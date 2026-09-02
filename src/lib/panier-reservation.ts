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

/**
 * L'acompte dû et ce qui restera à solder, pour un nombre d'enfants inscrits
 * à un stage et un total donné.
 *
 * Un acompte par enfant, jamais plus que le total. C'est la règle unique :
 * l'espace famille et l'écran d'inscription doivent annoncer le même montant,
 * sans quoi une famille lit un chiffre en ligne et en voit un autre sur sa
 * facture.
 */
export function montantsAcompteStage(nbEnfants: number, total: number): { acompte: number; solde: number } {
  const totalArrondi = Math.round((total || 0) * 100) / 100;
  const acompte = Math.min(ACOMPTE_PAR_ENFANT * Math.max(0, nbEnfants || 0), totalArrondi);
  return { acompte, solde: Math.round((totalArrondi - acompte) * 100) / 100 };
}

/**
 * L'acompte a-t-il un sens ici ? Il n'en a aucun si le total ne le dépasse
 * pas : on demanderait alors « un acompte » égal à la totalité, avec un solde
 * nul annoncé plus tard.
 */
export function acompteApplicable(nbEnfants: number, total: number): boolean {
  return (total || 0) > ACOMPTE_PAR_ENFANT * Math.max(0, nbEnfants || 0);
}

export function totauxPanier(lignes: LignePanier[]): TotauxPanier {
  const cart = lignes || [];
  const total = Math.round(cart.reduce((s, i) => s + (i.prixFinal || 0), 0) * 100) / 100;
  const reductions = Math.round(cart.reduce((s, i) => s + (i.remiseEuros || 0), 0) * 100) / 100;
  const nbEnfantsStage = cart.filter((i) => i.isStage).length;
  const { acompte, solde } = montantsAcompteStage(nbEnfantsStage, total);
  return {
    total,
    reductions,
    // La clause d'annulation à trois semaines ne concerne que les stages :
    // inutile de la faire accepter pour une balade.
    contientUnStage: cart.some((i) => i.isStage === true),
    nbEnfantsStage,
    acompte,
    solde,
  };
}
