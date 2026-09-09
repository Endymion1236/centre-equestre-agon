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

/**
 * Déclaration TRIMESTRIELLE, trimestres civils : janvier–mars, avril–juin,
 * juillet–septembre, octobre–décembre. Un mois désigne son trimestre.
 */
export interface Trimestre {
  /** « T3 2026 » */
  libelle: string;
  /** « juillet à septembre 2026 » */
  periode: string;
  /** Les trois mois, AAAA-MM. */
  mois: string[];
}

const NOMS_MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

export function trimestreDe(mois: string): Trimestre {
  const annee = Number(mois.slice(0, 4));
  const m = Number(mois.slice(5, 7));
  const t = Math.floor((m - 1) / 3);
  const premier = t * 3 + 1;
  const trois = [0, 1, 2].map((i) => `${annee}-${String(premier + i).padStart(2, "0")}`);
  return {
    libelle: `T${t + 1} ${annee}`,
    periode: `${NOMS_MOIS[premier - 1]} à ${NOMS_MOIS[premier + 1]} ${annee}`,
    mois: trois,
  };
}

export interface ResultatTvaTrimestre extends ResultatTvaAPayer {
  trimestre: Trimestre;
  /** Détail par mois ; `null` quand les chiffres du mois ne sont pas encore lus. */
  parMois: { mois: string; resultat: ResultatTvaAPayer | null }[];
  /** Mois du trimestre sans chiffres : le total est partiel. */
  moisManquants: string[];
}

/** Somme des mois disponibles du trimestre ; dit lesquels manquent. */
export function calculerTvaTrimestre(moisReference: string, parMois: Record<string, EntreeTvaAPayer | null | undefined>): ResultatTvaTrimestre {
  const trimestre = trimestreDe(moisReference);
  const detail = trimestre.mois.map((m) => ({ mois: m, resultat: parMois[m] ? calculerTvaAPayer(parMois[m]!) : null }));
  const presents = detail.filter((d) => d.resultat).map((d) => d.resultat!);
  const total = calculerTvaAPayer({
    collectee: presents.reduce((s, r) => s + r.collectee, 0),
    deductibleJustifiee: presents.reduce((s, r) => s + r.deductible, 0),
    aVerifier: { nb: presents.reduce((s, r) => s + r.aVerifierNb, 0), ttc: presents.reduce((s, r) => s + r.aVerifierTtc, 0) },
  });
  return { ...total, trimestre, parMois: detail, moisManquants: detail.filter((d) => !d.resultat).map((d) => d.mois) };
}
