/**
 * Tri stable des créneaux par heure, puis heure de fin, puis titre alphabétique.
 *
 * Pourquoi ce helper centralisé ?
 * Partout où on affiche une liste de créneaux (planning admin, réservation
 * cavalier, emails aux monitrices, montoir TV, etc.), on veut que l'ordre
 * soit DÉTERMINISTE et IDENTIQUE chaque jour. Sans ça, deux créneaux à
 * 10:00 peuvent apparaître dans l'ordre A, B un jour et B, A le lendemain
 * (l'ordre dépend alors de l'ordre de retour Firestore qui n'est pas garanti).
 *
 * Les 3 niveaux de tri couvrent tous les cas observés :
 *   1. startTime : critère principal
 *   2. endTime : départage les créneaux longs vs courts à même heure début
 *   3. activityTitle : départage alphabétiquement quand tout le reste est
 *      identique — garantit un ordre totalement déterministe
 */
export function compareCreneaux(
  a: { startTime: string; endTime?: string; activityTitle?: string },
  b: { startTime: string; endTime?: string; activityTitle?: string }
): number {
  const byStart = a.startTime.localeCompare(b.startTime);
  if (byStart !== 0) return byStart;
  const byEnd = (a.endTime || "").localeCompare(b.endTime || "");
  if (byEnd !== 0) return byEnd;
  return (a.activityTitle || "").localeCompare(b.activityTitle || "");
}

/**
 * Comparateur stable pour un tri par jour-de-semaine puis heure (templates
 * de modèles planning où les créneaux ont un dayOfWeek 0-6 pas de date).
 */
export function compareCreneauxByDow(
  a: { dayOfWeek: number; startTime: string; endTime?: string; activityTitle?: string },
  b: { dayOfWeek: number; startTime: string; endTime?: string; activityTitle?: string }
): number {
  const byDow = a.dayOfWeek - b.dayOfWeek;
  if (byDow !== 0) return byDow;
  return compareCreneaux(a, b);
}

/**
 * Comparateur stable pour un tri par date puis heure (listes multi-jours).
 */
export function compareCreneauxByDate(
  a: { date: string; startTime: string; endTime?: string; activityTitle?: string },
  b: { date: string; startTime: string; endTime?: string; activityTitle?: string }
): number {
  const byDate = a.date.localeCompare(b.date);
  if (byDate !== 0) return byDate;
  return compareCreneaux(a, b);
}
