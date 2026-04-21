import { NextRequest, NextResponse } from "next/server";
import { cleanupOldEmailLogs } from "@/lib/email-log";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 min max — les 4 crons en séquence

/**
 * CRON orchestrateur — UNIQUE point d'entrée quotidien
 *
 * Fréquence : 20h00 chaque soir (veille des séances/stages)
 * Enchaîne en séquence les 4 modules d'emails automatiques :
 *   1. rappels-j1                → rappels cours/stages du lendemain
 *   2. daily-notifications       → rappels J-1 parents + planning moniteur + rappels solde stages
 *   3. daily-monitor-recap       → récap planning moniteur
 *   4. charge-stage-balances     → relance solde stage J-7
 *
 * Nettoie aussi les logs emails > 90 jours.
 *
 * REMARQUE : les 4 routes individuelles restent accessibles en debug manuel,
 * mais elles ne sont plus invoquées automatiquement par Vercel. Seul ce cron
 * est planifié dans vercel.json.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://centre-equestre-agon.vercel.app";
  const cronSecret = process.env.CRON_SECRET || "";

  const modules = [
    // Rappels J-1 : depuis le soir, on cible bien demain (target par défaut)
    { name: "rappels-j1", path: "/api/cron/rappels-j1" },
    // Daily notifs : depuis le soir, on veut viser le jour suivant
    { name: "daily-notifications", path: "/api/cron/daily-notifications?target=tomorrow" },
    // Récap moniteur : depuis le soir, on envoie le planning de demain
    { name: "daily-monitor-recap", path: "/api/cron/daily-monitor-recap?target=tomorrow" },
    // Solde stage J-7 : calcule J-7 depuis la date des stages, pas depuis aujourd'hui → pas de décalage
    { name: "charge-stage-balances", path: "/api/cron/charge-stage-balances" },
  ];

  const results: Record<string, any> = {};
  const startTime = Date.now();

  // Exécution séquentielle pour éviter les collisions sur Firestore
  for (const mod of modules) {
    const modStart = Date.now();
    try {
      const res = await fetch(`${appUrl}${mod.path}`, {
        method: "GET",
        headers: { "authorization": `Bearer ${cronSecret}` },
      });
      const body = await res.json().catch(() => ({}));
      results[mod.name] = {
        status: res.status,
        ok: res.ok,
        durationMs: Date.now() - modStart,
        ...body,
      };
    } catch (e: any) {
      results[mod.name] = {
        status: 0,
        ok: false,
        durationMs: Date.now() - modStart,
        error: e?.message || String(e),
      };
    }
  }

  // Nettoyage des logs emails > 90 jours
  let cleanedLogs = 0;
  try {
    cleanedLogs = await cleanupOldEmailLogs(90);
  } catch (e) {
    console.error("[daily-emails] cleanup failed:", e);
  }

  return NextResponse.json({
    success: true,
    totalDurationMs: Date.now() - startTime,
    cleanedLogs,
    modules: results,
    timestamp: new Date().toISOString(),
  });
}
