/**
 * src/lib/nom-foyer.ts
 *
 * Déduire le nom de famille du foyer à partir du nom du parent saisi.
 *
 * La saisie n'est pas normalisée : on lit aussi bien « LE MOAL Sophie » que
 * « Marie Dupont ». Deux conventions se rencontrent en pratique, et il faut
 * les reconnaître toutes les deux — le nom déduit sert de nom par défaut aux
 * cavaliers de la famille, donc une erreur ici se retrouve sur les fiches.
 */

/**
 * Le nom du foyer, en majuscules.
 *
 * Quand le nom est écrit en majuscules, on prend TOUS les mots en majuscules
 * consécutifs, pas seulement le premier : sans quoi « LE MOAL Sophie »
 * donnait « LE » au lieu de « LE MOAL ». Sinon, convention du nom en dernier.
 */
export function nomDeduitDuParent(parentName: string): string {
  const brut = (parentName || "").trim();
  if (!brut) return "";
  const mots = brut.split(/\s+/).filter(Boolean);
  const estMaj = (m: string) => m.length > 1 && m === m.toUpperCase() && /[A-ZÀ-Ý]/.test(m);
  const majuscules = mots.filter(estMaj);
  if (majuscules.length > 0) return majuscules.join(" ");
  return (mots[mots.length - 1] || "").toUpperCase();
}
