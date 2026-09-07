/**
 * src/lib/bilan-justificatifs.ts
 *
 * Trois lectures d'un mois du tableau des opérations, sans Firestore ni écran :
 *   - la complétude des justificatifs, en nombre ET en euros ;
 *   - la TVA du mois : ce qui est déductible parce qu'une pièce le prouve,
 *     ce qui reste à vérifier, ce qui est sans TVA ;
 *   - les exports CSV correspondants pour la comptable.
 *
 * Périmètre : les dépenses suivies (pas les simples mouvements bancaires),
 * hors lignes exclues du rapprochement et hors dépenses personnelles. Une
 * immobilisation reste dans le périmètre des justificatifs et de la TVA
 * (sa TVA se récupère aussi), mais pas dans les charges.
 */

export interface ExtractionMin {
  typeDocument?: string | null; devise?: string | null; numero?: string | null; date?: string | null;
  ht?: number | null; tva?: number | null; ttc?: number | null;
}
export interface LigneMois {
  id: string;
  dateOperation?: string; mois?: string; fournisseur?: string; poste?: string; montant: number; source?: string; compte?: string;
  suivie?: boolean; rapprochementExclu?: boolean; depensePersonnelle?: boolean; immobilisation?: boolean;
  statutTVA?: string; justificatifReleve?: boolean; referenceJustificatifReleve?: string | null;
  /** Justifiée par un autre écran (Masse salariale) : { type, detail }. */
  justifieeVia?: { type: string; detail: string } | null;
  piece?: { id?: string; nom?: string; extraction?: ExtractionMin | null; associationDevise?: { deviseFacture: string; montantFacture: number; montantDebiteEUR: number } | null; associationEcart?: { type: string; taux: number; montant: number } | null } | null;
}

const c = (n: number) => Math.round(n * 100) / 100;
export const dansPerimetre = (l: LigneMois) => l.suivie !== false && !l.rapprochementExclu && !l.depensePersonnelle;
export const estJustifiee = (l: LigneMois) => !!(l.piece || l.justificatifReleve || l.justifieeVia);
export const natureLigne = (l: LigneMois) => l.depensePersonnelle ? "personnel" : l.immobilisation ? "immobilisation" : l.suivie === false ? "hors charges" : "charge";

export function completudeJustificatifs(lignes: LigneMois[]) {
  const base = lignes.filter(dansPerimetre);
  const sans = base.filter(l => !estJustifiee(l));
  return {
    total: base.length,
    justifies: base.length - sans.length,
    sansPiece: sans.length,
    montantSansPiece: c(sans.reduce((s, l) => s + (l.montant || 0), 0)),
    pourcent: base.length ? Math.round(((base.length - sans.length) / base.length) * 100) : 100,
  };
}

/** TVA lue sur la pièce d'achat associée, en euros ; null si rien d'exploitable. */
export function tvaJustifiee(l: LigneMois): number | null {
  const e = l.piece?.extraction;
  if (!e || (e.typeDocument && e.typeDocument !== "achat") || (e.devise && e.devise !== "EUR")) return null;
  if (typeof e.tva !== "number" || !Number.isFinite(e.tva) || e.tva <= 0) return null;
  if (l.statutTVA === "sans-tva" || l.statutTVA === "non-recuperee") return null;
  return c(e.tva);
}

export function bilanTvaMois(lignes: LigneMois[]) {
  const base = lignes.filter(dansPerimetre);
  const r = { deductibleJustifiee: 0, nbJustifiees: 0, aVerifier: { nb: 0, ttc: 0 }, sansTva: { nb: 0, ttc: 0 }, nonRecuperee: { nb: 0, ttc: 0 }, pieceSansTva: { nb: 0, ttc: 0 } };
  for (const l of base) {
    const tva = tvaJustifiee(l);
    if (tva !== null) { r.deductibleJustifiee += tva; r.nbJustifiees++; continue; }
    // Salaires, cotisations : justifiés par la Masse salariale, et sans TVA par nature.
    if (l.justifieeVia && (l.statutTVA || "a-verifier") === "a-verifier") { r.sansTva.nb++; r.sansTva.ttc += l.montant || 0; continue; }
    const statut = l.statutTVA || "a-verifier";
    const cible = statut === "sans-tva" ? r.sansTva : statut === "non-recuperee" ? r.nonRecuperee : l.piece ? r.pieceSansTva : r.aVerifier;
    cible.nb++; cible.ttc += l.montant || 0;
  }
  r.deductibleJustifiee = c(r.deductibleJustifiee);
  for (const k of ["aVerifier", "sansTva", "nonRecuperee", "pieceSansTva"] as const) r[k].ttc = c(r[k].ttc);
  return r;
}

