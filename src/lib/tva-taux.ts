/**
 * Choix d'un taux de TVA parmi des candidats, sans écraser le 0 %.
 *
 * Le code repliait partout un taux manquant avec `||`. Or 0 est « falsy »
 * en JavaScript : une activité réglée à 0 % de TVA — l'interface des
 * activités le propose, et les cotisations le sont — ressortait à 5,5 %.
 * Concrètement, le prix affiché au client était majoré de 5,5 % et la TVA
 * déclarée portait sur une base exonérée.
 *
 * `??` suffit dans la plupart des cas et c'est ce qui est utilisé au fil du
 * code. Ce helper sert là où la valeur peut aussi arriver en NaN ou en
 * chaîne, que `??` laisserait passer.
 *
 * Lui passer la valeur BRUTE, jamais un Number() déjà appliqué : Number("")
 * vaut 0, donc convertir avant l'appel transforme une saisie vide en
 * exonération de TVA.
 */

const TAUX_PAR_DEFAUT = 5.5;

export function tauxTva(...candidats: unknown[]): number {
  for (const brut of candidats) {
    if (brut === null || brut === undefined || brut === "") continue;
    const n = typeof brut === "number" ? brut : Number(brut);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return TAUX_PAR_DEFAUT;
}

/** Prix TTC à partir d'un HT et d'un taux, arrondi au centime. */
export function ttcDepuisHt(ht: number, taux: number): number {
  return Math.round((ht || 0) * (1 + taux / 100) * 100) / 100;
}
