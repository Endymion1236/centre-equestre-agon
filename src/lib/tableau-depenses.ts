import { nettoyerPiece, proposerAssociations, validerLienDevise, deviseEtrangere, type DepenseCandidate } from "./justificatifs";
export function verifierAssociationTableau(extraction: Record<string, unknown>, depense: DepenseCandidate) {
  if (depense.source !== "releve-bancaire" || !Number.isFinite(depense.montant) || depense.montant <= 0) throw new Error("Un débit bancaire positif est requis.");
  const p = nettoyerPiece(extraction);
  if (p.typeDocument === "paie") {
    if (p.devise !== "EUR" || !p.salarie || !p.moisPaie || p.netAPayer == null || p.netAPayer <= 0 || Math.round(p.netAPayer * 100) !== Math.round(depense.montant * 100)) throw new Error("Le net à payer du bulletin doit correspondre au virement en euros. Vérifiez le salarié et le mois.");
    return { nature: "paie", montantPiece: p.netAPayer, devisePiece: "EUR", montantEUR: depense.montant };
  }
  if (deviseEtrangere(p)) {
    validerLienDevise(p, depense, true);
    return { nature: "devise", montantPiece: p.ttc!, devisePiece: p.devise!, montantEUR: depense.montant };
  }
  if (!proposerAssociations(p, [depense]).length) throw new Error("La devise ou le montant ne correspond pas. Corrigez la pièce ; les paiements groupés ou fractionnés restent à vérifier.");
  return { nature: "facture", montantPiece: p.ttc!, devisePiece: "EUR", montantEUR: depense.montant };
}

export function verifierEcheance(extraction: Record<string, unknown>, montant: number, dejaAssocie: number) {
  const p = nettoyerPiece(extraction);
  if (p.typeDocument !== "achat" || p.devise !== "EUR" || !p.date || !p.fournisseur || !p.ttc || p.ttc <= 0 || !Number.isFinite(montant) || montant <= 0 || !Number.isFinite(dejaAssocie) || dejaAssocie < 0)
    throw new Error("Une facture d’achat en euros et une échéance positive sont requises.");
  if (Math.round(dejaAssocie * 100) + Math.round(montant * 100) > Math.round(p.ttc * 100)) throw new Error("Les paiements associés dépasseraient le total de la facture.");
}
