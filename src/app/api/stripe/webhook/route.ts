import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

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
        console.error("Webhook signature verification failed:", err.message);
        return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
      }
    } else {
      event = JSON.parse(body);
    }

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const meta = session.metadata || {};
        const familyId = meta.familyId;
        const paymentId = meta.paymentId;
        const isDeposit = meta.isDeposit === "true";
        const depositPercent = parseInt(meta.depositPercent || "100");
        const amountPaid = (session.amount_total || 0) / 100;
        const isSubscription = meta.isSubscription === "true";

        console.log(`✅ Stripe checkout: ${meta.familyName} — ${amountPaid}€ ${isDeposit ? `(acompte ${depositPercent}%)` : ""} ${isSubscription ? `(abonnement ${meta.nbEcheances}×)` : ""}`);

        // Pour les abonnements, enregistrer le subscriptionId
        if (isSubscription && session.subscription && paymentId) {
          await adminDb.collection("payments").doc(paymentId).update({
            stripeSubscriptionId: session.subscription,
            stripeCustomerId: session.customer || "",
            status: "partial",
            paidAmount: amountPaid,
            paidEcheances: 1,
            updatedAt: FieldValue.serverTimestamp(),
          });
          await adminDb.collection("encaissements").add({
            paymentId, familyId,
            familyName: meta.familyName || "",
            montant: amountPaid,
            mode: "stripe_subscription",
            modeLabel: `Stripe — Échéance 1/${meta.nbEcheances}`,
            ref: session.id,
            date: FieldValue.serverTimestamp(),
          });
          // Email confirmation abonnement
          const parentEmail = session.customer_details?.email || "";
          const resendKey = process.env.RESEND_API_KEY;
          if (parentEmail && resendKey) {
            await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: { "Authorization": `Bearer ${resendKey}`, "Content-Type": "application/json" },
              body: JSON.stringify({
                from: process.env.RESEND_FROM_EMAIL || "Centre Equestre <onboarding@resend.dev>",
                to: parentEmail,
                ...(process.env.RESEND_BCC_EMAIL ? { bcc: process.env.RESEND_BCC_EMAIL } : {}),
                subject: `Inscription confirmée — Paiement mensuel en ${meta.nbEcheances} fois`,
                html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;">
                  <p>Bonjour <strong>${meta.familyName}</strong>,</p>
                  <p>Votre inscription est confirmée avec un paiement en <strong>${meta.nbEcheances} mensualités</strong>.</p>
                  <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;margin:16px 0;">
                    <p style="margin:0;color:#166534;font-weight:600;">✅ 1ère échéance : ${amountPaid.toFixed(2)}€ reçue</p>
                    <p style="margin:8px 0 0;color:#555;font-size:13px;">Les ${parseInt(meta.nbEcheances)-1} prochaines mensualités de ${amountPaid.toFixed(2)}€ seront prélevées automatiquement.</p>
                  </div>
                  <p>À bientôt au centre équestre !</p>
                </div>`,
              }),
            }).catch(e => console.error("Email error:", e));
          }
          break;
        }

        if (familyId) {
          let payRef;
          if (paymentId) {
            payRef = adminDb.collection("payments").doc(paymentId);
            const snap = await payRef.get();
            if (!snap.exists) payRef = null;
          }
          
          if (!payRef) {
            const snap = await adminDb.collection("payments")
              .where("familyId", "==", familyId)
              .where("status", "==", "pending")
              .limit(5)
              .get();
            // Prendre le plus récent (sans orderBy pour éviter l'index composite)
            if (!snap.empty) {
              const sorted = snap.docs.sort((a, b) => {
                const da = a.data().date?.toMillis?.() || a.data().date?.seconds * 1000 || 0;
                const db2 = b.data().date?.toMillis?.() || b.data().date?.seconds * 1000 || 0;
                return db2 - da;
              });
              payRef = sorted[0].ref;
            }
          }

          if (payRef) {
            const paySnap = await payRef.get();
            const pData = paySnap.data()!;
            const totalTTC = pData.totalTTC || 0;
            const paidAmount = isDeposit ? Math.round(totalTTC * depositPercent / 100 * 100) / 100 : totalTTC;

            await payRef.update({
              status: isDeposit ? "partial" : "paid",
              paidAmount,
              paymentMode: "stripe",
              stripeSessionId: session.id,
              stripeCustomerId: session.customer || "",
              stripePaymentDate: new Date().toISOString(),
              updatedAt: FieldValue.serverTimestamp(),
            });

            await adminDb.collection("encaissements").add({
              paymentId: payRef.id,
              familyId,
              familyName: meta.familyName || pData.familyName || "",
              montant: amountPaid,
              mode: "stripe",
              modeLabel: isDeposit ? `Stripe (acompte ${depositPercent}%)` : "Stripe CB en ligne",
              ref: session.id,
              activityTitle: (pData.items || []).map((i: any) => i.activityTitle).join(", "),
              date: FieldValue.serverTimestamp(),
            });

            // ── Email de confirmation ──────────────────────────────────────
            const parentEmail = session.customer_details?.email || pData.familyEmail || "";
            const parentName  = meta.familyName || pData.familyName || "Client";
            const prestations = (pData.items || []).map((i: any) => i.activityTitle).join(", ") || "Prestation";
            const resendKey   = process.env.RESEND_API_KEY;
            const fromEmail   = process.env.RESEND_FROM_EMAIL || "Centre Equestre <onboarding@resend.dev>";

            if (parentEmail && resendKey) {
              try {
                // Déterminer le type d'email selon le contenu du panier
                const hasStage  = (pData.items || []).some((i: any) => i.activityType === "stage");
                const hasForfait = pData.echeancesTotal > 1 || pData.type === "annuel";

                let subject = `Paiement reçu — ${amountPaid.toFixed(2)}€`;
                let html = "";

                if (hasForfait) {
                  subject = `Inscription annuelle confirmée — ${(pData.items?.[0]?.childName) || ""}`;
                  html = `<p>Bonjour <strong>${parentName}</strong>,</p>
                  <p>L'inscription annuelle de <strong>${(pData.items?.[0]?.childName) || ""}</strong> est confirmée.</p>
                  <div style="background:#fefce8;border:1px solid #fde68a;border-radius:8px;padding:16px;margin:16px 0;">
                    <p style="margin:0;color:#854d0e;font-weight:600;">${prestations}</p>
                    <p style="margin:8px 0 0;color:#1e3a5f;font-weight:bold;font-size:16px;">${amountPaid.toFixed(2)}€ reçus${isDeposit ? ` (acompte ${depositPercent}%)` : ""}</p>
                    ${isDeposit ? `<p style="margin:6px 0 0;color:#92400e;font-size:13px;">Le solde sera prélevé selon votre échéancier.</p>` : ""}
                  </div>
                  <p>À bientôt au centre équestre !</p>`;
                } else if (hasStage) {
                  const dates = (pData.items || []).map((i: any) => i.activityTitle).join(", ");
                  subject = `Stage confirmé — ${(pData.items?.[0]?.activityTitle) || ""}`;
                  html = `<p>Bonjour <strong>${parentName}</strong>,</p>
                  <p>L'inscription au stage est confirmée !</p>
                  <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;margin:16px 0;">
                    <p style="margin:0;color:#166534;font-weight:600;">${dates}</p>
                    <p style="margin:8px 0 0;color:#1e3a5f;font-weight:bold;font-size:16px;">${amountPaid.toFixed(2)}€ reçus${isDeposit ? ` (acompte ${depositPercent}%)` : ""}</p>
                    ${isDeposit ? `<p style="margin:6px 0 0;color:#065f46;font-size:13px;">Le solde de ${(pData.totalTTC * 0.7).toFixed(2)}€ sera prélevé 3 jours avant le stage.</p>` : ""}
                  </div>
                  <p>À bientôt pour ce stage !</p>`;
                } else {
                  html = `<p>Bonjour <strong>${parentName}</strong>,</p>
                  <p>Nous avons bien reçu votre paiement :</p>
                  <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;margin:16px 0;">
                    <p style="margin:0;color:#166534;font-weight:600;font-size:18px;">✅ ${amountPaid.toFixed(2)}€ reçus</p>
                    <p style="margin:8px 0 0;color:#555;font-size:13px;">${prestations}</p>
                  </div>
                  <p>À bientôt au centre équestre !</p>`;
                }

                await fetch("https://api.resend.com/emails", {
                  method: "POST",
                  headers: { "Authorization": `Bearer ${resendKey}`, "Content-Type": "application/json" },
                  body: JSON.stringify({
                    from: fromEmail,
                    to: parentEmail,
                    ...(process.env.RESEND_BCC_EMAIL ? { bcc: process.env.RESEND_BCC_EMAIL } : {}),
                    subject,
                    html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;">${html}<hr style="margin:24px 0;border:none;border-top:1px solid #eee;"><p style="color:#999;font-size:11px;text-align:center;">Centre Équestre d'Agon-Coutainville — Paiement sécurisé par Stripe</p></div>`,
                  }),
                });
                console.log(`  → Email confirmation envoyé à ${parentEmail}`);
              } catch (emailErr) {
                console.error("  ⚠️ Email confirmation failed:", emailErr);
              }
            }

            console.log(`  → Payment ${payRef.id}: ${isDeposit ? "partial" : "paid"} — ${paidAmount}€`);
          }
        }
        break;
      }

      case "payment_intent.succeeded": {
        const intent = event.data.object;
        const meta = intent.metadata || {};
        if (meta.type === "balance_charge" && meta.paymentId) {
          const amountPaid = (intent.amount || 0) / 100;
          const payRef = adminDb.collection("payments").doc(meta.paymentId);
          const paySnap = await payRef.get();
          if (paySnap.exists) {
            const pData = paySnap.data()!;
            const newPaid = (pData.paidAmount || 0) + amountPaid;
            await payRef.update({
              status: newPaid >= (pData.totalTTC || 0) ? "paid" : "partial",
              paidAmount: Math.round(newPaid * 100) / 100,
              updatedAt: FieldValue.serverTimestamp(),
            });
            await adminDb.collection("encaissements").add({
              paymentId: meta.paymentId,
              familyId: meta.familyId || pData.familyId,
              familyName: pData.familyName || "",
              montant: amountPaid,
              mode: "stripe",
              modeLabel: "Stripe (solde prélevé)",
              ref: intent.id,
              activityTitle: (pData.items || []).map((i: any) => i.activityTitle).join(", "),
              date: FieldValue.serverTimestamp(),
            });
          }
        }
        break;
      }

      case "payment_intent.payment_failed": {
        const intent = event.data.object;
        console.error(`❌ Payment failed: ${intent.metadata?.familyName} — ${intent.last_payment_error?.message}`);
        break;
      }

      // ── Prélèvement mensuel automatique réussi ────────────────────────────
      case "invoice.paid": {
        const invoice = event.data.object as any;
        const subscriptionId = invoice.subscription;
        if (!subscriptionId) break;

        // Trouver le paiement associé à cette subscription
        const paySnap = await adminDb.collection("payments")
          .where("stripeSubscriptionId", "==", subscriptionId)
          .limit(1).get();
        if (paySnap.empty) break;

        const payRef = paySnap.docs[0].ref;
        const pData = paySnap.docs[0].data();
        const amountPaid = invoice.amount_paid / 100;
        const paidEcheances = (pData.paidEcheances || 0) + 1;
        const nbEcheances = pData.echeancesTotal || 10;
        const totalTTC = pData.totalTTC || 0;
        const newPaidAmount = Math.round(((pData.paidAmount || 0) + amountPaid) * 100) / 100;
        const isComplete = paidEcheances >= nbEcheances;

        await payRef.update({
          paidAmount: newPaidAmount,
          paidEcheances,
          status: isComplete ? "paid" : "partial",
          updatedAt: FieldValue.serverTimestamp(),
        });

        await adminDb.collection("encaissements").add({
          paymentId: payRef.id,
          familyId: pData.familyId,
          familyName: pData.familyName || "",
          montant: amountPaid,
          mode: "stripe_subscription",
          modeLabel: `Stripe — Échéance ${paidEcheances}/${nbEcheances}`,
          ref: invoice.id,
          date: FieldValue.serverTimestamp(),
        });

        console.log(`✅ Mensualité ${paidEcheances}/${nbEcheances} — ${pData.familyName} — ${amountPaid}€`);
        if (isComplete) {
          console.log(`  → Abonnement terminé pour ${pData.familyName}`);
          // Annuler la subscription Stripe automatiquement
          try {
            await stripe.subscriptions.cancel(subscriptionId);
          } catch (e) { console.error("Erreur annulation subscription:", e); }
        }
        break;
      }

      // ── Échec prélèvement mensuel ─────────────────────────────────────────
      case "invoice.payment_failed": {
        const invoice = event.data.object as any;
        const subscriptionId = invoice.subscription;
        if (!subscriptionId) break;

        const paySnap = await adminDb.collection("payments")
          .where("stripeSubscriptionId", "==", subscriptionId)
          .limit(1).get();
        if (!paySnap.empty) {
          await paySnap.docs[0].ref.update({
            lastPaymentError: invoice.last_payment_error?.message || "Échec prélèvement",
            updatedAt: FieldValue.serverTimestamp(),
          });
        }
        console.error(`❌ Échec mensualité — subscription ${subscriptionId}`);
        break;
      }
    }

    return NextResponse.json({ received: true });
  } catch (error: any) {
    console.error("Webhook error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
