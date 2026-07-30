/**
 * src/lib/cgv-clauses.ts
 *
 * Clauses d'annulation, ecrites UNE SEULE FOIS.
 *
 * Elles etaient auparavant recopiees a trois endroits — page CGV, ecran de
 * reservation, email de confirmation — avec des formulations divergentes.
 * Sur un texte contractuel, cet ecart se retourne contre le club en cas de
 * litige : la famille peut se prevaloir de la version qui l'arrange.
 *
 * Toute modification faite ici s'applique donc partout.
 *
 * ⚠️ Texte a portee contractuelle : ne pas reformuler sans validation.
 */

/** Delai au-dela duquel un stage n'est plus remboursable. */
export const STAGE_DELAI_ANNULATION = "3 semaines";

/** Montant de l'acompte stage, tel qu'annonce aux familles. */
export const STAGE_ACOMPTE_EUROS = 30;

/** Fin de validite des avoirs. */
export const AVOIR_FIN_VALIDITE = "30 juin";

/**
 * Clause stages, version longue (page CGV).
 *
 * Le sort de l'acompte est enonce en deux phrases distinctes, car la
 * redaction precedente — « ... sauf certificat medical. L'acompte est
 * ALORS converti en avoir » — laissait croire que l'avoir valait pour
 * toute annulation tardive. Il n'est du qu'en cas de justificatif.
 */
export const CGV_STAGES_LONG =
  `Annulation jusqu'à ${STAGE_DELAI_ANNULATION} avant le début du stage : remboursement intégral ` +
  `(hors frais bancaires). Passé ce délai, le stage n'est plus remboursable. ` +
  `Sur présentation d'un certificat médical ou en cas de force majeure, l'acompte de ` +
  `${STAGE_ACOMPTE_EUROS} € est converti en avoir, valable sur toute prestation du centre ` +
  `jusqu'à la fin de la saison en cours (${AVOIR_FIN_VALIDITE}). ` +
  `Sans justificatif, l'acompte reste acquis au centre.`;

/** Clause stages, version courte (case a cocher, email). */
export const CGV_STAGES_COURT =
  `Au-delà de ${STAGE_DELAI_ANNULATION} avant le début du stage, l'annulation ne donne pas lieu ` +
  `à remboursement. L'acompte de ${STAGE_ACOMPTE_EUROS} € est converti en avoir uniquement sur ` +
  `présentation d'un certificat médical ou en cas de force majeure ; sans justificatif, ` +
  `il reste acquis au centre.`;

export const CGV_COURS_ANNUELS =
  `Toute séance non effectuée sans prévenir 24h à l'avance est due. ` +
  `En cas de maladie du cavalier (certificat médical), un report peut être accordé.`;

export const CGV_BALADES =
  `Annulation jusqu'à 24h avant : remboursement intégral. ` +
  `En deçà, aucun remboursement sauf certificat médical.`;

export const CGV_ANNULATION_CENTRE =
  `En cas d'annulation par le centre (météo, force majeure) : report proposé ou remboursement intégral.`;
