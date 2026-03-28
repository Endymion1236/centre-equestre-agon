import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results: any[] = [];
  const errors: any[] = [];

  try {
    const target = new Date();
    target.setDate(target.getDate() + 3);
    const targetStr = `${target.getFullYear()}-${String(target.getMonth()+1).padStart(2,"0")}-${String(target.getDate()).padStart(2,"0")}`;

    const snap = await adminDb.collection("payments")
      .where("status", "==", "partial")
      .where("stageDate", "==", targetStr)
      .get();

    if (snap.empty) {
      return NextResponse.json({ message: `Aucun solde à prélever pour le ${targetStr}`, charged: 0 });
    }

    for (const docSnap of snap.docs) {
      const p = docSnap.data();
      if (!p.stripeCustomerId || p.stripeSubscriptionId) continue;

      const totalTTC = p.totalTTC || 0;
      const paidAmount = p.paidAmount || 0;
      const solde = Math.round((totalTTC - paidAmount) * 100) / 100;
      if (solde <= 0) continue;

      const amountCents = Math.round(solde * 100);
      const description = `Solde stage — ${(p.items || []).map((i: any) => i.activityTitle).join(", ")}`;

      try {
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://centre-equestre-agon.vercel.app";
        const res = await fetch(`${baseUrl}/api/stripe/charge-balance`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ customerId: p.stripeCustomerId, amountCents, description, familyId: p.familyId, paymentId: docSnap.id }),
        });
        const data = await res.json();

        if (data.success) {
          await docSnap.ref.update({ status: "paid", paidAmount: totalTTC, balanceChargedAt: new Date().toISOString(), updatedAt: FieldValue.serverTimestamp() });
          await adminDb.collection("encaissements").add({ paymentId: docSnap.id, familyId: p.familyId, familyName: p.familyName || "", montant: solde, mode: "stripe", modeLabel: "Stripe (solde prélevé auto)", ref: data.paymentIntentId || "", activityTitle: description, date: FieldValue.serverTimestamp() });

          const resendKey = process.env.RESEND_API_KEY;
          const fromEmail = process.env.RESEND_FROM_EMAIL || "Centre Equestre <onboarding@resend.dev>";
          if (resendKey && p.familyEmail) {
            fetch("https://api.resend.com/emails", { method: "POST", headers: { "Authorization": `Bearer ${resendKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ from: fromEmail, to: p.familyEmail, subject: `✅ Solde prélevé — Stage du ${targetStr}`, html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;"><p>Bonjour <strong>${p.familyName}</strong>,</p><p>Le solde de votre stage a été prélevé automatiquement.</p><div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;margin:16px 0;"><p style="margin:0;color:#166534;font-weight:600;">${description}</p><p style="margin:8px 0;color:#1e3a5f;font-size:18px;font-weight:bold;">✅ ${solde.toFixed(2)}€ prélevés</p><p style="margin:0;color:#555;font-size:13px;">Total réglé : ${totalTTC.toFixed(2)}€</p></div><p>À bientôt au centre équestre ! 🐴</p></div>` }) }).catch(() => {});
          }
          results.push({ paymentId: docSnap.id, family: p.familyName, solde, status: "charged" });
        } else {
          await docSnap.ref.update({ balanceChargeError: data.error || "Échec", balanceChargeAttemptAt: new Date().toISOString(), updatedAt: FieldValue.serverTimestamp() });
          const resendKey = process.env.RESEND_API_KEY;
          const ownerEmail = process.env.RESEND_OWNER_EMAIL;
          if (resendKey && ownerEmail) {
            fetch("https://api.resend.com/emails", { method: "POST", headers: { "Authorization": `Bearer ${resendKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ from: process.env.RESEND_FROM_EMAIL || "Centre Equestre <onboarding@resend.dev>", to: ownerEmail, subject: `⚠️ Échec prélèvement solde — ${p.familyName}`, html: `<p>Prélèvement échoué pour <strong>${p.familyName}</strong> — ${solde.toFixed(2)}€</p><p>Raison : ${data.error || "Inconnu"}</p><p>Action requise : contacter la famille pour paiement manuel.</p>` }) }).catch(() => {});
          }
          errors.push({ paymentId: docSnap.id, family: p.familyName, solde, error: data.error });
        }
      } catch (e: any) {
        errors.push({ paymentId: docSnap.id, family: p.familyName, error: e.message });
      }
    }

    return NextResponse.json({ date: targetStr, charged: results.length, errorCount: errors.length, results, errors });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
