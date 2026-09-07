import { dateValide } from "./justificatifs";
export interface LigneDate { id?: string; mois: string; fournisseur: string; montant: number; dateOperation?: string; date?: string; }
const nom = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const cle = (l: LigneDate) => JSON.stringify([l.mois, nom(l.fournisseur), Math.round(l.montant * 100)]);
/** Complète seulement un couple unique. Ni création, ni réaffectation arbitraire de doublons. */
export function completerDates(existantes: LigneDate[], releve: LigneDate[]) {
  const modifications: { id: string; dateOperation: string }[] = [];
  let ambigues = 0, absentes = 0, dejaDatees = 0, invalides = 0;
  for (const l of releve) {
    const date = dateValide(l.date);
    if (!date || date.slice(0, 7) !== l.mois || !nom(l.fournisseur) || !Number.isFinite(l.montant)) { invalides++; continue; }
    const candidates = existantes.filter(e => cle(e) === cle(l));
    if (!candidates.length) { absentes++; continue; }
    if (candidates.length !== 1 || releve.filter(r => cle(r) === cle(l)).length !== 1) { ambigues++; continue; }
    const e = candidates[0];
    if (e.dateOperation) { dejaDatees++; continue; }
    if (!e.id) { invalides++; continue; }
    modifications.push({ id: e.id, dateOperation: date });
  }
  return { modifications, ambigues, absentes, dejaDatees, invalides };
}
