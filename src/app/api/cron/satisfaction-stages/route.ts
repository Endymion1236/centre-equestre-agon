/**
 * Cron — questionnaire de satisfaction post-stage (planifié).
 * Auth : `Authorization: Bearer <CRON_SECRET>` (imposé par le middleware).
 * Params : ?date=YYYY-MM-DD  ?dry=1  ?to=email
 * La logique est dans @/lib/satisfaction/run (partagée avec la route admin de test).
 */
import { NextRequest, NextResponse } from "next/server";
import { runSatisfactionStages, runSatisfactionPromenades } from "@/lib/satisfaction/run";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const common = {
      date: req.nextUrl.searchParams.get("date") || undefined,
      dry: req.nextUrl.searchParams.get("dry") === "1",
      toOverride: req.nextUrl.searchParams.get("to") || undefined,
    };
    // Même passage quotidien : stages terminés la veille + promenades de la veille.
    const stages = await runSatisfactionStages(common);
    const promenades = await runSatisfactionPromenades(common);
    return NextResponse.json({ stages, promenades });
  } catch (e: any) {
    console.error("satisfaction-stages (cron):", e);
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) { return GET(req); }
