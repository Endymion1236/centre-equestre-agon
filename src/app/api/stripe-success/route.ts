import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Appelé par le success_url de Stripe Checkout
// Marque la 1ère échéance comme payée dans Firestore via REST API
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const paymentId = searchParams.get("pid");
  const familyId = searchParams.get("fid");
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

  if (paymentId && projectId) {
    try {
      const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/payments/${paymentId}`;
      
      // Récupérer le document pour avoir le totalTTC
      const getRes = await fetch(firestoreUrl);
      const docData = await getRes.json();
      const totalTTC = docData?.fields?.totalTTC?.doubleValue || docData?.fields?.totalTTC?.integerValue || 0;

      // Marquer comme payé
      await fetch(`${firestoreUrl}?updateMask.fieldPaths=status&updateMask.fieldPaths=paidAmount&updateMask.fieldPaths=paymentMode`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fields: {
            status: { stringValue: "paid" },
            paidAmount: { doubleValue: Number(totalTTC) },
            paymentMode: { stringValue: "stripe" },
          },
        }),
      });
    } catch (e) {
      console.error("Error marking payment as paid:", e);
    }
  }

  // Rediriger vers la page paiements
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://centre-equestre-agon.vercel.app";
  return NextResponse.redirect(`${baseUrl}/admin/paiements?stripe=success&family=${familyId || ""}`);
}
