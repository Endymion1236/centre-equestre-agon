/**
 * src/app/admin/comptabilite/libelles-modes.ts
 *
 * Le nom lisible d'un mode de règlement. Partagé par l'écran comptable et
 * l'onglet des bordereaux de remise, pour qu'un même mode ne s'affiche pas
 * sous deux noms selon l'endroit où on le regarde.
 */
export const modeLabels: Record<string, string> = {
  cb_terminal: "CB Terminal", cb_online: "CB en ligne", cheque: "Chèque", especes: "Espèces",
  cheque_vacances: "Chèques Vacances", pass_sport: "Pass'Sport", ancv: "ANCV",
  virement: "Virement", avoir: "Avoir", prelevement_sepa: "Prélèvement SEPA",
};

/** Le libellé du mode, ou le code brut s'il est inconnu. */
export function libelleMode(mode: string | undefined | null): string {
  if (!mode) return "";
  return modeLabels[mode] || mode;
}
