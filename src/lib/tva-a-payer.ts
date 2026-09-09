/**
 * src/lib/tva-a-payer.ts
 *
 * La TVA du mois d'un coup d'œil : collectée sur les ventes, déductible sur
 * les achats justifiés, et ce qu'il reste à payer.
 *
 * Deux chiffres existaient déjà, sur deux écrans : la TVA collectée dans
 * Comptabilité → TVA, la TVA déductible justifiée sur la page Dépenses.
 * Personne ne faisait la soustraction. C'est fait ici, une seule fois, pour
 * les deux écrans.
 *
 * C'est une ESTIMATION de préparation : seule la TVA prouvée par une facture
 * est déduite (une dépense « à vérifier » n'en déduit rien tant qu'elle n'a
 * pas sa pièce), et la déclaration reste établie par la comptable. Module
 * pur, sans Firestore ni React.
 */

export interface EntreeTvaAPayer {
  /** TVA collectée sur les ventes du mois (euros). */
  collectee: number;
  /** TVA déductible documentée par une facture associée (euros). */
  deductibleJustifiee: number;
  /** Dépenses dont la TVA reste à vérifier : nombre et TTC. */
  aVerifier?: { nb: number; ttc: number };
}

export interface ResultatTvaAPayer {
  collectee: number;
  deductible: number;
  /** Montant à verser (positif) ; 0 quand la déductible dépasse la collectée. */
  aPayer: number;
  /** Crédit de TVA (déductible > collectée), en positif. 0 sinon. */
  credit: number;
  aVerifierNb: number;
  aVerifierTtc: number;
  /**
   * Ce que les lignes « à vérifier » pourraient encore déduire si elles
   * portaient toutes de la TVA au taux normal : une borne haute, pour situer
   * l'enjeu d'aller chercher les factures manquantes.
   */
  deductiblePotentielle: number;
}

const arrondi = (n: number) => Math.round(n * 100) / 100;
const TAUX_NORMAL = 0.2;

export function calculerTvaAPayer(e: EntreeTvaAPayer): ResultatTvaAPayer {
  const collectee = arrondi(Math.max(0, e.collectee || 0));
  const deductible = arrondi(Math.max(0, e.deductibleJustifiee || 0));
  const solde = arrondi(collectee - deductible);
  const aVerifierNb = e.aVerifier?.nb || 0;
  const aVerifierTtc = arrondi(Math.max(0, e.aVerifier?.ttc || 0));
  return {
    collectee,
    deductible,
    aPayer: solde > 0 ? solde : 0,
    credit: solde < 0 ? -solde : 0,
    aVerifierNb,
    aVerifierTtc,
    deductiblePotentielle: arrondi(aVerifierTtc - aVerifierTtc / (1 + TAUX_NORMAL)),
  };
}

/** Phrase de synthèse, la même partout. */
export function phraseTvaAPayer(r: ResultatTvaAPayer): string {
  const eur = (n: number) => `${n.toFixed(2).replace(".", ",")} €`;
  if (r.credit > 0) return `Crédit de TVA de ${eur(r.credit)} : la TVA déductible (${eur(r.deductible)}) dépasse la TVA collectée (${eur(r.collectee)}).`;
  return `${eur(r.aPayer)} à payer : ${eur(r.collectee)} collectés sur les ventes, moins ${eur(r.deductible)} déductibles sur les achats justifiés.`;
}
