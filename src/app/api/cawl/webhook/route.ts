import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.text();
    const event = JSON.parse(body);

    // Log l'événement
    console.log(`CAWL webhook: type=${event.type}, id=${event.payment?.id}`);

    const payment = event.payment;
    if (!payment) {
      return NextResponse.json({ received: true });
    }

    const status = payment.status;
    const merchantRef = payment.paymentOutput?.references?.merchantReference || "";
    const totalCents = payment.paymentOutput?.amountOfMoney?.amount || 0;
    const totalEuros = totalCents / 100;

    // Paiement confirmé
    if (status === "CAPTURED" || status === "PAID") {

      // Trouver le paiement par merchantRef
      if (merchantRef) {
        const paySnap = await adminDb.collection("payments")
          .where("cawlRef", "==", merchantRef)
          .limit(1)
          .get();

        if (!paySnap.empty) {
          const payDoc = paySnap.docs[0];
          await payDoc.ref.update({
            status: "paid",
            paidAmount: totalEuros,
            paymentMode: "cb_online",
            paymentRef: `CAWL-${payment.id}`,
            updatedAt: FieldValue.serverTimestamp(),
          });

          // Créer l'encaissement
          await adminDb.collection("encaissements").add({
            paymentId: payDoc.id,
            familyId: payDoc.data().familyId,
            familyName: payDoc.data().familyName || "",
            montant: totalEuros,
            mode: "cb_online",
            modeLabel: "CB en ligne (CAWL)",
            ref: `CAWL-${payment.id}`,
            activityTitle: (payDoc.data().items || []).map((i: any) => i.activityTitle).join(", "),
            date: FieldValue.serverTimestamp(),
          });

          console.log(`✅ CAWL payment confirmed: ${merchantRef} — ${totalEuros}€`);
        }
      }
    }

    // Paiement échoué
    if (status === "REJECTED" || status === "CANCELLED") {
      console.log(`❌ CAWL payment failed: ${merchantRef} — status=${status}`);
    }

    return NextResponse.json({ received: true });
  } catch (error: any) {
    console.error("CAWL webhook error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
