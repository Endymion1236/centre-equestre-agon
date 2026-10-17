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

/**
 * Rubriques du filtre « Encaissements à remettre ».
 *
 * Octobre 2026 : 13 encaissements à remettre, mais les boutons CB, Chèques
 * et Espèces n'en montraient que 9 ; les chèques-vacances papier (à envoyer
 * à l'ANCV) n'avaient pas de bouton et ne se voyaient que sous « Tous ».
 * Tout mode sans rubrique tombe dans « Autres » : rien ne reste invisible.
 */
export const RUBRIQUES_REMISE: readonly { id: string; label: string; modes: readonly string[] }[] = [
  { id: "cb_terminal", label: "CB", modes: ["cb_terminal"] },
  { id: "cheque", label: "Chèques", modes: ["cheque"] },
  { id: "cheque_vacances", label: "Chèques vacances", modes: ["cheque_vacances", "ancv"] },
  { id: "especes", label: "Espèces", modes: ["especes"] },
];
export const RUBRIQUE_AUTRES = "autres";

/** Rubrique d'un mode d'encaissement (« autres » si aucune). */
export function rubriqueRemise(mode: string | null | undefined): string {
  const m = String(mode ?? "");
  return RUBRIQUES_REMISE.find((r) => r.modes.includes(m))?.id ?? RUBRIQUE_AUTRES;
}
