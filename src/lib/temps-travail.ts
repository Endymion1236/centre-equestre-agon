/**
 * Temps de travail d'une journée, à partir des tâches planifiées.
 *
 * Règle voulue par Nicolas (26 septembre 2026) : tant qu'un temps n'est pas
 * saisi comme tâche « pause », il est travaillé. La journée compte donc de
 * la première tâche à la dernière, pauses saisies déduites — un battement
 * entre deux tâches, même long, est du travail (le salarié reste à
 * disposition).
 *
 * Contrepartie : une coupure du midi qu'on oublie de saisir est payée. D'où
 * l'alerte : tout battement de plus d'une heure non couvert par une pause
 * est signalé (fiche horaire et planning), pour ajouter la pause s'il
 * n'était pas travaillé.
 *
 * Historique : du 19 août au 26 septembre 2026, un battement de 30 minutes
 * ou plus n'était pas compté ; avant, déjà l'amplitude moins les pauses.
 *
 * Les chevauchements sont fusionnés : deux tâches qui se recouvrent ne
 * comptent pas double.
 */

/** Au-delà de ce battement non couvert par une pause, on alerte. */
export const SEUIL_ALERTE_BATTEMENT_MIN = 60;

export interface TacheJour {
  heureDebut: string;
  dureeMinutes: number;
  categorie: string;
}

interface Intervalle { debut: number; fin: number }

export interface JourneeCalculee {
  /** Au moins une tâche de travail ce jour-là. */
  travaille: boolean;
  /** Début de la première tâche et fin de la dernière (minutes depuis minuit). */
  debutMin: number;
  finMin: number;
  /** Périodes de tâches (fusionnées). */
  segments: Intervalle[];
  /** Battements de plus d'une heure comptés en travail, faute de pause saisie. */
  battementsLongs: (Intervalle & { minutes: number })[];
  /** Minutes retirées au titre des pauses explicitement saisies. */
  pauseDeduiteMin: number;
  /** La plus longue interruption non travaillée — sert à couper matin / après-midi. */
  coupure: Intervalle | null;
  /** Pauses saisies (tâche « pause »), ramenées à la journée de travail. */
  pausesSaisies: Intervalle[];
  /** Temps de travail retenu, en minutes. */
  dureeMin: number;
}

export function heureEnMinutes(h: string): number {
  const [hh, mm] = String(h || "0:0").split(":").map(Number);
  return (hh || 0) * 60 + (mm || 0);
}

export function minutesEnHeure(min: number): string {
  const m = Math.max(0, Math.round(min));
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** Fusionne les intervalles qui se chevauchent ou se touchent. */
function fusionner(list: Intervalle[]): Intervalle[] {
  const tri = [...list].sort((a, b) => a.debut - b.debut);
  const out: Intervalle[] = [];
  for (const i of tri) {
    const dernier = out[out.length - 1];
    if (dernier && i.debut <= dernier.fin) dernier.fin = Math.max(dernier.fin, i.fin);
    else out.push({ ...i });
  }
  return out;
}

export function calculerJournee(taches: TacheJour[]): JourneeCalculee {
  const vide: JourneeCalculee = {
    travaille: false, debutMin: 0, finMin: 0, segments: [], battementsLongs: [],
    pauseDeduiteMin: 0, coupure: null, pausesSaisies: [], dureeMin: 0,
  };

  const enIntervalle = (t: TacheJour): Intervalle => {
    const d = heureEnMinutes(t.heureDebut);
    return { debut: d, fin: d + Math.max(0, t.dureeMinutes || 0) };
  };

  const travail = fusionner(taches.filter(t => t.categorie !== "pause").map(enIntervalle));
  if (travail.length === 0) return vide;

  const debutMin = travail[0].debut;
  const finMin = travail[travail.length - 1].fin;

  // Pauses saisies, ramenées à la journée de travail : seules déduites.
  const pausesSaisies = fusionner(taches.filter(t => t.categorie === "pause").map(enIntervalle))
    .map((p) => ({ debut: Math.max(p.debut, debutMin), fin: Math.min(p.fin, finMin) }))
    .filter((p) => p.fin > p.debut);
  const pauseDeduiteMin = pausesSaisies.reduce((s, p) => s + (p.fin - p.debut), 0);

  // Battements entre deux tâches : comptés en travail. Plus longue
  // interruption (coupure) et battements longs non couverts par une pause.
  let coupure: Intervalle | null = null;
  const battementsLongs: (Intervalle & { minutes: number })[] = [];
  for (let i = 1; i < travail.length; i++) {
    const trou = { debut: travail[i - 1].fin, fin: travail[i].debut };
    if (!coupure || trou.fin - trou.debut > coupure.fin - coupure.debut) coupure = trou;
    const couvert = pausesSaisies.reduce((s, p) => s + Math.max(0, Math.min(p.fin, trou.fin) - Math.max(p.debut, trou.debut)), 0);
    const minutes = (trou.fin - trou.debut) - couvert;
    if (minutes > SEUIL_ALERTE_BATTEMENT_MIN) battementsLongs.push({ ...trou, minutes });
  }

  return {
    travaille: true,
    debutMin, finMin, segments: travail, battementsLongs, pauseDeduiteMin, coupure, pausesSaisies,
    dureeMin: Math.max(0, (finMin - debutMin) - pauseDeduiteMin),
  };
}

/** Raccourci : minutes travaillées d'une journée. */
export function minutesTravaillees(taches: TacheJour[]): number {
  return calculerJournee(taches).dureeMin;
}

/**
 * Les heures imprimées sur la fiche horaire d'une journée.
 *
 * Le midi imprimé est celui de la tâche « pause » quand elle est saisie : la
 * fiche coupait au plus long trou entre deux tâches, et un battement avant
 * ou après la pause (fin des soins à 11 h 45, pause 12 h–13 h, reprise à
 * 13 h 30) faisait imprimer 11 h 45 / 13 h 30 au lieu des heures de la pause.
 * Plusieurs pauses : la plus longue. Sans pause saisie, la journée est
 * imprimée d'un bloc (le battement est travaillé). « pause » = le temps des
 * pauses saisies.
 */
export function plagesFicheHoraire(j: JourneeCalculee): { debut: string; fin: string; debutAprem: string; finAprem: string; pauseMin: number } {
  if (!j.travaille) return { debut: "", fin: "", debutAprem: "", finAprem: "", pauseMin: 0 };
  const pause = [...j.pausesSaisies].sort((a, b) => (b.fin - b.debut) - (a.fin - a.debut) || a.debut - b.debut)[0];
  // Sans pause saisie, la journée est travaillée d'un bloc : pas de coupure imprimée.
  const midi = pause && pause.debut > j.debutMin && pause.fin < j.finMin ? pause : null;
  const pauseMin = Math.max(0, (j.finMin - j.debutMin) - j.dureeMin);
  if (!midi) return { debut: minutesEnHeure(j.debutMin), fin: minutesEnHeure(j.finMin), debutAprem: "", finAprem: "", pauseMin };
  return {
    debut: minutesEnHeure(j.debutMin),
    fin: minutesEnHeure(midi.debut),
    debutAprem: minutesEnHeure(midi.fin),
    finAprem: minutesEnHeure(j.finMin),
    pauseMin,
  };
}
