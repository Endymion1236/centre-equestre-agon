/**
 * src/lib/annonces-accueil.ts — message ponctuel en tête de la page d'accueil.
 *
 * Chaque annonce porte une fenêtre d'affichage en heure de Paris : elle
 * apparaît et disparaît d'elle-même, sans nouvelle mise en ligne. Pure,
 * testée seule (tests/unit/annonces-accueil.test.ts).
 */

export interface AnnonceAccueil {
  /** « AAAA-MM-JJ HH:MM », heure de Paris. */
  debut: string;
  fin: string;
  titre: string;
  texte: string;
}

export const ANNONCES_ACCUEIL: AnnonceAccueil[] = [
  {
    debut: "2026-10-23 00:00",
    fin: "2026-10-23 13:00",
    titre: "Stage baby annulé ce matin",
    texte: "Le stage baby de ce vendredi matin est annulé. Tous les autres stages sont maintenus.",
  },
];

/** Date et heure de Paris au format « AAAA-MM-JJ HH:MM ». */
export function maintenantParis(d: Date): string {
  const p = Object.fromEntries(new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day} ${String(Number(p.hour) % 24).padStart(2, "0")}:${p.minute}`;
}

/** Annonces à afficher à cet instant. */
export function annoncesActives(annonces: AnnonceAccueil[], d: Date): AnnonceAccueil[] {
  const t = maintenantParis(d);
  return annonces.filter((a) => a.debut <= t && t < a.fin);
}
