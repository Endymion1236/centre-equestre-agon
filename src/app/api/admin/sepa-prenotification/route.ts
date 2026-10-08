/**
 * POST /api/admin/sepa-prenotification  { paymentId | paymentIds[], mode?: "apercu" }
 *
 * Plusieurs commandes d'une même famille (`paymentIds`) partent en UN seul
 * email : calendrier des prélèvements (montant total par date) et détail par
 * commande (lib/sepa-prenotification-resume). Octobre 2026 : les DUHEM
 * recevaient 8 pré-notifications, une par commande.
 *
 * `mode: "apercu"` renvoie ce qui PARTIRAIT (destinataire, objet, échéances,
 * total, mandat) sans rien envoyer : l'administration vérifie l'échéancier
 * avant de confirmer. À l'envoi, la commande garde la trace
 * (`prenotificationSepa: { envoyeeLe, to }`).
 *
 * Prévient la famille qu'une commande sera réglée par prélèvement automatique,
 * avec le calendrier, les montants et la référence du mandat.
 *
 * Pourquoi cette route existe
 * ───────────────────────────
 * Une commande enregistrée « à encaisser plus tard » envoie « Votre commande
 * est enregistrée — aucun paiement n'a été prélevé, réglez quand vous le
 * souhaitez ». Quand l'administration bascule ensuite cette commande en
 * prélèvement SEPA, la famille n'était prévenue de rien : elle gardait le
 * premier message, qui lui disait l'inverse de ce qui allait se passer, et
 * découvrait le prélèvement sur son relevé.
 *
 * C'est aussi une obligation : les règles SEPA imposent au créancier de
 * prévenir le débiteur du montant et de la date avant chaque prélèvement
 * (14 jours calendaires par défaut, sauf accord contraire au mandat).
 *
 * Auth admin obligatoire. Ne throw jamais côté appelant : l'échéancier est
 * déjà créé, un email qui échoue ne doit pas le remettre en cause.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { verifyAuth } from "@/lib/api-auth";
import { logEmail } from "@/lib/email-log";
import { isRecipientAllowed, refreshEmailMode } from "@/lib/email-guard";
import { REPLY_TO } from "@/lib/email-reply-to";
import {
  emailLayout, emailTitre, emailParagraphe as P, emailPanneau, emailLigne,
  emailSignature, emailCouleurs as C, euros, eurosTexte,
} from "@/lib/email-templates";
import { SEPA_CREDITOR } from "@/lib/sepa";
import { resumePrenotification, type EcheancePrenotif } from "@/lib/sepa-prenotification-resume";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const jour = (iso: string) => {
  if (!/^\d{4}-\d{2}-\d{2}/.test(iso || "")) return iso || "";
  return new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString("fr-FR", {
    day: "numeric", month: "long", year: "numeric",
  });
};

export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req, { adminOnly: true });
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await req.json().catch(() => ({} as any));
    const ids: string[] = [...new Set<string>(
      (Array.isArray(body?.paymentIds) ? body.paymentIds : body?.paymentId ? [body.paymentId] : [])
        .map((x: unknown) => String(x || "").trim()).filter(Boolean),
    )].slice(0, 50);
    if (ids.length === 0) return NextResponse.json({ error: "paymentId requis" }, { status: 400 });
    const apercu = body?.mode === "apercu";

    const snaps = await Promise.all(ids.map((id) => adminDb.collection("payments").doc(id).get()));
    if (snaps.some((s) => !s.exists)) return NextResponse.json({ error: "Commande introuvable" }, { status: 404 });
    const commandes = snaps.map((s) => ({ id: s.id, ...(s.data() as any) }));
    const familles = [...new Set(commandes.map((c) => c.familyId || ""))];
    if (familles.length > 1) return NextResponse.json({ error: "Commandes de familles différentes : une pré-notification par famille" }, { status: 400 });
    const p = commandes[0];

    // Deux rattachements coexistent : les échéances créées depuis les impayés
    // portent `paymentId`, celles d'un forfait annuel ne connaissent que
    // l'`orderId` de la commande de référence.
    const echeancesTaguees: EcheancePrenotif[] = [];
    for (const cmd of commandes) {
      const parPaiement = await adminDb.collection("echeances-sepa").where("paymentId", "==", cmd.id).get();
      let docs = parPaiement.docs;
      if (docs.length === 0 && cmd.orderId) {
        docs = (await adminDb.collection("echeances-sepa").where("orderId", "==", cmd.orderId).get()).docs;
      }
      for (const d of docs) {
        const e = d.data() as any;
        echeancesTaguees.push({ commandeId: cmd.id, dateEcheance: String(e.dateEcheance || ""), montant: Number(e.montant) || 0, mandatId: e.mandatId || null, status: e.status || null });
      }
    }
    const resume = resumePrenotification(commandes, echeancesTaguees);
    if (resume.nbEcheances === 0) {
      return NextResponse.json({ sent: false, reason: "aucune échéance en attente" });
    }

    // Destinataire : l'adresse d'une commande, sinon celle de la fiche famille.
    let email = String(commandes.find((c) => c.familyEmail)?.familyEmail || "").trim();
    if (!email && p.familyId) {
      const fam = await adminDb.collection("families").doc(p.familyId).get();
      email = String((fam.data() as any)?.parentEmail || "").trim();
    }
    if (!email) return NextResponse.json({ sent: false, reason: "famille sans adresse email" });

    const total = resume.total;
    const mandatId = resume.mandats.join(" · ") || p.paymentRef || "";
    const plusieursCommandes = resume.commandes.length > 1;
    const prestations = resume.commandes.map((c) => c.prestations).join(" ; ");
    const multi = resume.parDate.length > 1;
    const premiere = resume.parDate[0].date;

    const lignes = resume.parDate
      .map((d) => emailLigne(jour(d.date), euros(d.montant)))
      .join("");
    const ligneTotal = `
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin-top:9px;border-top:1px solid ${C.bord};">
          <tr>
            <td style="padding:10px 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;font-weight:700;color:${C.encre};">Total</td>
            <td align="right" style="padding:8px 0 0;font-family:Georgia,'Times New Roman',serif;font-size:24px;color:${C.encre};">${euros(total)}</td>
          </tr>
        </table>`;

    const html = emailLayout([
      emailTitre(multi ? "Vos prélèvements sont programmés" : "Votre prélèvement est programmé"),
      P(`Bonjour <strong>${p.familyName || ""}</strong>,`),
      P(plusieursCommandes
        ? `Vos ${resume.commandes.length} commandes ci-dessous seront réglées par <strong>prélèvement automatique</strong>. Voici en un seul message tout ce qui sera prélevé, et quand. Vous n'avez aucune démarche à faire.`
        : multi
          ? `Votre commande${prestations ? ` — ${prestations}` : ""} sera réglée par <strong>prélèvement automatique</strong>, en ${resume.parDate.length} fois. Vous n'avez aucune démarche à faire.`
          : `Votre commande${prestations ? ` — ${prestations}` : ""} sera réglée par <strong>prélèvement automatique</strong>. Vous n'avez aucune démarche à faire.`),
      emailPanneau(multi ? `Calendrier · ${resume.parDate.length} dates de prélèvement` : "Prélèvement à venir",
        lignes + (multi || plusieursCommandes ? ligneTotal : ""),
        "carte"),
      ...(plusieursCommandes ? [emailPanneau("Détail par commande",
        resume.commandes.map((c) => emailLigne(c.prestations, `${euros(c.montant)}${c.nbEcheances > 1 ? ` en ${c.nbEcheances} fois` : ""}`)).join(""))] : []),
      emailPanneau(resume.mandats.length > 1 ? "Vos mandats" : "Votre mandat", [
        emailLigne(resume.mandats.length > 1 ? "Références des mandats" : "Référence du mandat", mandatId || "—"),
        emailLigne("Identifiant créancier (ICS)", SEPA_CREDITOR.ics),
        P(`Le prélèvement apparaîtra sur votre relevé sous le libellé <strong>${SEPA_CREDITOR.name}</strong>.`, 12),
      ].join("")),
      // La commande a pu être enregistrée « à régler plus tard » avant d'être
      // basculée en prélèvement : la famille garde alors un message qui
      // l'invite à payer. On le désamorce ici plutôt que de la laisser régler
      // deux fois.
      P(`Si vous avez reçu un message vous invitant à régler ${plusieursCommandes ? "ces commandes" : "cette commande"}, il est sans objet : le prélèvement s'en charge.`, 13),
      P("Si vous préférez régler autrement, ou si vos coordonnées bancaires ont changé, prévenez-nous avant la date indiquée : nous annulerons le prélèvement.", 13),
      emailSignature(),
    ].join("\n"), multi
      ? `${resume.parDate.length} dates de prélèvement · ${eurosTexte(total)} au total`
      : `${eurosTexte(total)} le ${jour(premiere)}`);

    const subject = multi
      ? `Prélèvements automatiques programmés — ${eurosTexte(total)} à partir du ${jour(premiere)}`
      : `Prélèvement automatique programmé — ${eurosTexte(total)} le ${jour(premiere)}`;

    if (apercu) {
      return NextResponse.json({
        apercu: true,
        to: email,
        subject,
        familyName: p.familyName || "",
        prestations,
        mandatId,
        total,
        echeances: resume.parDate.map((d) => ({ date: d.date, dateLabel: jour(d.date), montant: d.montant })),
        commandes: resume.commandes,
        dejaEnvoyeeLe: commandes.map((c) => c.prenotificationSepa?.envoyeeLe).filter(Boolean).sort().pop() || null,
      });
    }

    const resendKey = process.env.RESEND_API_KEY;
    await refreshEmailMode();
    if (!resendKey || !isRecipientAllowed(email)) {
      await logEmail({
        to: email, subject, context: "sepa_prenotification", template: "sepaPrenotification",
        status: "failed", error: resendKey ? "Mode restreint : destinataire non autorisé" : "RESEND_API_KEY absente",
        sentBy: (auth as any)?.uid || "admin", paymentId: ids[0], familyId: p.familyId,
      }).catch(() => {});
      return NextResponse.json({ sent: false, reason: "destinataire non autorisé (mode restreint)" });
    }

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.RESEND_FROM_EMAIL || "Centre Equestre <onboarding@resend.dev>",
        to: email,
        reply_to: REPLY_TO,
        ...(process.env.RESEND_BCC_EMAIL ? { bcc: process.env.RESEND_BCC_EMAIL } : {}),
        subject,
        html,
      }),
    });

    const errText = res.ok ? "" : await res.text().catch(() => "");
    await logEmail({
      to: email, subject, context: "sepa_prenotification", template: "sepaPrenotification",
      status: res.ok ? "sent" : "failed",
      ...(res.ok ? {} : { error: `HTTP ${res.status}: ${errText}`.slice(0, 500) }),
      sentBy: (auth as any)?.uid || "admin", paymentId: ids[0], familyId: p.familyId,
    }).catch(() => {});

    if (!res.ok) return NextResponse.json({ error: `Envoi refusé (${res.status})` }, { status: 502 });
    // Chaque commande garde la trace : l'écran SEPA sait ce qui reste à prévenir.
    const trace = { envoyeeLe: new Date().toISOString(), to: email, ...(ids.length > 1 ? { groupee: ids.length } : {}) };
    await Promise.all(snaps.map((s) => s.ref.update({ prenotificationSepa: trace }).catch(() => {})));
    return NextResponse.json({ sent: true, to: email, nbEcheances: resume.nbEcheances, nbCommandes: resume.commandes.length, total });
  } catch (e: any) {
    console.error("[sepa-prenotification]", e);
    return NextResponse.json({ error: "Erreur d'envoi" }, { status: 500 });
  }
}
