import { adminDb } from "@/lib/firebase-admin";

/**
 * src/lib/cron-trace.ts
 *
 * Trace des executions de cron, en Firestore.
 *
 * Vercel (plan Hobby) ne retient les logs que quelques dizaines de minutes
 * et n'offre qu'une fenetre d'execution « best effort » d'une heure : un
 * soir saute ne laisse AUCUNE trace consultable le lendemain. Impossible de
 * distinguer « le cron n'a pas tourne » de « il a tourne sans rien envoyer ».
 *
 * Chaque execution ecrit donc son propre journal dans `cron_runs`, durable
 * et consultable depuis l'admin. Le meme principe que le mode email
 * restreint : en serverless, tout etat qui doit survivre va en Firestore.
 */

export interface CronRunResult {
  ok: boolean;
  /** Resume libre : nombre d'emails, de relances… */
  resume?: Record<string, unknown>;
  erreur?: string;
}

/**
 * Enveloppe l'execution d'un cron : mesure la duree, capture les erreurs,
 * et journalise le resultat. L'erreur est relancee apres journalisation —
 * tracer ne doit pas masquer un echec.
 *
 * @param nom          identifiant du cron (ex. "daily-emails")
 * @param declencheur  "vercel" | "externe" | "manuel"
 */
export async function tracerExecution(
  nom: string,
  declencheur: string,
  resultat: CronRunResult,
): Promise<void> {
  const jourParis = new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris" }).format(new Date());
  try {
    // Un document par cron ET par jour : un second passage (declencheur de
    // secours) ECRASE le premier plutot que d'empiler des doublons, ce qui
    // garde le journal lisible — la question posee est « ce cron a-t-il
    // tourne ce jour-la ? ».
    await adminDb.collection("cron_runs").doc(`${nom}_${jourParis}`).set({
      nom,
      jour: jourParis,
      declencheur,
      executeA: new Date().toISOString(),
      ok: resultat.ok !== false,
      resume: resultat.resume || null,
      erreur: resultat.erreur || null,
    }, { merge: true });
  } catch (e) {
    console.error(`[cron-trace] ${nom}:`, e);
  }
}

/** Les crons ont-ils tourne aujourd'hui ? Pour l'affichage admin. */
export async function dernieresExecutions(nom?: string, limite = 14) {
  let q = adminDb.collection("cron_runs").orderBy("executeA", "desc").limit(limite);
  if (nom) q = adminDb.collection("cron_runs").where("nom", "==", nom).orderBy("executeA", "desc").limit(limite) as any;
  const snap = await q.get();
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
}
