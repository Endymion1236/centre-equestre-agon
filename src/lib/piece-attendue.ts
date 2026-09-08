/**
 * src/lib/piece-attendue.ts
 *
 * Qui attend vraiment une facture ?
 *
 * Le tableau des opérations affichait « Justificatif manquant » en orange sur
 * toute ligne sans pièce. Or une bonne part de ces lignes n'attend aucune
 * facture et n'en attendra jamais : la banque n'émet pas de facture pour une
 * commission, une échéance de prêt se justifie par le tableau
 * d'amortissement, un salaire par son bulletin, une dépense personnelle par
 * rien du tout. Ces alertes noyaient les vraies : celles où il manque un
 * document qu'il faut aller chercher chez un fournisseur.
 *
 * On distingue donc trois états, du plus urgent au plus neutre :
 *
 *   « facture-a-obtenir »  — un document existe chez un tiers, il manque ici ;
 *   « releve-suffit »      — un clic sur le relevé règle la ligne ;
 *   « rien-a-fournir »     — justifiée ailleurs, personnelle, ou déjà pourvue.
 *
 * Module pur : ni Firebase, ni React. La règle est la même à l'écran, dans le
 * compteur de complétude et dans le colis de la comptable.
 */

import { estDeclareePerdue, estJustifiee, type LigneMois } from "./bilan-justificatifs";
import { CATEGORIE_COMPTE_FFE, CATEGORIE_EMPRUNTS, CATEGORIE_PERSONNELLE, justifiableParReleve } from "./tableau-depenses";
import { posteCommissionCarte } from "./postes-depenses";

export type EtatPiece = "facture-a-obtenir" | "releve-suffit" | "rien-a-fournir";

/**
 * Une ligne dont la pièce se trouve ailleurs qu'auprès d'un fournisseur :
 * relevé bancaire, tableau d'amortissement, relevé du compte FFE.
 */
export function justifiableSansFacture(l: LigneMois): boolean {
  return justifiableParReleve(l.poste, l.fournisseur, posteCommissionCarte)
    || l.poste === CATEGORIE_EMPRUNTS
    || l.poste === CATEGORIE_COMPTE_FFE
    || l.avanceFfe === true;
}

/** Ce que cette ligne réclame encore, une fois tout pris en compte. */
export function etatPiece(l: LigneMois): EtatPiece {
  // Déjà pourvue, écartée, personnelle, ou justifiée par un autre écran
  // (Masse salariale pour les salaires et les cotisations).
  if (estJustifiee(l) || estDeclareePerdue(l) || l.rapprochementExclu) return "rien-a-fournir";
  if (l.depensePersonnelle || l.poste === CATEGORIE_PERSONNELLE) return "rien-a-fournir";
  // Avant la règle des lignes hors charges : une échéance de prêt et un
  // versement au compte FFE en sont, et méritent quand même leur bouton.
  if (justifiableSansFacture(l)) return "releve-suffit";
  // Hors charges et sans pièce à réclamer : un virement interne, un salaire
  // net, un débit encore à classer. Rien à demander tant qu'il n'est pas
  // rangé dans une charge.
  if (l.suivie === false && !l.immobilisation) return "rien-a-fournir";
  return "facture-a-obtenir";
}

/** Libellé court affiché sur la ligne. */
export const LIBELLE_ETAT_PIECE: Record<EtatPiece, string> = {
  "facture-a-obtenir": "Facture à obtenir",
  "releve-suffit": "Le relevé suffit",
  "rien-a-fournir": "Rien à fournir",
};

/**
 * Ce qu'il reste réellement à faire sur un mois : les factures à réclamer, et
 * à côté les lignes qu'un clic sur le relevé suffirait à régler.
 */
export function resteAFaire(lignes: LigneMois[]) {
  const c = (n: number) => Math.round(n * 100) / 100;
  const factures = lignes.filter(l => etatPiece(l) === "facture-a-obtenir");
  const releves = lignes.filter(l => etatPiece(l) === "releve-suffit");
  return {
    factures: factures.length,
    montantFactures: c(factures.reduce((s, l) => s + (l.montant || 0), 0)),
    releves: releves.length,
    montantReleves: c(releves.reduce((s, l) => s + (l.montant || 0), 0)),
  };
}
