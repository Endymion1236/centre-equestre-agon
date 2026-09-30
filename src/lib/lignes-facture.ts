/**
 * src/lib/lignes-facture.ts — les lignes d'une facture, ramenées à son total.
 *
 * Septembre 2026 : l'export du CA montrait 71 616,24 € de lignes pour
 * 68 000,81 € de factures. Deux défauts de saisie, en sens contraires :
 *   - un forfait payé en 3× ou 10× depuis le planning crée une commande par
 *     échéance ; la PREMIÈRE porte toutes les lignes du forfait (699 €) pour
 *     un total d'une échéance (69,90 €), les suivantes une ligne
 *     « Échéance n/10 ». Le forfait était compté presque deux fois ;
 *   - une remise posée sur la facture entière, sans ligne.
 * Une ancienne version de l'inscription en ligne ne notait qu'un `amount`,
 * sans taux de TVA : ces lignes ne sont pas lues (on n'invente pas un taux),
 * la facture reste dans la liste des écarts, à régler avec le comptable.
 *
 * Le total de la facture fait foi. Les lignes sont ramenées à ce total AU
 * PRORATA : la 1re échéance de 69,90 € se répartit entre forfait, licence
 * et adhésion comme le forfait entier, et une remise globale se répartit
 * comme le reste. Utilisé par l'export du CA, le FEC et la déclaration de
 * TVA (base factures), pour que les trois disent la même chose.
 *
 * Module pur. Les pièces elles-mêmes ne sont pas modifiées.
 */

import { tauxTva } from "@/lib/tva-taux";

export interface LigneRamenee {
  priceTTC: number;
  /** Absent quand la ligne n'a ni taux ni HT (rien ne permet de le calculer). */
  priceHT?: number;
  tva?: number;
  [cle: string]: any;
}

const cts = (n: unknown) => Math.round((Number(n) || 0) * 100);

/** Le TTC d'une ligne (`priceTTC` ; une ligne sans prix compte pour 0). */
export function ttcDeLigne(l: any): number {
  return Number(l?.priceTTC) || 0;
}

/** Écart (en €) entre le total de la facture et la somme brute de ses lignes. */
export function ecartLignes(facture: { totalTTC?: number; items?: any[] }): number {
  const somme = (facture.items || []).reduce((s: number, l: any) => s + cts(ttcDeLigne(l)), 0);
  return (cts(facture.totalTTC) - somme) / 100;
}

/**
 * Les lignes de la facture, TTC et HT ramenés au total. Sans ligne chiffrée,
 * les lignes sont rendues telles quelles (rien ne permet de répartir).
 */
export function lignesAuTotal<T extends { totalTTC?: number; items?: any[] }>(facture: T): LigneRamenee[] {
  // Libellé : les lignes saisies en ligne le portent dans `label`.
  const items = (facture.items || []).map((l: any) => ({ ...l, activityTitle: l.activityTitle ?? l.label, priceTTC: ttcDeLigne(l) }));
  const chiffrees = items.filter((l) => cts(l.priceTTC) !== 0);
  const somme = chiffrees.reduce((s, l) => s + cts(l.priceTTC), 0);
  const total = cts(facture.totalTTC);
  if (somme === 0 || somme === total) return items;
  // Répartition au centime : le reste d'arrondi va à la plus grosse ligne,
  // pour que la somme retombe EXACTEMENT sur le total.
  const parts = chiffrees.map((l) => Math.round((cts(l.priceTTC) * total) / somme));
  const reste = total - parts.reduce((s, p) => s + p, 0);
  if (reste !== 0) {
    let iMax = 0;
    chiffrees.forEach((l, i) => { if (Math.abs(cts(l.priceTTC)) > Math.abs(cts(chiffrees[iMax].priceTTC))) iMax = i; });
    parts[iMax] += reste;
  }
  let k = 0;
  return items.map((l) => {
    if (cts(l.priceTTC) === 0) return l;
    const ttc = parts[k++] / 100;
    return { ...l, priceTTC: ttc, priceHT: htRamene(l, ttc) };
  });
}

/**
 * HT de la ligne ramenée : depuis son taux quand elle en a un ; sinon le HT
 * d'origine au même prorata ; sinon rien (on n'invente pas un taux).
 */
function htRamene(l: any, ttc: number): number | undefined {
  if (l.tva !== undefined && l.tva !== null && l.tva !== "") {
    const t = tauxTva(l.tva);
    return Math.round((ttc / (1 + t / 100)) * 100) / 100;
  }
  if (l.priceHT !== undefined && l.priceHT !== null && Number(l.priceTTC)) {
    return Math.round(((Number(l.priceHT) * ttc) / Number(l.priceTTC)) * 100) / 100;
  }
  return undefined;
}
