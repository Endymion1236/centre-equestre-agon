import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/api-auth";
import { dernieresExecutions } from "@/lib/cron-trace";

/**
 * GET /api/admin/cron-runs
 *
 * Historique des executions de cron (collection `cron_runs`). Repond a la
 * seule question qui compte le lendemain matin : « le cron a-t-il tourne
 * hier soir ? » — que les logs Vercel, purges en quelques dizaines de
 * minutes sur le plan Hobby, ne permettent plus de trancher.
 */
export async function GET(req: NextRequest) {
  const auth = await verifyAuth(req, { adminOnly: true });
  if (auth instanceof NextResponse) return auth;

  const nom = req.nextUrl.searchParams.get("nom") || undefined;
  const runs = await dernieresExecutions(nom, 30);

  // Signale les jours manquants sur les 7 derniers, pour reperer un saut
  // sans avoir a comparer les dates a la main.
  const jours: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(Date.now() - i * 86400000);
    jours.push(new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris" }).format(d));
  }
  const presents = new Set(runs.map((r: any) => `${r.nom}_${r.jour}`));
  const manquants = jours.filter((j) => !presents.has(`daily-emails_${j}`));

  return NextResponse.json({ runs, joursSansDailyEmails: manquants });
}
