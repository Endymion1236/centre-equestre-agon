/**
 * Cron — questionnaire de satisfaction post-stage (planifié).
 * Auth : `Authorization: Bearer <CRON_SECRET>` (imposé par le middleware).
 * Params : ?date=YYYY-MM-DD  ?dry=1  ?to=email
 * La logique est dans @/lib/satisfaction/run (partagée avec la route admin de test).
 */
import { NextRequest, NextResponse } from "next/server";
import { runSatisfactionStages } from "@/lib/satisfaction/run";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const result = await runSatisfactionStages({
    date: req.nextUrl.searchParams.get("date") || undefined,
    dry: req.nextUrl.searchParams.get("dry") === "1",
    toOverride: req.nextUrl.searchParams.get("to") || undefined,
  });
  return NextResponse.json(result);
}

export async function POST(req: NextRequest) { return GET(req); }
