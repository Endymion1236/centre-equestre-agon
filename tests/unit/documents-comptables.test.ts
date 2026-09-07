import assert from "node:assert/strict";
import { test } from "node:test";
import { construireDocuments, lireJournalComptable, ENTETE_JOURNAL, MAX_LIGNES_DOCUMENTS, type Ecriture } from "../../src/lib/documents-comptables";
const periode = { debut: "2026-07-01", fin: "2026-08-31" };
const l = (journal: string, piece: string, date: string, compte: string, debit: number, credit: number): Ecriture => ({ journal, piece, date, compte, debit, credit, libelle: piece, libelleCompte: compte });
const lignes = [
  l("AN", "OUVERTURE", "2026-07-01", "51200000", 100000, 0), l("AN", "OUVERTURE", "2026-07-01", "10100000", 0, 100000),
  l("VTE", "F001", "2026-07-02", "41100000", 12000, 0), l("VTE", "F001", "2026-07-02", "70611400", 0, 10000), l("VTE", "F001", "2026-07-02", "44571000", 0, 2000),
  l("BNQ", "R001", "2026-07-03", "51200000", 12000, 0), l("BNQ", "R001", "2026-07-03", "41100000", 0, 12000),
  l("ACH", "A001", "2026-08-01", "60640000", 5000, 0), l("ACH", "A001", "2026-08-01", "44566000", 1000, 0), l("ACH", "A001", "2026-08-01", "401ARVAL", 0, 6000),
  l("BNQ", "P001", "2026-08-02", "401ARVAL", 6000, 0), l("BNQ", "P001", "2026-08-02", "51200000", 0, 6000),
];
const dossier = (rows = lignes) => construireDocuments([{ nom: "Journal complet", lignes: rows }], periode);
test("les cinq états partagent les totaux ; règlement sans doublement du chiffre d’affaires", () => {
  const d = dossier(); assert.equal(d.totalDebit, 136000); assert.equal(d.totalCredit, 136000);
  assert.equal(d.produits, 10000); assert.equal(d.charges, 5000); assert.equal(d.resultat, 5000);
  assert.equal(d.totalActif, 107000); assert.equal(d.totalPassif, 107000);
  assert.equal(d.balance.find(c => c.compte === "51200000")?.solde, 106000);
  assert.equal(d.balance.find(c => c.compte === "41100000")?.solde, 0);
  assert.equal(d.centralisateur.reduce((s, c) => s + c.debit, 0), d.totalDebit);
  assert.equal(d.centralisateur.reduce((s, c) => s + c.credit, 0), d.totalCredit);
  assert.equal(d.avertissements.some(a => a.startsWith("Aucun journal")), false);
});
test("une période mensuelle n’invente pas les soldes d’ouverture", () => {
  const d = construireDocuments([{ nom: "Exercice", lignes }], { debut: "2026-08-01", fin: "2026-08-31" });
  assert.equal(d.horsPeriode, 7); assert.equal(d.resultat, -5000);
  assert.ok(d.avertissements.some(a => a.startsWith("Aucun journal")));
  assert.equal(d.totalActif, d.totalPassif);
});
test("amortissement net, découvert et résultat négatif gardent un bilan équilibré", () => {
  const rows = [l("OD", "IMMO", "2026-07-01", "21830000", 10000, 0), l("OD", "IMMO", "2026-07-01", "51200000", 0, 10000),
    l("OD", "AMORT", "2026-07-31", "68112000", 2000, 0), l("OD", "AMORT", "2026-07-31", "28183000", 0, 2000)];
  const d = dossier(rows); assert.equal(d.totalActif, 8000); assert.equal(d.totalPassif, 8000); assert.equal(d.resultat, -2000);
  assert.equal(d.actif.find(c => c.compte === "28183000")?.montant, -2000);
  assert.equal(d.passif.find(c => c.compte === "51200000")?.montant, 10000);
});
test("pièce tronquée bloquée même si le total général semble équilibré", () => {
  assert.throws(() => dossier(lignes.slice(1)), /déséquilibrée/);
  assert.throws(() => dossier([l("VTE", "a", "2026-07-01", "411", 100, 0), l("VTE", "b", "2026-07-01", "706", 0, 100)]), /déséquilibrée/);
});
test("dates, montants non entiers, comptes et lignes ambiguës refusés", () => {
  for (const bad of [{ date: "2026-02-30" }, { debit: NaN }, { debit: 1.1 }, { credit: 1 }, { compte: "NON_VENTILE" }, { compte: "89100000" }, { piece: "" }])
    assert.throws(() => dossier([{ ...lignes[0], ...bad }, ...lignes.slice(1)]));
  assert.throws(() => construireDocuments([], { debut: "2026-08-01", fin: "2026-07-01" }), /chronologique/);
  assert.throws(() => construireDocuments([], { debut: "2024-01-01", fin: "2026-07-01" }), /18 mois/);
});
test("sources en double bloquées ; ordre de lecture sans effet sur les totaux", () => {
  const source = { nom: "a", lignes };
  assert.throws(() => construireDocuments([source, source], periode), /deux fois/);
  assert.throws(() => construireDocuments([source, { nom: "b", lignes }], periode), /plusieurs sources/);
  assert.deepEqual(dossier([...lignes].reverse()), dossier());
});
test("les avoirs négatifs inversent le côté sans perdre les centimes", () => {
  const d = dossier([l("VTE", "AVOIR", "2026-07-01", "411", -121, 0), l("VTE", "AVOIR", "2026-07-01", "706", 0, -101), l("VTE", "AVOIR", "2026-07-01", "44571", 0, -20)]);
  assert.equal(d.resultat, -101); assert.equal(d.totalDebit, 121); assert.equal(d.totalCredit, 121);
});
test("mois absents et jeu vide explicitement signalés ; aucun export tronqué", () => {
  const d = dossier(lignes.slice(0, 7)); assert.deepEqual(d.moisAbsents, ["2026-08"]);
  assert.throws(() => dossier([]), /Aucune écriture/);
  assert.throws(() => dossier(Array.from({ length: MAX_LIGNES_DOCUMENTS + 1 }, () => lignes[0])), /Aucun export partiel/);
});
test("CSV compatible Céleris et journal multimois, accents, guillemets et comptes fournisseurs", () => {
  const rows = lireJournalComptable(ENTETE_JOURNAL + '\nACH;401ARVAL;FA1;01-07-2026;0;1 200,01;"Achat; \\"équipement\\"";Arval\n'.replaceAll('\\"', '""') + 'ACH;60640000;FA1;2026-07-01;1200,01;0;"Équipement\nsecond libellé";Matériel\n');
  assert.equal(rows[0].credit, 120001); assert.equal(rows[0].compte, "401ARVAL"); assert.equal(rows[1].date, "2026-07-01");
  assert.equal(dossier(rows).totalDebit, 120001);
});
test("CSV mal formé ou montants ambigus bloqués", () => {
  for (const texte of ["mauvais en-tête", ENTETE_JOURNAL + '\n"non fermé', ENTETE_JOURNAL + '\nBNQ;512;a;2026-07-01;1,001;0;x;x', ENTETE_JOURNAL + '\nBNQ;512;a;2026-07-01;10oops;0;x;x'])
    assert.throws(() => lireJournalComptable(texte));
});
