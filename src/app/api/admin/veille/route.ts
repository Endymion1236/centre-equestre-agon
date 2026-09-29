/**
 * GET /api/admin/veille — la veille du club, à la demande (écran /admin/veille).
 * Même calcul que l'email de 7 h 30 (lib/veille-club). Lecture seule.
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/api-auth";
import { messageErreur } from "@/lib/message-erreur";
import { calculerVeille } from "@/lib/veille-club-serveur";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(req: NextRequest) {
  const auth = await verifyAuth(req, { adminOnly: true });
  if (auth instanceof NextResponse) return auth;
  try {
    const { aujourdhui, points } = await calculerVeille();
    return NextResponse.json({ aujourdhui, analyseLe: new Date().toISOString(), points });
  } catch (e) {
    console.error("[admin/veille]", e);
    return NextResponse.json({ error: messageErreur(e) }, { status: 500 });
  }
}
