/**
 * Quels encaissements passent par un bordereau de remise ?
 *
 * Une remise, c'est ce qu'on porte soi-même : chèques, espèces, chèques
 * vacances papier envoyés à l'ANCV. Les modes ci-dessous n'en ont pas besoin,
 * l'argent arrive seul sur le compte :
 *   - virement, prélèvement SEPA ;
 *   - carte en ligne (CAWL) — « cb » est l'ancien code des bons cadeaux en
 *     ligne, gardé pour les écritures déjà au journal ;
 *   - avoir : aucun argent ne bouge ;
 *   - chèques vacances Connect (octobre 2026) : la famille paie depuis
 *     l'appli ANCV, l'ANCV vire au club. Les mélanger aux chèques vacances
 *     papier les faisait apparaître dans les remises à préparer.
 *
 * Une seule liste pour tout l'onglet Remises : elle était recopiée à quatre
 * endroits, dont trois avaient oublié « cb_cawl » et « cb ».
 */
export const MODE_CHEQUES_VACANCES_CONNECT = "cheque_vacances_connect" as const;

export const MODES_SANS_REMISE: readonly string[] = [
  "virement",
  "prelevement_sepa",
  "cb_online",
  "cb_cawl",
  "cb",
  "avoir",
  MODE_CHEQUES_VACANCES_CONNECT,
];

/** Vrai si un encaissement de ce mode doit figurer sur un bordereau de remise. */
export function passeParRemise(mode: string | null | undefined): boolean {
  return !MODES_SANS_REMISE.includes(String(mode ?? ""));
}
