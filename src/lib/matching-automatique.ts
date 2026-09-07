import { alertesPiece, dateValide, proposerAssociations, type PieceExtraite, type DepenseCandidate } from "./justificatifs";

export type PieceMatching = { id: string; extraction?: PieceExtraite | null; retire?: boolean; depenseId?: string | null; autoBloque?: boolean };
const normaliser = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
export function candidatsAutomatiques(p: PieceExtraite, depenses: DepenseCandidate[]) {
  if (p.devise !== "EUR" || p.typeDocument !== "achat" || !p.numero || p.ht === null || p.tva === null || alertesPiece(p).length) return [];
  const nom = normaliser(p.fournisseur);
  if (nom.length < 4) return [];
  return proposerAssociations(p, depenses).filter(d => {
    if (d.ecart) return false; // un escompte se confirme à la main, jamais tout seul
    const date = dateValide(d.dateOperation);
    const jours = date ? (Date.parse(date) - Date.parse(p.date)) / 86400000 : -1;
    return normaliser(d.fournisseur) === nom && jours >= 0 && jours <= 7;
  });
}
/** Pas de gagnant arbitraire : unicité dans les deux sens, doublons et décisions humaines prioritaires. */
export function planifierMatching(pieces: PieceMatching[], depenses: DepenseCandidate[], depensesLiees: Set<string>) {
  const actives = pieces.filter(p => !p.retire);
  if (actives.some(p => !p.extraction)) return { associations: [] as { pieceId: string; depenseId: string }[], analyseIncomplete: true };
  const associations: { pieceId: string; depenseId: string }[] = [];
  for (const p of actives) {
    if (p.depenseId || p.autoBloque || !p.extraction) continue;
    const e = p.extraction;
    const doublon = actives.some(q => q.id !== p.id && q.extraction && normaliser(q.extraction.fournisseur) === normaliser(e.fournisseur)
      && normaliser(q.extraction.numero) === normaliser(e.numero));
    if (doublon) continue;
    // Conserver aussi les dépenses déjà liées pour ne pas masquer une ambiguïté.
    const candidats = candidatsAutomatiques(e, depenses);
    if (candidats.length !== 1 || depensesLiees.has(candidats[0].id)) continue;
    const d = candidats[0];
    // Un ancien import sans date peut être le même paiement : ne pas le masquer.
    if (depenses.some(autre => autre.id !== d.id && !dateValide(autre.dateOperation)
      && (!autre.mois || autre.mois === d.mois || autre.mois === d.dateOperation?.slice(0, 7))
      && proposerAssociations(e, [autre]).some(c => c.raisons.includes("Fournisseur concordant")))) continue;
    // Toute autre pièce non liée compatible par fournisseur/montant, même à date inconnue,
    // empêche une validation automatique. Elle reste proposée au contrôle humain.
    const concurrente = actives.some(q => q.id !== p.id && !q.depenseId && q.extraction &&
      proposerAssociations(q.extraction, [d]).some(c => c.raisons.includes("Fournisseur concordant")));
    if (!concurrente) associations.push({ pieceId: p.id, depenseId: d.id });
  }
  return { associations, analyseIncomplete: false };
}
