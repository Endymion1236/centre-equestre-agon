/**
 * Temps de travail d'une journée, à partir des tâches planifiées.
 *
 * La règle a changé le 19 août 2026. Elle comptait auparavant l'AMPLITUDE —
 * de la première tâche à la dernière — en n'en retirant que les pauses saisies
 * comme tâche « pause ». Une journée 9h–12h puis 14h–17h sans pause saisie
 * comptait donc 8 h au lieu de 6 : le trou du midi était payé. À l'échelle
 * d'un mois, cela faisait apparaître 33 h supplémentaires là où il n'y en
 * avait aucune, parce que le calcul dépendait d'une saisie qu'on oublie.
 *
 * La règle est maintenant celle du terrain :
 *
 *   1. on additionne les périodes réellement travaillées ;
 *   2. une interruption de MOINS de 30 minutes reste comptée en travail —
 *      personne ne quitte son poste pour un quart d'heure ;
 *   3. les pauses explicitement saisies sont déduites, y compris courtes :
 *      les saisir est une déclaration, elle prime sur le seuil.
 *
 * Les chevauchements sont fusionnés : deux tâches qui se recouvrent ne
 * comptent pas double, ce qu'une simple somme des durées aurait fait.
 */

/** En deçà de ce battement, on considère que le salarié n'a pas quitté son poste. */
export const SEUIL_BATTEMENT_MIN = 30;

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
  /** Périodes de présence après pontage des battements courts. */
  segments: Intervalle[];
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
    travaille: false, debutMin: 0, finMin: 0, segments: [],
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

  // Pontage des battements courts : deux périodes séparées de moins du seuil
  // n'en font qu'une. Au-delà, la coupure est une vraie coupure.
  const segments: Intervalle[] = [];
  for (const p of travail) {
    const dernier = segments[segments.length - 1];
    if (dernier && p.debut - dernier.fin < SEUIL_BATTEMENT_MIN) dernier.fin = p.fin;
    else segments.push({ ...p });
  }

  // Pauses saisies : déduites de ce qui est compté comme présence.
  const pauses = fusionner(taches.filter(t => t.categorie === "pause").map(enIntervalle));
  let pauseDeduiteMin = 0;
  for (const pause of pauses) {
    for (const seg of segments) {
      pauseDeduiteMin += Math.max(0, Math.min(pause.fin, seg.fin) - Math.max(pause.debut, seg.debut));
    }
  }

  const presence = segments.reduce((s, seg) => s + (seg.fin - seg.debut), 0);

  // Plus longue interruption entre deux segments : c'est elle qui sépare la
  // matinée de l'après-midi sur la fiche imprimée.
  let coupure: Intervalle | null = null;
  for (let i = 1; i < segments.length; i++) {
    const trou = { debut: segments[i - 1].fin, fin: segments[i].debut };
    if (!coupure || trou.fin - trou.debut > coupure.fin - coupure.debut) coupure = trou;
  }

  const pausesSaisies = pauses
    .map((p) => ({ debut: Math.max(p.debut, debutMin), fin: Math.min(p.fin, finMin) }))
    .filter((p) => p.fin > p.debut);

  return {
    travaille: true,
    debutMin, finMin, segments, pauseDeduiteMin, coupure, pausesSaisies,
    dureeMin: Math.max(0, presence - pauseDeduiteMin),
  };
}

/**
 * Les heures imprimées sur la fiche horaire d'une journée.
 *
 * Le midi imprimé est celui de la tâche « pause » quand elle est saisie : la
 * fiche coupait au plus long trou entre deux tâches, et un battement avant
 * ou après la pause (fin des soins à 11 h 45, pause 12 h–13 h, reprise à
 * 13 h 30) faisait imprimer 11 h 45 / 13 h 30 au lieu des heures de la pause.
 * Plusieurs pauses : la plus longue. Sans pause saisie, la plus longue
 * coupure. La durée travaillée ne change pas ; « pause » = tout le temps
 * non travaillé entre la première et la dernière tâche.
 */
export function plagesFicheHoraire(j: JourneeCalculee): { debut: string; fin: string; debutAprem: string; finAprem: string; pauseMin: number } {
  if (!j.travaille) return { debut: "", fin: "", debutAprem: "", finAprem: "", pauseMin: 0 };
  const pause = [...j.pausesSaisies].sort((a, b) => (b.fin - b.debut) - (a.fin - a.debut) || a.debut - b.debut)[0];
  const midi = pause && pause.debut > j.debutMin && pause.fin < j.finMin ? pause : j.coupure;
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

/** Raccourci : minutes travaillées d'une journée. */
export function minutesTravaillees(taches: TacheJour[]): number {
  return calculerJournee(taches).dureeMin;
}
