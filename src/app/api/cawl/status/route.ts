import { NextRequest, NextResponse } from "next/server";
import { cawlSdk, CAWL_PSPID } from "@/lib/cawl";
import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const ref = req.nextUrl.searchParams.get("ref") || "";
  const paymentId = req.nextUrl.searchParams.get("paymentId") || "";
  const familyId = req.nextUrl.searchParams.get("familyId") || "";
  const hostedCheckoutId = req.nextUrl.searchParams.get("RETURNMAC")
    ? req.nextUrl.searchParams.get("hostedCheckoutId") || ""
    : "";

  try {
    // Si on a un hostedCheckoutId, vérifier le statut
    if (hostedCheckoutId && CAWL_PSPID) {
      const statusResponse = await cawlSdk.hostedCheckout.getHostedCheckout(
        CAWL_PSPID,
        hostedCheckoutId,
        {}
      );

      const status = statusResponse.body?.status;
      const paymentStatus = statusResponse.body?.createdPaymentOutput?.payment?.status;

      // Si le paiement est confirmé, mettre à jour Firestore
      if (paymentStatus === "CAPTURED" || paymentStatus === "PAID" || status === "PAYMENT_CREATED") {
        if (paymentId) {
          const totalCents = statusResponse.body?.createdPaymentOutput?.payment?.paymentOutput?.amountOfMoney?.amount || 0;
          const totalEuros = totalCents / 100;

          await adminDb.collection("payments").doc(paymentId).update({
            status: "paid",
            paidAmount: totalEuros,
            paymentMode: "cb_online",
            paymentRef: `CAWL-${hostedCheckoutId}`,
            updatedAt: FieldValue.serverTimestamp(),
          });

          // Créer l'encaissement
          await adminDb.collection("encaissements").add({
            paymentId,
            familyId,
            montant: totalEuros,
            mode: "cb_online",
            modeLabel: "CB en ligne (CAWL)",
            ref: `CAWL-${hostedCheckoutId}`,
            date: FieldValue.serverTimestamp(),
          });
        }
      }
    }

    // Rediriger vers la page de confirmation
    return NextResponse.redirect(
      new URL(`/espace-cavalier/reservations?success=true`, req.nextUrl.origin)
    );
  } catch (error: any) {
    console.error("CAWL status error:", error);
    // Même en cas d'erreur, rediriger vers les réservations
    return NextResponse.redirect(
      new URL(`/espace-cavalier/reservations?success=true`, req.nextUrl.origin)
    );
  }
}
