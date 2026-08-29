/**
 * src/lib/cawl-confirmation.ts
 *
 * Ce qu'un encaissement CAWL doit produire sur le document `payments`.
 *
 * ⚠️ Pourquoi ce module existe — audit du 29/08/2026.
 *
 * Deux chemins confirment un paiement carte : le retour navigateur
 * (`/api/cawl/status`) et la notification serveur (`/api/cawl/webhook`). Ils
 * s'étaient mis à diverger sur trois points, et la divergence était invisible
 * parce qu'elle ne se manifeste que si la famille ferme son onglet avant la
 * redirection :
 *
 *   1. Montant attendu — `status` le prenait du montant DEMANDÉ à la création
 *      de la session (`cawl_sessions.totalCents`), ce qui gère nativement les
 *      liens de paiement PARTIELS (un acompte de 30 € sur une commande de
 *      175 €). `webhook` le prenait de `payments.totalTTC` : il voyait 30 €
 *      encaissés contre 175 € attendus, concluait à une incohérence, et
 *      refusait la confirmation en marquant `needsReview`.
 *
 *   2. Cumul — `status` ADDITIONNE (acompte puis solde, ou liens partiels
 *      successifs). `webhook` ÉCRASAIT `paidAmount` avec le total dû.
 *
 *   3. Facture — `status` attribuait un numéro séquentiel quand la vente était
 *      soldée. `webhook` ne le faisait jamais : une vente payée par une
 *      famille ayant fermé son navigateur restait une proforma `PF-…`.
 *
 * La décision est désormais calculée ICI, par une fonction pure, et les deux
 * routes l'appliquent. Le pendant de `deciderPaiement()` : une seule
 * définition, pour que les deux chemins ne PUISSENT plus diverger.
 */

/** Tolérance d'arrondi, en euros (deux centimes). */
export const EPSILON_MONTANT = 0.02;

export interface EntreeConfirmation {
  /** Montant réellement encaissé sur CE passage, en euros (0 si CAWL ne l'a pas renvoyé). */
  montantEncaisseEuros: number;
  /** Montant demandé à la création de la session CAWL, en euros. null si la session est introuvable. */
  montantSessionEuros: number | null;
  /** `payments.totalTTC` — le total dû de la vente. */
  totalTTC: number;
  /** `payments.paidAmount` déjà enregistré avant ce passage. */
  dejaPaye: number;
  /** Acompte ou paiement total ? Vient du marqueur `isDeposit` de `cawl_sessions`. */
  estAcompte: boolean;
  /** `payments.acompteAmount`, si connu. */
  acompteAttendu?: number | null;
  /** Pourcentage d'acompte stocké à la session, utilisé en dernier recours. */
  depositPercent?: number;
  /** Un numéro de facture est-il déjà attribué à ce paiement ? */
  aDejaUneFacture: boolean;
}

export interface DecisionConfirmation {
  /** false → ne rien confirmer, marquer le paiement `needsReview`. */
  accepte: boolean;
  /** Montant attendu retenu comme référentiel (euros). */
  montantAttendu: number;
  /** Montant à créditer sur ce passage (euros). */
  montantCredite: number;
  /** Nouveau cumul encaissé (euros). */
  nouveauCumul: number;
  /** Statut à écrire sur le document `payments`. */
  statut: "paid" | "partial";
  /** Faut-il attribuer un numéro de facture séquentiel ? */
  attribuerFacture: boolean;
}

/**
 * Montant attendu pour ce passage.
 *
 * Priorité au montant demandé à la session : c'est le seul qui décrive ce que
 * la famille était censée payer MAINTENANT. Les replis servent aux sessions
 * anciennes ou introuvables.
 */
export function montantAttendu(e: EntreeConfirmation): number {
  if (typeof e.montantSessionEuros === "number" && e.montantSessionEuros > 0) {
    return e.montantSessionEuros;
  }
  if (e.estAcompte) {
    if (typeof e.acompteAttendu === "number" && e.acompteAttendu > 0) return e.acompteAttendu;
    const pct = e.depositPercent || 0;
    if (pct > 0) return Math.round((e.totalTTC * pct) / 100 * 100) / 100;
  }
  return e.totalTTC;
}

/**
 * Que faut-il écrire sur le paiement à l'issue de cet encaissement ?
 *
 * Fonction PURE — aucun accès Firestore, aucune écriture. Les routes
 * appliquent le résultat.
 */
export function deciderConfirmation(e: EntreeConfirmation): DecisionConfirmation {
  const attendu = montantAttendu(e);

  // Montant réellement crédité : ce que CAWL annonce, sinon ce qui était
  // demandé, sinon le total dû (comportement historique).
  const credite = e.montantEncaisseEuros > 0
    ? e.montantEncaisseEuros
    : (typeof e.montantSessionEuros === "number" && e.montantSessionEuros > 0
        ? e.montantSessionEuros
        : attendu);

  // Sous-paiement : on ne confirme rien. Seul un montant annoncé par CAWL
  // (> 0) peut déclencher ce refus — un montant absent n'est pas une preuve
  // de sous-paiement.
  if (
    e.montantEncaisseEuros > 0 &&
    attendu > 0 &&
    e.montantEncaisseEuros < attendu - EPSILON_MONTANT
  ) {
    return {
      accepte: false,
      montantAttendu: attendu,
      montantCredite: credite,
      nouveauCumul: e.dejaPaye,
      statut: "partial",
      attribuerFacture: false,
    };
  }

  const nouveauCumul = Math.round(((e.dejaPaye || 0) + credite) * 100) / 100;
  const solde = e.totalTTC > 0 && nouveauCumul >= e.totalTTC - EPSILON_MONTANT;

  return {
    accepte: true,
    montantAttendu: attendu,
    montantCredite: credite,
    nouveauCumul,
    statut: solde ? "paid" : "partial",
    // Une vente intégralement réglée doit avoir sa FACTURE : numérotation
    // séquentielle continue (CGI art. 242 nonies A). Sans ça, les paiements
    // soldés en ligne restaient des proformas PF-….
    attribuerFacture: solde && !e.aDejaUneFacture,
  };
}
