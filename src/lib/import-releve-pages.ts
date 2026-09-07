export interface OperationPage { date: string; mois: string; libelle: string; montant: number; poste: string; }
export interface ResultatPage { operations: OperationPage[]; creditsClients: number | null; lectureIncomplete?: boolean; ecartees?: OperationPage[]; }

/**
 * Virement reçu d'une plateforme d'encaissement (Stripe, CAWL/Worldline, SumUp,
 * HelloAsso) : de l'argent qui ARRIVE, net des commissions. Jamais un débit,
 * donc jamais une dépense — et les commissions, retenues à la source, ne
 * figurent pas sur le relevé bancaire. La lecture IA les prenait parfois pour
 * des sorties : on les écarte des débits et on le dit à l'écran.
 * Un libellé qui parle explicitement de commission, frais ou prélèvement reste
 * un débit possible.
 */
export function estVirementPlateforme(libelle: unknown): boolean {
  const t = String(libelle ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (/\b(commission|commissions|com|frais|prlv|prelevement|prelvt|cotis)\b/.test(t)) return false;
  return /\b(stripe|stp|cawl|worldline|sumup|helloasso)\b/.test(t);
}
export function separerVirementsPlateforme<T extends { libelle: string }>(operations: T[]): { operations: T[]; ecartees: T[] } {
  const ecartees = operations.filter(o => estVirementPlateforme(o.libelle));
  return { operations: operations.filter(o => !estVirementPlateforme(o.libelle)), ecartees };
}
export interface PageLue { index: number; resultat: ResultatPage; }
/** Remplace une page lors d'une relance : ne concatène jamais deux lectures de la même page. */
export function remplacerPage(pages: PageLue[], index: number, resultat: ResultatPage): PageLue[] {
  return [...pages.filter(p => p.index !== index), { index, resultat }].sort((a,b) => a.index - b.index);
}
export function regrouperPages(pages: PageLue[], nombrePages: number, empreinte: string) {
  const completes = pages.filter(p => !p.resultat.lectureIncomplete);
  const manquantes = Array.from({ length: nombrePages }, (_, i) => i).filter(i => !completes.some(p => p.index === i));
  const operations = completes.flatMap(p => p.resultat.operations.map((o, rang) => ({ ...o, pageReleve: p.index + 1, sourceOperation: `${empreinte}:${p.index}:${rang}` })));
  const creditsClients = manquantes.length || completes.some(p => p.resultat.creditsClients === null)
    ? null : Math.round(completes.reduce((s,p) => s + p.resultat.creditsClients!, 0) * 100) / 100;
  const ecartees = completes.flatMap(p => (p.resultat.ecartees || []).map(o => ({ ...o, pageReleve: p.index + 1 })));
  return { operations, manquantes, creditsClients, ecartees };
}
