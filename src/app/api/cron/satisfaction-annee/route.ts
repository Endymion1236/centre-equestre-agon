/**
 * Cron — questionnaire de satisfaction de fin de saison (planifié).
 * Auth : `Authorization: Bearer <CRON_SECRET>` (imposé par le middleware).
 * Params : ?saison=N  ?dry=1  ?to=email
 */
import { NextRequest, NextResponse } from "next/server";
import { runSatisfactionAnnee } from "@/lib/satisfaction/run";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const result = await runSatisfactionAnnee({
      saison: Number(req.nextUrl.searchParams.get("saison")) || undefined,
      dry: req.nextUrl.searchParams.get("dry") === "1",
      toOverride: req.nextUrl.searchParams.get("to") || undefined,
    });
    return NextResponse.json(result);
  } catch (e: any) {
    console.error("satisfaction-annee (cron):", e);
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
export async function POST(req: NextRequest) { return GET(req); }
