import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/api-auth";
export const dynamic = "force-dynamic";
/** Anciennes pages ouvertes : ne plus lancer d'associations globales silencieuses. */
export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req, { adminOnly: true });
  if (auth instanceof NextResponse) return auth;
  return NextResponse.json({ error: "Le traitement par lot est désactivé. Actualisez Justificatifs pour traiter une pièce à la fois." }, { status: 410 });
}
