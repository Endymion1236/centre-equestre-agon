/**
 * src/lib/panier-reservation.ts
 *
 * Les totaux du panier de réservation en ligne, et ce que la famille doit
 * régler tout de suite.
 *
 * L'acompte n'est pas un pourcentage mais un montant fixe PAR ENFANT inscrit
 * à un stage — la même valeur que celle annoncée dans les conditions de
 * vente. Deux enfants sur un stage, c'est deux acomptes. Il ne dépasse jamais
 * le total du panier : un panier moins cher que l'acompte se règle en une
 * fois, sans solde à venir.
 *
 * Ces calculs vivaient dans l'écran de réservation, à six cents lignes de
 * l'affichage qui les montre à la famille et du paiement qui les encaisse.
 */

import { STAGE_ACOMPTE_EUROS } from "./cgv-clauses";

/** Ce qu'une ligne du panier apporte au calcul. */
export interface LignePanier {
  prixFinal: number;
  remiseEuros: number;
  isStage?: boolean;
}

export interface TotauxPanier {
  /** Somme à payer, réductions déduites. */
  total: number;
  /** Total des réductions accordées, pour l'afficher à la famille. */
  reductions: number;
  /** Le panier contient au moins un stage. */
  contientUnStage: boolean;
  /** Nombre d'enfants inscrits à un stage — un acompte chacun. */
  nbEnfantsStage: number;
  /** À régler maintenant si la famille choisit l'acompte. */
  acompte: number;
  /** Ce qui restera dû après l'acompte. */
  solde: number;
}

/** Montant de l'acompte dû par enfant inscrit à un stage. */
export const ACOMPTE_PAR_ENFANT = STAGE_ACOMPTE_EUROS;

export function totauxPanier(lignes: LignePanier[]): TotauxPanier {
  const cart = lignes || [];
  const total = Math.round(cart.reduce((s, i) => s + (i.prixFinal || 0), 0) * 100) / 100;
  const reductions = Math.round(cart.reduce((s, i) => s + (i.remiseEuros || 0), 0) * 100) / 100;
  const nbEnfantsStage = cart.filter((i) => i.isStage).length;
  const acompte = Math.min(ACOMPTE_PAR_ENFANT * nbEnfantsStage, total);
  return {
    total,
    reductions,
    // La clause d'annulation à trois semaines ne concerne que les stages :
    // inutile de la faire accepter pour une balade.
    contientUnStage: cart.some((i) => i.isStage === true),
    nbEnfantsStage,
    acompte,
    solde: Math.round((total - acompte) * 100) / 100,
  };
}
