import { NextRequest, NextResponse } from "next/server";
import { messageErreur } from "@/lib/message-erreur";
import { verifyAuth } from "@/lib/api-auth";
import { adminDb } from "@/lib/firebase-admin";
import { refreshEmailMode, isRecipientAllowed, blockedLog } from "@/lib/email-guard";
import { logEmail } from "@/lib/email-log";
import { emailLayout } from "@/lib/email-templates";
import { SEPA_CREDITOR } from "@/lib/sepa";

/**
 * POST /api/admin/sepa/notifier-mandat — { mandatDocId }
 *
 * Envoie à la famille, en UN SEUL message :
 *
 *  1. La CONFIRMATION DU MANDAT : référence unique (RUM), identifiant
 *     créancier (ICS), coordonnées du créancier, IBAN masqué, date de
 *     signature. Le débiteur doit disposer de ces éléments pour exercer
 *     son droit à contestation.
 *
 *  2. La PRÉNOTIFICATION : l'échéancier complet (montants et dates).
 *     Le SEPA impose de prévenir le débiteur avant chaque prélèvement.
 *     Les montants et dates d'un forfait en 3 ou 10 fois étant connus
 *     dès la signature, un envoi unique couvre toutes les échéances —
 *     inutile de renvoyer un message avant chacune.
 *
 * Rien de tout cela n'existait : aucun email SEPA n'était envoyé, ni à la
 * signature, ni avant prélèvement.
 */

/** N'expose que les 4 derniers caractères de l'IBAN. */
function ibanMasque(iban: string): string {
  const v = String(iban || "").replace(/\s/g, "");
  if (v.length < 8) return "••••";
  return `${v.slice(0, 4)} •••• •••• ${v.slice(-4)}`;
}

