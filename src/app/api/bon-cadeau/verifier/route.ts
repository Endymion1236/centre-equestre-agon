import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/api-auth";
import { verifierBonCadeau } from "@/lib/bon-cadeau-application";

export const dynamic = "force-dynamic";

/**
 * GET /api/bon-cadeau/verifier?code=BON-XXXX
 * La famille vérifie un bon avant de l'utiliser dans son panier : solde et
 * validité seulement — rien sur qui l'a acheté ni qui l'a déjà utilisé.
 * Compte connecté obligatoire, pour ne pas offrir un oracle de codes.
 */
export async function GET(req: NextRequest) {
  const auth = await verifyAuth(req);
  if (auth instanceof NextResponse) return auth;
  const v = await verifierBonCadeau(req.nextUrl.searchParams.get("code"));
  if (!v.ok) return NextResponse.json({ ok: false, error: v.raison }, { status: 400 });
  return NextResponse.json({ ok: true, code: v.bon.code, solde: v.bon.solde, validUntil: v.bon.validUntil });
}
