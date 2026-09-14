/**
 * src/lib/rappel-saison.ts
 *
 * Le mail de reprise des cours (cron daily-notifications, JOB 4) : ce qu'il
 * dit à chaque famille, à partir des créneaux de la première semaine.
 *
 * Deux choses lui manquaient : le prénom de l'enfant sous chaque créneau
 * (une famille avec deux enfants sur deux cours voyait deux lignes sans
 * savoir laquelle était pour qui), et un mot pour les parents qui attendent
 * pendant la séance. Module pur : le cron lit Firestore, ce fichier compose.
 */

import { emailPanneau, emailLigne, emailParagraphe as P, emailTitre } from "@/lib/email-templates";

export interface CreneauSaison {
  title: string;
  /** « lundi », « mardi »… */
  jour: string;
  /** « 17:00–18:00 » */
  horaire: string;
  moniteur: string;
  /** Prénoms des enfants de la famille sur ce créneau. */
  enfants: string[];
}

const ORDRE_JOURS = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];
const rangJour = (j: string) => { const i = ORDRE_JOURS.indexOf(j.toLowerCase()); return i < 0 ? 99 : i; };

/** Clé d'un créneau récurrent : même activité, même jour, même heure. */
export const cleCreneauSaison = (title: string, jour: string, startTime: string) => `${title}|${jour}|${startTime}`;

/** Ajoute un enfant à la liste des créneaux d'une famille, sans doublon. */
export function ajouterEnfantAuCreneau(slots: Map<string, CreneauSaison>, cle: string, creneau: Omit<CreneauSaison, "enfants">, enfant: string) {
  const existant = slots.get(cle);
  const prenom = String(enfant || "").trim();
  if (!existant) { slots.set(cle, { ...creneau, enfants: prenom ? [prenom] : [] }); return; }
  if (prenom && !existant.enfants.includes(prenom)) existant.enfants.push(prenom);
}

/** Les créneaux triés par jour puis heure, chacun avec le ou les enfants. */
export function panneauxCreneauxSaison(slots: Iterable<CreneauSaison>): string {
  return [...slots]
    .sort((a, b) => rangJour(a.jour) - rangJour(b.jour) || a.horaire.localeCompare(b.horaire))
    .map((s) => emailPanneau(s.title, [
      s.enfants.length ? emailLigne(s.enfants.length > 1 ? "Cavaliers" : "Cavalier", s.enfants.join(", ")) : "",
      emailLigne("Jour", s.jour),
      emailLigne("Horaire", s.horaire),
      s.moniteur ? emailLigne("Encadrement", s.moniteur) : "",
    ].join("")))
    .join("");
}

export const MOT_ACCUEIL_PARENTS =
  "Pendant la séance, la salle de club vous est ouverte : café et thé y sont à votre disposition, pour patienter au chaud.";

/** Corps du mail, hors en-tête et signature (ajoutés par le cron avec emailLayout). */
export function corpsRappelSaison(params: { parentName: string; debut: Date; slots: Iterable<CreneauSaison> }): string {
  const { parentName, debut, slots } = params;
  const dateLongue = debut.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  return [
    emailTitre("Les cours reprennent"),
    P(`Bonjour ${parentName || "cher parent"},`),
    P(`Les cours reprennent le <strong>${dateLongue}</strong>. Voici votre planning récurrent pour la saison :`),
    panneauxCreneauxSaison(slots),
    P("Ce créneau est le vôtre chaque semaine pour toute la saison.", 13),
    P(MOT_ACCUEIL_PARENTS, 13),
  ].join("\n");
}
