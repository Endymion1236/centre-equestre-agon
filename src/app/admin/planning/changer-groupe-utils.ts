/**
 * src/app/admin/planning/changer-groupe-utils.ts
 *
 * Règles pures de la modale « Changer de groupe », testées seules
 * (tests/unit/changer-groupe-utils.test.ts) : à quelle semaine est une
 * destination par rapport au stage actuel, comment le dire, dans quel ordre
 * les montrer.
 */
import { lundiDe } from "@/lib/meme-stage";

/** Semaines d'écart entre la semaine de `reference` et celle de `date` (négatif = avant). */
export function ecartSemaines(reference: string, date: string): number {
  const a = lundiDe(reference), b = lundiDe(date);
  if (!a || !b) return 0;
  return Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / (7 * 24 * 3600 * 1000));
}

/** « même semaine », « semaine précédente », « 2 semaines avant »… */
export function libelleSemaine(ecart: number): string {
  if (ecart === 0) return "même semaine";
  if (ecart === -1) return "semaine précédente";
  if (ecart === 1) return "semaine suivante";
  return ecart < 0 ? `${-ecart} semaines avant` : `${ecart} semaines après`;
}

/**
 * Ordre d'affichage : la même semaine d'abord (le cas courant, changer de
 * groupe), puis les autres semaines de la plus proche à la plus lointaine,
 * la précédente avant la suivante à distance égale, puis par date.
 */
export function ordonnerDestinations<T extends { ecart: number; date: string }>(lots: T[]): T[] {
  return lots.slice().sort((a, b) =>
    Math.abs(a.ecart) - Math.abs(b.ecart) || a.ecart - b.ecart || a.date.localeCompare(b.date));
}
