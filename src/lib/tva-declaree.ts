/**
 * src/lib/tva-declaree.ts — la CA3 déposée par le cabinet, face au calcul de
 * l'application.
 *
 * Novembre 2026, demande de Nicolas : chaque trimestre, il reporte les
 * montants de la déclaration déposée (lignes 08, 09, 9B, 16, 19, 20, 22, 23,
 * TD/28 ou 25) ; l'écran TVA montre l'écart ligne par ligne, et la veille
 * signale un écart important tant qu'il n'est pas noté comme expliqué.
 * Exemple 3e trimestre 2026 : collectée 5 186 €, déductible 475 € + crédit
 * 473 €, 4 238 € à payer.
 *
 * Pur, sans import, testé (tests/unit/tva-declaree.test.ts).
 */

/** Champs saisis, en euros entiers comme sur la déclaration. */
export const CHAMPS_DECLARES = [
  { code: "08", cle: "base20", libelle: "Base HT à 20 %", base: true },
  { code: "9B", cle: "base10", libelle: "Base HT à 10 %", base: true },
  { code: "09", cle: "base55", libelle: "Base HT à 5,5 %", base: true },
  { code: "16", cle: "collectee", libelle: "TVA brute due (collectée)", base: false },
  { code: "19", cle: "immobilisations", libelle: "TVA déductible sur immobilisations", base: false },
  { code: "20", cle: "autresBiensServices", libelle: "TVA déductible sur autres biens et services", base: false },
  { code: "22", cle: "creditAnterieur", libelle: "Crédit reporté de la déclaration précédente", base: false },
  { code: "23", cle: "totalDeductible", libelle: "Total TVA déductible", base: false },
  { code: "TD", cle: "netteDue", libelle: "TVA due (ou 0 si crédit)", base: false },
  { code: "25", cle: "credit", libelle: "Crédit de TVA", base: false },
] as const;

export type CleDeclaree = (typeof CHAMPS_DECLARES)[number]["cle"];
export type MontantsTva = Partial<Record<CleDeclaree, number>>;

/** Écart à partir duquel une ligne est jugée importante (en euros). */
export const SEUIL_ECART_TVA = 20;
export const SEUIL_ECART_BASE = 200;

/** « 2026-T3 » pour un mois de référence « AAAA-MM ». */
export function cleTrimestre(mois: string): string {
  const [a, m] = mois.split("-").map(Number);
  return `${a}-T${Math.ceil(m / 3)}`;
}

/** Saisie de l'écran → montants (vide = non renseigné). */
export function lireSaisie(saisie: Record<string, unknown>): MontantsTva {
  const out: MontantsTva = {};
  for (const c of CHAMPS_DECLARES) {
    const brut = String(saisie?.[c.cle] ?? "").replace(/\s/g, "").replace(",", ".");
    if (brut === "") continue;
    const v = Number(brut);
    if (Number.isFinite(v)) out[c.cle] = Math.round(v * 100) / 100;
  }
  return out;
}

/** Les montants de l'application, dans les mêmes rubriques, depuis le calcul de la CA3. */
export function montantsApplication(r: {
  parTaux: { taux: number; base: number }[];
  collectee: number;
  deductible: { immobilisations: number; autresBiensServices: number; creditAnterieur: number; total: number };
  netteDue: number; credit: number;
}): MontantsTva {
  const base = (t: number) => Math.round((r.parTaux.find((v) => Math.abs(v.taux - t) < 0.001)?.base || 0) * 100) / 100;
  return {
    base20: base(20), base10: base(10), base55: base(5.5),
    collectee: r.collectee,
    immobilisations: r.deductible.immobilisations,
    autresBiensServices: r.deductible.autresBiensServices,
    creditAnterieur: r.deductible.creditAnterieur,
    totalDeductible: r.deductible.total,
    netteDue: r.netteDue,
    credit: r.credit,
  };
}

export interface LigneComparaison {
  code: string; libelle: string;
  cabinet: number; application: number; ecart: number;
  important: boolean;
}

/** Lignes renseignées par le cabinet, avec l'écart application − cabinet. */
export function comparerDeclaration(cabinet: MontantsTva, application: MontantsTva): LigneComparaison[] {
  return CHAMPS_DECLARES.filter((c) => typeof cabinet[c.cle] === "number").map((c) => {
    const cab = cabinet[c.cle]!;
    const app = Math.round((application[c.cle] || 0) * 100) / 100;
    const ecart = Math.round((app - cab) * 100) / 100;
    return { code: c.code, libelle: c.libelle, cabinet: cab, application: app, ecart, important: Math.abs(ecart) >= (c.base ? SEUIL_ECART_BASE : SEUIL_ECART_TVA) };
  });
}

/** Phrase de synthèse pour l'écran. */
export function syntheseComparaison(lignes: LigneComparaison[]): string {
  const imp = lignes.filter((l) => l.important);
  if (!lignes.length) return "Aucun montant du cabinet saisi.";
  if (!imp.length) return "La déclaration du cabinet et le calcul de l'application concordent (écarts inférieurs aux seuils).";
  return `${imp.length} ligne${imp.length > 1 ? "s" : ""} en écart important : ${imp.map((l) => `${l.code} (${l.ecart > 0 ? "+" : ""}${l.ecart.toLocaleString("fr-FR")} €)`).join(", ")}.`;
}

/** Document enregistré (collection `tva-declarations-cabinet`, id = « AAAA-Tn »). */
export interface DeclarationCabinet {
  id: string;
  libelle?: string;
  cabinet: MontantsTva;
  /** Calcul de l'application au moment de la dernière comparaison. */
  application?: MontantsTva;
  base?: "encaissements" | "factures";
  ecartsImportants?: number;
  ecartExplique?: string;
}

/** Veille : déclarations en écart important non expliqué. */
export function declarationsEnEcart(docs: DeclarationCabinet[]): string[] {
  return docs
    .filter((d) => (d.ecartsImportants || 0) > 0 && !String(d.ecartExplique || "").trim() && d.application)
    .sort((a, b) => b.id.localeCompare(a.id))
    .map((d) => `${d.libelle || d.id} — ${syntheseComparaison(comparerDeclaration(d.cabinet, d.application!))}`);
}