function dateFr(v: any): string {
  if (!v) return "";
  const d = typeof v === "string" ? new Date(v) : v?.toDate?.() || new Date(v);
  if (isNaN(d.getTime())) return String(v);
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req, { adminOnly: true });
  if (auth instanceof NextResponse) return auth;

  try {
    const { mandatDocId } = await req.json();
    if (!mandatDocId) {
      return NextResponse.json({ error: "mandatDocId requis" }, { status: 400 });
    }

    const mSnap = await adminDb.collection("mandats-sepa").doc(String(mandatDocId)).get();
    if (!mSnap.exists) {
      return NextResponse.json({ error: "Mandat introuvable" }, { status: 404 });
    }
    const m = mSnap.data() as any;

    // Adresse de la famille
    const fSnap = await adminDb.collection("families").doc(String(m.familyId)).get();
    const famille = fSnap.exists ? (fSnap.data() as any) : null;
    const to = famille?.parentEmail || "";
    if (!to) {
      return NextResponse.json({ error: "Cette famille n'a pas d'adresse email" }, { status: 400 });
    }

    // ── Échéancier : paiements échelonnés non réglés de cette famille ────
    const paySnap = await adminDb
      .collection("payments")
      .where("familyId", "==", m.familyId)
      .get();
    const echeances = paySnap.docs
      .map((d) => ({ id: d.id, ...(d.data() as any) }))
      .filter(
        (p: any) =>
          (p.echeancesTotal || 0) > 1 &&
          p.status !== "cancelled" &&
          p.status !== "paid" &&
          p.echeanceDate
      )
      .sort((a: any, b: any) => String(a.echeanceDate).localeCompare(String(b.echeanceDate)));

    const totalEcheances = echeances.reduce((s: number, e: any) => s + (e.totalTTC || 0), 0);

    const lignesEcheancier = echeances.length
      ? echeances
          .map(
            (e: any) => `
        <tr>
          <td style="padding:7px 10px;border-bottom:1px solid #e2e8f0;font-size:14px;color:#334155;">${dateFr(e.echeanceDate)}</td>
          <td style="padding:7px 10px;border-bottom:1px solid #e2e8f0;font-size:14px;color:#0f172a;font-weight:600;text-align:right;white-space:nowrap;">${(e.totalTTC || 0).toFixed(2)} €</td>
        </tr>`
          )
          .join("")
      : "";

    const blocEcheancier = echeances.length
      ? `
      <p style="margin:22px 0 8px;font-size:15px;font-weight:600;color:#1e293b;">Échéancier de vos prélèvements</p>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;">
        ${lignesEcheancier}
        <tr>
          <td style="padding:9px 10px;font-size:14px;font-weight:700;color:#1e293b;">Total</td>
          <td style="padding:9px 10px;font-size:14px;font-weight:700;color:#1e293b;text-align:right;">${totalEcheances.toFixed(2)} €</td>
        </tr>
      </table>
      <p style="margin:10px 0 0;font-size:13px;color:#64748b;line-height:1.6;">
        Ce message vaut <strong>prénotification</strong> pour l'ensemble de ces échéances :
        vous n'en recevrez pas d'autre avant chaque prélèvement. Chacun sera présenté
        à la date indiquée, ou le jour ouvré suivant.
      </p>`
      : `
      <p style="margin:22px 0 0;font-size:14px;color:#64748b;line-height:1.6;">
        Aucune échéance n'est programmée pour le moment. Vous recevrez le détail
        des montants et des dates avant tout prélèvement.
      </p>`;

    const html = emailLayout(`
      <p style="margin:0 0 14px;font-size:15px;color:#1e293b;">Bonjour <strong>${famille?.parentName || m.familyName || ""}</strong>,</p>
      <p style="margin:0 0 16px;font-size:15px;color:#334155;line-height:1.6;">
        Nous confirmons l'enregistrement de votre mandat de prélèvement SEPA.
        Conservez ce message : il contient les références nécessaires en cas de contestation.
      </p>

      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;background:#f8fafc;border-radius:8px;">
        <tr><td style="padding:9px 12px;font-size:13px;color:#64748b;">Référence du mandat (RUM)</td>
            <td style="padding:9px 12px;font-size:13px;color:#0f172a;font-weight:600;text-align:right;">${m.mandatId || "—"}</td></tr>
        <tr><td style="padding:9px 12px;font-size:13px;color:#64748b;">Identifiant créancier (ICS)</td>
            <td style="padding:9px 12px;font-size:13px;color:#0f172a;font-weight:600;text-align:right;">${SEPA_CREDITOR.ics}</td></tr>
        <tr><td style="padding:9px 12px;font-size:13px;color:#64748b;">Créancier</td>
            <td style="padding:9px 12px;font-size:13px;color:#0f172a;text-align:right;">${SEPA_CREDITOR.name}</td></tr>
        <tr><td style="padding:9px 12px;font-size:13px;color:#64748b;">Compte débité</td>
            <td style="padding:9px 12px;font-size:13px;color:#0f172a;text-align:right;">${ibanMasque(m.iban)}</td></tr>
        <tr><td style="padding:9px 12px;font-size:13px;color:#64748b;">Type</td>
            <td style="padding:9px 12px;font-size:13px;color:#0f172a;text-align:right;">Prélèvement récurrent</td></tr>
        <tr><td style="padding:9px 12px;font-size:13px;color:#64748b;">Signé le</td>
            <td style="padding:9px 12px;font-size:13px;color:#0f172a;text-align:right;">${dateFr(m.dateSignature)}</td></tr>
      </table>

      ${blocEcheancier}

      <p style="margin:20px 0 0;font-size:13px;color:#64748b;line-height:1.6;">
        Vous bénéficiez d'un droit au remboursement par votre banque selon les conditions
        décrites dans la convention que vous avez passée avec elle. Toute demande doit être
        présentée dans les 8 semaines suivant la date de débit.
      </p>
      <p style="margin:10px 0 0;font-size:13px;color:#64748b;line-height:1.6;">
        Une question sur cet échéancier ? Répondez simplement à ce message.
      </p>
    `);

    const subject = `Mandat de prélèvement SEPA et échéancier — ${SEPA_CREDITOR.name}`;

    await refreshEmailMode();
    if (!isRecipientAllowed(to)) {
      console.warn(blockedLog(to, "sepa_mandat"));
      await logEmail({ to, subject, context: "sepa_mandat", status: "failed", error: "Bloqué par le mode restreint (email-guard)", sentBy: auth.uid, familyId: m.familyId }).catch(() => {});
      return NextResponse.json({ sent: false, blocked: true });
    }

    const resendKey = process.env.RESEND_API_KEY;
    if (!resendKey) {
      return NextResponse.json({ sent: false, error: "RESEND_API_KEY absente" }, { status: 200 });
    }

    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.RESEND_FROM_EMAIL || "Centre Equestre <onboarding@resend.dev>",
        to,
        ...(process.env.RESEND_BCC_EMAIL ? { bcc: process.env.RESEND_BCC_EMAIL } : {}),
        subject,
        html,
      }),
    });

    await logEmail({
      to, subject, context: "sepa_mandat",
      status: r.ok ? "sent" : "failed",
      sentBy: auth.uid, familyId: m.familyId,
      ...(r.ok ? {} : { error: `HTTP ${r.status}` }),
    }).catch(() => {});

    // Trace sur le mandat : preuve que la prénotification a été adressée.
    if (r.ok) {
      await mSnap.ref.update({
        prenotificationSentAt: new Date(),
        prenotificationEcheances: echeances.length,
      }).catch(() => {});
    }

    return NextResponse.json({ sent: r.ok, echeances: echeances.length, to });
  } catch (e: any) {
    console.error("[sepa/notifier-mandat]", e?.message || e);
    return NextResponse.json({ error: `Erreur interne — ${messageErreur(e)}` }, { status: 500 });
  }
}
