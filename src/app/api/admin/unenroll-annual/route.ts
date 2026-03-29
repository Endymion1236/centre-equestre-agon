import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { stripe } from "@/lib/stripe";

export async function POST(req: NextRequest) {
  try {
    const { childId, childName, familyId } = await req.json();

    if (!childId || !familyId) {
      return NextResponse.json({ error: "childId et familyId requis" }, { status: 400 });
    }

    const today = new Date().toISOString().split("T")[0];

    // ── 1. Remove child from all future "cours" creneaux ──
    const creneauxSnap = await adminDb
      .collection("creneaux")
      .where("date", ">=", today)
      .get();

    let unenrolledCount = 0;
    const creneauxToUpdate: { ref: FirebaseFirestore.DocumentReference; newEnrolled: any[] }[] = [];

    for (const doc of creneauxSnap.docs) {
      const data = doc.data();
      const enrolled = data.enrolled || [];
      if (enrolled.some((e: any) => e.childId === childId)) {
        const newEnrolled = enrolled.filter((e: any) => e.childId !== childId);
        creneauxToUpdate.push({ ref: doc.ref, newEnrolled });
        unenrolledCount++;
      }
    }

    // Commit in batches of 450 (safe margin under 500 limit)
    for (let i = 0; i < creneauxToUpdate.length; i += 450) {
      const batch = adminDb.batch();
      const chunk = creneauxToUpdate.slice(i, i + 450);
      for (const item of chunk) {
        batch.update(item.ref, { enrolled: item.newEnrolled, enrolledCount: item.newEnrolled.length });
      }
      await batch.commit();
    }

    // ── 2. Cancel annual reservations ──
    const reservationsSnap = await adminDb
      .collection("reservations")
      .where("childId", "==", childId)
      .where("familyId", "==", familyId)
      .where("type", "==", "annual")
      .where("status", "==", "confirmed")
      .get();

    if (!reservationsSnap.empty) {
      const resBatch = adminDb.batch();
      for (const doc of reservationsSnap.docs) {
        resBatch.update(doc.ref, { status: "cancelled", cancelledAt: new Date().toISOString() });
      }
      await resBatch.commit();
    }

    // ── 3. Cancel future installment payments (3x, 10x) ──
    let cancelledPayments = 0;
    const paymentsSnap = await adminDb
      .collection("payments")
      .where("familyId", "==", familyId)
      .get();

    const payBatch = adminDb.batch();
    let payBatchCount = 0;
    for (const doc of paymentsSnap.docs) {
      const p = doc.data();
      const isAnnualPayment =
        (p.type === "inscription_annuelle" && p.childId === childId) ||
        (p.paymentRef && (p.paymentRef.includes("3x") || p.paymentRef.includes("10x")) &&
          (p.items || []).some((i: any) =>
            i.label?.toLowerCase().includes("forfait") ||
            i.activityTitle?.toLowerCase().includes("cours")
          ) && p.childId === childId);

      if (!isAnnualPayment) continue;

      const paid = p.paidAmount || 0;
      const total = p.totalTTC || 0;
      if (paid < total && p.status !== "paid" && p.status !== "cancelled") {
        payBatch.update(doc.ref, {
          status: "cancelled",
          cancelledAt: new Date().toISOString(),
          cancelReason: "Désinscription annuelle en masse",
        });
        cancelledPayments++;
        payBatchCount++;
      }
    }
    if (payBatchCount > 0) {
      await payBatch.commit();
    }

    // ── 4. Cancel Stripe subscriptions if any ──
    let cancelledSubscriptions = 0;
    try {
      const familyDoc = await adminDb.collection("families").doc(familyId).get();
      const familyData = familyDoc.data();
      if (familyData?.parentEmail) {
        const customers = await stripe.customers.list({ email: familyData.parentEmail, limit: 1 });
        if (customers.data.length > 0) {
          const customer = customers.data[0];
          const subscriptions = await stripe.subscriptions.list({
            customer: customer.id,
            status: "active",
            limit: 10,
          });
          for (const sub of subscriptions.data) {
            if (sub.metadata?.familyId === familyId) {
              await stripe.subscriptions.cancel(sub.id);
              cancelledSubscriptions++;
            }
          }
        }
      }
    } catch (stripeErr) {
      console.error("Stripe cancellation (non-bloquant):", stripeErr);
    }

    // ── 5. Update forfait status ──
    const forfaitsSnap = await adminDb
      .collection("forfaits")
      .where("childId", "==", childId)
      .where("familyId", "==", familyId)
      .get();

    if (!forfaitsSnap.empty) {
      const fBatch = adminDb.batch();
      for (const doc of forfaitsSnap.docs) {
        const f = doc.data();
        if (f.status === "active" || f.status === "suspended") {
          fBatch.update(doc.ref, {
            status: "cancelled",
            cancelledAt: new Date().toISOString(),
            cancelReason: "Désinscription en masse",
          });
        }
      }
      await fBatch.commit();
    }

    return NextResponse.json({
      success: true,
      unenrolledCount,
      cancelledReservations: reservationsSnap.size,
      cancelledPayments,
      cancelledSubscriptions,
      message: `${childName || childId} désinscrit(e) de ${unenrolledCount} séance(s).${cancelledPayments > 0 ? ` ${cancelledPayments} échéance(s) annulée(s).` : ""}${cancelledSubscriptions > 0 ? ` ${cancelledSubscriptions} prélèvement(s) Stripe annulé(s).` : ""}`,
    });
  } catch (error: any) {
    console.error("Erreur désinscription en masse:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
