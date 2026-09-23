/**
 * src/lib/meme-stage.ts
 *
 * « Ces deux créneaux appartiennent-ils au même stage ? »
 *
 * Un stage n'est pas un objet en base : c'est un LOT de créneaux, un par jour,
 * reliés par `stageGroupId`. Savoir si deux jours relèvent du même stage est
 * donc une question posée partout — à la désinscription, au calcul des
 * réductions, et maintenant au changement de groupe.
 *
 * La règle vivait dans `app/admin/planning/types.ts`. Elle est ici pour que
 * les modules de `lib/` puissent s'en servir sans dépendre d'un écran, et
 * surtout pour qu'il n'en existe qu'UNE version : une règle métier recopiée
 * finit toujours par diverger de son original (cf. le calcul des réductions
 * de stage, qui avait fini par exister en double).
 */

/** Lundi de la semaine d'une date ISO, en UTC pour éviter tout décalage. */
export function lundiDe(dateISO: string): string {
  if (!dateISO) return "";
  const d = new Date(dateISO + "T12:00:00Z");
  if (Number.isNaN(d.getTime())) return "";
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().split("T")[0];
}

/**
 * Deux créneaux appartiennent-ils au même stage ?
 *
 * Priorité au `stageGroupId` (fiable à 100 %). Repli historique : même
 * `activityId` + même titre — limite connue, deux stages homonymes créés
 * depuis la même activité AVANT l'introduction du `stageGroupId` restent
 * indissociables.
 */
export function memeStage(a: any, b: any): boolean {
  if (!a || !b) return false;

  // Un stage se déroule sur UNE semaine. Deux créneaux de semaines différentes
  // ne sont jamais le même stage, quels que soient leurs autres champs.
  // Sans cette barrière, les règles de repli ci-dessous rapprochaient le
  // « Stage galop d'or » de la Toussaint et celui d'août — au même titre et à
  // la même heure — et une suppression de stage emportait toute l'année.
  const sa = lundiDe(a.date), sb = lundiDe(b.date);
  if (sa && sb && sa !== sb) return false;

  // Priorité 1 : identifiant de lot explicite (stages créés ensemble)
  if (a.stageGroupId && b.stageGroupId) return a.stageGroupId === b.stageGroupId;
  // Priorité 2 : même activité + même titre (stages depuis la même activité)
  if (a.activityId && b.activityId) return a.activityId === b.activityId && a.activityTitle === b.activityTitle;
  // Priorité 3 (repli) : ni l'un ni l'autre n'a d'identifiant fiable
  // (stages anciens ou créés jour par jour à la main) → titre + horaire.
  return a.activityTitle === b.activityTitle && a.startTime === b.startTime;
}
