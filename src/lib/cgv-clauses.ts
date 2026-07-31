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
 *
 * Redaction : trois cas ENUMERES plutot qu'un paragraphe a exceptions
 * imbriquees. Les versions precedentes disaient « au-dela de 3 semaines
 * avant le stage », qui se lit dans les deux sens (plus tot ? plus tard ?),
 * et n'annoncaient jamais le remboursement integral — une famille n'y
 * lisait que des restrictions.
 */

/** Delai au-dela duquel un stage n'est plus remboursable. */
export const STAGE_DELAI_ANNULATION = "3 semaines";

/** Montant de l'acompte stage, tel qu'annonce aux familles. */
export const STAGE_ACOMPTE_EUROS = 30;

/** Fin de validite des avoirs. */
export const AVOIR_FIN_VALIDITE = "30 juin";

export interface CasAnnulation {
  quand: string;
  consequence: string;
}

/**
 * Les trois situations possibles, dans l'ordre chronologique.
 * On commence par le cas favorable : c'est le plus frequent, et le taire
 * donnait l'impression qu'aucun remboursement n'existait.
 */
export const CGV_STAGES_CAS: CasAnnulation[] = [
  {
    quand: `Plus de ${STAGE_DELAI_ANNULATION} avant le début du stage`,
    consequence:
      `Remboursement intégral, acompte compris (hors frais bancaires).`,
  },
  {
    quand: `Moins de ${STAGE_DELAI_ANNULATION} avant le début du stage`,
    consequence: `Aucun remboursement.`,
  },
  {
    quand: `Moins de ${STAGE_DELAI_ANNULATION} avant, avec certificat médical ou cas de force majeure`,
    consequence:
      `Les sommes versées sont remboursées, à l'exception de l'acompte de ${STAGE_ACOMPTE_EUROS} €, ` +
      `converti en avoir valable sur toute prestation du centre jusqu'au ${AVOIR_FIN_VALIDITE}.`,
  },
];

/** Version phrase (page CGV, email) — reprend les trois cas a la suite. */
export const CGV_STAGES_LONG = CGV_STAGES_CAS
  .map((c) => `${c.quand} : ${c.consequence}`)
  .join(" ");

/** Bloc HTML en liste, plus lisible qu'un paragraphe dans un email. */
export const CGV_STAGES_HTML = `
  <ul style="margin:8px 0 0;padding-left:18px;color:#555;font-size:13px;line-height:1.6;">
    ${CGV_STAGES_CAS.map((c) => `<li><strong>${c.quand}</strong> : ${c.consequence}</li>`).join("")}
  </ul>`;

/**
 * Version courte (case a cocher avant paiement).
 * Enonce d'abord ce a quoi la famille a droit, puis la limite.
 */
export const CGV_STAGES_COURT =
  `remboursement intégral si j'annule plus de ${STAGE_DELAI_ANNULATION} avant le début du stage ; ` +
  `passé ce délai, aucun remboursement, sauf certificat médical ou cas de force majeure — ` +
  `l'acompte de ${STAGE_ACOMPTE_EUROS} € est alors converti en avoir valable jusqu'au ${AVOIR_FIN_VALIDITE}.`;

export const CGV_COURS_ANNUELS =
  `Toute séance non effectuée sans prévenir 24h à l'avance est due. ` +
  `En cas de maladie du cavalier (certificat médical), un report peut être accordé.`;

export const CGV_BALADES =
  `Annulation jusqu'à 24h avant : remboursement intégral. ` +
  `En deçà, aucun remboursement sauf certificat médical.`;

export const CGV_ANNULATION_CENTRE =
  `En cas d'annulation par le centre (météo, force majeure) : report proposé ou remboursement intégral.`;
