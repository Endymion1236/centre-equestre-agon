import { NextRequest, NextResponse } from "next/server";
import { tracerExecution } from "@/lib/cron-trace";
import { cleanupOldEmailLogs } from "@/lib/email-log";
import { classerWaitlist } from "@/lib/waitlist-cleanup";
import { adminDb } from "@/lib/firebase-admin";

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
  // Deux voies d'appel : Vercel (Authorization: Bearer) et un declencheur
  // externe de secours (x-cron-secret), le plan Hobby n'offrant aucune
  // garantie d'execution. Les traitements sont idempotents (marqueurs
  // soldeReminderSentAt, notifiedAt…) : un double appel n'envoie rien deux
  // fois.
  const secret = process.env.CRON_SECRET;
  const parVercel = req.headers.get("authorization") === `Bearer ${secret}`;
  const parExterne = req.headers.get("x-cron-secret") === secret
    || req.nextUrl.searchParams.get("secret") === secret;
  if (!secret || (!parVercel && !parExterne)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const declencheur = parVercel ? "vercel" : "externe";

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://centre-equestre-agon.vercel.app";
  const cronSecret = process.env.CRON_SECRET || "";

  const modules = [
    // Rappels J-1 : depuis le soir, on cible bien demain (target par défaut)
    { name: "rappels-j1", path: "/api/cron/rappels-j1" },
    // Daily notifs : depuis le soir, on veut viser le jour suivant.
    // Inclut DÉJÀ le récap moniteur (push + email) → pas de daily-monitor-recap
    // séparé, qui envoyait un email moniteur identique (doublon supprimé).
    { name: "daily-notifications", path: "/api/cron/daily-notifications?target=tomorrow" },
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

  // Retrait des demandes de liste d'attente devenues sans objet (seance
  // passee depuis plus que le delai de grace). Suppression DEFINITIVE :
  // on journalise ce qui part, sinon une erreur de date resterait invisible.
  let waitlistSupprimees = 0;
  const waitlistDetail: string[] = [];
  try {
    if (adminDb) {
      const aujourdhui = new Date().toISOString().slice(0, 10);
      // ── Chaine de propositions : 24h ecoulees sans reservation → au
      //    suivant. On remet proposedAt de l'entree expiree a "expired"
      //    (jamais re-proposee) et on declenche la proposition suivante en
      //    rappelant la route interne — meme logique, meme email.
      try {
        const cutoff = Date.now() - 24 * 3600 * 1000;
        const propSnap = await adminDb.collection("waitlist").get();
        const parCreneau = new Map<string, boolean>();
        for (const d of propSnap.docs) {
          const w = d.data() as any;
          // Convention unique : "notified" + notifiedAt, posee par le circuit
          // planning ET par les routes propose. 24h ecoulees sans inscription
          // → l'entree expire, la place est proposee au suivant.
          if (w.status !== "notified") continue;
          const nAt = w.notifiedAt ? new Date(w.notifiedAt).getTime() : 0;
          if (nAt && nAt < cutoff) {
            await adminDb.collection("waitlist").doc(d.id).update({ status: "expired" });
            const cible = w.creneauId || (Array.isArray(w.creneauIds) ? w.creneauIds[0] : null);
            if (cible) parCreneau.set(String(cible), true);
          }
        }
        for (const cid of parCreneau.keys()) {
          const base = process.env.NEXT_PUBLIC_APP_URL || "https://centre-equestre-agon.vercel.app";
          await fetch(`${base}/api/waitlist/propose-interne`, {
            method: "POST", headers: { "Content-Type": "application/json", "x-cron-secret": process.env.CRON_SECRET || "" },
            body: JSON.stringify({ creneauId: cid }),
          }).catch(() => {});
        }
      } catch (e) { console.error("Chaine waitlist:", e); }

      const snap = await adminDb.collection("waitlist").get();
      const entries = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
      const { aSupprimer } = classerWaitlist(entries, aujourdhui);

      for (const entry of aSupprimer) {
        waitlistDetail.push(
          `${entry.activityTitle || "?"} du ${entry.dateFin || entry.date} — ${entry.childName || entry.familyName || "?"}`,
        );
        await adminDb.collection("waitlist").doc(entry.id!).delete();
        waitlistSupprimees++;
      }
      if (waitlistSupprimees > 0) {
        console.log(`[daily-emails] waitlist purgee : ${waitlistSupprimees}`, waitlistDetail);
      }
    }
  } catch (e) {
    console.error("[daily-emails] purge waitlist failed:", e);
  }

  // Trace durable : les logs Vercel ne survivent pas a la nuit sur Hobby.
  await tracerExecution("daily-emails", declencheur, {
    ok: true,
    resume: {
      dureeMs: Date.now() - startTime,
      modules: results.map((r: any) => ({ nom: r.name, ok: r.ok !== false })),
      cleanedLogs, waitlistSupprimees,
    },
  });

  return NextResponse.json({
    success: true,
    declencheur,
    totalDurationMs: Date.now() - startTime,
    cleanedLogs,
    waitlistSupprimees,
    waitlistDetail,
    modules: results,
    timestamp: new Date().toISOString(),
  });
}
