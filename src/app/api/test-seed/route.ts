import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { FieldValue, Timestamp } from "firebase-admin/firestore";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const { action, data } = await req.json();

    if (action === "seed") {
      // Injecter les encaissements de test
      const encaissements = data as any[];
      let count = 0;
      
      for (let i = 0; i < encaissements.length; i += 50) {
        const batch = adminDb.batch();
        const chunk = encaissements.slice(i, i + 50);
        for (const enc of chunk) {
          const ref = adminDb.collection("encaissements").doc();
          batch.set(ref, {
            ...enc,
            date: Timestamp.fromDate(new Date(enc.dateISO)),
          });
          // Remove dateISO from the doc (it's converted to Timestamp)
          delete enc.dateISO;
        }
        await batch.commit();
        count += chunk.length;
      }

      return NextResponse.json({ success: true, count });
    }

    if (action === "clean") {
      // Supprimer tous les encaissements de test
      const snap = await adminDb.collection("encaissements")
        .where("ref", ">=", "TEST-")
        .where("ref", "<=", "TEST-~")
        .get();

      let deleted = 0;
      for (let i = 0; i < snap.docs.length; i += 500) {
        const batch = adminDb.batch();
        const chunk = snap.docs.slice(i, i + 500);
        for (const doc of chunk) {
          batch.delete(doc.ref);
        }
        await batch.commit();
        deleted += chunk.length;
      }

      return NextResponse.json({ success: true, deleted });
    }

    return NextResponse.json({ error: "Action inconnue" }, { status: 400 });
  } catch (error: any) {
    console.error("Test seed error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
