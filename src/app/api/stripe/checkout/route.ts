import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { items, familyId, familyEmail, familyName } = body;

    // items = [{ name, description, priceInCents, quantity }]
    if (!items || items.length === 0) {
      return NextResponse.json({ error: "Panier vide" }, { status: 400 });
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",
      customer_email: familyEmail,
      metadata: {
        familyId,
        familyName,
        source: "online",
      },
      line_items: items.map((item: any) => ({
        price_data: {
          currency: "eur",
          product_data: {
            name: item.name,
            description: item.description || undefined,
          },
          unit_amount: item.priceInCents, // en centimes
        },
        quantity: item.quantity || 1,
      })),
      success_url: `${req.nextUrl.origin}/espace-cavalier/reservations?success=true`,
      cancel_url: `${req.nextUrl.origin}/espace-cavalier/reserver?cancelled=true`,
    });

    return NextResponse.json({ url: session.url });
  } catch (error: any) {
    console.error("Stripe error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
