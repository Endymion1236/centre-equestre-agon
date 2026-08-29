/**
 * Ventilation du chiffre d'affaires par compte comptable.
 *
 * Le comptable a besoin, par période : base HT, TVA et TTC par compte et par
 * taux. Les lignes de facture ne portent pas toutes la même information selon
 * leur origine — d'où une cascade, du plus fiable au plus approximatif :
 *
 *   1. `compteComptable` posé explicitement (caisse, récurrences) ;
 *   2. `category` (même origine, sans le code) ;
 *   3. `activityType` (inscriptions au planning : cours, stage, balade…) ;
 *   4. le LIBELLÉ, par mots-clés — heuristique assumée (licence, adhésion,
 *      forfait, pension…) ;
 *   5. sinon : NON VENTILÉ, jamais rangé au hasard dans « Divers ».
 *
 * Le point 5 est essentiel : une ligne mal classée en silence coûte plus cher
 * qu'une ligne signalée. L'écran d'export affiche ce total à part.
 */

export interface CompteComptable {
  code: string;
  label: string;
  tva: number;
}

/** Plan comptable du club, importé de Celeris. */
export const PLAN_COMPTABLE: CompteComptable[] = [
  { code: "70641000", label: "Animations collectivité", tva: 5.5 },
  { code: "70611110", label: "Cotisations / Adhésions", tva: 5.5 },
  { code: "70611600", label: "Découverte / Familiarisation", tva: 5.5 },
  { code: "70605000", label: "Divers", tva: 20 },
  { code: "70619900", label: "Droits d'accès installations", tva: 5.5 },
  { code: "70611300", label: "Enseignement / Cartes", tva: 5.5 },
  { code: "70611700", label: "Enseignement / Coaching", tva: 5.5 },
  { code: "70611000", label: "Enseignement / Forfaits", tva: 5.5 },
  { code: "4386", label: "Formation professionnelle", tva: 0 },
  { code: "70613110", label: "Location poneys", tva: 20 },
  { code: "70630110", label: "Pensions équidé", tva: 5.5 },
  { code: "70611500", label: "Randonnées / Promenades", tva: 5.5 },
  { code: "70100000", label: "Refacturation FFE", tva: 0 },
  { code: "70880000", label: "Refacturation soin", tva: 20 },
  { code: "70611400", label: "Stages équitation", tva: 5.5 },
  { code: "70622011", label: "Transport", tva: 20 },
  { code: "70410000", label: "Ventes équidés", tva: 20 },
];

export const NON_VENTILE = "NON_VENTILE";

/** Libellé d'un code — le code brut si absent du plan (ancien encaissement). */
export function libelleCompte(code: string): string {
  if (code === NON_VENTILE) return "À ventiler (origine non identifiée)";
  return PLAN_COMPTABLE.find(c => c.code === code)?.label || `Compte ${code}`;
}

/** Catégories de la caisse et des récurrences → plan Celeris. */
const PAR_CATEGORIE: Record<string, string> = {
  enseignement: "70611000",
  pension: "70630110",
  location: "70613110",
  vente: "70410000",
  licence: "70100000",
  transport: "70622011",
  evenement: "70641000",
  autre: "70605000",
  bon_cadeau: "70605000",
};

/** Types d'activité du planning → plan Celeris. */
const PAR_TYPE_ACTIVITE: Record<string, string> = {
  cours: "70611000",
  cours_collectif: "70611000",
  cours_particulier: "70611700",
  stage: "70611400",
  stage_journee: "70611400",
  balade: "70611500",
  ponyride: "70611600",
  competition: "70611700",
  option: "70605000",
};

/** Mots-clés du libellé → plan Celeris. Ordre significatif : premier trouvé. */
const PAR_LIBELLE: { motif: RegExp; code: string }[] = [
  { motif: /licence/i, code: "70100000" },
  { motif: /adh[ée]sion|cotisation/i, code: "70611110" },
  { motif: /pension/i, code: "70630110" },
  { motif: /forfait/i, code: "70611000" },
  { motif: /stage/i, code: "70611400" },
  { motif: /balade|promenade|randonn/i, code: "70611500" },
  { motif: /carte\s+\d*\s*s[ée]ances?/i, code: "70611300" },
  { motif: /location|box/i, code: "70613110" },
  { motif: /transport/i, code: "70622011" },
  { motif: /bon cadeau/i, code: "70605000" },
];

export interface LigneFacture {
  activityTitle?: string;
  priceTTC?: number;
  tva?: number;
  compteComptable?: string;
  category?: string;
  activityType?: string;
}

/** Compte d'une ligne + provenance de la décision (pour l'audit à l'écran). */
export function compteDeLigne(item: LigneFacture): { code: string; source: string } {
  if (item.compteComptable) return { code: item.compteComptable, source: "compte de la ligne" };
  if (item.category && PAR_CATEGORIE[item.category]) {
    return { code: PAR_CATEGORIE[item.category], source: "catégorie" };
  }
  if (item.activityType && PAR_TYPE_ACTIVITE[item.activityType]) {
    return { code: PAR_TYPE_ACTIVITE[item.activityType], source: "type d'activité" };
  }
  const titre = item.activityTitle || "";
  const parMot = PAR_LIBELLE.find(r => r.motif.test(titre));
  if (parMot) return { code: parMot.code, source: "libellé" };
  return { code: NON_VENTILE, source: "aucune" };
}

/**
 * Base HT recalculée depuis le TTC et le taux, jamais lue dans `priceHT` :
 * selon l'écran d'origine, ce champ contient tantôt un prix unitaire, tantôt
 * un total de ligne. Le TTC et le taux, eux, sont fiables partout.
 */
export function baseHT(ttc: number, taux: number): number {
  return Math.round((ttc / (1 + (taux || 0) / 100)) * 100) / 100;
}

export interface LigneVentilee {
  compte: string;
  libelle: string;
  taux: number;
  ht: number;
  tvaMontant: number;
  ttc: number;
  nb: number;
}

/** Agrège des lignes de facture par (compte, taux de TVA). */
export function ventiler(items: LigneFacture[]): LigneVentilee[] {
  const map = new Map<string, LigneVentilee>();
  for (const item of items) {
    const ttc = Number(item.priceTTC || 0);
    if (!ttc) continue;
    const taux = Number(item.tva || 0);
    const { code } = compteDeLigne(item);
    const cle = `${code}|${taux}`;
    const ht = baseHT(ttc, taux);
    const ligne = map.get(cle) || {
      compte: code, libelle: libelleCompte(code), taux, ht: 0, tvaMontant: 0, ttc: 0, nb: 0,
    };
    ligne.ht = Math.round((ligne.ht + ht) * 100) / 100;
    ligne.ttc = Math.round((ligne.ttc + ttc) * 100) / 100;
    ligne.tvaMontant = Math.round((ligne.ttc - ligne.ht) * 100) / 100;
    ligne.nb += 1;
    map.set(cle, ligne);
  }
  return [...map.values()].sort((a, b) =>
    a.compte === NON_VENTILE ? 1 : b.compte === NON_VENTILE ? -1 : a.compte.localeCompare(b.compte) || a.taux - b.taux
  );
}

/** CSV pour tableur français : séparateur « ; », virgule décimale, BOM Excel. */
export function versCsv(entetes: string[], lignes: (string | number)[][]): string {
  const cell = (v: string | number) =>
    typeof v === "number"
      ? `"${v.toFixed(2).replace(".", ",")}"`
      : `"${String(v).replace(/"/g, '""')}"`;
  return "﻿" + [entetes, ...lignes].map(l => l.map(cell).join(";")).join("\r\n");
}
