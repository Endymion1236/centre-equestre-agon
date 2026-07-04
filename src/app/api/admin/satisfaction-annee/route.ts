/**
 * Déclenchement ADMIN du questionnaire de fin de saison (test).
 * Auth : token Firebase admin (verifyAuth).
 * Params : ?saison=N  ?dry=1  ?to=email  ?limit=N  ?bcc=0 (retire la copie cachée)
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/api-auth";
import { runSatisfactionAnnee } from "@/lib/satisfaction/run";

export const dynamic = "force-dynamic";

async function handle(req: NextRequest) {
  const auth = await verifyAuth(req, { adminOnly: true });
  if (auth instanceof NextResponse) return auth;
  try {
    const result = await runSatisfactionAnnee({
      saison: Number(req.nextUrl.searchParams.get("saison")) || undefined,
      dry: req.nextUrl.searchParams.get("dry") === "1",
      toOverride: req.nextUrl.searchParams.get("to") || undefined,
      limit: Number(req.nextUrl.searchParams.get("limit")) || undefined,
      noBcc: req.nextUrl.searchParams.get("bcc") === "0",
    });
    return NextResponse.json(result);
  } catch (e: any) {
    console.error("satisfaction-annee (admin):", e);
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
export async function GET(req: NextRequest) { return handle(req); }
export async function POST(req: NextRequest) { return handle(req); }
