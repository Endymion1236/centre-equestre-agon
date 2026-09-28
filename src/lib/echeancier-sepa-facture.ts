/**
 * Ce qu'une facture (ou une proforma) dit d'une commande réglée par
 * prélèvement SEPA.
 *
 * Une maman dont le forfait est en prélèvement demande une facture : le
 * document sortait « En attente de règlement », avec l'IBAN du club et un QR
 * de virement pour le montant entier — une invitation à payer une seconde
 * fois ce qui sera prélevé (septembre 2026). Le document annonce désormais
 * l'échéancier, et ne propose un virement que pour la part qu'il ne couvre pas.
 *
 * Module pur, partagé avec les tests.
 */

export interface EcheanceSepaFacture {
  dateEcheance?: string;
  montant?: number;
  status?: string;
}

export interface EcheancierFacture {
  /** Prélèvements encore à venir, triés par date. */
  lignes: string[];
  montantPrevu: number;
  /** Ce qui reste dû hors prélèvements : 0 quand l'échéancier couvre tout. */
  resteHorsPrelevement: number;
}

const A_VENIR = new Set(["pending", "remis"]);

const dateFr = (iso: string) => {
  const [a, m, j] = iso.split("-");
  return a && m && j ? `${j}/${m}/${a}` : iso;
};

/**
 * `null` quand aucun prélèvement n'est à venir : le document garde alors son
 * rendu ordinaire (virement, QR).
 */
export function echeancierSepaFacture(echeances: EcheanceSepaFacture[], resteDu: number): EcheancierFacture | null {
  const aVenir = echeances
    .filter(e => A_VENIR.has(String(e.status || "")) && (Number(e.montant) || 0) > 0)
    .sort((a, b) => String(a.dateEcheance || "").localeCompare(String(b.dateEcheance || "")));
  if (aVenir.length === 0) return null;
  const montantPrevu = Math.round(aVenir.reduce((s, e) => s + (Number(e.montant) || 0), 0) * 100) / 100;
  return {
    lignes: aVenir.map(e => `${e.dateEcheance ? dateFr(e.dateEcheance) : "date à fixer"} : ${(Number(e.montant) || 0).toFixed(2)} €`),
    montantPrevu,
    resteHorsPrelevement: Math.max(0, Math.round((resteDu - montantPrevu) * 100) / 100),
  };
}
