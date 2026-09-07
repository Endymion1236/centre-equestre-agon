import type { BalanceCompte, DossierComptable } from "./documents-comptables";

export type TotalComptable = { debit: number; credit: number; solde: number };
/** Les sous-totaux portent sur les comptes, jamais sur d'autres sous-totaux. */
export function totalComptes(comptes: readonly BalanceCompte[]): TotalComptable {
  return comptes.reduce((t, c) => ({ debit: t.debit + c.debit, credit: t.credit + c.credit, solde: t.solde + c.solde }), { debit: 0, credit: 0, solde: 0 });
}
export function groupesBalance(comptes: readonly BalanceCompte[]) {
  const classes = new Map<string, Map<string, BalanceCompte[]>>();
  for (const c of [...comptes].sort((a, b) => a.compte.localeCompare(b.compte))) {
    const classe = c.compte.slice(0, 1), prefixe = c.compte.slice(0, 2);
    let groupes = classes.get(classe); if (!groupes) { groupes = new Map(); classes.set(classe, groupes); }
    const liste = groupes.get(prefixe); if (liste) liste.push(c); else groupes.set(prefixe, [c]);
  }
  return [...classes].map(([classe, groupes]) => ({ classe,
    groupes: [...groupes].map(([prefixe, comptes]) => ({ prefixe, comptes, total: totalComptes(comptes) })),
    total: totalComptes([...groupes.values()].flat()),
  }));
}
export function groupesMensuels(centralisateur: DossierComptable["centralisateur"]) {
  const mois = new Map<string, DossierComptable["centralisateur"]>();
  for (const ligne of [...centralisateur].sort((a, b) => a.mois.localeCompare(b.mois) || a.journal.localeCompare(b.journal))) {
    const liste = mois.get(ligne.mois); if (liste) liste.push(ligne); else mois.set(ligne.mois, [ligne]);
  }
  return [...mois].map(([mois, journaux]) => ({ mois, journaux, total: journaux.reduce((t, j) => ({ lignes: t.lignes + j.lignes, debit: t.debit + j.debit, credit: t.credit + j.credit }), { lignes: 0, debit: 0, credit: 0 }) }));
}
