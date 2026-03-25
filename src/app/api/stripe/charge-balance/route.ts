import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";

export const dynamic = "force-dynamic";

/**
 * Prélève le solde d'un stage dont l'acompte a été payé.
 * Utilise la carte enregistrée lors du paiement de l'acompte.
 * 
 * POST /api/stripe/charge-balance
 * Body: { customerId, amountCents, description, familyId, paymentId }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { customerId, amountCents, description, familyId, paymentId } = body;

    if (!customerId || !amountCents) {
      return NextResponse.json({ error: "customerId et amountCents requis" }, { status: 400 });
    }

    // Récupérer le moyen de paiement par défaut du customer
    const paymentMethods = await stripe.paymentMethods.list({
      customer: customerId,
      type: "card",
    });

    if (paymentMethods.data.length === 0) {
      return NextResponse.json({ error: "Aucune carte enregistrée pour ce client" }, { status: 400 });
    }

    const paymentMethod = paymentMethods.data[0]; // La plus récente

    // Créer le PaymentIntent off-session (prélèvement automatique)
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: "eur",
      customer: customerId,
      payment_method: paymentMethod.id,
      off_session: true,
      confirm: true,
      description: description || "Solde stage",
      metadata: {
        familyId: familyId || "",
        paymentId: paymentId || "",
        type: "balance_charge",
      },
    });

    return NextResponse.json({
      success: true,
      paymentIntentId: paymentIntent.id,
      status: paymentIntent.status,
      amount: amountCents / 100,
    });
  } catch (error: any) {
    console.error("Stripe charge-balance error:", error);

    // Si la carte est refusée ou expirée
    if (error.code === "card_declined" || error.code === "expired_card") {
      return NextResponse.json({
        error: "Carte refusée ou expirée. Le parent devra payer manuellement.",
        code: error.code,
      }, { status: 402 });
    }

    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
