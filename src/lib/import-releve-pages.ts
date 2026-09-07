export interface OperationPage { date: string; mois: string; libelle: string; montant: number; poste: string; }
export interface ResultatPage { operations: OperationPage[]; creditsClients: number | null; lectureIncomplete?: boolean; }
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
  return { operations, manquantes, creditsClients };
}
