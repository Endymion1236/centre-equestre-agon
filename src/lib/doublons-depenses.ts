import type { DepenseCandidate } from "./justificatifs";
import { dateValide } from "./justificatifs";
const nom = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
// « Carte », « Prlv », « Vir »… décrivent le moyen de paiement, pas le
// fournisseur : la même échéance Groupama arrive une fois « Groupama Centre
// Manche » et une fois « Prlv Groupama Centre Manche » selon la lecture. On
// retire ces préfixes, autant de fois qu'ils se répètent, sans rapprochement
// approximatif sur le reste.
const PREFIXES = /^(?:(?:prlv|prelevement|prelvt|vir|virement|sepa|cb|carte|paiement|fact|facture|echeance|ech|chq|cheque)\s+)+/;
export const fournisseurNormalise = (s: string) => nom(s).replace(PREFIXES, "");
const fournisseur = fournisseurNormalise;
export function doublonPossible(a: DepenseCandidate, b: DepenseCandidate): boolean {
  return a.id !== b.id && a.source === "releve-bancaire" && b.source === a.source && !!a.mois && a.mois === b.mois
    && Number.isFinite(a.montant) && Number.isFinite(b.montant) && Math.round(a.montant * 100) === Math.round(b.montant * 100)
    && !!fournisseur(a.fournisseur || "") && fournisseur(a.fournisseur || "") === fournisseur(b.fournisseur || "")
    && (!a.compte || !b.compte || a.compte === b.compte)
    && (!a.dateOperation || !b.dateOperation || a.dateOperation === b.dateOperation);
}

export type PropositionDoublon = { conserver: DepenseCandidate; ecarter: DepenseCandidate };
const releve = (s: string) => nom(s.replace(/\s*\(\d+\)(?=\.pdf\s*$)/i, ""));
/** Un couple unique de deux copies nommées du même relevé ; aucune décision sur les groupes répétés. */
export function preparerLotDoublons(lignes: DepenseCandidate[], lies: Set<string>) {
  const propositions: PropositionDoublon[] = [];
  const groupes = groupesDoublons(lignes);
  for (const g of groupes) {
    if (g.length !== 2 || !doublonPossible(g[0], g[1])) continue;
    const [a, b] = g;
    if (!a.note || !b.note || a.note === b.note || !/\.pdf\s*$/i.test(a.note) || !/\.pdf\s*$/i.test(b.note) || releve(a.note) !== releve(b.note)) continue;
    // Garder la ligne datée, sans perdre un compte connu ni une association.
    const candidats = g.filter(x => dateValide(x.dateOperation));
    if (candidats.length !== 1) continue;
    const conserver = candidats[0], ecarter = conserver.id === a.id ? b : a;
    if (lies.has(ecarter.id) || (ecarter.compte && !conserver.compte)) continue;
    propositions.push({ conserver, ecarter });
  }
  propositions.sort((a, b) => a.ecarter.id.localeCompare(b.ecarter.id));
  return { propositions, groupesManuels: groupes.length - propositions.length };
}
export function groupesDoublons(lignes: DepenseCandidate[]) {
  const groupes = new Map<string, DepenseCandidate[]>();
  for (const l of lignes) {
    if (l.source !== "releve-bancaire") continue;
    const cle = JSON.stringify([l.mois, fournisseur(l.fournisseur || ""), Math.round(l.montant * 100)]);
    groupes.set(cle, [...(groupes.get(cle) || []), l]);
  }
  return [...groupes.values()].filter(g => g.some(a => g.some(b => doublonPossible(a, b))));
}
