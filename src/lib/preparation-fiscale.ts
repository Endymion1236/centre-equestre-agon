/** Préparation de la liasse BA réel normal 2144 à 2154, millésimes publiés 2025/2026.
 * Sources : impots.gouv.fr/formulaire/2143-sd et notice 2142-NOT-SD.
 * Les cases non déductibles de la balance restent nulles, jamais implicitement à zéro.
 * Ces tableaux de travail ne sont ni des CERFA remplis ni une télédéclaration. */
import { ErreurDocumentsComptables } from "./documents-comptables";
import { IMMOBILISATIONS, type EtatAnnuel } from "./etats-annuels";

export type BrouillonFiscal = { version: 1; millesime: 2025 | 2026; valeurs: Record<string, string>; revues: string[] };
export type CelluleFiscale = { cle: string; libelle: string; type: "montant" | "texte"; valeur: number | string | null; saisie: boolean; origine: "calculé" | "saisi" | "proposé" | "à compléter" };
export type LigneFiscale = { id: string; libelle: string; cellules: CelluleFiscale[] };
export type TableauFiscal = { id: string; titre: string; aide: string; lignes: LigneFiscale[]; controles: string[]; manquants: number; revu: boolean };
export const brouillonFiscalVide = (millesime: 2025 | 2026 = 2025): BrouillonFiscal => ({ version: 1, millesime, valeurs: {}, revues: [] });
export function verifierBrouillonFiscal(value: unknown): BrouillonFiscal {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ErreurDocumentsComptables("Brouillon fiscal invalide.");
  const d = value as Record<string, unknown>;
  if (Object.keys(d).some(k => !["version", "millesime", "valeurs", "revues"].includes(k)) || d.version !== 1 || ![2025, 2026].includes(Number(d.millesime)) ||
    typeof d.millesime !== "number" || !d.valeurs || typeof d.valeurs !== "object" || Array.isArray(d.valeurs) || !Array.isArray(d.revues) || d.revues.length > 15 ||
    !d.revues.every(v => typeof v === "string" && /^21[0-9]{2}(bis|ter)?$/.test(v))) throw new ErreurDocumentsComptables("Format ou millésime du brouillon fiscal non reconnu.");
  if (Object.keys(d.valeurs).length > 3000) throw new ErreurDocumentsComptables("Brouillon fiscal trop volumineux.");
  for (const [key, value] of Object.entries(d.valeurs)) if (!/^[A-Za-z0-9_.-]{1,100}$/.test(key) || typeof value !== "string" || value.length > 500)
    throw new ErreurDocumentsComptables("Champ fiscal invalide ou trop long.");
  return d as BrouillonFiscal;
}
const arrondiEuro = (centimes: number) => Math.sign(centimes) * Math.round(Math.abs(centimes) / 100) * 100;
export function construirePreparationFiscale(n: EtatAnnuel, precedent: EtatAnnuel | null, brouillon: BrouillonFiscal) {
  verifierBrouillonFiscal(brouillon);
  const tables: TableauFiscal[] = [], connues = new Set<string>();
  const sum = (regex: RegExp, produit = false) => n.balance.filter(c => regex.test(c.compte)).reduce((s, c) => s + (produit ? -c.solde : c.solde), 0);
  function tableau(id: string, titre: string, aide: string) {
    const t: TableauFiscal = { id, titre, aide, lignes: [], controles: [], manquants: 0, revu: brouillon.revues.includes(id) }; tables.push(t); return t;
  }
  function cellule(t: TableauFiscal, ligne: string, cle: string, libelle: string, type: "montant" | "texte", initial: number | string | null = null, saisie = true): CelluleFiscale {
    const key = `${t.id}.${ligne}.${cle}`; connues.add(key);
    let valeur = initial;
    const fourni = brouillon.valeurs[key];
    if (fourni !== undefined) {
      if (!saisie) throw new ErreurDocumentsComptables(`La case ${key} est calculée et ne peut pas être modifiée.`);
      if (!fourni.trim()) valeur = null;
      else if (type === "texte") valeur = fourni.trim();
      else {
        const v = fourni.replace(/[ \u202f\u00a0]/g, "");
        if (!/^-?\d+(?:[,.]\d{1,2})?$/.test(v)) throw new ErreurDocumentsComptables(`Montant invalide dans ${t.id} : ${libelle}.`);
        valeur = Math.round(Number(v.replace(",", ".")) * 100);
        if (!Number.isSafeInteger(valeur) || Math.abs(valeur) > 100_000_000_000) throw new ErreurDocumentsComptables("Montant fiscal hors limite.");
      }
    }
    if (valeur === null && saisie) t.manquants++;
    return { cle: key, libelle, type, valeur, saisie, origine: !saisie ? "calculé" : valeur === null ? "à compléter" : fourni !== undefined ? "saisi" : "proposé" };
  }
  function champs(t: TableauFiscal, id: string, libelle: string, colonnes: [string, string, "montant" | "texte", (number | string | null)?, boolean?][]) {
    const l: LigneFiscale = { id, libelle, cellules: colonnes.map(([k, label, type, value, edit]) => cellule(t, id, k, label, type, value, edit)) }; t.lignes.push(l); return l;
  }
  const val = (l: LigneFiscale, k: string) => l.cellules.find(c => c.cle.endsWith(`.${k}`))!.valeur;
  const ecart = (t: TableauFiscal, l: LigneFiscale, positifs: string[], negatifs: string[], attendu: string) => {
    const keys = [...positifs, ...negatifs, attendu]; if (keys.some(k => typeof val(l, k) !== "number")) return;
    const total = positifs.reduce((s, k) => s + Number(val(l, k)), 0) - negatifs.reduce((s, k) => s + Number(val(l, k)), 0);
    if (total !== val(l, attendu)) t.controles.push(`${l.libelle} : les mouvements ne correspondent pas au solde ou au total.`);
  };
  const t44 = tableau("2144", "Bilan actif", "Montants issus de la ventilation annuelle. Corriger le rattachement des comptes dans le bilan si nécessaire.");
  for (const r of n.actif) champs(t44, r.code, r.libelle, [["brut", "Brut N", "montant", r.brut, false], ["amort", "Amortissements / dépréciations", "montant", r.amortissements, false], ["net", "Net N", "montant", r.net, false]]);
  const t45 = tableau("2145", "Bilan passif", "Montants issus des comptes, avec le résultat de la période. Les échéances des dettes sont renseignées dans le tableau 2150.");
  for (const r of n.passif) champs(t45, r.code, r.libelle, [["net", "Net N", "montant", r.net, false]]);

  const t46 = tableau("2146", "Compte de résultat — rattachement fiscal", "Les totaux comptables servent de contrôle. Ventiler les ventes et vérifier les postes agricoles avec la comptable. Les montants proposés restent modifiables.");
  const recettes = [["FC", "Ventes de produits végétaux"], ["FF", "Ventes de produits d’origine animale"], ["FI", "Ventes de produits transformés"], ["FL", "Ventes d’animaux"], ["FO", "Autre production vendue (dont prestations)"]] as const;
  const revenus: LigneFiscale[] = [];
  for (const [code, label] of recettes) revenus.push(champs(t46, code, label, [["france", "France", "montant"], ["export", "Exportations", "montant"]]));
  champs(t46, "FR", "Chiffre d’affaires — contrôle comptable", [["valeur", "Total comptes 70", "montant", sum(/^70/, true), false]]);
  const champs46: [string, string, number | null][] = [
    ["FS", "Variation des animaux reproducteurs immobilisés", null], ["FT", "Production stockée", sum(/^71/, true)], ["FU", "Production immobilisée", sum(/^72/, true)],
    ["FV", "Production autoconsommée", null], ["FW", "Indemnités et subventions d’exploitation", sum(/^74/, true)], ["FX", "Reprises d’exploitation", sum(/^781/, true) + (brouillon.millesime === 2025 ? sum(/^79/, true) : 0)],
    ["GZ", "Autres produits d’exploitation", sum(/^75/, true)], ["FZ", "Achats de marchandises et d’approvisionnements", sum(/^60[1279]/)], ["GA", "Variation des stocks achetés", sum(/^603/)],
    ["GB", "Achats d’animaux", null], ["GC", "Autres achats et charges externes", sum(/^60[4568]|^6[12]/)], ["GD", "Impôts et taxes", sum(/^63/)],
    ["GE", "Rémunérations", sum(/^64[1234]/)], ["GF", "Cotisations personnelles de l’exploitant", sum(/^646/)], ["GG", "Autres charges sociales", sum(/^64[5789]/)],
    ["GH", "Dotations aux amortissements d’exploitation", sum(/^6811/)], ["GI", "Dépréciations des immobilisations", sum(/^6816/)], ["GJ", "Dépréciations de l’actif circulant", sum(/^6817/)], ["GK", "Provisions pour risques et charges", sum(/^6815/)], ["GL", "Autres charges d’exploitation", sum(/^65/)],
    ["GO", "Produits des participations", sum(/^761/, true)], ["GP", "Produits des autres valeurs mobilières et créances immobilisées", sum(/^762/, true)], ["GQ", "Autres intérêts et produits financiers", sum(/^76[3458]/, true)],
    ["GR", "Reprises financières", sum(/^786/, true)], ["GS", "Produits nets sur cessions de placements", sum(/^767/, true)], ["GU", "Dotations financières", sum(/^686/)], ["GV", "Intérêts et autres charges financières", sum(/^66[1234568]/)], ["GW", "Charges nettes sur cessions de placements", sum(/^667/)],
  ];
  const montants46 = new Map<string, number | null>();
  for (const [code, label, initial] of champs46) { const l = champs(t46, code, `${code} — ${label}`, [["valeur", "Montant", "montant", initial]]); montants46.set(code, val(l, "valeur") as number | null); }
  const totalCodes = (codes: string[]) => codes.every(k => typeof montants46.get(k) === "number") ? codes.reduce((s, k) => s + Number(montants46.get(k)), 0) : null;
  const ventes = revenus.flatMap(l => l.cellules.map(c => c.valeur));
  const ca = ventes.every(v => typeof v === "number") ? ventes.reduce<number>((s, v) => s + Number(v), 0) : null;
  if (ca !== null && ca !== sum(/^70/, true)) t46.controles.push("La ventilation France/export ne correspond pas au chiffre d’affaires des comptes 70.");
  const prodEx = totalCodes(["FS", "FT", "FU", "FV", "FW", "FX", "GZ"]), chEx = totalCodes(["FZ", "GA", "GB", "GC", "GD", "GE", "GF", "GG", "GH", "GI", "GJ", "GK", "GL"]);
  const prodFin = totalCodes(["GO", "GP", "GQ", "GR", "GS"]), chFin = totalCodes(["GU", "GV", "GW"]);
  const pEx = ca === null || prodEx === null ? null : ca + prodEx;
  for (const [code, label, amount] of [["FY", "Total produits d’exploitation", pEx], ["GM", "Total charges d’exploitation", chEx], ["GN", "Résultat d’exploitation", pEx === null || chEx === null ? null : pEx - chEx], ["GT", "Total produits financiers", prodFin], ["GX", "Total charges financières", chFin], ["GY", "Résultat financier", prodFin === null || chFin === null ? null : prodFin - chFin]] as const)
    champs(t46, code, `${code} — ${label}`, [["valeur", "Calculé", "montant", amount, false]]);
  if (brouillon.millesime === 2026 && sum(/^79/, true)) t46.controles.push("Des comptes 79 sont présents : revoir leur rattachement pour le millésime 2026.");

  const t46b = tableau("2146bis", "Compte de résultat — suite", brouillon.millesime === 2025 ? "Millésime 2025 : détail des opérations exceptionnelles. Renseigner également les précisions utiles dans les lignes de détail." : "Millésime 2026 : produits et charges exceptionnels regroupés. Leur qualification doit être revue selon les règles applicables.");
  let produitsExceptionnels: number | null, chargesExceptionnelles: number | null;
  if (brouillon.millesime === 2025) {
    const valeurs = new Map<string, number | null>();
    for (const [code, label, amount] of [["HA", "Produits exceptionnels de gestion", sum(/^77[128]/, true)], ["HB", "Produits de cessions", sum(/^775/, true)], ["HC", "Subventions d’investissement virées au résultat", sum(/^777/, true)], ["HD", "Reprises exceptionnelles", sum(/^787/, true)], ["HF", "Charges exceptionnelles de gestion", sum(/^67[128]/)], ["HG", "Valeur comptable des immobilisations cédées", sum(/^675/)], ["HH", "Autres charges exceptionnelles en capital", sum(/^67[3467]/)], ["HI", "Dotations exceptionnelles", sum(/^687/)]] as const) {
      const l = champs(t46b, code, `${code} — ${label}`, [["valeur", "Montant", "montant", amount]]); valeurs.set(code, val(l, "valeur") as number | null);
    }
    const calculExceptionnel = (keys: string[]) => keys.some(k => valeurs.get(k) === null) ? null : keys.reduce((s, k) => s + Number(valeurs.get(k)), 0);
    produitsExceptionnels = calculExceptionnel(["HA", "HB", "HC", "HD"]); chargesExceptionnelles = calculExceptionnel(["HF", "HG", "HH", "HI"]);
    champs(t46b, "HE", "HE — Total produits exceptionnels", [["valeur", "Calculé", "montant", produitsExceptionnels, false]]);
    champs(t46b, "HJ", "HJ — Total charges exceptionnelles", [["valeur", "Calculé", "montant", chargesExceptionnelles, false]]);
  } else {
    produitsExceptionnels = val(champs(t46b, "HE", "HE — Produits exceptionnels", [["valeur", "Montant", "montant", sum(/^77|^787/, true)]]), "valeur") as number | null;
    chargesExceptionnelles = val(champs(t46b, "HJ", "HJ — Charges exceptionnelles", [["valeur", "Montant", "montant", sum(/^67|^687/)]]), "valeur") as number | null;
  }
  const participation = val(champs(t46b, "HL", "HL — Participation des salariés", [["valeur", "Montant", "montant", sum(/^691/)]]), "valeur") as number | null;
  champs(t46b, "HK", "HK — Résultat exceptionnel", [["valeur", "Calculé", "montant", produitsExceptionnels === null || chargesExceptionnelles === null ? null : produitsExceptionnels - chargesExceptionnelles, false]]);
  const totalProduits = pEx === null || prodFin === null || produitsExceptionnels === null ? null : pEx + prodFin + produitsExceptionnels;
  const totalCharges = chEx === null || chFin === null || chargesExceptionnelles === null || participation === null ? null : chEx + chFin + chargesExceptionnelles + participation;
  const resultatReconstitue = totalProduits === null || totalCharges === null ? null : totalProduits - totalCharges;
  champs(t46b, "HM", "HM — Total produits", [["valeur", "Calculé", "montant", totalProduits, false]]);
  champs(t46b, "HN", "HN — Total charges", [["valeur", "Calculé", "montant", totalCharges, false]]);
  champs(t46b, "HO", "HO — Résultat comptable reconstitué", [["valeur", "Calculé", "montant", resultatReconstitue, false]]);
  if (resultatReconstitue !== null && resultatReconstitue !== n.resultat) t46b.controles.push("Le résultat reconstitué diffère de la balance : revoir la ventilation du 2146 et du 2146 bis.");
  for (let i = 1; i <= 5; i++) champs(t46b, `detail${i}`, `Précision ${i}`, [["nature", "Opération exceptionnelle / exercice antérieur (ou néant)", "texte"], ["produits", "Produits", "montant"], ["charges", "Charges", "montant"]]);

  const t47 = tableau("2147", "Immobilisations", "Valeurs brutes. Les acquisitions, sorties et virements doivent provenir du registre des immobilisations. Les mouvements de la balance ne suffisent pas à les identifier.");
  const t48 = tableau("2148", "Amortissements", "Amortissements comptables 28, hors dépréciations 29. Compléter les mouvements depuis le registre ; les amortissements dérogatoires figurent séparément.");
  const amort28 = (etat: EtatAnnuel | null, code: string) => etat ? etat.ventilation.filter(v => v.code === code && /^28/.test(v.compte)).reduce((s, v) => s - v.solde, 0) : null;
  for (const [code, label] of IMMOBILISATIONS) {
    const r = n.actif.find(r => r.code === code)!, p = precedent?.actif.find(r => r.code === code);
    const l = champs(t47, code, label, [["ouverture", "Brut à l’ouverture", "montant", p?.brut ?? null], ["acquisitions", "Acquisitions / créations", "montant"], ["virements", "Virements nets (+ / −)", "montant"], ["sorties", "Cessions / sorties", "montant"], ["cloture", "Brut à la clôture", "montant", r.brut, false]]);
    ecart(t47, l, ["ouverture", "acquisitions", "virements"], ["sorties"], "cloture");
    const a = champs(t48, code, label, [["ouverture", "Amortissements à l’ouverture", "montant", amort28(precedent, code)], ["dotations", "Dotations", "montant"], ["virements", "Virements nets (+ / −)", "montant"], ["sorties", "Amortissements sortis", "montant"], ["cloture", "Amortissements à la clôture", "montant", amort28(n, code), false]]);
    ecart(t48, a, ["ouverture", "dotations", "virements"], ["sorties"], "cloture");
  }
  champs(t48, "derogatoires", "Amortissements dérogatoires — détail du régime", [["dotations", "Dotations dérogatoires", "montant"], ["reprises", "Reprises dérogatoires", "montant"], ["detail", "Différences de durée, mode ou mesure fiscale (ou néant)", "texte"]]);
  const t49 = tableau("2149", "Provisions et dépréciations", "Les soldes sont proposés par compte. Distinguer les dotations et reprises de l’exercice ; justifier leur traitement fiscal dans le 2151 bis.");
  const provisions = [...new Set([...n.balance, ...(precedent?.balance || [])].filter(c => /^14|^15|^29|^39|^49|^59/.test(c.compte)).map(c => c.compte))].sort();
  for (const compte of provisions.length ? provisions : ["NEANT"]) {
    const c = n.balance.find(c => c.compte === compte), p = precedent?.balance.find(c => c.compte === compte);
    const l = champs(t49, compte, c ? `${compte} — ${c.libelle}` : compte, [["ouverture", "Solde à l’ouverture", "montant", precedent ? -(p?.solde || 0) : null], ["dotations", "Dotations", "montant"], ["reprises", "Reprises", "montant"], ["cloture", "Solde à la clôture", "montant", -(c?.solde || 0), false], ["nature", "Nature et motif (ou néant)", "texte"]]);
    ecart(t49, l, ["ouverture", "dotations"], ["reprises"], "cloture");
  }
  const t50 = tableau("2150", "Échéances des créances et des dettes", "Renseigner les échéances contractuelles, à partir des factures et tableaux d’emprunts. Chaque ventilation doit égaler le montant brut du poste.");
  for (const r of n.actif.filter(r => ["BD", "BF", "BH", "BX", "BZ", "CB", "CD", "CJ"].includes(r.code))) {
    const l = champs(t50, `actif${r.code}`, `Créances — ${r.libelle}`, [["total", "Brut à ventiler", "montant", r.brut, false], ["court", "À un an au plus", "montant"], ["long", "À plus d’un an", "montant"]]); ecart(t50, l, ["court", "long"], [], "total");
  }
  for (const r of n.passif.filter(r => ["DP", "DQ", "DR", "DS", "DT", "DU", "DV", "DW", "DX", "DY"].includes(r.code))) {
    const l = champs(t50, `passif${r.code}`, `Dettes — ${r.libelle}`, [["total", "Solde à ventiler", "montant", r.net, false], ["court", "À un an au plus", "montant"], ["moyen", "De un à cinq ans", "montant"], ["long", "À plus de cinq ans", "montant"]]); ecart(t50, l, ["court", "moyen", "long"], [], "total");
  }
  champs(t50, "emprunts", "Mouvements et renvois", [["nouveaux", "Nouveaux emprunts", "montant"], ["rembourses", "Emprunts remboursés", "montant"], ["prets", "Prêts consentis", "montant"], ["recouvres", "Prêts remboursés", "montant"], ["associes", "Détail concernant les associés (ou néant)", "texte"]]);

  const t51 = tableau("2151", "Détermination du résultat fiscal", "Montants en euros ; calcul fiscal à l’euro le plus proche, après arrondi de chaque case. Le résultat fiscal reste indéterminé tant qu’une réintégration ou déduction n’a pas été renseignée. Vérification professionnelle nécessaire.");
  champs(t51, "WA", "WA — Bénéfice comptable", [["valeur", "Montant", "montant", arrondiEuro(Math.max(0, n.resultat)), false]]);
  champs(t51, "WQ", "WQ — Perte comptable", [["valeur", "Montant", "montant", arrondiEuro(Math.max(0, -n.resultat)), false]]);
  const reintegrations = [["WB", "Rémunération de l’exploitant ou des associés"], ["WD", "Avantages personnels non déductibles"], ["WE", "Animaux non fiscalement immobilisables"], ["WF", "Amortissements non déductibles"], ["WG", "Charges somptuaires"], ["WI", "Intérêts excédentaires d’associés"], ["WJ", "Provisions et charges non déductibles"], ["WK", "Amendes et pénalités"], ["WL", "Quote-part de bénéfices"], ["WM", "Moins-values à long terme"], ["WN", "Plus-values antérieures imposables"], ["WO", "Réintégrations diverses"]];
  const deductions = [["WR", "Quote-part de pertes"], ["WS", "Provisions antérieurement taxées"], ["WT", "Plus-values à long terme imposées séparément"], ["WU", "Plus-values imputées sur moins-values antérieures"], ["WV", "Plus-values imputées sur déficits"], ["A2", "Plus-values à long terme exonérées"], ["WX", "Plus-values à court terme différées"], ["WY", "Régime particulier outre-mer"], ["WZ", "Déductions diverses"]];
  const valeurs51 = new Map<string, number | null>();
  for (const [code, label] of [...reintegrations, ...deductions]) {
    const l = champs(t51, code, `${code} — ${label}`, [["valeur", "Montant", "montant"]]); const v = val(l, "valeur") as number | null;
    if (v !== null && v < 0) throw new ErreurDocumentsComptables(`Case ${code} : un montant positif est attendu.`);
    valeurs51.set(code, v === null ? null : arrondiEuro(v));
  }
  const total51 = (rows: string[][], base: number) => rows.some(([code]) => valeurs51.get(code) === null) ? null : base + rows.reduce((s, [code]) => s + Number(valeurs51.get(code)), 0);
  const wp = total51(reintegrations, arrondiEuro(Math.max(0, n.resultat))), xa = total51(deductions, arrondiEuro(Math.max(0, -n.resultat)));
  const resultatFiscal = wp === null || xa === null ? null : wp - xa;
  for (const [code, label, value] of [["WP", "Total I", wp], ["XA", "Total II", xa], ["XB", "Bénéfice fiscal avant corrections", resultatFiscal === null ? null : Math.max(0, resultatFiscal)], ["XC", "Déficit fiscal avant corrections", resultatFiscal === null ? null : Math.max(0, -resultatFiscal)]] as const)
    champs(t51, code, `${code} — ${label}`, [["valeur", "Calculé", "montant", value, false]]);
  for (const [code, label] of [["XJ", "Abattement jeunes agriculteurs"], ["XP", "Déduction pour épargne de précaution"], ...(brouillon.millesime === 2025 ? [["XS", "Déduction pour augmentation du stock de vaches"]] : []), ["XL", "Déductions imputées sur plus-values à long terme"], ["XM", "Plus-value nette imposable à long terme"], ["XQ", "Déductions imputées sur plus-values des particuliers"], ["XR", "Plus-value nette imposable des particuliers"]])
    champs(t51, code, `${code} — ${label}`, [["valeur", "Montant à confirmer", "montant"]]);
  champs(t51, "justification", "Détail des retraitements", [["texte", "Justifier notamment WO et WZ, exonérations et corrections (ou néant)", "texte"]]);
  const t51b = tableau("2151bis", "Suivi des déficits et provisions non déductibles", "Reprendre les historiques de la comptable ; aucune consommation de déficit n’est décidée automatiquement.");
  const deficit = champs(t51b, "deficits", "Déficits et amortissements historiques reportables", [["ouverture", "Report à l’ouverture", "montant"], ["imputes", "Montant imputé", "montant"], ["cloture", "Report restant", "montant"]]); ecart(t51b, deficit, ["ouverture"], ["imputes"], "cloture");
  for (let i = 1; i <= 5; i++) champs(t51b, `provision${i}`, `Provision / charge ${i}`, [["nature", "Nature (ou néant)", "texte"], ["dotation", "Dotation non déductible N", "montant"], ["reprise", "Reprise antérieurement taxée N", "montant"]]);
  const t51t = tableau("2151ter", "Renseignements divers", "Ventilation des achats et charges, engagements, TVA et renseignements de l’exploitation. La TVA de l’exercice ne se déduit pas des seuls soldes de clôture.");
  for (const [code, label] of [["ZA", "Engagements de crédit-bail mobilier"], ["ZB", "Engagements de crédit-bail immobilier"], ["ZC", "Effets escomptés non échus"], ["ZD", "Engrais"], ["ZE", "Semences"], ["ZF", "Défense des végétaux"], ["ZG", "Aliments du bétail"], ["ZH", "Défense des animaux"], ["ZI", "Combustibles et carburants stockés"], ["ZJ", "Autres approvisionnements"], ["ZL", "Sous-traitance"], ["ZM", "Crédit-bail mobilier"], ["ZN", "Crédit-bail immobilier"], ["ZO", "Fermages et charges foncières"], ["ZP", "Autres locations"], ["ZQ", "Personnel extérieur"], ["ZR", "Intermédiaires et honoraires"], ["ZS", "Publicité et relations publiques"], ["ZT", "Autres achats et charges externes"], ["ZV", "Taxes foncières"], ["ZW", "Autres impôts et taxes"], ["ZY", "TVA collectée de l’exercice"], ["ZZ", "TVA déductible sur biens et services"], ["UP", "TVA déductible afférente aux stocks"], ["UQ", "Salaires bruts fiscaux déclarés"]])
    champs(t51t, code, `${code} — ${label}`, [["valeur", "Montant", "montant"]]);
  for (const [code, label] of [["UR", "Effectif moyen, apprentis et salariés handicapés"], ["US", "Taux d’intérêt maximal servi aux associés"], ["UY", "Nombre d’associés"], ["UT", "Surface totale en hectares et ares"], ["UU", "Surface en faire-valoir direct"], ["UV", "Surface mise à disposition par associé"], ["UW", "Surface en fermage"], ["UX", "Surface en métayage"]]) champs(t51t, code, `${code} — ${label}`, [["valeur", "Information (ou néant)", "texte"]]);
  for (const [code, label, parts, reference] of [["ZK", "Total approvisionnements", ["ZD", "ZE", "ZF", "ZG", "ZH", "ZI", "ZJ"], "FZ"], ["ZU", "Total autres achats et charges externes", ["ZL", "ZM", "ZN", "ZO", "ZP", "ZQ", "ZR", "ZS", "ZT"], "GC"], ["ZX", "Total impôts et taxes", ["ZV", "ZW"], "GD"]] as [string, string, string[], string][]) {
    const values = parts.map(k => t51t.lignes.find(l => l.id === k)!.cellules[0].valeur);
    const total = values.every(v => typeof v === "number") ? values.reduce<number>((s, v) => s + Number(v), 0) : null;
    champs(t51t, code, `${code} — ${label}`, [["valeur", "Calculé", "montant", total, false]]);
    if (total !== null && montants46.get(reference) !== null && total !== montants46.get(reference)) t51t.controles.push(`${code} : total différent de la case ${reference} du 2146.`);
  }
  const t52 = tableau("2152", "Plus-values et moins-values", "Saisir les cessions et leur qualification fiscale : court terme, long terme, taux, exonération. Ajouter le détail complet en commentaire si plusieurs biens sont regroupés sur une ligne.");
  for (let i = 1; i <= 10; i++) {
    const l = champs(t52, `bien${i}`, `Bien ou lot ${i}`, [["designation", "Désignation, dates d’acquisition et de cession (ou néant)", "texte"], ["origine", "Valeur d’origine", "montant"], ["amort", "Amortissements retenus", "montant"], ["cession", "Prix de cession", "montant"], ["court", "Plus / moins-value court terme", "montant"], ["long", "Plus / moins-value long terme", "montant"], ["regime", "Régime, taux et exonération (ou néant)", "texte"]]);
    const v = ["origine", "amort", "cession", "court", "long"].map(k => val(l, k));
    if (v.every(x => typeof x === "number") && Number(v[2]) - Number(v[0]) + Number(v[1]) !== Number(v[3]) + Number(v[4])) t52.controles.push(`${l.libelle} : prix moins valeur nette différent des plus / moins-values ventilées.`);
  }
  const t52b = tableau("2152bis", "Suivi des plus-values et moins-values", "Reprendre les exercices d’origine, reports, imputations et soldes restant à imposer ou reporter. Joindre le détail du cabinet si nécessaire.");
  for (let i = 1; i <= 10; i++) {
    const l = champs(t52b, `report${i}`, `Report ${i}`, [["origine", "Exercice d’origine, nature et régime (ou néant)", "texte"], ["ouverture", "Solde à l’ouverture", "montant"], ["nouveau", "Nouveau report", "montant"], ["utilise", "Imputé / imposé", "montant"], ["cloture", "Solde restant", "montant"]]); ecart(t52b, l, ["ouverture", "nouveau"], ["utilise"], "cloture");
  }
  const t53 = tableau("2153", "Composition du capital social", "Reprendre l’identité des détenteurs concernés et les informations du registre juridique : personne physique ou morale, adresse, identifiant, parts et pourcentage. Ne pas les déduire du compte capital.");
  const t54 = tableau("2154", "Filiales et participations", "Reprendre les participations concernées depuis les documents juridiques, avec identité et pourcentage détenu. Inscrire néant après vérification si aucune participation n’est concernée.");
  for (const t of [t53, t54]) for (let i = 1; i <= 10; i++) champs(t, `entite${i}`, `Personne ou société ${i}`, [["identite", "Nom / raison sociale et forme juridique (ou néant)", "texte"], ["identifiant", "SIREN ou informations d’état civil (ou néant)", "texte"], ["adresse", "Adresse (ou néant)", "texte"], ["parts", "Nombre de parts et pourcentage (ou néant)", "texte"]]);

  for (const key of Object.keys(brouillon.valeurs)) if (!connues.has(key)) throw new ErreurDocumentsComptables(`Case fiscale inconnue pour ce millésime ou cette source : ${key}. Rechargez un brouillon compatible.`);
  if (brouillon.revues.some(id => !tables.some(t => t.id === id))) throw new ErreurDocumentsComptables("Tableau fiscal inconnu.");
  const controles = [...n.avertissements];
  if (Number(n.periode.fin.slice(0, 4)) !== brouillon.millesime) controles.push(`Clôture ${n.periode.fin.slice(0, 4)} et millésime ${brouillon.millesime} : faire confirmer le formulaire applicable avant tout usage déclaratif.`);
  return { millesime: brouillon.millesime, tableaux: tables, resultatFiscal, manquants: tables.reduce((s, t) => s + t.manquants, 0), controles,
    complet: tables.every(t => !t.manquants && !t.controles.length && t.revu) && !controles.length };
}
export type PreparationFiscale = ReturnType<typeof construirePreparationFiscale>;
