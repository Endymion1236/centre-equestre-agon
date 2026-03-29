import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

export async function POST(req: NextRequest) {
  try {
    const { childId, childName, familyId } = await req.json();

    if (!childId || !familyId) {
      return NextResponse.json({ error: "childId et familyId requis" }, { status: 400 });
    }

    const today = new Date().toISOString().split("T")[0];

    // Find all future "cours" creneaux where this child is enrolled
    const creneauxSnap = await adminDb
      .collection("creneaux")
      .where("activityType", "==", "cours")
      .where("date", ">=", today)
      .get();

    let unenrolledCount = 0;
    const batch = adminDb.batch();

    for (const doc of creneauxSnap.docs) {
      const data = doc.data();
      const enrolled = data.enrolled || [];
      const childIndex = enrolled.findIndex((e: any) => e.childId === childId);

      if (childIndex >= 0) {
        const newEnrolled = enrolled.filter((e: any) => e.childId !== childId);
        batch.update(doc.ref, {
          enrolled: newEnrolled,
          enrolledCount: newEnrolled.length,
        });
        unenrolledCount++;
      }
    }

    if (unenrolledCount > 0) {
      await batch.commit();
    }

    // Also update any annual reservations to "cancelled"
    const reservationsSnap = await adminDb
      .collection("reservations")
      .where("childId", "==", childId)
      .where("familyId", "==", familyId)
      .where("type", "==", "annual")
      .where("status", "==", "confirmed")
      .get();

    const resBatch = adminDb.batch();
    for (const doc of reservationsSnap.docs) {
      resBatch.update(doc.ref, { status: "cancelled", cancelledAt: new Date().toISOString() });
    }
    if (!reservationsSnap.empty) {
      await resBatch.commit();
    }

    return NextResponse.json({
      success: true,
      unenrolledCount,
      cancelledReservations: reservationsSnap.size,
      message: `${childName || childId} désinscrit(e) de ${unenrolledCount} séance(s) future(s).`,
    });
  } catch (error: any) {
    console.error("Erreur désinscription en masse:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
