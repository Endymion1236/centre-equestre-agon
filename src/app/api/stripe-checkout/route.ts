import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  // Import dynamique pour éviter l'erreur au build sans clé
  const Stripe = (await import("stripe")).default;
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    return NextResponse.json({ error: "Stripe non configuré. Ajoutez STRIPE_SECRET_KEY dans les variables d'environnement Vercel." }, { status: 500 });
  }
  const stripe = new Stripe(secretKey, { apiVersion: "2025-02-24.acacia" });

  try {
    const body = await request.json();
    const { familyId, familyName, childName, email, forfaitLabel, totalTTC, nbEcheances, paymentIds } = body;

    if (!email || !totalTTC || !nbEcheances) {
      return NextResponse.json({ error: "Paramètres manquants" }, { status: 400 });
    }

    const montantMensuel = Math.round((totalTTC / nbEcheances) * 100); // centimes

    const product = await stripe.products.create({
      name: `${forfaitLabel || "Forfait équitation"} — ${childName}`,
      metadata: { familyId, familyName, childName },
    });

    const price = await stripe.prices.create({
      product: product.id,
      unit_amount: montantMensuel,
      currency: "eur",
      recurring: { interval: "month", interval_count: 1 },
    });

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || request.headers.get("origin") || "https://centre-equestre-agon.vercel.app";

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      customer_email: email,
      line_items: [{ price: price.id, quantity: 1 }],
      subscription_data: {
        metadata: {
          familyId, familyName, childName,
          forfaitLabel: forfaitLabel || "",
          paymentIds: JSON.stringify(paymentIds || []),
          nbEcheances: nbEcheances.toString(),
          totalTTC: totalTTC.toString(),
        },
      },
      metadata: { familyId, type: "forfait_echelonne" },
      success_url: `${baseUrl}/admin/paiements?stripe=success&family=${familyId}`,
      cancel_url: `${baseUrl}/admin/paiements?stripe=cancel`,
    });

    return NextResponse.json({ url: session.url, sessionId: session.id });
  } catch (error: any) {
    console.error("Stripe Checkout error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
