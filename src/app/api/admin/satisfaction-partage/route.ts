import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/api-auth";
import { adminDb } from "@/lib/firebase-admin";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/satisfaction-partage
 * body: { avisId, partage: boolean, mot?: string }
 *
 * Marque un avis comme visible par les monitrices qu'il cite, avec un mot
 * d'accompagnement facultatif. Rien n'est partagé sans ce geste.
 */
export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req, { adminOnly: true });
  if (auth instanceof NextResponse) return auth;

  const { avisId, partage, mot } = await req.json().catch(() => ({} as any));
  if (!avisId) {
    return NextResponse.json({ error: "avisId requis" }, { status: 400 });
  }

  const ref = adminDb.collection("avis-satisfaction").doc(avisId);
  const snap = await ref.get();
  if (!snap.exists) {
    return NextResponse.json({ error: "Avis introuvable" }, { status: 404 });
  }

  await ref.update({
    partageMoniteurs: !!partage,
    motMoniteurs: partage ? String(mot || "").trim() : "",
    partageAt: partage ? new Date().toISOString() : null,
    partagePar: partage ? auth.email || auth.uid || "admin" : null,
  });

  return NextResponse.json({ ok: true, partage: !!partage });
}
