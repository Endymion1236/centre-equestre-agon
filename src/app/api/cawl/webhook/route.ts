import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { loadTemplate } from "@/lib/email-template-loader";
import { awardLoyaltyPointsServer } from "@/lib/fidelite";
import { confirmReservationsForPayment } from "@/lib/reservations";
import { createForfaitsForPayment } from "@/lib/forfaits-server";
import { acquireCawlConfirmationLock } from "@/lib/cawl-lock";
import { logEmail } from "@/lib/email-log";
import { isRecipientAllowed } from "@/lib/email-guard";
import { createEncaissementServer } from "@/lib/compta-encaissement-server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.text();

    // Vérification HMAC-SHA256 — CAWL signe les webhooks avec CAWL_SECRET_API_KEY
    const signature = req.headers.get("x-gcs-signature") || req.headers.get("x-signature") || "";
    const webhookSecret = process.env.CAWL_SECRET_API_KEY || process.env.CAWL_SECRET_API_KEY_VALUE || "";

    // Refus strict si secret non configuré (pas de mode "on continue quand même")
    if (!webhookSecret) {
      console.error("CAWL webhook: CAWL_SECRET_API_KEY non configuré — requête rejetée");
      return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
    }

    if (!signature) {
      console.error("CAWL webhook: signature absente");
      return NextResponse.json({ error: "Missing signature" }, { status: 400 });
    }

    const crypto = await import("crypto");
    const expectedSig = crypto
      .createHmac("sha256", webhookSecret)
      .update(body)
      .digest("base64");
    if (expectedSig !== signature) {
      console.error("CAWL webhook: signature invalide");
      return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }

    let event: any;
    try {
      event = JSON.parse(body);
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    console.log(`CAWL webhook: type=${event.type}, id=${event.payment?.id}`);

    const payment = event.payment;
    if (!payment) {
      return NextResponse.json({ received: true });
    }

    const status = payment.status;
    const merchantRef = payment.paymentOutput?.references?.merchantReference || "";
    const totalCents = payment.paymentOutput?.amountOfMoney?.amount || 0;
    const totalEuros = totalCents / 100;
    const hostedCheckoutId = payment.hostedCheckoutSpecificOutput?.hostedCheckoutId || "";

    // ── Paiement confirmé ─────────────────────────────────────────────────
    if (status === "CAPTURED" || status === "PAID" || status === "PENDING_CAPTURE") {

      // Chercher le payment par cawlRef (merchantReference)
      let payRef = null;
      let pData: any = null;

      if (merchantRef) {
        const snap = await adminDb.collection("payments")
          .where("cawlRef", "==", merchantRef)
          .limit(1)
          .get();
        if (!snap.empty) {
          payRef = snap.docs[0].ref;
          pData = snap.docs[0].data();
        }
      }

      // Fallback : chercher par hostedCheckoutId
      if (!payRef && hostedCheckoutId) {
        const snap = await adminDb.collection("payments")
          .where("cawlHostedCheckoutId", "==", hostedCheckoutId)
          .limit(1)
          .get();
        if (!snap.empty) {
          payRef = snap.docs[0].ref;
          pData = snap.docs[0].data();
        }
      }

      if (payRef && pData) {
        // ── Acompte ou paiement total ? ──────────────────────────────────
        // Le webhook n'a pas accès aux query params de l'URL de retour : on lit
        // le marqueur stocké dans cawl_sessions au checkout. Fallback heuristique
        // pour les sessions antérieures : montant CAWL < totalTTC ⇒ acompte.
        let isDeposit = false;
        try {
          if (hostedCheckoutId) {
            const sessSnap = await adminDb.collection("cawl_sessions").doc(hostedCheckoutId).get();
            if (sessSnap.exists) isDeposit = !!(sessSnap.data() as any)?.isDeposit;
          }
        } catch (e) { console.warn("CAWL webhook: lecture cawl_sessions impossible:", e); }
        if (!isDeposit && totalEuros > 0 && (pData.totalTTC || 0) > 0 && totalEuros < pData.totalTTC - 0.01) {
          isDeposit = true; // heuristique : montant encaissé < total dû
        }

        // ── Verrou anti-doublon ──────────────────────────────────────────
        // Empêche webhook + status d'écrire tous les deux si appelés en
        // parallèle. IMPORTANT : le stage doit être le même que celui utilisé
        // par la route status (deposit/full), sinon les deux verrous sont
        // distincts et le paiement serait traité deux fois (double encaissement).
        const lockAcquired = await acquireCawlConfirmationLock({
          hostedCheckoutId,
          stage: isDeposit ? "deposit" : "full",
          source: "webhook",
          paymentId: payRef.id,
          amountCents: totalCents,
        });

        if (!lockAcquired) {
          console.log(
            `CAWL webhook: confirmation déjà traitée pour ${merchantRef}, skip`
          );
          return NextResponse.json({ received: true });
        }

        if (pData.status !== "paid") {
          const totalTTC = pData.totalTTC || totalEuros;
          // Montant réellement encaissé : pour un acompte, c'est le montant CAWL
          // (jamais le total dû). Pour un paiement total, totalTTC comme avant.
          const paidAmount = isDeposit ? (totalEuros || pData.acompteAmount || 0) : totalTTC;

          // Token Card On File + référence du paiement initial : indispensables
          // pour le prélèvement automatique du solde (MIT). Le webhook est le
          // seul point de confirmation si la famille ferme son navigateur avant
          // la redirection — sans cette capture, le solde ne serait jamais
          // prélevable automatiquement.
          const cofToken = payment.paymentOutput?.cardPaymentMethodSpecificOutput?.token || "";
          const cofSchemeTxId = payment.paymentOutput?.cardPaymentMethodSpecificOutput?.schemeTransactionId || "";

          await payRef.update({
            status: isDeposit ? "partial" : "paid",
            paidAmount,
            paymentMode: "cb_online",
            paymentRef: `CAWL-${payment.id}`,
            ...(cofToken ? { cofToken, cawlTokenizedAt: FieldValue.serverTimestamp() } : {}),
            ...(cofSchemeTxId ? { cofSchemeTransactionId: cofSchemeTxId } : {}),
            ...(payment.id ? { cofInitialPaymentId: payment.id } : {}),
            updatedAt: FieldValue.serverTimestamp(),
          });

          await createEncaissementServer({
            paymentId: payRef.id,
            familyId: pData.familyId,
            familyName: pData.familyName || "",
            montant: paidAmount,
            mode: "cb_online",
            modeLabel: isDeposit ? "CB en ligne CAWL (acompte)" : "CB en ligne (CAWL)",
            ref: `CAWL-${payment.id}`,
            activityTitle: (pData.items || []).map((i: any) => i.activityTitle).join(", "),
          });

          console.log(`✅ CAWL webhook payment confirmé: ${merchantRef} — ${paidAmount}€${isDeposit ? " (acompte)" : ""}`);

          // ── Attribution des points de fidélité ────────────────────────
          // Non-bloquant : erreurs loggées mais n'interrompent pas le flow
          await awardLoyaltyPointsServer({
            familyId: pData.familyId,
            familyName: pData.familyName,
            montant: totalTTC,
            label: (pData.items || []).map((i: any) => i.activityTitle).join(", ") || "Paiement en ligne",
          });

          // ── Confirmer les réservations associées ──────────────────────
          // Les réservations créées en pending_payment au checkout doivent
          // passer en confirmed maintenant que le paiement est confirmé
          await confirmReservationsForPayment({
            familyId: pData.familyId,
            items: pData.items || [],
          });

          // ── Créer les forfaits annuels (inscription CB) ───────────────
          // Les payloads sont portés par le paiement (la famille ne peut pas
          // écrire dans `forfaits`). Création serveur ici. No-op si absent.
          await createForfaitsForPayment({
            paymentId: payRef.id,
            forfaitPayloads: pData.forfaitPayloads || [],
          });

          // ── Email de confirmation ─────────────────────────────────────
          const parentEmail = pData.familyEmail || "";
          const parentName = pData.familyName || "Client";
          const resendKey = process.env.RESEND_API_KEY;
          const fromEmail = process.env.RESEND_FROM_EMAIL || "Centre Equestre <onboarding@resend.dev>";

          if (parentEmail && resendKey && isRecipientAllowed(parentEmail)) {
            try {
              const prestations = (pData.items || []).map((i: any) => i.activityTitle).join(", ") || "Prestation";
              const hasStage = (pData.items || []).some((i: any) => i.activityType === "stage");

              let templateKey = "confirmationPaiement";
              let vars: Record<string, string | number> = {
                parentName,
                montant: paidAmount.toFixed(2),
                prestations,
                mode: "Carte bancaire en ligne (CAWL)",
              };

              if (hasStage) {
                // Acompte → template dédié avec récap total/acompte/solde ;
                // paiement total → template classique. Toujours le montant
                // réellement encaissé (paidAmount), jamais le total pour un acompte.
                templateKey = isDeposit ? "confirmationStageAcompte" : "confirmationStage";
                const enfantsList = (pData.items || [])
                  .map((i: any) => i.childName).filter(Boolean).join(", ") || "Cavalier(s)";
                const soldeRestant = Math.max(0, +(((pData.totalTTC || 0)) - paidAmount).toFixed(2));
                const soldePhrase = cofToken
                  ? `Le solde de ${soldeRestant.toFixed(2)}€ sera prélevé automatiquement sur votre carte enregistrée environ une semaine avant le début du stage. Aucune action n'est requise.`
                  : `Un email avec le lien de paiement du solde (${soldeRestant.toFixed(2)}€) vous sera envoyé environ une semaine avant le début du stage.`;
                vars = {
                  parentName,
                  stageTitle: pData.items?.[0]?.activityTitle || "Stage",
                  dates: pData.stageDate || prestations,
                  horaires: pData.items?.[0]?.stageSchedule || "",
                  enfants: enfantsList,
                  montant: paidAmount.toFixed(2),
                  acompte: paidAmount.toFixed(2),
                  solde: soldeRestant.toFixed(2),
                  total: (pData.totalTTC || 0).toFixed(2),
                  soldePhrase,
                };
              }

              const { subject, html } = await loadTemplate(templateKey, vars);
              fetch("https://api.resend.com/emails", {
                method: "POST",
                headers: {
                  "Authorization": `Bearer ${resendKey}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  from: fromEmail,
                  to: parentEmail,
                  ...(process.env.RESEND_BCC_EMAIL ? { bcc: process.env.RESEND_BCC_EMAIL } : {}),
                  subject,
                  html,
                }),
              })
                .then(async (res) => {
                  if (res.ok) {
                    await logEmail({ to: parentEmail, subject, context: "cawl_webhook", template: templateKey, status: "sent", sentBy: "system", paymentId: merchantRef, familyId: pData.familyId });
                  } else {
                    const errText = await res.text().catch(() => "");
                    await logEmail({ to: parentEmail, subject, context: "cawl_webhook", template: templateKey, status: "failed", error: `HTTP ${res.status}: ${errText}`.slice(0, 500), sentBy: "system", paymentId: merchantRef, familyId: pData.familyId });
                  }
                })
                .catch(async (e) => {
                  await logEmail({ to: parentEmail, subject, context: "cawl_webhook", template: templateKey, status: "failed", error: e?.message || String(e), sentBy: "system", paymentId: merchantRef, familyId: pData.familyId });
                  console.error("Email webhook CAWL error:", e);
                });
            } catch (emailErr) {
              console.error("Email template CAWL webhook error:", emailErr);
            }
          }
        } else {
          console.log(`CAWL webhook: paiement ${merchantRef} déjà confirmé, skip`);
        }
      } else {
        console.warn(`CAWL webhook: payment Firestore introuvable pour ref=${merchantRef}`);
      }
    }

    // ── Paiement échoué / annulé ──────────────────────────────────────────
    if (status === "REJECTED" || status === "CANCELLED" || status === "REJECTED_CAPTURE") {
      console.log(`❌ CAWL payment failed: ref=${merchantRef}, status=${status}`);

      if (merchantRef) {
        const snap = await adminDb.collection("payments")
          .where("cawlRef", "==", merchantRef)
          .limit(1)
          .get();
        if (!snap.empty) {
          await snap.docs[0].ref.update({
            cawlLastFailStatus: status,
            updatedAt: FieldValue.serverTimestamp(),
          });
        }
      }
    }

    return NextResponse.json({ received: true });
  } catch (error: any) {
    console.error("CAWL webhook error:", error);
    console.error("API error:", error);
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}
