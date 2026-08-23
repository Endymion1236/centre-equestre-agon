import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { Resend } from "resend";
import { isRecipientAllowed, refreshEmailMode } from "@/lib/email-guard";
import { REPLY_TO } from "@/lib/email-reply-to";
import { POSTES_DEPENSES } from "@/lib/postes-depenses";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ADMIN_EMAILS = ["ceagon@orange.fr", "ceagon50@gmail.com"];

/**
 * CRON rappel-cloture — le 2 de chaque mois.
 *
 * Reconstitue la checklist « Boucler le mois » du mois qui vient de se
 * terminer (soldes bancaires, fiches de paie, charges MSA, dépenses) et
 * l'envoie par email aux admins, avec en bonus les postes de dépenses qui
 * dépassent 110 % de leur « attendu » (référence bilan proratisée).
 * C'est ce rappel qui fait vivre les outils : sans lui, la meilleure
 * checklist meurt en février.
 *
 * Déclenchable aussi à la main (GET + Bearer CRON_SECRET).
 */
export async function GET(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || "https://centre-equestre-agon.vercel.app";

  try {
    // Le mois à boucler = le mois précédent, en heure de Paris.
    const maintenant = new Date();
    const ymParis = new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit" }).format(maintenant); // "AAAA-MM"
    const [a, m] = ymParis.split("-").map(Number);
    const prec = new Date(a, m - 2, 1);
    const mois = `${prec.getFullYear()}-${String(prec.getMonth() + 1).padStart(2, "0")}`;
    const nomMois = prec.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });

    const [settingsSnap, relSnap, msSnap, depSnap] = await Promise.all([
      adminDb.collection("settings").doc("tresorerie").get(),
      adminDb.collection("tresorerie-releves").where("mois", "==", mois).get(),
      adminDb.collection("masse-salariale").where("mois", "==", mois).get(),
      adminDb.collection("depenses").get(),
    ]);

    const st = settingsSnap.exists ? (settingsSnap.data() as any) : null;
    const comptes: string[] = Array.isArray(st?.comptes) && st.comptes.length ? st.comptes.map(String) : ["Compte courant"];
    const horsTotal: string[] = Array.isArray(st?.horsTotal) ? st.horsTotal.map(String) : [];
    const comptesComptes = comptes.filter((c) => !horsTotal.includes(c));
    const relevesMois = relSnap.docs.map((d) => String((d.data() as any).compte || ""));
    const soldesManquants = comptesComptes.filter((c) => !relevesMois.includes(c));

    const fiches = msSnap.docs.filter((d) => (d.data() as any).type !== "charge").length;
    const charges = msSnap.docs.filter((d) => (d.data() as any).type === "charge").length;

    const depensesMois = depSnap.docs
      .filter((d) => (d.data() as any).mois === mois)
      .reduce((s, d) => s + Number((d.data() as any).montant || 0), 0);

    // ── Dépassements de postes sur l'exercice en cours (juillet → juin) ──
    const exerciceDebutAnnee = m - 1 >= 7 ? a : a - 1; // année du 1er juillet de l'exercice du mois bouclé
    const moisEcoules = m - 1 >= 7 ? m - 1 - 6 : m - 1 + 6; // juillet=1 … juin=12
    const cumulParPoste = new Map<string, number>();
    depSnap.docs.forEach((d) => {
      const r = d.data() as any;
      const rm = String(r.mois || "");
      const [ra, rmm] = rm.split("-").map(Number);
      if (!ra) return;
      const ex = rmm >= 7 ? ra : ra - 1;
      if (ex !== exerciceDebutAnnee || rm > mois) return;
      cumulParPoste.set(r.poste, (cumulParPoste.get(r.poste) || 0) + Number(r.montant || 0));
    });
    const depassements = POSTES_DEPENSES
      .filter((p) => p.ref != null)
      .map((p) => ({ nom: p.nom, cumul: cumulParPoste.get(p.nom) || 0, attendu: (p.ref! * moisEcoules) / 12 }))
      .filter((p) => p.attendu > 0 && p.cumul > p.attendu * 1.1);

    const eur = (v: number) => v.toLocaleString("fr-FR", { maximumFractionDigits: 0 }) + " €";
    const points = [
      { ok: soldesManquants.length === 0, txt: soldesManquants.length === 0 ? `Soldes bancaires : ${comptesComptes.length}/${comptesComptes.length} comptes saisis` : `Soldes bancaires : il manque ${soldesManquants.join(", ")}` },
      { ok: fiches > 0, txt: fiches > 0 ? `Fiches de paie : ${fiches} salaire(s) enregistré(s)` : "Fiches de paie : aucune déposée" },
      { ok: true, txt: charges > 0 ? `Charges MSA/TESA : ${charges} enregistrée(s)` : "Charges MSA/TESA : aucune (normal sans saisonniers)" },
      { ok: depensesMois > 0, txt: depensesMois > 0 ? `Dépenses : ${eur(depensesMois)} saisis` : "Dépenses : rien de saisi — dépose le relevé, il les propose" },
    ];
    const aFaire = points.filter((p) => !p.ok).length;

    const li = points.map((p) => `<li style="margin:4px 0;color:${p.ok ? "#166534" : "#b91c1c"};">${p.ok ? "✓" : "✗"} ${p.txt}</li>`).join("");
    const liDep = depassements.map((p) => `<li style="margin:4px 0;color:#b45309;">⚠ ${p.nom} : ${eur(p.cumul)} cumulés pour ${eur(p.attendu)} attendus à ce stade</li>`).join("");

    const html = `<div style="font-family:sans-serif;max-width:560px;">
      <h2 style="color:#1e3a5f;">Boucler ${nomMois}</h2>
      <p>${aFaire === 0 ? "Tout est en place — il ne reste que la vérification du rapprochement." : `${aFaire} point(s) restent à faire :`}</p>
      <ul style="list-style:none;padding:0;">${li}</ul>
      ${depassements.length > 0 ? `<h3 style="color:#b45309;font-size:14px;">Postes de dépenses qui dérapent (exercice en cours)</h3><ul style="list-style:none;padding:0;">${liDep}</ul>` : ""}
      <p style="margin-top:16px;"><a href="${appUrl}/admin/comptabilite/cloture-mois" style="background:#1e3a5f;color:#fff;padding:9px 16px;border-radius:8px;text-decoration:none;">Ouvrir « Boucler le mois »</a></p>
      <p style="color:#9ca3af;font-size:11px;margin-top:14px;">Rappel automatique du 2 du mois — dépose les relevés bancaires, les fiches de paie et le récapitulatif MSA, le reste se remplit tout seul.</p>
    </div>`;

    let emailSent = false;
    const resendKey = process.env.RESEND_API_KEY;
    await refreshEmailMode();
    const to = ADMIN_EMAILS.filter((e) => isRecipientAllowed(e));
    if (resendKey && to.length > 0) {
      const resend = new Resend(resendKey);
      await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL || "Centre Equestre <onboarding@resend.dev>",
        replyTo: REPLY_TO,
        to,
        subject: aFaire === 0
          ? `Boucler ${nomMois} : tout est prêt ✓${depassements.length ? ` (${depassements.length} poste(s) à surveiller)` : ""}`
          : `Boucler ${nomMois} : ${aFaire} point(s) à faire${depassements.length ? ` · ${depassements.length} poste(s) qui dérapent` : ""}`,
        html,
      });
      emailSent = true;
    }

    return NextResponse.json({ ok: true, mois, aFaire, depassements: depassements.length, emailSent });
  } catch (e: any) {
    console.error("rappel-cloture:", e);
    return NextResponse.json({ error: (e?.message || String(e)).slice(0, 300) }, { status: 500 });
  }
}
