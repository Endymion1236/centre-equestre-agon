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
/**
 * Ordre d'affichage voulu pour les STAGES, par progression de niveau.
 * Appliqué à heure égale (donc : ordre par niveau le matin, puis à nouveau
 * par niveau l'après-midi, puisque l'heure de début reste le critère premier).
 * Les variantes "Après-midi" sont rattachées à leur niveau de base.
 * Tout titre non listé (cours réguliers, stages inconnus) garde le rang neutre
 * et retombe sur le tri alphabétique — comportement historique préservé.
 */
const STAGE_ORDER = [
  "3/4 ans",
  "4,5 / 5,5 ans",
  "galop de bronze 6/7 ans",
  "galop d'argent 8/10 ans",
  "galop d'or",
  "galop 3",
  "galop 4 et +",
  "débutant 10-15 ans",
];

const normTitle = (s: string) =>
  (s || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // accents
    .toLowerCase()
    .replace(/\bstage\b/g, " ")
    .replace(/apres[- ]?midi/g, " ")                  // variantes après-midi
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const STAGE_ORDER_NORM = STAGE_ORDER.map(normTitle);

/** Rang d'un stage dans l'ordre voulu, ou 999 si non reconnu (→ tri alpha). */
function stageRank(title?: string): number {
  const t = normTitle(title || "");
  if (!t) return 999;
  const i = STAGE_ORDER_NORM.findIndex(base => t.includes(base));
  return i === -1 ? 999 : i;
}

export function compareCreneaux(
  a: { startTime: string; endTime?: string; activityTitle?: string },
  b: { startTime: string; endTime?: string; activityTitle?: string }
): number {
  const byStart = a.startTime.localeCompare(b.startTime);
  if (byStart !== 0) return byStart;
  const byEnd = (a.endTime || "").localeCompare(b.endTime || "");
  if (byEnd !== 0) return byEnd;
  // À heure égale : ordonner les STAGES par niveau (uniquement entre stages
  // connus). Les autres cas retombent sur le tri alphabétique historique.
  const ra = stageRank(a.activityTitle);
  const rb = stageRank(b.activityTitle);
  if (ra !== 999 && rb !== 999 && ra !== rb) return ra - rb;
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
