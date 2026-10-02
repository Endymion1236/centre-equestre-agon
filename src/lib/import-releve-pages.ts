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
/**
 * Crédit du relevé lu à tort comme un débit. Octobre 2026 : le relevé de
 * septembre, rapproché après les CSV quotidiens, proposait comme dépenses
 * « Remise Carte 8067954 » (117 €), « Rem Chq 2123509 » (70 €) ou « A.p.
 * Emis Prel Ech Du » (300 €, avis de prélèvements SEPA émis par le club) :
 * de l'argent qui entre. Remises de cartes et de chèques, prélèvements émis,
 * virements reçus, versements d'espèces : jamais un débit. Une commission ou
 * des frais sur ces opérations (« Com Carte », « Frais remise chèque ») en
 * restent un.
 */
export function estCreditReleve(libelle: unknown): boolean {
  const t = String(libelle ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (/\b(commission|commissions|com|frais|cotis|cotisation|impaye|rejet)\b/.test(t)) return false;
  if (estVirementPlateforme(t)) return true;
  return /\b(remise|rem)\b.*\b(carte|cartes|cb|chq|cheque|cheques|tpe)\b/.test(t)
    || /\bemis\s+prel/.test(t) || /\bavis de prelevements?\s+emis\b/.test(t) || /\bremise\s+(sepa|prlv|prelevement)/.test(t)
    || /\ben votre faveur\b/.test(t) || /\bvir(ement)?\s+((sepa|inst)\s+)?recu\b/.test(t)
    || /\bversement\s+(d\s+)?especes\b/.test(t);
}

export function separerVirementsPlateforme<T extends { libelle: string }>(operations: T[]): { operations: T[]; ecartees: T[] } {
  const ecartees = operations.filter(o => estCreditReleve(o.libelle));
  return { operations: operations.filter(o => !estCreditReleve(o.libelle)), ecartees };
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
