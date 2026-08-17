/**
 * POST /api/admin/stage-acompte-recu
 *
 * Envoie la confirmation d'acompte quand celui-ci a été encaissé AU COMPTOIR
 * (espèces, chèque, CB terminal) depuis le panneau d'inscription du planning.
 *
 * Pourquoi une route dédiée : payé en ligne, l'acompte déclenche le webhook
 * CAWL, qui envoie le template `confirmationStageAcompte` (récapitulatif
 * total / acompte / solde). Encaissé au comptoir, il n'y a pas de webhook —
 * la famille ne recevait que la confirmation d'inscription, sans reçu de son
 * acompte. Même template, même contenu, quel que soit le mode de règlement.
 *
 * Le solde n'est pas demandé ici : le cron J-7 s'en charge, et il enverra un
 * lien de paiement plutôt qu'un prélèvement automatique, faute de carte
 * enregistrée quand l'acompte a été réglé en espèces ou par chèque. La phrase
 * du mail le dit à la famille.
 *
 * Body : { paymentId: string, montant?: number, mode?: string }
 *   montant : acompte réellement encaissé. À défaut, on prend paidAmount.
 *
 * Auth admin obligatoire.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { verifyAuth } from "@/lib/api-auth";
import { loadTemplate } from "@/lib/email-template-loader";
import { logEmail } from "@/lib/email-log";
import { isRecipientAllowed, refreshEmailMode } from "@/lib/email-guard";
import { REPLY_TO } from "@/lib/email-reply-to";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MODE_LABELS: Record<string, string> = {
  especes: "espèces",
  cheque: "chèque",
  cb_terminal: "carte bancaire",
};

export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req, { adminOnly: true });
  if (auth instanceof NextResponse) return auth;

  try {
    const { paymentId, montant, mode } = await req.json();
    if (!paymentId) {
      return NextResponse.json({ error: "paymentId manquant" }, { status: 400 });
    }

    const paySnap = await adminDb.collection("payments").doc(paymentId).get();
    if (!paySnap.exists) {
      return NextResponse.json({ error: "Commande introuvable" }, { status: 404 });
    }
    const p = paySnap.data() as any;

    // Destinataire : l'adresse portée par la commande, sinon celle de la fiche.
    let familyEmail = (p.familyEmail || "").trim();
    if (!familyEmail && p.familyId) {
      const famSnap = await adminDb.collection("families").doc(p.familyId).get();
      familyEmail = ((famSnap.data() as any)?.parentEmail || "").trim();
    }
    if (!familyEmail) {
      return NextResponse.json({ sent: false, reason: "famille sans adresse email" });
    }

    const total = Number(p.totalTTC) || 0;
    const acompte = Number(montant) || Number(p.paidAmount) || 0;
    const solde = Math.max(0, Math.round((total - acompte) * 100) / 100);
    const items = Array.isArray(p.items) ? p.items : [];
    const enfants = items.map((i: any) => i.childName).filter(Boolean)
      .filter((n: string, i: number, arr: string[]) => arr.indexOf(n) === i)
      .join(", ") || "Cavalier(s)";

    const modeLabel = MODE_LABELS[String(mode || "")] || "";
    const soldePhrase = solde > 0
      ? `Un email avec le lien de paiement du solde (${solde.toFixed(2)}€) vous sera envoyé environ une semaine avant le début du stage.`
      : "Le stage est intégralement réglé. Merci !";

    const { subject, html } = await loadTemplate("confirmationStageAcompte", {
      parentName: p.familyName || "",
      stageTitle: p.stageTitle || items[0]?.activityTitle || "Stage",
      dates: p.stageDate || "",
      horaires: items[0]?.stageSchedule || "",
      enfants,
      montant: acompte.toFixed(2),
      acompte: acompte.toFixed(2),
      solde: solde.toFixed(2),
      total: total.toFixed(2),
      soldePhrase: modeLabel
        ? `Acompte réglé au centre équestre en ${modeLabel}. ${soldePhrase}`
        : soldePhrase,
    });

    const resendKey = process.env.RESEND_API_KEY;
    const fromEmail = process.env.RESEND_FROM_EMAIL || "Centre Equestre <onboarding@resend.dev>";

    await refreshEmailMode();
    if (!resendKey || !isRecipientAllowed(familyEmail)) {
      // Mode restreint : on ne bloque pas l'encaissement, on le signale.
      await logEmail({
        to: familyEmail, subject, context: "admin_acompte_comptoir",
        template: "confirmationStageAcompte", status: "failed",
        error: resendKey ? "Mode restreint : destinataire non autorisé" : "RESEND_API_KEY absente",
        sentBy: (auth as any)?.uid || "admin", paymentId, familyId: p.familyId,
      }).catch(() => {});
      return NextResponse.json({ sent: false, reason: "destinataire non autorisé (mode restreint)" });
    }

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: fromEmail,
        to: familyEmail,
        reply_to: REPLY_TO,
        ...(process.env.RESEND_BCC_EMAIL ? { bcc: process.env.RESEND_BCC_EMAIL } : {}),
        subject,
        html,
      }),
    });

    const errText = res.ok ? "" : await res.text().catch(() => "");
    await logEmail({
      to: familyEmail, subject, context: "admin_acompte_comptoir",
      template: "confirmationStageAcompte", status: res.ok ? "sent" : "failed",
      ...(res.ok ? {} : { error: `HTTP ${res.status}: ${errText}`.slice(0, 500) }),
      sentBy: (auth as any)?.uid || "admin", paymentId, familyId: p.familyId,
    }).catch(() => {});

    if (!res.ok) {
      return NextResponse.json({ error: `Envoi refusé (${res.status})` }, { status: 502 });
    }
    return NextResponse.json({ sent: true, to: familyEmail, acompte, solde });
  } catch (e: any) {
    console.error("[stage-acompte-recu]", e);
    return NextResponse.json({ error: e?.message || "Erreur d'envoi" }, { status: 500 });
  }
}
