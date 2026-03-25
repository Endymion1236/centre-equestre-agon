import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { items, familyId, familyEmail, familyName, depositPercent, paymentId, stageDate } = body;

    if (!items || items.length === 0) {
      return NextResponse.json({ error: "Panier vide" }, { status: 400 });
    }

    const isDeposit = depositPercent && depositPercent > 0 && depositPercent < 100;
    const multiplier = isDeposit ? depositPercent / 100 : 1;

    // Créer ou trouver le customer Stripe (pour réutiliser la carte plus tard)
    let customer;
    const existingCustomers = await stripe.customers.list({ email: familyEmail, limit: 1 });
    if (existingCustomers.data.length > 0) {
      customer = existingCustomers.data[0];
    } else {
      customer = await stripe.customers.create({
        email: familyEmail,
        name: familyName,
        metadata: { familyId },
      });
    }

    const lineItems = items.map((item: any) => ({
      price_data: {
        currency: "eur",
        product_data: {
          name: isDeposit ? `Acompte ${depositPercent}% — ${item.name}` : item.name,
          description: item.description || undefined,
        },
        unit_amount: Math.round((item.priceInCents || 0) * multiplier),
      },
      quantity: item.quantity || 1,
    }));

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",
      customer: customer.id,
      payment_intent_data: {
        setup_future_usage: "off_session",
        metadata: {
          familyId,
          familyName,
          paymentId: paymentId || "",
          isDeposit: isDeposit ? "true" : "false",
          depositPercent: (depositPercent || 100).toString(),
          stageDate: stageDate || "",
        },
      },
      metadata: {
        familyId,
        familyName,
        source: "online",
        isDeposit: isDeposit ? "true" : "false",
        depositPercent: (depositPercent || 100).toString(),
        paymentId: paymentId || "",
        stageDate: stageDate || "",
      },
      line_items: lineItems,
      success_url: `${req.nextUrl.origin}/espace-cavalier/reservations?success=true&deposit=${isDeposit ? "true" : "false"}`,
      cancel_url: `${req.nextUrl.origin}/espace-cavalier/reserver?cancelled=true`,
    });

    return NextResponse.json({ url: session.url, sessionId: session.id, customerId: customer.id });
  } catch (error: any) {
    console.error("Stripe error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
