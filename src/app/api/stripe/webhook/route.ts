import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.text();
    const sig = req.headers.get("stripe-signature");
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    let event;
    if (webhookSecret && sig) {
      try {
        event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
      } catch (err: any) {
        console.error("Webhook signature verification failed:", err.message);
        return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
      }
    } else {
      event = JSON.parse(body);
    }

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const meta = session.metadata || {};
        const familyId = meta.familyId;
        const paymentId = meta.paymentId;
        const isDeposit = meta.isDeposit === "true";
        const depositPercent = parseInt(meta.depositPercent || "100");
        const amountPaid = (session.amount_total || 0) / 100;

        console.log(`✅ Stripe checkout: ${meta.familyName} — ${amountPaid}€ ${isDeposit ? `(acompte ${depositPercent}%)` : ""}`);

        if (familyId) {
          let payRef;
          if (paymentId) {
            payRef = adminDb.collection("payments").doc(paymentId);
            const snap = await payRef.get();
            if (!snap.exists) payRef = null;
          }
          
          if (!payRef) {
            const snap = await adminDb.collection("payments")
              .where("familyId", "==", familyId)
              .where("status", "==", "pending")
              .orderBy("date", "desc")
              .limit(1)
              .get();
            if (!snap.empty) payRef = snap.docs[0].ref;
          }

          if (payRef) {
            const paySnap = await payRef.get();
            const pData = paySnap.data()!;
            const totalTTC = pData.totalTTC || 0;
            const paidAmount = isDeposit ? Math.round(totalTTC * depositPercent / 100 * 100) / 100 : totalTTC;

            await payRef.update({
              status: isDeposit ? "partial" : "paid",
              paidAmount,
              paymentMode: "stripe",
              stripeSessionId: session.id,
              stripeCustomerId: session.customer || "",
              stripePaymentDate: new Date().toISOString(),
              updatedAt: FieldValue.serverTimestamp(),
            });

            await adminDb.collection("encaissements").add({
              paymentId: payRef.id,
              familyId,
              familyName: meta.familyName || pData.familyName || "",
              montant: amountPaid,
              mode: "stripe",
              modeLabel: isDeposit ? `Stripe (acompte ${depositPercent}%)` : "Stripe CB en ligne",
              ref: session.id,
              activityTitle: (pData.items || []).map((i: any) => i.activityTitle).join(", "),
              date: FieldValue.serverTimestamp(),
            });

            console.log(`  → Payment ${payRef.id}: ${isDeposit ? "partial" : "paid"} — ${paidAmount}€`);
          }
        }
        break;
      }

      case "payment_intent.succeeded": {
        const intent = event.data.object;
        const meta = intent.metadata || {};
        if (meta.type === "balance_charge" && meta.paymentId) {
          const amountPaid = (intent.amount || 0) / 100;
          const payRef = adminDb.collection("payments").doc(meta.paymentId);
          const paySnap = await payRef.get();
          if (paySnap.exists) {
            const pData = paySnap.data()!;
            const newPaid = (pData.paidAmount || 0) + amountPaid;
            await payRef.update({
              status: newPaid >= (pData.totalTTC || 0) ? "paid" : "partial",
              paidAmount: Math.round(newPaid * 100) / 100,
              updatedAt: FieldValue.serverTimestamp(),
            });
            await adminDb.collection("encaissements").add({
              paymentId: meta.paymentId,
              familyId: meta.familyId || pData.familyId,
              familyName: pData.familyName || "",
              montant: amountPaid,
              mode: "stripe",
              modeLabel: "Stripe (solde prélevé)",
              ref: intent.id,
              activityTitle: (pData.items || []).map((i: any) => i.activityTitle).join(", "),
              date: FieldValue.serverTimestamp(),
            });
          }
        }
        break;
      }

      case "payment_intent.payment_failed": {
        const intent = event.data.object;
        console.error(`❌ Payment failed: ${intent.metadata?.familyName} — ${intent.last_payment_error?.message}`);
        break;
      }
    }

    return NextResponse.json({ received: true });
  } catch (error: any) {
    console.error("Webhook error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
