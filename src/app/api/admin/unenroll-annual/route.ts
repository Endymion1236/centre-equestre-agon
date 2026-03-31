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

    // ── 1. Retirer l'enfant de tous les créneaux futurs ──────────────────────
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

    for (let i = 0; i < creneauxToUpdate.length; i += 450) {
      const batch = adminDb.batch();
      const chunk = creneauxToUpdate.slice(i, i + 450);
      for (const item of chunk) {
        batch.update(item.ref, { enrolled: item.newEnrolled, enrolledCount: item.newEnrolled.length });
      }
      await batch.commit();
    }

    // ── 2. Annuler les réservations futures (tous types) ─────────────────────
    const reservationsSnap = await adminDb
      .collection("reservations")
      .where("childId", "==", childId)
      .where("familyId", "==", familyId)
      .get();

    let cancelledReservations = 0;
    if (!reservationsSnap.empty) {
      const resBatch = adminDb.batch();
      for (const doc of reservationsSnap.docs) {
        const r = doc.data();
        // Annuler toutes les réservations futures confirmées (peu importe le type)
        if (r.status === "confirmed" && r.date >= today) {
          resBatch.update(doc.ref, { status: "cancelled", cancelledAt: new Date().toISOString() });
          cancelledReservations++;
        }
      }
      await resBatch.commit();
    }

    // ── 3. Annuler les paiements en attente liés à ce forfait ────────────────
    // Inclut : payments (pending/sepa_scheduled), echeances-sepa (pending non remises)
    let cancelledPayments = 0;

    const paymentsSnap = await adminDb
      .collection("payments")
      .where("familyId", "==", familyId)
      .get();

    const payBatch = adminDb.batch();
    let payBatchCount = 0;

    for (const doc of paymentsSnap.docs) {
      const p = doc.data();
      if (p.status === "paid" || p.status === "cancelled") continue;

      // Est-ce un paiement lié à un forfait annuel de cet enfant ?
      const isForfaitOfChild =
        // Paiement de référence SEPA (sepa_scheduled)
        p.status === "sepa_scheduled" && (p.items || []).some((i: any) => i.childId === childId) ||
        // Échéances classiques (pending, 3x/10x)
        (p.status === "pending" || p.status === "partial") && (
          // Via items
          (p.items || []).some((i: any) =>
            i.childId === childId &&
            (i.activityTitle?.includes("Forfait") || i.activityTitle?.includes("Adhésion") || i.activityTitle?.includes("Licence"))
          ) ||
          // Via echeancesTotal (échéance d'un plan 3x/10x)
          (p.echeancesTotal > 1 && (p.items || []).some((i: any) =>
            i.childId === childId || (i.childName === childName)
          )) ||
          // Paiement dont le forfaitRef existe (créé par EnrollPanel annuel)
          (p.forfaitRef && (p.items || []).some((i: any) => i.childId === childId))
        );

      if (!isForfaitOfChild) continue;

      payBatch.update(doc.ref, {
        status: "cancelled",
        cancelledAt: new Date().toISOString(),
        cancelReason: "Désinscription annuelle",
      });
      cancelledPayments++;
      payBatchCount++;
    }
    if (payBatchCount > 0) await payBatch.commit();

    // ── 4. Annuler les écheances-sepa non encore remises ────────────────────
    let cancelledSepa = 0;
    try {
      const sepaSnap = await adminDb
        .collection("echeances-sepa")
        .where("familyId", "==", familyId)
        .where("status", "==", "pending")
        .get();

      if (!sepaSnap.empty) {
        const sepaBatch = adminDb.batch();
        for (const doc of sepaSnap.docs) {
          // Vérifier que c'est bien lié à cet enfant via la description
          const d = doc.data();
          const concernsChild = d.description?.includes(childName) || !childName;
          if (concernsChild) {
            sepaBatch.delete(doc.ref);
            cancelledSepa++;
          }
        }
        await sepaBatch.commit();
      }
    } catch (e) {
      console.error("Erreur annulation SEPA:", e);
    }

    // ── 5. Annuler les souscriptions Stripe actives ──────────────────────────
    let cancelledSubscriptions = 0;
    try {
      const familyDoc = await adminDb.collection("families").doc(familyId).get();
      const familyData = familyDoc.data();
      if (familyData?.parentEmail) {
        const customers = await stripe.customers.list({ email: familyData.parentEmail, limit: 1 });
        if (customers.data.length > 0) {
          const subs = await stripe.subscriptions.list({ customer: customers.data[0].id, status: "active", limit: 10 });
          for (const sub of subs.data) {
            if (sub.metadata?.familyId === familyId) {
              await stripe.subscriptions.cancel(sub.id);
              cancelledSubscriptions++;
            }
          }
        }
      }
    } catch (e) { console.error("Stripe (non-bloquant):", e); }

    // ── 6. Marquer le forfait comme annulé ───────────────────────────────────
    const forfaitsSnap = await adminDb
      .collection("forfaits")
      .where("childId", "==", childId)
      .where("familyId", "==", familyId)
      .get();

    if (!forfaitsSnap.empty) {
      const fBatch = adminDb.batch();
      for (const doc of forfaitsSnap.docs) {
        const f = doc.data();
        if (f.status === "active" || f.status === "actif" || f.status === "suspended") {
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
      cancelledReservations,
      cancelledPayments,
      cancelledSepa,
      cancelledSubscriptions,
      message: [
        `${childName || childId} désinscrit(e) de ${unenrolledCount} séance(s)`,
        cancelledReservations > 0 ? `${cancelledReservations} réservation(s) annulée(s)` : "",
        cancelledPayments > 0 ? `${cancelledPayments} paiement(s) annulé(s)` : "",
        cancelledSepa > 0 ? `${cancelledSepa} échéance(s) SEPA supprimée(s)` : "",
      ].filter(Boolean).join(" · "),
    });
  } catch (error: any) {
    console.error("Erreur désinscription en masse:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
