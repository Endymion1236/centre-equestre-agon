import { estMouvementDeTresorerie, estRecette } from "@/lib/caisse-mouvements";

export interface ClotureResume {
  recettesDuJour: any[];
  mouvementsTresorerie: any[];
  totalTresorerie: number;
  totauxParMode: Record<string, number>;
  totalGeneral: number;
}

export const MODE_LABELS: Record<string, string> = {
  cb_terminal: "CB terminal",
  cb_online: "CB en ligne",
  cheque: "Chèque",
  cheque_differe: "Chèque différé",
  especes: "Espèces",
  virement: "Virement",
  prelevement_sepa: "Prélèvement SEPA",
  avoir: "Avoir",
  offert: "Offert",
  inconnu: "Inconnu",
};

export function arrondirEuro(valeur: number): number {
  return Math.round(valeur * 100) / 100;
}

export function calculerSyntheseCloture(encaissements: any[]): ClotureResume {
  const recettesDuJour = encaissements.filter(estRecette);
  const mouvementsTresorerie = encaissements.filter(estMouvementDeTresorerie);
  const totalTresorerie = arrondirEuro(
    mouvementsTresorerie.reduce((total, encaissement) => total + Number(encaissement?.montant || 0), 0),
  );

  const totauxParMode: Record<string, number> = {};
  for (const encaissement of recettesDuJour) {
    const mode = encaissement?.mode || "inconnu";
    totauxParMode[mode] = (totauxParMode[mode] || 0) + Number(encaissement?.montant || 0);
  }
  for (const mode of Object.keys(totauxParMode)) {
    totauxParMode[mode] = arrondirEuro(totauxParMode[mode]);
  }

  const totalGeneral = arrondirEuro(
    Object.values(totauxParMode).reduce((total, montant) => total + montant, 0),
  );

  return { recettesDuJour, mouvementsTresorerie, totalTresorerie, totauxParMode, totalGeneral };
}

export function prochainNumeroCloture(historique: Array<{ numero?: number }>): number {
  const precedent = historique.reduce((max, cloture) => Math.max(max, Number(cloture?.numero || 0)), 0);
  return precedent + 1;
}

export function cloturePrecedente<T extends { numero?: number; hash?: string }>(historique: T[]): T | null {
  if (historique.length === 0) return null;
  return historique.reduce((plusRecente, cloture) =>
    Number(cloture?.numero || 0) > Number(plusRecente?.numero || 0) ? cloture : plusRecente,
  );
}

export function cloturePourDate<T extends { date?: string }>(historique: T[], date: string): T | undefined {
  return historique.find((cloture) => cloture.date === date);
}

export function numeroZ(numero: number): string {
  return `Z${String(numero).padStart(4, "0")}`;
}
