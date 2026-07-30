/**
 * src/lib/cawl-status.ts
 *
 * Decide si un paiement CAWL/Worldline a REELLEMENT abouti.
 *
 * ⚠️ Incident du 30/07/2026 — la route de retour navigateur considerait
 * un paiement comme reussi des lors que le hosted checkout etait en
 * `PAYMENT_CREATED` :
 *
 *     const isSuccess = paymentStatus === "CAPTURED"
 *       || paymentStatus === "PAID"
 *       || paymentStatus === "PENDING_CAPTURE"
 *       || hcStatus === "PAYMENT_CREATED";   // ← faux
 *
 * Or `PAYMENT_CREATED` decrit la SESSION, pas le resultat : il signifie
 * qu'une tentative de paiement a ete creee. Un refus bancaire en cree une
 * aussi, avec le statut `REJECTED`. Consequence : une carte refusee
 * repartait en facture reglee, email « paiement confirme » a l'appui,
 * place reservee et argent jamais encaisse.
 *
 * Regle desormais unique : SEUL le statut du paiement decide. Le statut du
 * hosted checkout n'est jamais un critere de succes.
 */

/** Statuts Worldline signifiant que l'argent est encaisse ou garanti. */
export const STATUTS_PAYES = ["CAPTURED", "PAID", "CAPTURE_REQUESTED"] as const;

/**
 * Autorise mais pas encore capture. L'argent est reserve sur la carte :
 * on peut confirmer la reservation, la capture suivra.
 */
export const STATUTS_AUTORISES = ["PENDING_CAPTURE"] as const;

/** Statuts explicitement en echec — ne JAMAIS traiter comme un succes. */
export const STATUTS_ECHEC = [
  "REJECTED",
  "REJECTED_CAPTURE",
  "CANCELLED",
  "REFUNDED",
  "CHARGEBACKED",
] as const;

export type DecisionPaiement = "succes" | "echec" | "en_attente";

/**
 * Que faut-il conclure de ce retour CAWL ?
 *
 * @param paymentStatus statut du PAIEMENT (createdPaymentOutput.payment.status)
 *
 * - `succes`      : encaisse ou autorise, on peut valider l'inscription
 * - `echec`       : refuse ou annule, ne rien valider
 * - `en_attente`  : indetermine (statut inconnu, absent, verification en
 *                   cours). On ne valide pas : le webhook tranchera. Mieux
 *                   vaut une inscription en attente qu'une place donnee
 *                   sans encaissement.
 */
export function deciderPaiement(paymentStatus: unknown): DecisionPaiement {
  const statut = String(paymentStatus ?? "").trim().toUpperCase();
  if (!statut) return "en_attente";

  if ((STATUTS_PAYES as readonly string[]).includes(statut)) return "succes";
  if ((STATUTS_AUTORISES as readonly string[]).includes(statut)) return "succes";
  if ((STATUTS_ECHEC as readonly string[]).includes(statut)) return "echec";

  // PENDING_APPROVAL, PENDING_FRAUD_APPROVAL, REDIRECTED, AUTHORIZATION_REQUESTED…
  return "en_attente";
}

/** Raccourci : ce paiement peut-il valider une inscription ? */
export function paiementAbouti(paymentStatus: unknown): boolean {
  return deciderPaiement(paymentStatus) === "succes";
}

/**
 * Le montant encaisse correspond-il au montant attendu ?
 *
 * Un ecart signale une session forgee ou un montant modifie : on refuse
 * plutot que d'encaisser un montant qu'on n'a pas demande. Tolerance d'un
 * centime pour les arrondis.
 */
export function montantCoherent(attenduEuros: number | null, recuEuros: number): boolean {
  if (attenduEuros === null || !Number.isFinite(attenduEuros) || attenduEuros <= 0) return true;
  return Math.abs(attenduEuros - recuEuros) <= 0.01;
}
