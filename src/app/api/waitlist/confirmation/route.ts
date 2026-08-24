import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/api-auth";
import { logEmail } from "@/lib/email-log";
import { refreshEmailMode, isRecipientAllowed } from "@/lib/email-guard";
import { encadreConditionsPourType } from "@/lib/cgv-clauses";

/**
 * POST /api/waitlist/confirmation  { creneauId, childName, activityTitle, date, startTime, endTime }
 *
 * Confirme a une famille son inscription en liste d'attente.
 *
 * Route dediee car /api/send-email est reserve aux ADMINS : l'appel depuis
 * l'espace famille etait rejete en 401, et le `.catch()` cote client
 * l'avalait sans bruit — la famille ne recevait rien et personne ne le
 * voyait. Ici l'authentification suffit (une famille connectee), et
 * l'adresse de destination est celle du COMPTE, jamais une adresse fournie
 * par le client : impossible de se servir de la route pour ecrire a un tiers.
 */
export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req);
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch(() => ({}));
  const { creneauId, childName, activityTitle, activityType, date, dateFin, nbJours, startTime, endTime, parentName } = body;
  if (!creneauId || !activityTitle) {
    return NextResponse.json({ error: "Paramètres manquants" }, { status: 400 });
  }

  // Destinataire = email du compte authentifie, pas un champ du corps.
  const email = String(auth.email || "").trim();
  if (!email) return NextResponse.json({ ok: false, raison: "compte sans email" });

  await refreshEmailMode();
  const resendKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL || "Centre Equestre <onboarding@resend.dev>";
  if (!resendKey || !isRecipientAllowed(email)) {
    await logEmail({
      to: email, subject: `Inscription en liste d'attente — ${activityTitle}`,
      context: "famille_waitlist_confirmation", template: "waitlistConfirmation",
      status: "failed", error: "Bloqué par le mode restreint", sentBy: "system", creneauId: String(creneauId),
    }).catch(() => {});
    return NextResponse.json({ ok: false, raison: "envoi bloqué (mode restreint)" });
  }

  const lisible = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  // Attente de STAGE (semaine entière) : afficher la période, pas un seul jour.
  const dateLisible = date
    ? (dateFin && dateFin !== date
      ? `du ${lisible(String(date))} au ${lisible(String(dateFin))}${nbJours ? ` (${nbJours} jours)` : ""}`
      : lisible(String(date)))
    : "";
  const subject = `Inscription en liste d'attente — ${activityTitle}`;
  const html = `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;">
    <p>Bonjour <strong>${parentName || ""}</strong>,</p>
    <p><strong>${childName || "Votre cavalier"}</strong> est bien inscrit(e) en liste d'attente pour :</p>
    <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:16px;margin:16px 0;">
      <p style="margin:0;color:#1e40af;font-weight:600;">${activityTitle}</p>
      <p style="margin:8px 0 0;color:#555;font-size:13px;">📅 ${dateLisible}${startTime ? ` — ${startTime}–${endTime || ""}` : ""}</p>
    </div>
    <p style="font-size:14px;line-height:1.6;color:#334155;"><strong>Vous n'avez rien d'autre à faire.</strong>
      Si une place se libère, vous recevrez un email et elle vous sera
      <strong>réservée pendant 24 heures</strong> pour confirmer votre inscription.</p>
    <p style="font-size:13px;color:#555;line-height:1.6;">Cette activité ne vous intéresse plus ?
      Appelez-nous au <strong>02 44 84 99 96</strong> ou répondez à ce message,
      nous libérerons votre place pour une autre famille.</p>
    ${encadreConditionsPourType(String(activityType || ""))}
    <p style="color:#666;font-size:12px;">À bientôt au centre équestre !</p>
  </div>`;

  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${resendKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: fromEmail, to: email, subject, html }),
  });
  await logEmail({
    to: email, subject, context: "famille_waitlist_confirmation",
    template: "waitlistConfirmation", status: r.ok ? "sent" : "failed",
    sentBy: "system", creneauId: String(creneauId),
  }).catch(() => {});

  return NextResponse.json({ ok: r.ok });
}
