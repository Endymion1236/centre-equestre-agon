import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";

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
        return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
      }
    } else {
      event = JSON.parse(body);
    }

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        console.log(`✅ Payment completed: ${session.id} — ${session.metadata?.familyName} — ${session.amount_total / 100}€`);
        // Reservations are already confirmed at checkout time in our flow
        // This webhook serves as backup confirmation
        break;
      }
      case "payment_intent.payment_failed": {
        const intent = event.data.object;
        console.log(`❌ Payment failed: ${intent.metadata?.familyName}`);
        break;
      }
      case "invoice.payment_succeeded": {
        const invoice = event.data.object;
        console.log(`✅ Subscription payment: ${invoice.id}`);
        break;
      }
    }

    return NextResponse.json({ received: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
