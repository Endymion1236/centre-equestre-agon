/**
 * src/lib/ancv-rapprochement.ts — pointer un virement de l'ANCV.
 *
 * Octobre 2026 : « Virement en votre faveur DRFIP … -ANCV-DC2699G6EL-1 »,
 * 448,50 €, restait « À traiter ». Le paiement d'origine : 460 € en
 * chèques-vacances Connect le 03/10. L'ANCV rembourse NET de sa commission
 * (2,5 % sur Connect : 460 − 11,50 = 448,50 ; un peu moins sur le papier) : le
 * montant ne tombait jamais juste, et la fenêtre de pointage ne proposait ni
 * les encaissements chèques-vacances ni les bordereaux envoyés à l'ANCV.
 *
 * Module pur, testé seul (tests/unit/ancv-rapprochement.test.ts).
 */

/** Modes d'encaissement remboursés par l'ANCV. */
export const MODES_ANCV: readonly string[] = ["cheque_vacances_connect", "cheque_vacances", "ancv"];

/** Commission la plus forte admise entre le brut encaissé et le net viré. */
export const COMMISSION_ANCV_MAX = 0.05;

/** Le libellé bancaire d'un remboursement ANCV (viré par la DRFIP). */
export function estLigneAncv(libelle: unknown): boolean {
  return /\bANCV\b/i.test(String(libelle ?? ""));
}

export function estModeAncv(mode: unknown): boolean {
  return MODES_ANCV.includes(String(mode ?? ""));
}

export interface EcartAncv {
  /** Brut − net, en euros (0 si exact). */
  commission: number;
  /** Commission en % du brut, arrondie au dixième. */
  taux: number;
  /** Vrai si l'écart s'explique par la commission ANCV (0 à 5 % du brut). */
  plausible: boolean;
}

/** Écart entre le brut coché (encaissements) et le net reçu en banque. */
export function ecartAncv(brut: number, net: number): EcartAncv {
  const b = Math.round((brut || 0) * 100), n = Math.round((net || 0) * 100);
  const commission = (b - n) / 100;
  const taux = b > 0 ? Math.round((b - n) / b * 1000) / 10 : 0;
  return { commission, taux, plausible: b > 0 && n > 0 && n <= b && (b - n) <= Math.round(b * COMMISSION_ANCV_MAX) };
}

/** Texte de la ligne pointée : « ANCV — 460,00 € − commission 11,50 € (2,5 %) = 448,50 € ». */
export function libelleEcartAncv(brut: number, net: number): string {
  const e = ecartAncv(brut, net);
  const f = (x: number) => x.toFixed(2).replace(".", ",") + " €";
  return e.commission > 0
    ? `${f(brut)} − commission ANCV ${f(e.commission)} (${String(e.taux).replace(".", ",")} %) = ${f(net)}`
    : `${f(net)}`;
}
