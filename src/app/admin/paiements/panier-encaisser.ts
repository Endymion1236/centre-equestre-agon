/**
 * src/app/admin/paiements/panier-encaisser.ts
 *
 * Fabrication d'une ligne de panier, dans les trois cas possibles : une
 * activité du catalogue, une saisie libre, ou la vente d'un bon cadeau.
 *
 * Pourquoi séparer : la ligne fabriquée ici est recopiée telle quelle dans
 * la commande Firestore, et c'est elle qui porte la ventilation HT / TVA /
 * TTC et le compte comptable. Le HT n'est donc pas un affichage, c'est ce
 * que lira la comptable. Isolé du composant, ce calcul se relit sans
 * dérouler le formulaire qui l'entoure.
 */

import { safeNumber } from "@/lib/utils";
import type { Activity } from "@/types";
import type { BasketItem } from "./types";
import { CATEGORIES } from "./constantes-encaisser";

/**
 * Ligne issue du catalogue.
 *
 * Le TTC de l'activité fait foi (`priceTTC`), le HT en est déduit ; on ne
 * repart du HT que si l'activité n'a pas de TTC saisi. C'est le sens de
 * lecture qu'attend l'admin : il annonce un prix TTC au comptoir.
 */
export const construireItemActivite = (
  act: Activity & { firestoreId: string },
  childId: string,
  childName: string,
): BasketItem => {
  const priceTTC = (act as any).priceTTC || ((act.priceHT || 0) * (1 + ((act as any).tvaTaux || 5.5) / 100));
  return {
    id: Date.now().toString(),
    activityTitle: act.title,
    activityId: act.firestoreId,
    childId,
    childName,
    activityType: (act as any).type || "",
    description: act.title,
    priceHT: priceTTC / (1 + ((act as any).tvaTaux || 5.5) / 100),
    tva: (act as any).tvaTaux || 5.5,
    priceTTC,
  };
};

/** Saisie libre : prix TTC annoncé, HT recalculé, compte pris à la catégorie. */
export const construireItemLibre = (params: {
  customLabel: string;
  customPrice: string;
  customTva: string;
  customCategory: string;
  childId: string;
  childName: string;
}): BasketItem => {
  const { customLabel, customPrice, customTva, customCategory, childId, childName } = params;
  const price = safeNumber(customPrice);
  const tvaRate = safeNumber(customTva);
  const cat = CATEGORIES.find(c => c.id === customCategory);
  return {
    id: Date.now().toString(),
    activityTitle: customLabel,
    childId,
    childName,
    description: "Saisie manuelle",
    priceHT: tvaRate > 0 ? Math.round(price / (1 + tvaRate / 100) * 100) / 100 : price,
    tva: tvaRate,
    priceTTC: price,
    category: customCategory,
    compteComptable: cat?.compte || "708000",
  };
};

/**
 * Vente d'un bon cadeau.
 *
 * Sans TVA et à 100 % de HT : la vente d'un bon n'est pas une prestation,
 * c'est de l'argent encaissé d'avance. Le drapeau `isBonCadeau` est ce qui
 * déclenchera, à la validation du paiement, la création du bon et de son
 * code.
 */
export const construireItemBonCadeau = (montant: number, dest: string): BasketItem => ({
  id: `bon-${Date.now()}`,
  activityTitle: `Bon cadeau${dest ? ` — ${dest}` : ""}`,
  childId: "", childName: "—",
  description: "Vente d'un bon cadeau",
  priceHT: montant, tva: 0, priceTTC: montant,
  category: "bon_cadeau", compteComptable: "708000",
  isBonCadeau: true, recipientName: dest,
} as any);
