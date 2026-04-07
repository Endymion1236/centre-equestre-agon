import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

export async function POST() {
  try {
    const snap = await adminDb.collection("equides").get();
    const equides = snap.docs
      .map(d => ({ id: d.id, ...d.data() } as any))
      .sort((a, b) => (a.name || "").localeCompare(b.name || ""));

    const batch = adminDb.batch();
    equides.forEach((eq, i) => {
      batch.update(adminDb.collection("equides").doc(eq.id), { ordre: i + 1 });
    });
    await batch.commit();

    return NextResponse.json({ ok: true, count: equides.length, equides: equides.map((e, i) => ({ ordre: i+1, name: e.name })) });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
