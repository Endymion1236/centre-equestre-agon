import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const Stripe = (await import("stripe")).default;
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) return NextResponse.json({ error: "Stripe non configuré" }, { status: 500 });

  const stripe = new Stripe(secretKey, { apiVersion: "2025-02-24.acacia" });
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || "";
  const body = await request.text();
  const sig = request.headers.get("stripe-signature");

  let event: any;
  try {
    event = webhookSecret && sig ? stripe.webhooks.constructEvent(body, sig, webhookSecret) : JSON.parse(body);
  } catch (err: any) {
    console.error("Webhook signature error:", err.message);
    return NextResponse.json({ error: "Webhook error" }, { status: 400 });
  }

  if (event.type === "invoice.paid") {
    const invoice = event.data.object;
    const subscriptionId = invoice.subscription;
    if (subscriptionId) {
      try {
        const sub = await stripe.subscriptions.retrieve(subscriptionId as string);
        const meta = sub.metadata;
        const paymentIds: string[] = meta.paymentIds ? JSON.parse(meta.paymentIds) : [];
        const nbEcheances = parseInt(meta.nbEcheances || "1");
        const invoices = await stripe.invoices.list({ subscription: subscriptionId as string, status: "paid", limit: 20 });
        const paidCount = invoices.data.length;
        const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
        if (projectId && paymentIds.length > 0) {
          const idx = Math.min(paidCount - 1, paymentIds.length - 1);
          const pid = paymentIds[idx];
          if (pid) {
            const getUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/payments/${pid}`;
            const getRes = await fetch(getUrl);
            const docData = await getRes.json();
            const ttc = docData?.fields?.totalTTC?.doubleValue || docData?.fields?.totalTTC?.integerValue || 0;
            await fetch(`${getUrl}?updateMask.fieldPaths=status&updateMask.fieldPaths=paidAmount&updateMask.fieldPaths=paymentMode&updateMask.fieldPaths=stripeInvoiceId`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ fields: { status: { stringValue: "paid" }, paidAmount: { doubleValue: Number(ttc) }, paymentMode: { stringValue: "stripe" }, stripeInvoiceId: { stringValue: invoice.id } } }),
            });
            console.log(`Échéance ${paidCount}/${nbEcheances} payée — ${meta.familyName} — ${meta.childName}`);
          }
        }
        if (paidCount >= nbEcheances) {
          await stripe.subscriptions.cancel(subscriptionId as string);
          console.log(`Subscription terminée après ${nbEcheances} échéances`);
        }
      } catch (e) { console.error("Webhook processing error:", e); }
    }
  }
  if (event.type === "invoice.payment_failed") {
    console.error("Paiement échoué:", event.data.object.id);
  }
  return NextResponse.json({ received: true });
}
