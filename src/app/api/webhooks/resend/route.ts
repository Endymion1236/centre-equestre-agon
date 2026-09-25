/**
 * POST /api/webhooks/resend
 *
 * Resend y signale la vie de chaque email : remis, rejeté (adresse
 * invalide, boîte pleine), retardé, ouvert, cliqué, signalé comme spam.
 * Signature Svix vérifiée avec RESEND_WEBHOOK_SECRET (lib/resend-webhook).
 *
 * Effets :
 *   - le journal des emails (emailsSent) prend le statut de remise ;
 *   - un lien de paiement (payment-links) aussi, visible sous la commande ;
 *   - un email de commande rejeté pose `alerteEmail` sur la commande, que
 *     l'onglet Impayés affiche ; un email plus récent remis l'efface.
 */

import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { COLLECTION_LIENS } from "@/lib/lien-paiement";
import { lireEvenementResend, statutSuivant, verifierSignatureResend } from "@/lib/resend-webhook";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const secret = process.env.RESEND_WEBHOOK_SECRET || "";
  if (!secret) return NextResponse.json({ error: "RESEND_WEBHOOK_SECRET absent" }, { status: 500 });
  const corps = await req.text();
  const signe = verifierSignatureResend({
    id: req.headers.get("svix-id"),
    timestamp: req.headers.get("svix-timestamp"),
    signatures: req.headers.get("svix-signature"),
    corps,
    secret,
  });
  if (!signe) return NextResponse.json({ error: "Signature invalide" }, { status: 401 });

  let ev: any;
  try { ev = JSON.parse(corps); } catch { return NextResponse.json({ error: "JSON invalide" }, { status: 400 }); }
  const lu = lireEvenementResend(ev);
  // Événement sans intérêt ici (email.sent…) : accusé de réception quand même.
  if (!lu) return NextResponse.json({ received: true });

  const quand = new Date().toISOString();
  const echec = lu.statut === "bounced" || lu.statut === "complained";
  const paymentIds = new Set<string>();

  try {
    const [logs, liens] = await Promise.all([
      adminDb.collection("emailsSent").where("resendId", "==", lu.emailId).limit(5).get(),
      adminDb.collection(COLLECTION_LIENS).where("resendEmailId", "==", lu.emailId).limit(5).get(),
    ]);
    for (const d of logs.docs) {
      const x = d.data() as any;
      await d.ref.update({
        deliveryStatus: statutSuivant(x.deliveryStatus, lu.statut),
        deliveryStatusAt: quand,
        ...(lu.raison ? { deliveryRaison: lu.raison } : {}),
      });
      if (x.paymentId) paymentIds.add(String(x.paymentId));
    }
    for (const d of liens.docs) {
      const x = d.data() as any;
      await d.ref.update({
        emailStatus: statutSuivant(x.emailStatus, lu.statut),
        emailStatusAt: quand,
        ...(lu.raison ? { emailRaison: lu.raison } : {}),
      });
      if (x.paymentId) paymentIds.add(String(x.paymentId));
    }
    // Sur la commande : l'alerte d'un email rejeté, levée dès qu'un autre arrive.
    for (const pid of paymentIds) {
      const ref = adminDb.collection("payments").doc(pid);
      if (echec) {
        await ref.update({
          alerteEmail: { emailId: lu.emailId, statut: lu.statut, raison: lu.raison, to: lu.destinataires.join(", "), at: quand },
        }).catch(() => {});
      } else if (lu.statut === "delivered" || lu.statut === "opened" || lu.statut === "clicked") {
        const snap = await ref.get().catch(() => null);
        const alerte = snap?.exists ? (snap.data() as any)?.alerteEmail : null;
        if (alerte && alerte.emailId !== lu.emailId) await ref.update({ alerteEmail: FieldValue.delete() }).catch(() => {});
      }
    }
  } catch (e) {
    console.error("[webhook resend]", e);
    // 500 : Resend réessaiera plus tard.
    return NextResponse.json({ error: "Traitement impossible" }, { status: 500 });
  }
  return NextResponse.json({ received: true });
}
