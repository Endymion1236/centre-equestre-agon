/**
 * src/lib/creneaux-de-ligne.ts — les créneaux qu'une ligne de commande désigne.
 *
 * Octobre 2026 : une cavalière inscrite au stage lundi et mardi (54 €),
 * retirée depuis Impayés, est restée inscrite le lundi sans plus aucune
 * commande. La ligne créée par le planning ne portait pas l'identifiant de
 * ses créneaux ; seul le jour ajouté ensuite l'avait (`creneauIds`), et la
 * désinscription ne retirait que celui-là. Le lundi avait de plus été
 * renommé : le chercher par le titre ne marchait pas non plus.
 *
 * Règle : les identifiants portés par la ligne, plus, pour chaque date de
 * `stageDates` qu'ils ne couvrent pas, le créneau de stage de ce jour, à la
 * même heure, où ce cavalier est inscrit. Le titre n'entre pas en jeu.
 *
 * Module pur, testé seul (tests/unit/creneaux-de-ligne.test.ts).
 */

export interface LigneCreneaux {
  childId?: string;
  creneauId?: string;
  creneauIds?: string[];
  stageDates?: { date?: string; startTime?: string }[];
}

export interface CreneauCandidat {
  id: string;
  date?: string;
  startTime?: string;
  activityType?: string;
  enrolled?: { childId?: string }[];
}

const estStage = (c: CreneauCandidat) => c.activityType === "stage" || c.activityType === "stage_journee";

/** Dates de la ligne dont le créneau reste à retrouver en base. */
export function datesDeLaLigne(ligne: LigneCreneaux): string[] {
  return [...new Set((ligne.stageDates || []).map(d => d?.date || "").filter(Boolean))];
}

/** Identifiants des créneaux de la ligne, sans doublon. `candidats` = créneaux des dates de la ligne. */
export function creneauxDeLaLigne(ligne: LigneCreneaux, candidats: CreneauCandidat[]): string[] {
  const ids = new Set<string>([...(ligne.creneauIds || []), ...(ligne.creneauId ? [ligne.creneauId] : [])].filter(Boolean));
  const dateDe = new Map(candidats.map(c => [c.id, c.date]));
  const datesCouvertes = new Set([...ids].map(id => dateDe.get(id)).filter(Boolean));
  for (const sd of ligne.stageDates || []) {
    if (!sd?.date || datesCouvertes.has(sd.date) || !ligne.childId) continue;
    const trouve = candidats.filter(c =>
      c.date === sd.date && estStage(c)
      && (!sd.startTime || c.startTime === sd.startTime)
      && (c.enrolled || []).some(e => e.childId === ligne.childId));
    if (trouve.length === 1) { ids.add(trouve[0].id); datesCouvertes.add(sd.date); }
  }
  return [...ids];
}
