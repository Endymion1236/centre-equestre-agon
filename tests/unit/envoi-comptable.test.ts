/**
 * tests/unit/envoi-comptable.test.ts
 *
 * Le colis mensuel pour la comptable : quelles factures et écritures entrent
 * dans le mois, ce que contiennent les pièces jointes, et le résumé du mail.
 *   npx tsx tests/unit/envoi-comptable.test.ts
 */
import assert from "node:assert/strict";
import {
  construireColisComptable,
  corpsEmailComptable,
  facturesDuMois,
  moisParisDeSecondes,
} from "../../src/lib/envoi-comptable-utils";
import {
  construireExportDepenses,
  construireExportEncaissements,
  construireExportFactures,
} from "../../src/app/admin/comptabilite/exports-csv-utils";

let passes = 0;
function test(nom: string, fn: () => void) {
  try { fn(); passes++; console.log(`  ✅ ${nom}`); }
  catch (e: any) { console.error(`  ❌ ${nom}\n     ${e.message}`); process.exitCode = 1; }
}

const sec = (iso: string) => Math.floor(new Date(iso).getTime() / 1000);

console.log("\n── Mois en heure de Paris ──");
test("le 31 août à 23h30 heure de Paris reste en août", () => {
  // 21:30 UTC = 23:30 à Paris (été)
  assert.equal(moisParisDeSecondes(sec("2026-08-31T21:30:00Z")), "2026-08");
  // 22:30 UTC = 00:30 le 1er septembre à Paris
  assert.equal(moisParisDeSecondes(sec("2026-08-31T22:30:00Z")), "2026-09");
  assert.equal(moisParisDeSecondes(undefined), null);
});

const payments = [
  { id: "f1", invoiceNumber: "F-2026-0101", familyName: "Enaux", status: "paid", paymentMode: "virement", totalTTC: 300, paidAmount: 300,
    date: { seconds: sec("2026-09-01T10:00:00Z") }, items: [{ activityTitle: "Pension Dalhia", priceHT: 250, priceTTC: 300, tva: 20 }] },
  { id: "f2", familyName: "Martin", status: "pending", totalTTC: 57, paidAmount: 0,
    date: { seconds: sec("2026-09-03T10:00:00Z") }, items: [{ activityTitle: "Cours", priceHT: 54.03, priceTTC: 57, tva: 5.5 }] },
  { id: "f3", invoiceNumber: "F-2026-0090", familyName: "Durand", status: "paid", paymentMode: "cheque", totalTTC: 114, paidAmount: 114,
    date: { seconds: sec("2026-08-20T10:00:00Z") }, items: [{ activityTitle: "Stage", priceHT: 108.06, priceTTC: 114, tva: 5.5 }] },
  { id: "f4", familyName: "Annulée", status: "cancelled", totalTTC: 10, date: { seconds: sec("2026-09-10T10:00:00Z") }, items: [] },
];
const encaissements = [
  { id: "e1", paymentId: "f1", familyName: "Enaux", montant: 300, mode: "virement", modeLabel: "Virement", ref: "Virement reçu le 01/09/2026", activityTitle: "Pension Dalhia", date: { seconds: sec("2026-09-01T10:00:00Z") }, hash: "abcdef1234567890" },
  { id: "e2", paymentId: "f3", familyName: "Durand", montant: 114, mode: "cheque", date: { seconds: sec("2026-08-20T10:00:00Z") } },
  { id: "e3", paymentId: "f1", familyName: "Enaux", montant: -50, mode: "virement", raison: "Contre-passation", correctionDe: "e1", date: { seconds: sec("2026-09-15T10:00:00Z") } },
];
const depenses = [
  { mois: "2026-09", date: "2026-09-12", poste: "Alimentation chevaux", fournisseur: "Coopérative", montant: 420.5, note: "foin; 2 bottes" },
  { mois: "2026-08", date: "2026-08-02", poste: "Vétérinaire", fournisseur: "Dr X", montant: 90 },
];

console.log("\n── Périmètre du mois ──");
test("les factures du mois excluent les annulées et les en attente", () => {
  assert.deepEqual(facturesDuMois(payments, "2026-09").map((p) => p.id), ["f1"]);
});

const colis = construireColisComptable({ mois: "2026-09", payments, encaissements, depenses, maintenant: new Date("2026-10-02T08:00:00Z") });

test("le résumé compte ce qui part", () => {
  assert.deepEqual(colis.resume, {
    nbFactures: 1, totalTTC: 300, totalHT: 250,
    nbEncaissements: 2, totalEncaisse: 250,
    nbDepenses: 1, totalDepenses: 420.5,
  });
});

test("cinq pièces sont préparées, nommées par mois, CSV avec BOM", () => {
  assert.deepEqual(colis.pieces.map((p) => p.filename), [
    "factures_2026-09.csv", "ventes_2026-09.csv", "encaissements_2026-09.csv", "depenses_2026-09.csv", "FEC_202609.txt",
  ]);
  for (const p of colis.pieces.filter((x) => x.filename.endsWith(".csv"))) {
    assert.ok(p.contenu.startsWith("﻿"), `${p.filename} doit commencer par le BOM UTF-8`);
  }
});

console.log("\n── Contenu des exports ──");
test("l'export des factures porte le numéro, les montants et le reste dû", () => {
  const csv = construireExportFactures(colis.factures);
  assert.equal(csv.split("\n")[0], "N° facture;Date;Client;Prestations;HT;TVA;TTC;Réglé;Reste dû;Statut;Mode");
  assert.equal(csv.split("\n")[1], "F-2026-0101;01/09/2026;Enaux;Pension Dalhia;250.00;50.00;300.00;300.00;0.00;paid;virement");
});

test("le journal des encaissements garde la contre-passation et l'empreinte", () => {
  const lignes = construireExportEncaissements(colis.encaissements).split("\n");
  assert.equal(lignes[1], "01/09/2026;Enaux;Pension Dalhia;300.00;Virement;Virement reçu le 01/09/2026;f1;;;abcdef123456");
  assert.equal(lignes[2], "15/09/2026;Enaux;;-50.00;virement;;f1;Contre-passation;e1;");
});

test("les dépenses : un champ avec point-virgule est mis entre guillemets", () => {
  const lignes = construireExportDepenses(colis.depenses).split("\n");
  assert.equal(lignes[1], '2026-09;12/09/2026;Alimentation chevaux;Coopérative;420.50;"foin; 2 bottes"');
});

test("le FEC ne contient que les factures du mois", () => {
  const fec = colis.pieces.find((p) => p.filename === "FEC_202609.txt")!.contenu;
  assert.match(fec, /Enaux/);
  assert.doesNotMatch(fec, /Durand/);
});

console.log("\n── Email ──");
test("le corps du mail résume et liste les pièces, sans HTML injecté", () => {
  const html = corpsEmailComptable({ mois: "2026-09", resume: colis.resume, pieces: ["factures_2026-09.csv"], nomCentre: "CE Agon", message: "<b>attention</b>" });
  assert.match(html, /septembre 2026/);
  assert.match(html, /factures_2026-09\.csv/);
  assert.match(html, /&lt;b&gt;attention/);
  assert.doesNotMatch(html, /<b>attention/);
});

console.log(`\n✅ ${passes} tests passés\n`);
