/**
 * src/lib/borne-tableau.ts
 *
 * Le « tableau du jour » de la borne : les cours d'aujourd'hui avec le
 * prénom des cavaliers, comme un tableau de sellerie.
 *
 * Pourquoi : à la rentrée, un enfant qui lit son prénom en arrivant se sent
 * attendu, et les parents qui ne passent pas à l'accueil voient quand même
 * « Galop 2, 14h, avec Nicolas ». La borne vocale, elle, ne montre jamais
 * de nom (écran public) ; ce tableau est un mode à part, que le club ouvre
 * sur la tablette quand il le souhaite.
 *
 * Ce qui sort d'ici, et rien d'autre : titre du cours, horaire, moniteur,
 * PRÉNOMS et poney affecté (celui du Montoir). Pas de nom de famille, pas
 * d'identifiant, pas de famille. Les
 * places tenues non payées et les inscriptions annulées ne figurent pas.
 * Un cours terminé disparaît un quart d'heure après sa fin. Module pur.
 */

export interface InscritBrut {
  childName?: string | null;
  /** Poney affecté depuis le Montoir. */
  horseName?: string | null;
  pending?: boolean | null;
  cancelled?: boolean | null;
  presence?: string | null;
}

export interface CreneauBrut {
  id: string;
  date?: string;
  startTime?: string;
  endTime?: string;
  activityTitle?: string;
  activityType?: string;
  monitor?: string | null;
  status?: string | null;
  enrolled?: InscritBrut[] | null;
}

export type EtatCours = "en_cours" | "bientot" | "a_venir";

export interface CarteTableau {
  id: string;
  titre: string;
  horaire: string;
  debut: string;
  fin: string;
  moniteur: string;
  etat: EtatCours;
  /** Un cavalier : son prénom et, s'il est affecté, son poney. */
  cavaliers: { prenom: string; poney: string }[];
}

/** Un cours « bientôt » : il commence dans moins de 45 minutes. */
const BIENTOT_MIN = 45;
/** Un cours fini reste affiché 15 minutes, le temps de ranger les poneys. */
const REMANENCE_MIN = 15;

const minutes = (hhmm: string | undefined | null): number | null => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || "").trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

/** « Léa Martin » → « Léa » ; « MARTIN Léa » → « Léa » ; « léa » → « Léa ». */
export function prenomAffiche(nom: string | null | undefined): string {
  const mots = String(nom || "").trim().split(/\s+/).filter(Boolean);
  if (mots.length === 0) return "";
  // Un mot tout en capitales est un nom de famille (« MARTIN Léa ») : on l'ignore.
  const candidats = mots.filter((m) => !(m.length > 1 && m === m.toUpperCase()));
  const brut = (candidats[0] || mots[0]).toLowerCase();
  return brut.replace(/(^|[-'’ ])(\p{L})/gu, (_, sep, l) => sep + l.toUpperCase());
}

export function construireTableauDuJour(creneaux: CreneauBrut[], maintenantHHMM: string): CarteTableau[] {
  const now = minutes(maintenantHHMM) ?? 0;
  const cartes: CarteTableau[] = [];
  for (const c of creneaux) {
    if (c.status === "closed") continue;
    const debut = minutes(c.startTime);
    const fin = minutes(c.endTime) ?? (debut != null ? debut + 60 : null);
    if (debut == null || fin == null) continue;
    if (fin + REMANENCE_MIN < now) continue;
    const vus = new Set<string>();
    const cavaliers: { prenom: string; poney: string }[] = [];
    for (const e of c.enrolled || []) {
      if (!e || e.pending || e.cancelled || e.presence === "absent") continue;
      const prenom = prenomAffiche(e.childName);
      const poney = String(e.horseName || "").trim();
      const cle = `${prenom}|${poney}`;
      if (!prenom || vus.has(cle)) continue;
      vus.add(cle);
      cavaliers.push({ prenom, poney });
    }
    cavaliers.sort((a, b) => a.prenom.localeCompare(b.prenom, "fr"));
    if (cavaliers.length === 0) continue;
    const etat: EtatCours = debut <= now ? "en_cours" : debut - now <= BIENTOT_MIN ? "bientot" : "a_venir";
    cartes.push({
      id: c.id,
      titre: String(c.activityTitle || "Cours"),
      horaire: `${c.startTime}–${c.endTime || ""}`.replace(/–$/, ""),
      debut: String(c.startTime),
      fin: String(c.endTime || ""),
      moniteur: String(c.monitor || ""),
      etat,
      cavaliers,
    });
  }
  return cartes.sort((a, b) => a.debut.localeCompare(b.debut) || a.titre.localeCompare(b.titre, "fr"));
}

/**
 * « HH:MM » à Paris, en cycle 0–23 explicite. `hour12: false` donnait
 * « 00:15 » à midi et quart sur Vercel (cycle h11) : tous les cours de
 * l'après-midi partaient dans « plus tard », ceux du matin disparaissaient.
 */
export function heureParis(d: Date): string {
  const parts = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d);
  const h = Number(parts.find((p) => p.type === "hour")?.value || 0) % 24;
  const m = Number(parts.find((p) => p.type === "minute")?.value || 0);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
