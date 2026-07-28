/**
 * src/lib/search-normalize.ts
 *
 * Normalisation des textes pour la RECHERCHE uniquement (jamais pour
 * l'affichage ni le stockage : les fiches gardent leur orthographe exacte).
 *
 * Objectif : qu'une recherche trouve la fiche quelle que soit la saisie.
 *   "Lea"          trouve "Léa"
 *   "Léa"          trouve "Lea"
 *   "jean pierre"  trouve "Jean-Pierre"
 *   "jean-pierre"  trouve "Jean Pierre"
 *   "jeanpierre"   trouve "Jean-Pierre"
 *   "ndiaye"       trouve "N'Diaye"
 *
 * ⚠️ On ne touche PAS aux points ni aux arobases : sinon on casserait la
 * recherche par email (chercher "dupont@gmail" doit continuer de marcher).
 */

/** Caractères considérés comme des séparateurs de mots (tirets courts/longs,
 *  apostrophes droites et typographiques, underscore, espaces insécables). */
const SEPARATORS = /[-‐‑‒–—―_'’‘ʼ`´\s]+/g;

/**
 * Forme normalisée "avec espaces" : minuscules, sans accents,
 * séparateurs ramenés à un espace simple.
 *   "Jean-Pierre  N'Diaye" → "jean pierre n diaye"
 */
export function normalizeSearch(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // retire les accents (é → e, ï → i, ç → c…)
    .replace(SEPARATORS, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Forme normalisée "compactée" : idem mais sans aucun espace.
 * Permet de retrouver "Jean-Pierre" en tapant "jeanpierre".
 */
export function compactSearch(value: unknown): string {
  return normalizeSearch(value).replace(/ /g, "");
}

/**
 * Est-ce que `haystack` contient `needle`, en ignorant accents,
 * tirets, apostrophes et espaces ?
 *
 * Une recherche vide renvoie true (aucun filtre appliqué).
 */
export function searchMatches(haystack: unknown, needle: unknown): boolean {
  const query = normalizeSearch(needle);
  if (!query) return true;

  const target = normalizeSearch(haystack);
  if (!target) return false;

  // 1er essai : correspondance en gardant la séparation des mots
  if (target.includes(query)) return true;

  // 2e essai : tout collé, pour les saisies sans espace ni tiret
  return compactSearch(haystack).includes(compactSearch(needle));
}

/**
 * Variante pratique : `needle` est-il trouvé dans AU MOINS un des champs ?
 * Les valeurs vides / null / undefined sont ignorées sans planter.
 */
export function searchMatchesAny(fields: unknown[], needle: unknown): boolean {
  const query = normalizeSearch(needle);
  if (!query) return true;
  return fields.some((field) => searchMatches(field, needle));
}
