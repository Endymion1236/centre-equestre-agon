/**
 * POST /api/admin/sepa-prenotification  { paymentId }
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
    const { paymentId } = await req.json().catch(() => ({} as any));
    if (!paymentId) return NextResponse.json({ error: "paymentId requis" }, { status: 400 });

    const paySnap = await adminDb.collection("payments").doc(paymentId).get();
    if (!paySnap.exists) return NextResponse.json({ error: "Commande introuvable" }, { status: 404 });
    const p = paySnap.data() as any;

    // Deux rattachements coexistent : les échéances créées depuis les impayés
    // portent `paymentId`, celles d'un forfait annuel ne connaissent que
    // l'`orderId` de la commande de référence.
    const lues: any[] = [];
    const parPaiement = await adminDb
      .collection("echeances-sepa")
      .where("paymentId", "==", paymentId)
      .get();
    lues.push(...parPaiement.docs.map((d) => d.data() as any));
    if (lues.length === 0 && p.orderId) {
      const parCommande = await adminDb
        .collection("echeances-sepa")
        .where("orderId", "==", p.orderId)
        .get();
      lues.push(...parCommande.docs.map((d) => d.data() as any));
    }
    const echeances = lues
      .filter((e) => e.status === "pending")
      .sort((a, b) => String(a.dateEcheance).localeCompare(String(b.dateEcheance)));

    if (echeances.length === 0) {
      return NextResponse.json({ sent: false, reason: "aucune échéance en attente" });
    }

    // Destinataire : l'adresse de la commande, sinon celle de la fiche famille.
    let email = String(p.familyEmail || "").trim();
    if (!email && p.familyId) {
      const fam = await adminDb.collection("families").doc(p.familyId).get();
      email = String((fam.data() as any)?.parentEmail || "").trim();
    }
    if (!email) return NextResponse.json({ sent: false, reason: "famille sans adresse email" });

    const total = Math.round(echeances.reduce((s, e) => s + (Number(e.montant) || 0), 0) * 100) / 100;
    const mandatId = echeances[0]?.mandatId || p.paymentRef || "";
    const prestations = (p.items || []).map((i: any) => i.activityTitle).filter(Boolean).join(", ");
    const multi = echeances.length > 1;

    const lignes = echeances
      .map((e) => emailLigne(jour(e.dateEcheance), euros(Number(e.montant) || 0)))
      .join("");

    const html = emailLayout([
      emailTitre("Votre prélèvement est programmé"),
      P(`Bonjour <strong>${p.familyName || ""}</strong>,`),
      P(multi
        ? `Votre commande${prestations ? ` — ${prestations}` : ""} sera réglée par <strong>prélèvement automatique</strong>, en ${echeances.length} fois. Vous n'avez aucune démarche à faire.`
        : `Votre commande${prestations ? ` — ${prestations}` : ""} sera réglée par <strong>prélèvement automatique</strong>. Vous n'avez aucune démarche à faire.`),
      emailPanneau(multi ? `Échéancier · ${echeances.length} prélèvements` : "Prélèvement à venir",
        lignes + (multi ? `
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin-top:9px;border-top:1px solid ${C.bord};">
          <tr>
            <td style="padding:10px 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;font-weight:700;color:${C.encre};">Total</td>
            <td align="right" style="padding:8px 0 0;font-family:Georgia,'Times New Roman',serif;font-size:24px;color:${C.encre};">${euros(total)}</td>
          </tr>
        </table>` : ""),
        "carte"),
      emailPanneau("Votre mandat", [
        emailLigne("Référence du mandat", mandatId || "—"),
        emailLigne("Identifiant créancier (ICS)", SEPA_CREDITOR.ics),
        P(`Le prélèvement apparaîtra sur votre relevé sous le libellé <strong>${SEPA_CREDITOR.name}</strong>.`, 12),
      ].join("")),
      // La commande a pu être enregistrée « à régler plus tard » avant d'être
      // basculée en prélèvement : la famille garde alors un message qui
      // l'invite à payer. On le désamorce ici plutôt que de la laisser régler
      // deux fois.
      P("Si vous avez reçu un message vous invitant à régler cette commande, il est sans objet : le prélèvement s'en charge.", 13),
      P("Si vous préférez régler autrement, ou si vos coordonnées bancaires ont changé, prévenez-nous avant la date indiquée : nous annulerons le prélèvement.", 13),
      emailSignature(),
    ].join("\n"), multi
      ? `${echeances.length} prélèvements · ${eurosTexte(total)} au total`
      : `${eurosTexte(total)} le ${jour(echeances[0].dateEcheance)}`);

    const subject = multi
      ? `Prélèvement automatique programmé — ${echeances.length} × à partir du ${jour(echeances[0].dateEcheance)}`
      : `Prélèvement automatique programmé — ${eurosTexte(total)} le ${jour(echeances[0].dateEcheance)}`;

    const resendKey = process.env.RESEND_API_KEY;
    await refreshEmailMode();
    if (!resendKey || !isRecipientAllowed(email)) {
      await logEmail({
        to: email, subject, context: "sepa_prenotification", template: "sepaPrenotification",
        status: "failed", error: resendKey ? "Mode restreint : destinataire non autorisé" : "RESEND_API_KEY absente",
        sentBy: (auth as any)?.uid || "admin", paymentId, familyId: p.familyId,
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
      sentBy: (auth as any)?.uid || "admin", paymentId, familyId: p.familyId,
    }).catch(() => {});

    if (!res.ok) return NextResponse.json({ error: `Envoi refusé (${res.status})` }, { status: 502 });
    return NextResponse.json({ sent: true, to: email, nbEcheances: echeances.length, total });
  } catch (e: any) {
    console.error("[sepa-prenotification]", e);
    return NextResponse.json({ error: "Erreur d'envoi" }, { status: 500 });
  }
}
