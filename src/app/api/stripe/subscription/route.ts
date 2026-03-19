import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { familyEmail, familyName, familyId, totalAmount, installments, description } = body;

    // totalAmount in cents, installments = 3 or 10
    if (!totalAmount || !installments || ![3, 10].includes(installments)) {
      return NextResponse.json({ error: "Paramètres invalides" }, { status: 400 });
    }

    const installmentAmount = Math.ceil(totalAmount / installments);

    // 1. Create or find customer
    const customers = await stripe.customers.list({ email: familyEmail, limit: 1 });
    let customer;
    if (customers.data.length > 0) {
      customer = customers.data[0];
    } else {
      customer = await stripe.customers.create({
        email: familyEmail,
        name: familyName,
        metadata: { familyId },
      });
    }

    // 2. Create a price for the installment plan
    const product = await stripe.products.create({
      name: `Forfait ${description || "Centre Équestre"} — ${installments}x`,
      metadata: { familyId },
    });

    const price = await stripe.prices.create({
      product: product.id,
      unit_amount: installmentAmount,
      currency: "eur",
      recurring: {
        interval: "month",
        interval_count: 1,
      },
    });

    // 3. Create Checkout Session for subscription (with SEPA option)
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card", "sepa_debit"],
      mode: "subscription",
      customer: customer.id,
      metadata: { familyId, familyName, installments: installments.toString(), totalAmount: totalAmount.toString() },
      line_items: [{ price: price.id, quantity: 1 }],
      subscription_data: {
        metadata: { familyId, familyName, totalAmount: totalAmount.toString() },
        // Cancel after X installments
      },
      success_url: `${req.nextUrl.origin}/espace-cavalier/reservations?success=true&plan=${installments}x`,
      cancel_url: `${req.nextUrl.origin}/espace-cavalier/reserver?cancelled=true`,
    });

    return NextResponse.json({ url: session.url });
  } catch (error: any) {
    console.error("Stripe subscription error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
