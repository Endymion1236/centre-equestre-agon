/** Etats annuels agricoles préparatoires. Montants exclusivement en centimes.
 * Le rattachement proposé est contrôlable par compte ; aucune écriture créée. */
import { ErreurDocumentsComptables, verifierPeriode, type BalanceCompte, type Periode } from "./documents-comptables";

export const ACTIF = [
  ["AA", "Capital souscrit non appelé"], ["AB", "Frais d’établissement"], ["AD", "Autres immobilisations incorporelles"], ["AF", "Avances sur immobilisations incorporelles"],
  ["AH", "Terrains"], ["AJ", "Aménagements des terrains"], ["AL", "Améliorations du fonds"], ["AN", "Constructions"], ["AP", "Installations techniques et matériel"],
  ["AR", "Autres immobilisations corporelles"], ["AT", "Animaux reproducteurs"], ["AV", "Animaux de service"], ["AX", "Plantations pérennes"],
  ["AZ", "Immobilisations en cours"], ["BB", "Avances sur immobilisations corporelles"], ["BD", "Participations et créances rattachées"], ["BF", "Prêts"], ["BH", "Autres immobilisations financières"],
  ["BL", "Approvisionnements et marchandises"], ["BN", "Animaux et végétaux en terre — cycle long"], ["BP", "En-cours de production — cycle long"],
  ["BR", "Animaux et végétaux en terre — cycle court"], ["BT", "En-cours de production — cycle court"], ["BV", "Produits finis"],
  ["BX", "Avances et acomptes fournisseurs"], ["BZ", "Clients"], ["CB", "Créances sur conventions de compte courant"], ["CD", "Autres créances"],
  ["CF", "Valeurs mobilières de placement"], ["CH", "Disponibilités"], ["CJ", "Charges constatées d’avance"], ["IE", "Frais d’émission d’emprunts à étaler"], ["CO", "Écarts de conversion actif"],
  ["A_AUTRE", "Actif à ventiler"],
] as const;
export const PASSIF = [
  ["DA", "Capital"], ["DB", "Primes"], ["DC", "Écarts de réévaluation"], ["DE", "Réserves statutaires ou contractuelles"], ["DF", "Réserves réglementées"], ["DG", "Autres réserves"],
  ["DH", "Report à nouveau"], ["DI", "Résultat de l’exercice"], ["DJ", "Subventions d’investissement"], ["DK", "Provisions réglementées"],
  ["DM", "Provisions pour risques"], ["DN", "Provisions pour charges"], ["DP", "Emprunts auprès des établissements de crédit"], ["DQ", "Concours bancaires courants"],
  ["DR", "Autres dettes financières et comptes d’associés"], ["DS", "Avances et acomptes clients"], ["DT", "Fournisseurs"], ["DU", "Dettes sur conventions de compte courant"],
  ["DV", "Dettes fiscales et sociales"], ["DW", "Dettes sur immobilisations"], ["DX", "Autres dettes"], ["DY", "Produits constatés d’avance"], ["EA", "Écarts de conversion passif"],
  ["P_AUTRE", "Passif à ventiler"],
] as const;
export type AffectationsAnnuelles = Record<string, string>;
const actifIds = new Set<string>(ACTIF.map(r => r[0])), passifIds = new Set<string>(PASSIF.map(r => r[0]));
export const IMMOBILISATIONS = ACTIF.slice(1, 18);
export type LigneActif = { code: string; libelle: string; brut: number; amortissements: number; net: number; comptes: string[] };
export type LignePassif = { code: string; libelle: string; net: number; comptes: string[] };
export const GROUPES_RESULTAT = [
  ["70", "Chiffre d’affaires"], ["71", "Production stockée"], ["72", "Production immobilisée"], ["73", "Produits nets partiels"], ["74", "Subventions d’exploitation"],
  ["75", "Autres produits de gestion"], ["76", "Produits financiers"], ["77", "Produits exceptionnels"], ["78", "Reprises sur amortissements et provisions"], ["79", "Transferts de charges"],
  ["60", "Achats et variations de stocks"], ["61", "Services extérieurs"], ["62", "Autres services extérieurs"], ["63", "Impôts et taxes"], ["64", "Charges de personnel"],
  ["65", "Autres charges de gestion"], ["66", "Charges financières"], ["67", "Charges exceptionnelles"], ["68", "Dotations aux amortissements et provisions"], ["69", "Participation et impôts sur les bénéfices"],
] as const;
function rubriqueActif(compte: string): string {
  if (compte.startsWith("109")) return "AA";
  const regles: [RegExp, string][] = [
    [/^201/, "AB"], [/^237/, "AF"], [/^20/, "AD"], [/^211/, "AH"], [/^212/, "AJ"], [/^214/, "AL"], [/^213/, "AN"], [/^215/, "AP"], [/^218/, "AR"],
    [/^24[12]/, "AT"], [/^243/, "AV"], [/^24[56]/, "AX"], [/^238/, "BB"], [/^23/, "AZ"], [/^26/, "BD"], [/^274/, "BF"], [/^27/, "BH"],
    [/^30|^3[127]/, "BL"], [/^33/, "BN"], [/^34/, "BP"], [/^35/, "BR"], [/^36/, "BV"],
    [/^409/, "BX"], [/^41/, "BZ"], [/^486/, "CJ"], [/^481/, "IE"], [/^476/, "CO"], [/^4/, "CD"], [/^50/, "CF"], [/^5/, "CH"],
  ];
  return regles.find(([r]) => r.test(compte))?.[1] || "A_AUTRE";
}
function rubriquePassif(compte: string): string {
  const regles: [RegExp, string][] = [
    [/^10[1238]/, "DA"], [/^104/, "DB"], [/^105/, "DC"], [/^106[13]/, "DE"], [/^106[24]/, "DF"], [/^106/, "DG"], [/^11/, "DH"], [/^12/, "DI"],
    [/^13/, "DJ"], [/^14/, "DK"], [/^151/, "DM"], [/^15/, "DN"], [/^16/, "DP"], [/^1[78]/, "DR"], [/^404|^405/, "DW"], [/^40/, "DT"],
    [/^41/, "DS"], [/^4[234]/, "DV"], [/^45/, "DR"], [/^487/, "DY"], [/^477/, "EA"], [/^4/, "DX"], [/^5/, "DQ"],
  ];
  return regles.find(([r]) => r.test(compte))?.[1] || "P_AUTRE";
}
export function verifierAffectations(value: unknown): AffectationsAnnuelles {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length > 2000) throw new ErreurDocumentsComptables("Ventilation annuelle invalide.");
  const result: AffectationsAnnuelles = {};
  for (const [compte, code] of Object.entries(value)) {
    if (!/^[1-5][A-Z0-9]{1,14}$/.test(compte) || typeof code !== "string" || !actifIds.has(code) && !passifIds.has(code)) throw new ErreurDocumentsComptables("Compte ou rubrique annuelle invalide.");
    result[compte] = code;
  }
  return result;
}
export function construireEtatAnnuel(balance: BalanceCompte[], periode: Periode, affectations: AffectationsAnnuelles = {}) {
  verifierPeriode(periode); verifierAffectations(affectations);
  const actif: LigneActif[] = ACTIF.map(([code, libelle]) => ({ code, libelle, brut: 0, amortissements: 0, net: 0, comptes: [] }));
  const passif: LignePassif[] = PASSIF.map(([code, libelle]) => ({ code, libelle, net: 0, comptes: [] }));
  const avertissements: string[] = [], comptes = new Set<string>();
  const ventilation: { compte: string; libelle: string; code: string; solde: number; amortissement: boolean }[] = [];
  let equilibre = 0, charges = 0, produits = 0;
  for (const c of balance) {
    if (!/^[1-7][A-Z0-9]{1,14}$/.test(c.compte) || comptes.has(c.compte) || typeof c.libelle !== "string" || c.libelle.length > 1000 ||
      ![c.debit, c.credit, c.solde].every(n => Number.isSafeInteger(n) && Math.abs(n) <= 100_000_000_000) || c.debit - c.credit !== c.solde)
      throw new ErreurDocumentsComptables("Balance annuelle invalide ou compte en double.");
    comptes.add(c.compte); equilibre += c.solde;
    if (c.compte.startsWith("6")) { charges += c.solde; continue; }
    if (c.compte.startsWith("7")) { produits -= c.solde; continue; }
    if (!c.solde) continue;
    const amortissement = /^(28|29|39|49|59)/.test(c.compte);
    const base = amortissement ? c.compte[0] + c.compte.slice(2) : c.compte;
    const estActif = amortissement || /^109|^[23]/.test(c.compte) || /^[45]/.test(c.compte) && c.solde > 0;
    const code = affectations[c.compte] || (estActif ? rubriqueActif(base) : rubriquePassif(base));
    if (amortissement && !actifIds.has(code)) throw new ErreurDocumentsComptables(`Le compte correcteur ${c.compte} doit être rattaché à un poste d’actif.`);
    if (actifIds.has(code)) {
      const r = actif.find(r => r.code === code)!;
      if (amortissement) r.amortissements -= c.solde; else r.brut += c.solde;
      r.net = r.brut - r.amortissements; r.comptes.push(c.compte);
    } else { const r = passif.find(r => r.code === code)!; r.net -= c.solde; r.comptes.push(c.compte); }
    ventilation.push({ compte: c.compte, libelle: c.libelle, code, solde: c.solde, amortissement });
  }
  if (equilibre) throw new ErreurDocumentsComptables("La balance annuelle doit être équilibrée, classes 1 à 7 comprises.");
  const resultat = produits - charges;
  passif.find(r => r.code === "DI")!.net += resultat;
  if (balance.some(c => /^12/.test(c.compte) && c.solde) && (charges || produits)) avertissements.push("Les comptes 12 et les comptes de charges/produits coexistent : faire contrôler le report du résultat.");
  for (const r of actif) if (r.amortissements < 0 || r.net < 0 || r.amortissements > r.brut) avertissements.push(`${r.code} — ${r.libelle} : valeur brute ou amortissement à contrôler.`);
  if (ventilation.some(r => r.code.endsWith("AUTRE"))) avertissements.push("Des comptes restent dans les rubriques « à ventiler » : compléter leur affectation.");
  const brut = actif.reduce((s, r) => s + r.brut, 0), amortissements = actif.reduce((s, r) => s + r.amortissements, 0);
  const totalActif = brut - amortissements, totalPassif = passif.reduce((s, r) => s + r.net, 0);
  if (![brut, amortissements, totalActif, totalPassif, charges, produits].every(Number.isSafeInteger) || totalActif !== totalPassif) throw new ErreurDocumentsComptables("Les totaux annuels ne concordent pas.");
  const achats = balance.filter(c => /^60/.test(c.compte)).reduce((s, c) => s + c.solde, 0);
  const comptesAchats = balance.filter(c => /^60/.test(c.compte) && (c.debit || c.credit)).length;
  if (!comptesAchats) avertissements.push("Aucun compte d’achats 60 dans la source. Les dépenses de l’application ne sont pas ajoutées aux écritures importées.");
  return { periode, balance, actif, passif, brut, amortissements, totalActif, totalPassif, charges, produits, resultat, achats, comptesAchats, ventilation, avertissements };
}
export type EtatAnnuel = ReturnType<typeof construireEtatAnnuel>;
export function verifierComparatif(n: Periode, precedent: Periode) {
  verifierPeriode(n); verifierPeriode(precedent);
  if (precedent.fin >= n.debut) throw new ErreurDocumentsComptables("N-1 doit se terminer avant le début de N, sans chevauchement.");
  const veille = new Date(Date.parse(n.debut) - 86400000).toISOString().slice(0, 10);
  if (precedent.fin !== veille) throw new ErreurDocumentsComptables("La clôture N-1 doit correspondre à la veille de l’ouverture N ; sinon les soldes ne représentent pas les à-nouveaux de cet exercice.");
  const duree = (p: Periode) => Date.parse(p.fin) - Date.parse(p.debut);
  return Math.abs(duree(n) - duree(precedent)) > 86400000 * 2 ? ["Les durées de N et N-1 diffèrent : la comparaison n’est pas directement homogène."] : [];
}
export const ENTETE_BALANCE = "Compte;Libelle;Debit;Credit";
/** Balance complète N-1, mouvements cumulés ou soldes D/C. Ne crée pas de journal fictif. */
export function lireBalanceAnnuelle(texte: string): BalanceCompte[] {
  // Réutilise le lecteur CSV à guillemets, mais sans inventer une date ou une pièce.
  const rows: string[][] = []; let row: string[] = [], cell = "", quoted = false, closed = false;
  const push = () => { row.push(cell.trim()); cell = ""; closed = false; };
  const t = texte.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  if (t.length > 1_000_000) throw new ErreurDocumentsComptables("La balance N-1 doit faire moins de 1 Mo.");
  for (let i = 0; i <= t.length; i++) {
    const ch = i === t.length ? "\n" : t[i];
    if (quoted) { if (ch === '"' && t[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') { quoted = false; closed = true; } else cell += ch; }
    else if (ch === ";") push();
    else if (ch === "\n") { push(); if (row.some(Boolean)) rows.push(row); row = []; }
    else if (ch === '"' && !cell && !closed) quoted = true;
    else if (ch === '"' || closed && ch.trim()) throw new ErreurDocumentsComptables("Guillemets invalides dans la balance N-1.");
    else if (!closed) cell += ch;
  }
  if (quoted || rows.shift()?.join(";") !== ENTETE_BALANCE || !rows.length || rows.length > 2000) throw new ErreurDocumentsComptables("Utilisez le modèle de balance N-1, avec 1 à 2 000 comptes.");
  const montant = (v: string) => {
    const s = v.replace(/[ \u00a0\u202f]/g, "");
    if (!/^\d+(?:[,.]\d{1,2})?$/.test(s)) throw new ErreurDocumentsComptables("Balance N-1 : montants positifs avec deux décimales maximum, zéro explicite requis.");
    return Math.round(Number(s.replace(",", ".")) * 100);
  };
  return rows.map(r => {
    if (r.length !== 4) throw new ErreurDocumentsComptables("Balance N-1 : quatre colonnes attendues.");
    const debit = montant(r[2]), credit = montant(r[3]); return { compte: r[0], libelle: r[1], debit, credit, solde: debit - credit };
  });
}
