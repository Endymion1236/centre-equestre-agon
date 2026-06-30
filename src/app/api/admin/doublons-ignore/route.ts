/**
 * Écarte (ou ré-inclut) une paire de doublons potentiels — admin.
 * POST /api/admin/doublons-ignore  body: { pairId, undo? }
 *   pairId = "idA__idB" (ids triés). undo=true pour réintégrer la paire au scan.
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/api-auth";
import { adminDb } from "@/lib/firebase-admin";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req, { adminOnly: true });
  if (auth instanceof NextResponse) return auth;
  try {
    const body = await req.json().catch(() => ({}));
    const pairId = String(body?.pairId || "");
    if (!pairId || !pairId.includes("__")) return NextResponse.json({ error: "pairId invalide" }, { status: 400 });
    const ref = adminDb.collection("doublons-ignores").doc(pairId);
    if (body?.undo) await ref.delete();
    else await ref.set({ ignoredAt: new Date() });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
