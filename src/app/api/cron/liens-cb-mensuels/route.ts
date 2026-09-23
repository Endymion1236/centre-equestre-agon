/**
 * CRON liens-cb-mensuels — le dernier jour de chaque mois, 8 h à Paris.
 *
 * Nicolas envoie chaque fin de mois un lien de paiement CB aux familles
 * dont l'échéancier se règle ainsi (repère « lien CB chaque mois » posé dans
 * Paiements → Échéances). Ce rappel liste, pour chacune, la prochaine
 * échéance à régler et son montant, par email aux admins et en notification.
 * Règles dans liensCbAEnvoyer (paiements/echeances-utils).
 *
 * Planifié du 28 au 31 : la route ne travaille que si demain est le 1er,
 * en heure de Paris. `?force=1` l'exécute quel que soit le jour.
 * Déclenchable à la main (GET + Bearer CRON_SECRET).
 */

import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { adminDb } from "@/lib/firebase-admin";
import { messageErreur } from "@/lib/message-erreur";
import { sendPushBatch } from "@/lib/push";
import { isRecipientAllowed, refreshEmailMode } from "@/lib/email-guard";
import { REPLY_TO } from "@/lib/email-reply-to";
import { CHAMP_LIEN_CB, dateEcheanceLisible, liensCbAEnvoyer } from "@/app/admin/paiements/echeances-utils";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ADMIN_EMAILS = ["ceagon50@gmail.com", "emmelinelagy@gmail.com"];

function parisYMD(d = new Date()): string {
  return new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

export async function GET(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || "https://centre-equestre-agon.vercel.app";
  const today = parisYMD();
  const demain = parisYMD(new Date(Date.now() + 24 * 3600 * 1000));
  if (!demain.endsWith("-01") && req.nextUrl.searchParams.get("force") !== "1") {
    return NextResponse.json({ ok: true, message: `Pas le dernier jour du mois (${today}).` });
  }

  const result = { liens: 0, retards: 0, total: 0, emailSent: false, pushSent: 0 };
  try {
    const snap = await adminDb.collection("payments").where(CHAMP_LIEN_CB, "==", true).get();
    const lignes = liensCbAEnvoyer(snap.docs.map((d) => ({ id: d.id, ...d.data() })), today);
    result.liens = lignes.length;
    result.retards = lignes.filter((l) => l.enRetard).length;
    result.total = Math.round(lignes.reduce((s, l) => s + l.reste, 0) * 100) / 100;
    if (lignes.length === 0) return NextResponse.json({ ok: true, message: "Aucun lien CB à envoyer ce mois-ci", ...result });

    // Adresse de la famille, pour savoir où part le lien.
    const familles = await Promise.all([...new Set(lignes.map((l) => l.familyId).filter(Boolean))]
      .map(async (id) => [id, await adminDb.collection("families").doc(id).get()] as const));
    const emailDe = new Map(familles.map(([id, s]) => [id, s.exists ? String((s.data() as any)?.parentEmail || "") : ""]));

    const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const lignesHtml = lignes.map((l) => `<tr style="border-bottom:1px solid #eee;">
        <td style="padding:5px 8px;">${l.enRetard ? "⚠️ " : ""}<b>${esc(l.familyName)}</b><br/><span style="color:#6b7280;font-size:12px;">${esc(emailDe.get(l.familyId) || "adresse absente de la fiche")}</span></td>
        <td style="padding:5px 8px;color:#6b7280;">échéance ${l.numero}/${l.total}${l.autresEnRetard ? `<br/><span style="color:#dc2626;">+ ${l.autresEnRetard} autre(s) en retard</span>` : ""}</td>
        <td style="padding:5px 8px;color:${l.enRetard ? "#dc2626" : "#1f2937"};">${dateEcheanceLisible(l.date)}</td>
        <td style="padding:5px 8px;text-align:right;font-weight:bold;">${l.reste.toFixed(2)} €</td>
      </tr>`).join("");
    const html = `<div style="font-family:Arial,sans-serif;color:#1f2937;max-width:640px;">
      <h2 style="color:#1e3a5f;margin-bottom:4px;">Liens de paiement CB à envoyer</h2>
      <p>${lignes.length} famille(s) règle(nt) leur échéance par lien CB, pour un total de <strong>${result.total.toFixed(2)} €</strong>${result.retards ? ` — dont <strong style="color:#dc2626;">${result.retards} en retard</strong>` : ""}.</p>
      <table style="border-collapse:collapse;width:100%;font-size:13px;">
        <thead><tr style="background:#f9fafb;text-align:left;"><th style="padding:6px 8px;">Famille</th><th style="padding:6px 8px;">Échéance</th><th style="padding:6px 8px;">Date</th><th style="padding:6px 8px;text-align:right;">À régler</th></tr></thead>
        <tbody>${lignesHtml}</tbody>
      </table>
      <p style="margin-top:16px;"><a href="${appUrl}/admin/paiements?tab=echeances" style="background:#1e3a5f;color:#fff;padding:9px 16px;border-radius:8px;text-decoration:none;">Ouvrir les échéances</a></p>
      <p style="color:#6b7280;font-size:12px;">Dans l'onglet Échéances, le bouton « 💳 Lien » de chaque échéance prépare le lien avec le bon montant et un message qui nomme l'échéance.</p>
      <p style="color:#9ca3af;font-size:11px;margin-top:14px;">Rappel automatique du dernier jour du mois, pour les échéanciers marqués « lien CB chaque mois ».</p>
    </div>`;

    const resendKey = process.env.RESEND_API_KEY;
    await refreshEmailMode();
    const to = ADMIN_EMAILS.filter((e) => isRecipientAllowed(e));
    if (resendKey && to.length > 0) {
      try {
        await new Resend(resendKey).emails.send({
          from: process.env.RESEND_FROM_EMAIL || "Centre Equestre <onboarding@resend.dev>",
          replyTo: REPLY_TO,
          to,
          subject: `Rappel : ${lignes.length} lien(s) de paiement CB à envoyer${result.retards ? ` (${result.retards} en retard)` : ""}`,
          html,
        });
        result.emailSent = true;
      } catch (e) { console.error("[liens-cb-mensuels] email:", e); }
    }

    try {
      const tokens: string[] = [];
      const staffSnap = await adminDb.collection("staff").get();
      staffSnap.forEach((d) => {
        const s = d.data() as any;
        if (s.pushToken && s.role === "admin") tokens.push(s.pushToken);
      });
      if (tokens.length > 0) {
        const r = await sendPushBatch(tokens, "Liens de paiement CB à envoyer",
          `${lignes.length} famille(s) · ${result.total.toFixed(2)} €${result.retards ? ` · ${result.retards} en retard` : ""}`,
          `${appUrl}/admin/paiements?tab=echeances`);
        result.pushSent = r.sent;
      }
    } catch (e) { console.error("[liens-cb-mensuels] push:", e); }

    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error("[liens-cb-mensuels]", e);
    return NextResponse.json({ error: `Erreur interne — ${messageErreur(e)}` }, { status: 500 });
  }
}
