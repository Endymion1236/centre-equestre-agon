/**
 * Déclenchement ADMIN du questionnaire de satisfaction post-stage (test).
 * Auth : token Firebase admin (le middleware exige un Bearer ; verifyAuth valide).
 * Params : ?date=YYYY-MM-DD  ?dry=1  ?to=email
 * Même logique que le cron, mais accessible à un admin connecté pour tester.
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/api-auth";
import { runSatisfactionStages, runSatisfactionPromenades } from "@/lib/satisfaction/run";

export const dynamic = "force-dynamic";

async function handle(req: NextRequest) {
  const auth = await verifyAuth(req, { adminOnly: true });
  if (auth instanceof NextResponse) return auth;

  try {
    const opts = {
      date: req.nextUrl.searchParams.get("date") || undefined,
      dry: req.nextUrl.searchParams.get("dry") === "1",
      toOverride: req.nextUrl.searchParams.get("to") || undefined,
      limit: Number(req.nextUrl.searchParams.get("limit")) || undefined,
      force: req.nextUrl.searchParams.get("force") === "1",
    };
    const isPromenade = req.nextUrl.searchParams.get("type") === "promenade";
    const result = isPromenade
      ? await runSatisfactionPromenades(opts)
      : await runSatisfactionStages(opts);
    return NextResponse.json(result);
  } catch (e: any) {
    console.error("satisfaction-stages (admin):", e);
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}

export async function GET(req: NextRequest) { return handle(req); }
export async function POST(req: NextRequest) { return handle(req); }
