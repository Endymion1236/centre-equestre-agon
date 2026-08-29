/**
 * src/lib/signaler-erreur.ts — remonter une erreur avalée.
 *
 * Le dépôt compte 121 blocs `catch` qui ne font rien, et 637 `catch` au total
 * dans les pages. C'est le mécanisme par lequel deux index Firestore manquants
 * sont restés invisibles pendant des mois : la requête échoue, un repli
 * s'exécute ou la liste reste vide, et personne n'est prévenu — ni la
 * personne devant l'écran, ni Sentry (audit 29/08/2026, Q3).
 *
 * Usage :
 *
 *   try {
 *     const snap = await getDocs(q);
 *   } catch (e) {
 *     signalerErreur(e, "galerie: chargement des photos", { category });
 *     setPhotos([]);
 *   }
 *
 * Le repli reste le comportement visible ; on cesse simplement de perdre
 * l'information. Sentry est déjà configuré sans données personnelles
 * (`sendDefaultPii: false` + filtrage IBAN/CB dans `beforeSend`).
 */
import * as Sentry from "@sentry/nextjs";

/** Codes Firestore qui signalent un défaut de configuration, pas un aléa. */
const CODES_CONFIGURATION = ["failed-precondition", "permission-denied"];

export function signalerErreur(
  erreur: unknown,
  contexte: string,
  donnees?: Record<string, unknown>
): void {
  const code = (erreur as { code?: string } | null)?.code;

  // `failed-precondition` sur une requête Firestore = index composite manquant.
  // Le message d'erreur contient le lien de création de l'index : il doit être
  // lisible, pas noyé.
  if (code && CODES_CONFIGURATION.includes(code)) {
    console.error(`[${contexte}] ${code} — vérifier les règles et firestore.indexes.json`, erreur);
  } else {
    console.error(`[${contexte}]`, erreur);
  }

  try {
    Sentry.captureException(erreur, {
      tags: { contexte, firestoreCode: code || "n/a" },
      extra: donnees,
    });
  } catch {
    // Sentry indisponible (build local, quota) : le console.error ci-dessus
    // reste. Ne jamais laisser la remontée d'erreur casser l'appelant.
  }
}
