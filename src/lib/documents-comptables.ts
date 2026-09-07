/** Un seul jeu d'écritures pour les cinq états. Tous les montants sont en centimes. */
import type { EcritureCeleris } from "./import-comptable-celeris";

export class ErreurDocumentsComptables extends Error {}
export type Ecriture = EcritureCeleris;
export type Periode = { debut: string; fin: string };
export type SourceComptable = { nom: string; lignes: Ecriture[] };
export type BalanceCompte = { compte: string; libelle: string; debit: number; credit: number; solde: number };
export const DOCUMENTS_COMPTABLES = {
  journal: "Journal classique", "grand-livre": "Grand livre", balance: "Balance générale",
  centralisateur: "Centralisateur par mois", bilan: "Bilan préparatoire",
} as const;
export type TypeDocumentComptable = keyof typeof DOCUMENTS_COMPTABLES;
export const MAX_LIGNES_DOCUMENTS = 200_000;
export const ENTETE_JOURNAL = "Journal;N compte;N piece;Date ope;Debit;Credit;Libele ecriture;Libele compte";

function dateValide(date: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date;
}
export function verifierPeriode(periode: Periode) {
  if (!dateValide(periode.debut) || !dateValide(periode.fin) || periode.debut > periode.fin)
    throw new ErreurDocumentsComptables("Choisissez des dates valides, dans l’ordre chronologique.");
  if ((Date.parse(periode.fin) - Date.parse(periode.debut)) / 86400000 > 550)
    throw new ErreurDocumentsComptables("Sélectionnez au maximum 18 mois pour un même exercice.");
}
function somme(a: number, b: number) {
  const n = a + b;
  if (!Number.isSafeInteger(n)) throw new ErreurDocumentsComptables("Total hors limite de calcul.");
  return n;
}
function montant(value: string) {
  const v = value.replace(/[ \u00a0\u202f]/g, "");
  if (!/^-?\d+(?:[,.]\d{1,2})?$/.test(v)) throw new ErreurDocumentsComptables("Montant invalide : deux décimales maximum.");
  const cents = Math.round(Number(v.replace(",", ".")) * 100);
  if (!Number.isSafeInteger(cents) || Math.abs(cents) > 1_000_000_000) throw new ErreurDocumentsComptables("Montant hors limite.");
  return cents;
}
/** CSV ; avec guillemets et retours à la ligne dans les libellés. Aucun montant flottant conservé. */
export function lireJournalComptable(texte: string): Ecriture[] {
  if (texte.length > 4_000_000) throw new ErreurDocumentsComptables("Fichier de 4 Mo maximum attendu.");
  const rows: string[][] = []; let row: string[] = [], cell = "", quoted = false, closed = false;
  const pushCell = () => { row.push(cell.trim()); cell = ""; closed = false; };
  const pushRow = () => { pushCell(); if (row.some(Boolean)) rows.push(row); row = []; };
  const t = texte.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (quoted) {
      if (c === '"' && t[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') { quoted = false; closed = true; }
      else cell += c;
    } else if (c === ";") pushCell();
    else if (c === "\n") pushRow();
    else if (c === '"' && !cell && !closed) quoted = true;
    else if (c === '"' || closed && c.trim()) throw new ErreurDocumentsComptables("Guillemets CSV invalides.");
    else if (!closed) cell += c;
    if (rows.length > MAX_LIGNES_DOCUMENTS + 1) throw new ErreurDocumentsComptables(`Maximum ${MAX_LIGNES_DOCUMENTS} lignes par export. Aucun export partiel n’est produit.`);
  }
  if (quoted) throw new ErreurDocumentsComptables("Guillemets CSV non fermés.");
  pushRow();
  if (rows.shift()?.join(";") !== ENTETE_JOURNAL) throw new ErreurDocumentsComptables("En-tête non reconnu : utilisez le modèle d’écritures.");
  if (!rows.length || rows.length > MAX_LIGNES_DOCUMENTS) throw new ErreurDocumentsComptables(`Entre 1 et ${MAX_LIGNES_DOCUMENTS} lignes attendues.`);
  return rows.map((r, i) => {
    if (r.length !== 8) throw new ErreurDocumentsComptables(`Ligne ${i + 2} : huit colonnes attendues.`);
    const [journal, compte, piece, brute, d, c, libelle, libelleCompte] = r;
    const date = /^\d{2}-\d{2}-\d{4}$/.test(brute) ? brute.split("-").reverse().join("-") : brute;
    try { return { journal, compte, piece, date, debit: montant(d), credit: montant(c), libelle, libelleCompte }; }
    catch (e) { throw new ErreurDocumentsComptables(`Ligne ${i + 2} : ${(e as Error).message}`); }
  });
}

export function construireDocuments(sources: SourceComptable[], periode: Periode) {
  verifierPeriode(periode);
  const lignes: Ecriture[] = [], noms = new Set<string>(), piecesSources = new Map<string, string>();
  let horsPeriode = 0;
  for (const source of sources) {
    if (!source.nom || noms.has(source.nom) || !Array.isArray(source.lignes)) throw new ErreurDocumentsComptables("Source absente ou chargée deux fois.");
    noms.add(source.nom);
    const groupes = new Map<string, number>();
    for (const brute of source.lignes) {
      if (!brute || !dateValide(brute.date) || !/^[A-Z0-9]{1,12}$/.test(brute.journal) ||
        !/^[1-7][A-Z0-9]{1,14}$/.test(brute.compte) || typeof brute.piece !== "string" || !brute.piece.trim() || brute.piece.length > 80 ||
        typeof brute.libelle !== "string" || brute.libelle.length > 1000 || typeof brute.libelleCompte !== "string" || brute.libelleCompte.length > 1000 ||
        ![brute.debit, brute.credit].every(n => Number.isSafeInteger(n) && Math.abs(n) <= 1_000_000_000))
        throw new ErreurDocumentsComptables(`Écriture invalide dans ${source.nom} : date, compte (classes 1 à 7), référence ou montant à vérifier.`);
      if (brute.debit && brute.credit) throw new ErreurDocumentsComptables(`Pièce ${brute.piece} : une ligne ne peut pas porter un débit et un crédit simultanément.`);
      // Les contrepassations négatives sont conservées, en inversant le côté de la ligne.
      const l = { ...brute, debit: Math.max(0, brute.debit) + Math.max(0, -brute.credit), credit: Math.max(0, brute.credit) + Math.max(0, -brute.debit) };
      const cle = JSON.stringify([l.journal, l.piece, l.date]);
      groupes.set(cle, somme(groupes.get(cle) || 0, l.debit - l.credit));
      if (l.date < periode.debut || l.date > periode.fin) { horsPeriode++; continue; }
      const precedente = piecesSources.get(cle);
      if (precedente && precedente !== source.nom) throw new ErreurDocumentsComptables(`Pièce ${l.piece} présente dans plusieurs sources : sélectionnez un seul export complet.`);
      piecesSources.set(cle, source.nom);
      lignes.push(l);
      if (lignes.length > MAX_LIGNES_DOCUMENTS) throw new ErreurDocumentsComptables(`Plus de ${MAX_LIGNES_DOCUMENTS} lignes : le volume maximal est dépassé. Aucun export partiel n’est produit.`);
    }
    for (const [cle, ecart] of groupes) if (ecart) throw new ErreurDocumentsComptables(`Écriture déséquilibrée dans ${source.nom} : ${JSON.parse(cle).join(" / ")} (écart ${ecart} centimes).`);
  }
  if (!lignes.length) throw new ErreurDocumentsComptables("Aucune écriture comptable dans cette période. Importez un journal ou choisissez une autre période.");
  lignes.sort((a, b) => a.date.localeCompare(b.date) || a.journal.localeCompare(b.journal) || a.piece.localeCompare(b.piece) || a.compte.localeCompare(b.compte));
  const comptes = new Map<string, BalanceCompte>();
  const central = new Map<string, { mois: string; journal: string; debit: number; credit: number; lignes: number }>();
  for (const l of lignes) {
    const c = comptes.get(l.compte) || { compte: l.compte, libelle: l.libelleCompte, debit: 0, credit: 0, solde: 0 };
    c.debit = somme(c.debit, l.debit); c.credit = somme(c.credit, l.credit); c.solde = c.debit - c.credit; comptes.set(l.compte, c);
    const cle = `${l.date.slice(0, 7)} / ${l.journal}`;
    const m = central.get(cle) || { mois: l.date.slice(0, 7), journal: l.journal, debit: 0, credit: 0, lignes: 0 };
    m.debit = somme(m.debit, l.debit); m.credit = somme(m.credit, l.credit); m.lignes++; central.set(cle, m);
  }
  const balance = [...comptes.values()].sort((a, b) => a.compte.localeCompare(b.compte));
  const totalDebit = balance.reduce((s, c) => somme(s, c.debit), 0), totalCredit = balance.reduce((s, c) => somme(s, c.credit), 0);
  const charges = balance.filter(c => c.compte.startsWith("6")).reduce((s, c) => somme(s, c.solde), 0);
  const produits = balance.filter(c => c.compte.startsWith("7")).reduce((s, c) => somme(s, -c.solde), 0);
  const resultat = produits - charges;
  const actif: { compte: string; libelle: string; montant: number }[] = [], passif: typeof actif = [];
  for (const c of balance.filter(c => /^[1-5]/.test(c.compte) && c.solde)) {
    if (c.compte.startsWith("1")) passif.push({ ...c, montant: -c.solde });
    else if (/^[23]/.test(c.compte) || c.solde > 0) actif.push({ ...c, montant: c.solde });
    else passif.push({ ...c, montant: -c.solde });
  }
  passif.push({ compte: "RESULTAT", libelle: "Résultat des comptes 6 et 7 sur la période", montant: resultat });
  const totalActif = actif.reduce((s, c) => somme(s, c.montant), 0), totalPassif = passif.reduce((s, c) => somme(s, c.montant), 0);
  if (totalDebit !== totalCredit || totalActif !== totalPassif) throw new ErreurDocumentsComptables("Les états ne concordent pas. Export interrompu.");
  const moisPresents = [...new Set(lignes.map(l => l.date.slice(0, 7)))].sort();
  const moisAbsents: string[] = [];
  for (let d = new Date(periode.debut.slice(0, 7) + "-01T00:00:00Z"); d.toISOString().slice(0, 7) <= periode.fin.slice(0, 7); d.setUTCMonth(d.getUTCMonth() + 1)) {
    const m = d.toISOString().slice(0, 7); if (!moisPresents.includes(m)) moisAbsents.push(m);
  }
  const avertissements = [
    "Document préparatoire : seule la source indiquée est reprise. L’équilibre débit/crédit ne garantit pas l’exhaustivité des comptes.",
    "Les dépenses, justificatifs, propositions de comptes et encaissements de l’application ne sont pas ajoutés automatiquement à ce journal.",
    "Faire vérifier les à-nouveaux, amortissements, stocks, TVA, factures non réglées et écritures de clôture avant validation des comptes annuels.",
  ];
  if (!balance.some(c => c.compte.startsWith("6"))) avertissements.unshift("SOURCE PARTIELLE : aucun compte de charge (classe 6). Le solde produits moins charges ne représente pas le bénéfice de l’exploitation. Importer un journal complet comprenant les achats et les autres charges.");
  else if (!balance.some(c => c.compte.startsWith("60"))) avertissements.unshift("Aucun compte d’achats 60 dans la source : vérifier que le journal d’achats a été inclus.");
  if (!lignes.some(l => ["AN", "ANO", "RAN"].includes(l.journal))) avertissements.push("Aucun journal d’à-nouveaux AN / ANO / RAN repéré : les soldes de départ ne sont pas attestés.");
  if (moisAbsents.length) avertissements.push(`Mois sans écriture dans la sélection : ${moisAbsents.join(", ")}.`);
  if (horsPeriode) avertissements.push(`${horsPeriode} ligne(s) de la source hors période, non reprises dans ces états.`);
  if (!balance.some(c => /^[256]/.test(c.compte))) avertissements.push("Aucune immobilisation, trésorerie ou charge repérée : cet export peut ne contenir que des ventes.");
  return { periode, sources: [...noms], lignes, balance, centralisateur: [...central.values()], totalDebit, totalCredit,
    charges, produits, resultat, actif, passif, totalActif, totalPassif, moisPresents, moisAbsents, horsPeriode, avertissements, perimetrePartiel: !balance.some(c => c.compte.startsWith("6")) };
}
export type DossierComptable = ReturnType<typeof construireDocuments>;
