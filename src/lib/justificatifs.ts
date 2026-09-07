/** Matching indicatif : aucune décision comptable ni écriture de paiement. */
export interface PieceExtraite {
  fournisseur: string;
  numero: string;
  date: string;
  debutPeriode: string;
  finPeriode: string;
  ht: number | null;
  tva: number | null;
  ttc: number | null;
}
export interface DepenseCandidate {
  id: string;
  fournisseur: string;
  montant: number;
  dateOperation?: string;
  source?: string;
  mois?: string;
  note?: string;
  compte?: string;
}
const texte = (v: unknown) => typeof v === "string" ? v.trim().slice(0, 180) : "";
export function dateValide(v: unknown): string {
  const s = texte(v);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return "";
  const d = new Date(s + "T00:00:00Z");
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === s ? s : "";
}
const montant = (v: unknown) => typeof v === "number" && Number.isFinite(v) && Math.abs(v) < 1e9 ? Math.round(v * 100) / 100 : null;
export function nettoyerPiece(v: Record<string, unknown>): PieceExtraite {
  return { fournisseur: texte(v.fournisseur), numero: texte(v.numero), date: dateValide(v.date),
    debutPeriode: dateValide(v.debutPeriode), finPeriode: dateValide(v.finPeriode),
    ht: montant(v.ht), tva: montant(v.tva), ttc: montant(v.ttc) };
}
export function alertesPiece(p: PieceExtraite): string[] {
  const alerts: string[] = [];
  if (!p.fournisseur || !p.date || p.ttc === null) alerts.push("Fournisseur, date ou TTC à compléter.");
  if (p.ht !== null && p.tva !== null && p.ttc !== null && Math.abs(Math.round(p.ht * 100) + Math.round(p.tva * 100) - Math.round(p.ttc * 100)) > 1) alerts.push("HT + TVA ne correspond pas au TTC.");
  if (p.debutPeriode && p.finPeriode && p.debutPeriode > p.finPeriode) alerts.push("Période inversée.");
  if (p.ttc !== null && p.ttc <= 0) alerts.push("Avoir ou montant nul : traitement manuel nécessaire.");
  return alerts;
}
const normaliser = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
export function proposerAssociations(p: PieceExtraite, depenses: DepenseCandidate[]) {
  if (p.ttc === null || p.ttc <= 0) return [];
  const nom = normaliser(p.fournisseur);
  return depenses.filter(d => d.source === "releve-bancaire" && Math.round(d.montant * 100) === Math.round(p.ttc! * 100)).map(d => {
    const autre = normaliser(d.fournisseur);
    const fournisseur = nom.length >= 4 && autre.length >= 4 && (nom === autre || nom.includes(autre) || autre.includes(nom));
    const date = dateValide(d.dateOperation);
    const jours = p.date && date ? (Date.parse(date) - Date.parse(p.date)) / 86400000 : null;
    const proche = jours !== null && jours >= 0 && jours <= 90;
    return { ...d, score: 40 + (fournisseur ? 40 : 0) + (proche ? 20 : 0),
      raisons: ["TTC identique", ...(fournisseur ? ["Fournisseur concordant"] : []), ...(proche ? ["Paiement dans les 90 jours suivants"] : [])] };
  }).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}
