/**
 * src/lib/nom-cavalier.ts
 *
 * « Prénom Nom » d'un cavalier, tel qu'on le copie sur un créneau et qu'on
 * l'affiche au planning.
 *
 * Règle du gérant : le nom de l'enfant s'il est renseigné sur sa fiche,
 * sinon le nom de la fiche famille. Sans cette règle, les enfants créés sans
 * nom depuis l'espace famille s'inscrivaient « Antoine » ou « Louis » au
 * planning, au milieu de « Aurèle COSTEGROSSE ».
 */

import { nomDeduitDuParent } from "./nom-foyer";

/** Nom de famille du foyer : champ dédié, sinon déduit du nom du parent. */
export function nomDeFamille(family: any): string {
  const dedie = String(family?.lastName || "").trim();
  if (dedie) return dedie;
  return nomDeduitDuParent(family?.parentName || "");
}

/**
 * « Prénom Nom » du cavalier. `family` est la fiche qui porte l'enfant ;
 * sans elle, on ne peut qu'espérer que le nom est sur l'enfant.
 */
export function nomCompletCavalier(child: any, family?: any): string {
  const prenom = String(child?.firstName || child?.prenom || "").split(" (")[0].trim();
  const nomEnfant = String(child?.lastName || child?.nom || "").trim();
  const nom = nomEnfant || (family ? nomDeFamille(family) : "");
  return [prenom, nom].filter(Boolean).join(" ");
}
