/** Matching indicatif : aucune décision comptable ni écriture de paiement. */
export interface PieceExtraite {
  devise?: string;
  typeDocument?: "achat" | "vente" | "paie" | "autre" | "inconnu";
  salarie?: string;
  employeur?: string;
  moisPaie?: string;
  brut?: number | null;
  netAPayer?: number | null;
  cotisationsSalariales?: number | null;
  cotisationsPatronales?: number | null;
  prelevementSource?: number | null;
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
export const DEVISES_PIECES = ["EUR", "USD", "GBP", "CHF", "CAD", "AUD"] as const;
export const deviseEtrangere = (p: PieceExtraite) => !!p.devise && p.devise !== "EUR" && (DEVISES_PIECES as readonly string[]).includes(p.devise);
export function nettoyerPiece(v: Record<string, unknown>): PieceExtraite {
  const typeDocument = ["achat", "vente", "paie", "autre"].includes(String(v.typeDocument)) ? v.typeDocument as PieceExtraite["typeDocument"] : "inconnu";
  const paie = typeDocument === "paie";
  return { devise: (DEVISES_PIECES as readonly string[]).includes(texte(v.devise).toUpperCase()) ? texte(v.devise).toUpperCase() : "", typeDocument,
    salarie: paie ? texte(v.salarie) : "", employeur: paie ? texte(v.employeur) : "", moisPaie: paie && /^\d{4}-(0[1-9]|1[0-2])$/.test(texte(v.moisPaie)) ? texte(v.moisPaie) : "",
    brut: paie ? montant(v.brut) : null, netAPayer: paie ? montant(v.netAPayer) : null,
    cotisationsSalariales: paie ? montant(v.cotisationsSalariales) : null, cotisationsPatronales: paie ? montant(v.cotisationsPatronales) : null, prelevementSource: paie ? montant(v.prelevementSource) : null,
    fournisseur: texte(v.fournisseur), numero: texte(v.numero), date: dateValide(v.date),
    debutPeriode: dateValide(v.debutPeriode), finPeriode: dateValide(v.finPeriode),
    ht: paie ? null : montant(v.ht), tva: paie ? null : montant(v.tva), ttc: paie ? null : montant(v.ttc) };
}
export function alertesPiece(p: PieceExtraite): string[] {
  const alerts: string[] = [];
  if (p.typeDocument === "paie") {
    if (!p.salarie || !p.moisPaie || p.netAPayer == null) alerts.push("Salarié, mois ou net à payer à compléter sur le bulletin.");
    if (!p.devise) alerts.push("Devise à vérifier sur le bulletin.");
    return alerts;
  }
  if (p.typeDocument === "autre") return ["Document hors facture ou bulletin : vous pouvez l’exclure."];
  if (!p.devise) alerts.push("Devise à vérifier sur la facture.");
  if (!p.fournisseur || !p.date || p.ttc === null) alerts.push("Fournisseur, date ou TTC à compléter.");
  if (p.ht !== null && p.tva !== null && p.ttc !== null && Math.abs(Math.round(p.ht * 100) + Math.round(p.tva * 100) - Math.round(p.ttc * 100)) > 1) alerts.push("HT + TVA ne correspond pas au TTC.");
  if (p.debutPeriode && p.finPeriode && p.debutPeriode > p.finPeriode) alerts.push("Période inversée.");
  if (p.ttc !== null && p.ttc <= 0) alerts.push("Avoir ou montant nul : traitement manuel nécessaire.");
  return alerts;
}
const normaliser = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
export function proposerAssociations(p: PieceExtraite, depenses: DepenseCandidate[]) {
  if (["paie", "autre", "vente"].includes(p.typeDocument || "") || p.devise !== "EUR" || p.ttc === null || p.ttc <= 0) return [];
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
/** Association manuelle explicite : conserve les montants, aucune conversion comptable. */
export function validerLienDevise(p: PieceExtraite, d: DepenseCandidate, confirme: unknown) {
  if (!deviseEtrangere(p) || ["vente", "paie", "autre"].includes(p.typeDocument || "") || !p.date || !p.fournisseur || p.ttc === null || p.ttc <= 0 || d.source !== "releve-bancaire" || !Number.isFinite(d.montant) || d.montant <= 0 || confirme !== true)
    throw new Error("Vérifiez la devise, les montants et confirmez explicitement le débit en euros.");
  return { deviseFacture: p.devise!, montantFacture: p.ttc, montantDebiteEUR: d.montant };
}
