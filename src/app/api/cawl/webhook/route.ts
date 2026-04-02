import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { loadTemplate } from "@/lib/email-template-loader";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.text();
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
        // Éviter la double mise à jour (la route status a peut-être déjà mis à jour)
        if (pData.status !== "paid") {
          const totalTTC = pData.totalTTC || totalEuros;

          await payRef.update({
            status: "paid",
            paidAmount: totalTTC,
            paymentMode: "cb_online",
            paymentRef: `CAWL-${payment.id}`,
            updatedAt: FieldValue.serverTimestamp(),
          });

          await adminDb.collection("encaissements").add({
            paymentId: payRef.id,
            familyId: pData.familyId,
            familyName: pData.familyName || "",
            montant: totalTTC,
            mode: "cb_online",
            modeLabel: "CB en ligne (CAWL)",
            ref: `CAWL-${payment.id}`,
            activityTitle: (pData.items || []).map((i: any) => i.activityTitle).join(", "),
            date: FieldValue.serverTimestamp(),
          });

          console.log(`✅ CAWL webhook payment confirmé: ${merchantRef} — ${totalTTC}€`);

          // ── Email de confirmation ─────────────────────────────────────
          const parentEmail = pData.familyEmail || "";
          const parentName = pData.familyName || "Client";
          const resendKey = process.env.RESEND_API_KEY;
          const fromEmail = process.env.RESEND_FROM_EMAIL || "Centre Equestre <onboarding@resend.dev>";

          if (parentEmail && resendKey) {
            try {
              const prestations = (pData.items || []).map((i: any) => i.activityTitle).join(", ") || "Prestation";
              const hasStage = (pData.items || []).some((i: any) => i.activityType === "stage");

              let templateKey = "confirmationPaiement";
              let vars: Record<string, string | number> = {
                parentName,
                montant: totalTTC.toFixed(2),
                prestations,
              };

              if (hasStage) {
                templateKey = "confirmationStage";
                vars = {
                  parentName,
                  stageTitle: pData.items?.[0]?.activityTitle || "Stage",
                  dates: prestations,
                  horaires: "",
                  enfants: (pData.items || []).map((i: any) => i.childName).filter(Boolean).join(", "),
                  montant: totalTTC.toFixed(2),
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
              }).catch(e => console.error("Email webhook CAWL error:", e));
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
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