const SEP = ";";
const champ = (v: unknown) => { const t = v == null ? "" : String(v); return /[;"\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
const fr = (d?: string | null) => d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d.split("-").reverse().join("/") : "";
const num = (n: number | null | undefined) => n == null || !Number.isFinite(n) ? "" : n.toFixed(2);
const libelleStatutTva: Record<string, string> = { "a-verifier": "À vérifier", "sans-tva": "Sans TVA", "non-recuperee": "TVA non récupérée" };
export const etatJustificatif = (l: LigneMois) =>
  l.piece ? "Pièce associée" : l.justificatifReleve ? `Relevé bancaire${l.referenceJustificatifReleve ? ` (${l.referenceJustificatifReleve})` : ""}` : l.justifieeVia ? `Justifiée ailleurs : ${l.justifieeVia.detail}` : "Manquant";

/** Une ligne par dépense du mois : justificatif, pièce, HT/TVA lus, écart devise ou escompte. */
export function construireExportJustificatifs(lignes: LigneMois[]) {
  const tete = ["Date", "Fournisseur", "Catégorie", "Nature", "Montant débité", "Justificatif", "Pièce", "N° facture", "Date facture", "HT pièce", "TVA pièce", "TTC pièce", "Devise pièce", "Écart", "Statut TVA", "Compte"];
  const rows = [...lignes].filter(l => l.suivie !== false && !l.rapprochementExclu).sort((a, b) => (a.dateOperation || "").localeCompare(b.dateOperation || "") || (a.fournisseur || "").localeCompare(b.fournisseur || "")).map(l => {
    const e = l.piece?.extraction;
    const ecart = l.piece?.associationDevise ? `Devise : ${l.piece.associationDevise.montantFacture.toFixed(2)} ${l.piece.associationDevise.deviseFacture} facturés`
      : l.piece?.associationEcart ? `${l.piece.associationEcart.type} ${l.piece.associationEcart.taux.toFixed(2)} % (${l.piece.associationEcart.montant.toFixed(2)} €)` : "";
    return [fr(l.dateOperation), l.fournisseur || "", l.poste || "", natureLigne(l), num(l.montant), etatJustificatif(l), l.piece?.nom || "", e?.numero || "", fr(e?.date), num(e?.ht), num(e?.tva), num(e?.ttc), e?.devise || "", ecart, libelleStatutTva[l.statutTVA || "a-verifier"] || l.statutTVA || "", l.compte || ""].map(champ).join(SEP);
  });
  return [tete.join(SEP), ...rows].join("\n") + "\n";
}

/** Vue TVA du mois : ce que la comptable reporte sur la déclaration, ligne par ligne. */
export function construireExportTva(lignes: LigneMois[]) {
  const tete = ["Date", "Fournisseur", "Catégorie", "Nature", "Montant TTC débité", "HT pièce", "TVA pièce", "TVA déductible justifiée", "Statut TVA", "Justificatif", "N° facture"];
  const rows = [...lignes].filter(dansPerimetre).sort((a, b) => (a.dateOperation || "").localeCompare(b.dateOperation || "")).map(l => {
    const e = l.piece?.extraction; const tva = tvaJustifiee(l);
    return [fr(l.dateOperation), l.fournisseur || "", l.poste || "", natureLigne(l), num(l.montant), num(e?.ht), num(e?.tva), num(tva), libelleStatutTva[l.statutTVA || "a-verifier"] || l.statutTVA || "", etatJustificatif(l), e?.numero || ""].map(champ).join(SEP);
  });
  const b = bilanTvaMois(lignes);
  rows.push(["", "TOTAL", "", "", "", "", "", num(b.deductibleJustifiee), `${b.aVerifier.nb} ligne(s) à vérifier pour ${num(b.aVerifier.ttc)} € TTC`, "", ""].map(champ).join(SEP));
  return [tete.join(SEP), ...rows].join("\n") + "\n";
}
