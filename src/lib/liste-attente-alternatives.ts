/**
 * src/lib/liste-attente-alternatives.ts — proposer aux familles en liste
 * d'attente un autre créneau du même nom, ouvert la même semaine.
 *
 * Octobre 2026 : le « Stage premier sabot » de 10 h affichait complet avec
 * trois enfants en attente ; Nicolas en ouvre un second à 16 h 30, d'1 h 30
 * au lieu de 2 h. Rien ne prévenait les familles en attente : il fallait les
 * appeler une à une.
 *
 * Règle : même titre (sans tenir compte des majuscules ni des accents), même
 * semaine, autre horaire, encore des places. Pour un stage, les jours d'un
 * même horaire forment UNE proposition (« du lundi au vendredi,
 * 16 h 30–18 h »). Les familles restent sur leur liste d'attente : elles
 * choisissent. Chaque entrée garde la trace des propositions déjà faites,
 * pour ne pas renvoyer le même email.
 *
 * Module pur, testé seul (tests/unit/liste-attente-alternatives.test.ts).
 */
import { lundiDe } from "@/lib/meme-stage";

export interface CreneauAlternatif {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  activityTitle?: string;
  maxPlaces?: number;
  enrolled?: unknown[];
  status?: string;
}

export interface Alternative {
  /** Clé stable de la proposition : semaine + horaire. */
  cle: string;
  startTime: string;
  endTime: string;
  dureeMinutes: number;
  /** Jours concernés, dans l'ordre. */
  creneaux: CreneauAlternatif[];
  /** Places encore libres (le jour le plus rempli fait foi). */
  placesLibres: number;
}

const normaliser = (s: unknown) =>
  String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

const minutes = (h: string) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(h || "");
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
};

export function dureeMinutes(startTime: string, endTime: string): number {
  const d = minutes(endTime) - minutes(startTime);
  return Number.isFinite(d) && d > 0 ? d : 0;
}

/** « 90 » → « 1 h 30 », « 120 » → « 2 h », « 45 » → « 45 min ». */
export function libelleDuree(min: number): string {
  if (!min) return "";
  const h = Math.floor(min / 60), m = min % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${String(m).padStart(2, "0")}` : `${h} h`;
}

const placesLibres = (c: CreneauAlternatif) => Math.max(0, (Number(c.maxPlaces) || 0) - (c.enrolled || []).length);

/**
 * Les autres horaires du même créneau, la même semaine, avec des places.
 * `aujourdhui` (AAAA-MM-JJ, heure de Paris) écarte les jours passés.
 */
export function alternativesMemeSemaine(
  creneau: CreneauAlternatif,
  tous: CreneauAlternatif[],
  aujourdhui: string,
): Alternative[] {
  const titre = normaliser(creneau.activityTitle);
  const semaine = lundiDe(creneau.date);
  if (!titre || !semaine) return [];
  const groupes = new Map<string, CreneauAlternatif[]>();
  for (const c of tous) {
    if (!c || c.id === creneau.id || c.status === "closed") continue;
    if (normaliser(c.activityTitle) !== titre || lundiDe(c.date) !== semaine) continue;
    if (c.startTime === creneau.startTime && c.endTime === creneau.endTime) continue; // même horaire : c'est le même stage
    if (c.date < aujourdhui) continue;
    const k = `${c.startTime}-${c.endTime}`;
    groupes.set(k, [...(groupes.get(k) || []), c]);
  }
  const sortie: Alternative[] = [];
  for (const [k, liste] of groupes) {
    const jours = [...liste].sort((a, b) => a.date.localeCompare(b.date));
    const libres = Math.min(...jours.map(placesLibres));
    if (libres <= 0) continue;
    sortie.push({
      cle: `${semaine}_${k}`,
      startTime: jours[0].startTime,
      endTime: jours[0].endTime,
      dureeMinutes: dureeMinutes(jours[0].startTime, jours[0].endTime),
      creneaux: jours,
      placesLibres: libres,
    });
  }
  return sortie.sort((a, b) => a.startTime.localeCompare(b.startTime));
}

export interface EntreeAttente {
  id: string;
  familyId?: string;
  familyName?: string;
  familyEmail?: string;
  childName?: string;
  alternativesProposees?: string[];
}

export interface EnvoiAlternative {
  familyId: string;
  familyName: string;
  email: string;
  enfants: string[];
  entreeIds: string[];
}

/**
 * Un email par famille (deux enfants en attente = un seul message), en
 * sautant celles déjà prévenues de cette proposition et celles sans email.
 */
export function envoisAlternative(
  attente: EntreeAttente[],
  cle: string,
  emailFiche: (familyId: string) => string,
): { envois: EnvoiAlternative[]; dejaPrevenues: number; sansEmail: string[] } {
  const parFamille = new Map<string, EnvoiAlternative>();
  let dejaPrevenues = 0;
  const sansEmail: string[] = [];
  for (const e of attente) {
    if ((e.alternativesProposees || []).includes(cle)) { dejaPrevenues++; continue; }
    const fid = e.familyId || e.id;
    const email = (e.familyEmail || emailFiche(fid) || "").trim();
    if (!email) { sansEmail.push(e.familyName || e.childName || "?"); continue; }
    const deja = parFamille.get(fid);
    if (deja) { deja.enfants.push(e.childName || ""); deja.entreeIds.push(e.id); continue; }
    parFamille.set(fid, { familyId: fid, familyName: e.familyName || "", email, enfants: [e.childName || ""], entreeIds: [e.id] });
  }
  return { envois: [...parFamille.values()], dejaPrevenues, sansEmail };
}

const JOURS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const jourDe = (iso: string) => JOURS[new Date(iso + "T12:00:00Z").getUTCDay()];
const dateCourte = (iso: string) => {
  const d = new Date(iso + "T12:00:00Z");
  return `${jourDe(iso)} ${d.getUTCDate()}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};

/** « lundi 19/10 » ou « du lundi 19/10 au vendredi 23/10 (5 jours) ». */
export function libelleJours(a: Alternative): string {
  const j = a.creneaux;
  if (j.length === 1) return dateCourte(j[0].date);
  return `du ${dateCourte(j[0].date)} au ${dateCourte(j[j.length - 1].date)} (${j.length} jours)`;
}

/** Ligne d'horaire, avec la différence de durée quand il y en a une. */
export function libelleHoraire(a: Alternative, dureeOrigine: number): string {
  const base = `${a.startTime.replace(":", " h ")}–${a.endTime.replace(":", " h ")}`.replace(/ h 00/g, " h");
  const d = libelleDuree(a.dureeMinutes);
  if (!d) return base;
  return dureeOrigine && dureeOrigine !== a.dureeMinutes
    ? `${base} (${d}, au lieu de ${libelleDuree(dureeOrigine)})`
    : `${base} (${d})`;
}
