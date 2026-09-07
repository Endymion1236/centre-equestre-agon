import type { DepenseCandidate } from "./justificatifs";
const nom = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
export function doublonPossible(a: DepenseCandidate, b: DepenseCandidate): boolean {
  return a.id !== b.id && a.source === "releve-bancaire" && b.source === a.source && !!a.mois && a.mois === b.mois
    && Number.isFinite(a.montant) && Number.isFinite(b.montant) && Math.round(a.montant * 100) === Math.round(b.montant * 100)
    && !!nom(a.fournisseur || "") && nom(a.fournisseur || "") === nom(b.fournisseur || "")
    && (!a.compte || !b.compte || a.compte === b.compte)
    && (!a.dateOperation || !b.dateOperation || a.dateOperation === b.dateOperation);
}
export function groupesDoublons(lignes: DepenseCandidate[]) {
  const groupes = new Map<string, DepenseCandidate[]>();
  for (const l of lignes) {
    if (l.source !== "releve-bancaire") continue;
    const cle = JSON.stringify([l.mois, nom(l.fournisseur || ""), Math.round(l.montant * 100)]);
    groupes.set(cle, [...(groupes.get(cle) || []), l]);
  }
  return [...groupes.values()].filter(g => g.some(a => g.some(b => doublonPossible(a, b))));
}
