/**
 * src/lib/conflit-horaire.ts — un cavalier ne peut pas être à deux endroits
 * en même temps.
 *
 * Octobre 2026 : Charlie et Léonie VASSEUR se sont retrouvées inscrites le
 * même jour, à la même heure, sur « Poney Aventure » ET sur le « Stage
 * bronze et argent ». Les contrôles existaient, mais chacun dans son coin,
 * sur ce que l'écran avait sous les yeux : le panier en ligne regardait le
 * panier, le panneau d'inscription regardait la vue courante du planning,
 * et le serveur ne regardait rien. Une inscription posée par un autre chemin
 * (jours supplémentaires d'un stage, changement de groupe, boîte mail) passait.
 *
 * La règle vit ici, une fois, et se teste sans base :
 *   - `chevauche` : deux créneaux du même jour dont les heures se recouvrent ;
 *   - `creneauxEnConflit` : où ce cavalier est DÉJÀ inscrit à ce moment-là ;
 *   - `doublonsInscriptions` : tous les cavaliers attendus à deux endroits
 *     (veille du club).
 *
 * Toute entrée du tableau `enrolled` compte, pré-inscription et place tenue
 * comprises : une place retenue est une place où le cavalier est attendu.
 */

export interface InscritHoraire {
  childId?: string;
  childName?: string;
}

export interface CreneauHoraire {
  id?: string;
  date?: string;
  startTime?: string;
  endTime?: string;
  activityTitle?: string;
  enrolled?: InscritHoraire[] | null;
}

/** Deux créneaux du même jour dont les heures se recouvrent (bornes exclues). */
export function chevauche(a: CreneauHoraire, b: CreneauHoraire): boolean {
  if (!a?.date || !b?.date || a.date !== b.date) return false;
  // Sans horaires connus des deux côtés, on ne conclut pas à un conflit :
  // mieux vaut laisser passer qu'interdire une inscription légitime.
  if (!a.startTime || !a.endTime || !b.startTime || !b.endTime) return false;
  return a.startTime < b.endTime && b.startTime < a.endTime;
}

const inscrit = (c: CreneauHoraire, childId: string) =>
  (c.enrolled || []).some((e) => e?.childId === childId);

/**
 * Les créneaux où ce cavalier est déjà inscrit et qui chevauchent la cible.
 * `ignorer` : créneaux à ne pas compter (ceux qu'il quitte lors d'un
 * changement de groupe, ou les autres jours du stage qu'on inscrit).
 */
export function creneauxEnConflit(
  childId: string,
  cible: CreneauHoraire,
  candidats: CreneauHoraire[],
  ignorer: Iterable<string> = [],
): CreneauHoraire[] {
  const exclus = new Set<string>(ignorer);
  if (cible.id) exclus.add(cible.id);
  return candidats.filter((c) =>
    !!c && !(c.id && exclus.has(c.id)) && chevauche(cible, c) && inscrit(c, childId));
}

/** « Poney Aventure » de 14:00 à 16:00 */
export function libelleConflit(c: CreneauHoraire): string {
  const heures = c.startTime && c.endTime ? ` de ${c.startTime} à ${c.endTime}` : "";
  return `« ${c.activityTitle || "?"} »${heures}`;
}

export interface DoublonInscription {
  childId: string;
  childName: string;
  date: string;
  /** Les deux créneaux, dans l'ordre de l'heure de début. */
  creneaux: [CreneauHoraire, CreneauHoraire];
}

/**
 * Tous les cavaliers inscrits à deux créneaux qui se chevauchent, un cas par
 * paire de créneaux. Trié par date, puis par nom.
 */
export function doublonsInscriptions(creneaux: CreneauHoraire[]): DoublonInscription[] {
  const parJour = new Map<string, CreneauHoraire[]>();
  for (const c of creneaux) {
    if (!c?.date || !(c.enrolled || []).length) continue;
    const liste = parJour.get(c.date) || [];
    liste.push(c);
    parJour.set(c.date, liste);
  }
  const cas: DoublonInscription[] = [];
  for (const [date, liste] of parJour) {
    const tries = liste.slice().sort((a, b) => String(a.startTime || "").localeCompare(String(b.startTime || "")));
    for (let i = 0; i < tries.length; i++) {
      for (let j = i + 1; j < tries.length; j++) {
        const a = tries[i], b = tries[j];
        if (!chevauche(a, b)) continue;
        for (const e of a.enrolled || []) {
          if (!e?.childId || !inscrit(b, e.childId)) continue;
          const nom = e.childName || (b.enrolled || []).find((x) => x?.childId === e.childId)?.childName || e.childId;
          cas.push({ childId: e.childId, childName: nom, date, creneaux: [a, b] });
        }
      }
    }
  }
  return cas.sort((x, y) => x.date.localeCompare(y.date) || x.childName.localeCompare(y.childName));
}
