import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Stripe supprimé — les paiements récurrents (acomptes stages) passent désormais par CAWL/SEPA
// Ce cron est désactivé en attendant l'implémentation CAWL off-session
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({
    ok: true,
    message: "Cron charge-stage-balances désactivé — migration CAWL en cours",
    processed: 0,
  });
}
