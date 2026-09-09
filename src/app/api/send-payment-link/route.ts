import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/api-auth";
import { envoyerLienPaiement } from "@/lib/lien-paiement";

export const dynamic = "force-dynamic";

/**
 * POST /api/send-payment-link
 *
 * Envoie un lien de paiement CAWL à une famille. Le corps du traitement vit
 * dans lib/lien-paiement — la confirmation de stage différée l'appelle
 * directement, sans repasser par ici.
 */
export async function POST(req: NextRequest) {
  // 🔒 Auth obligatoire — route admin
  const auth = await verifyAuth(req, { adminOnly: true });
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await req.json();
    const {
      paymentId,
      recipientEmail,
      amount, // montant custom en euros
      message, // message personnalisé
      familyId,
      familyName,
    } = body;

    const r = await envoyerLienPaiement({
      paymentId,
      recipientEmail,
      amount: Number(amount),
      message,
      familyId,
      familyName,
      origin: req.nextUrl.origin,
      authHeader: req.headers.get("authorization") || "",
      sentBy: (auth as any)?.uid || "admin",
    });

    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    return NextResponse.json({
      success: true,
      paymentUrl: r.paymentUrl,
      linkId: r.linkId,
      expiresAt: r.expiresAt,
    });
  } catch (error: any) {
    console.error("send-payment-link error:", error);
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}
