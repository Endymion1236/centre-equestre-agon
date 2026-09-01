export const BILLETS = [500, 200, 100, 50, 20, 10, 5] as const;
export const PIECES = [2, 1, 0.5, 0.2, 0.1, 0.05, 0.02, 0.01] as const;

export function arrondirCaisse(valeur: number): number {
  return Math.round(valeur * 100) / 100;
}

export function initialiserComptage(denominations: readonly number[]): Record<number, number> {
  return Object.fromEntries(denominations.map((valeur) => [valeur, 0])) as Record<number, number>;
}

export function totalDenominations(
  denominations: readonly number[],
  quantites: Record<number, number>,
): number {
  return arrondirCaisse(
    denominations.reduce((total, valeur) => total + valeur * Number(quantites[valeur] || 0), 0),
  );
}

export function calculerSoldeTheorique(encaissementsEspeces: any[]): number {
  return arrondirCaisse(
    encaissementsEspeces.reduce((total, encaissement) => total + Number(encaissement?.montant || 0), 0),
  );
}

export function calculerComptage(
  billets: Record<number, number>,
  pieces: Record<number, number>,
  soldeTheorique: number | null,
) {
  const totalBillets = totalDenominations(BILLETS, billets);
  const totalPieces = totalDenominations(PIECES, pieces);
  const totalCompte = arrondirCaisse(totalBillets + totalPieces);
  const ecart = soldeTheorique === null ? 0 : arrondirCaisse(totalCompte - soldeTheorique);
  const hasEcart = Math.abs(ecart) >= 0.01;
  return { totalBillets, totalPieces, totalCompte, ecart, hasEcart };
}

export function motifEcartRequis(ecart: number, motif: string): boolean {
  return Math.abs(ecart) >= 0.01 && !motif.trim();
}
