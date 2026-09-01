import assert from "node:assert/strict";
import {
  calculerResumeImpayes,
  filtrerImpayes,
  grouperImpayesParEvenement,
  listerImpayes,
  preparerMultiEncaissements,
  soldeRestant,
} from "../../src/app/admin/paiements/impayes-utils";

let passes = 0;
function test(nom: string, fn: () => void) {
  try {
    fn();
    passes++;
    console.log(`  ✅ ${nom}`);
  } catch (e: any) {
    console.error(`  ❌ ${nom}\n     ${e.message}`);
    process.exitCode = 1;
  }
}

const ts = (seconds: number) => ({ seconds });
const p = (overrides: Record<string, any> = {}) => ({
  id: "p1",
  familyId: "f1",
  familyName: "Martin",
  status: "pending",
  paymentMode: "cheque",
  totalTTC: 100,
  paidAmount: 20,
  items: [{ activityTitle: "Stage", childName: "Eliot", date: "2026-09-10" }],
  date: ts(100),
  ...overrides,
});

console.log("\n── Sélection des impayés ──");

test("le solde restant tient compte du déjà encaissé", () => {
  assert.equal(soldeRestant(p()), 80);
});

test("payés, annulés, SEPA et chèques différés sont exclus", () => {
  const result = listerImpayes([
    p({ id: "ok" }),
    p({ id: "paid", status: "paid" }),
    p({ id: "cancelled", status: "cancelled" }),
    p({ id: "sepa", paymentMode: "prelevement_sepa", status: "partial" }),
    p({ id: "diff", paymentMode: "cheque_differe" }),
  ], "2026-09-01");
  assert.deepEqual(result.map((x) => x.id), ["ok"]);
});

test("une échéance n'est impayée que si sa date est dépassée", () => {
  const result = listerImpayes([
    p({ id: "past", echeancesTotal: 3, echeanceDate: "2026-08-31" }),
    p({ id: "future", echeancesTotal: 3, echeanceDate: "2026-09-15" }),
  ], "2026-09-01");
  assert.deepEqual(result.map((x) => x.id), ["past"]);
});

console.log("\n── Filtres ──");

const unpaid = [
  p({ id: "a", familyId: "f1", familyName: "Martin", items: [{ activityTitle: "Stage", childName: "Eliot", date: "2026-09-10" }] }),
  p({ id: "b", familyId: "f2", familyName: "Durand", items: [{ activityTitle: "Balade", childName: "Ambre", date: "2026-09-11" }] }),
  p({ id: "c", familyId: "f2", familyName: "Durand", echeancesTotal: 3, echeanceDate: "2026-08-31", items: [{ activityTitle: "Forfait" }] }),
];

test("le filtre famille utilise l'identifiant et pas le nom", () => {
  assert.deepEqual(filtrerImpayes(unpaid, { familyFilter: "f1" }).map((x) => x.id), ["a"]);
});

test("le filtre type distingue facture et échéance", () => {
  assert.deepEqual(filtrerImpayes(unpaid, { typeFilter: "invoice" }).map((x) => x.id), ["a", "b"]);
  assert.deepEqual(filtrerImpayes(unpaid, { typeFilter: "echeance" }).map((x) => x.id), ["c"]);
});

test("la recherche couvre famille, activité et enfant", () => {
  assert.deepEqual(filtrerImpayes(unpaid, { search: "durand" }).map((x) => x.id), ["b", "c"]);
  assert.deepEqual(filtrerImpayes(unpaid, { search: "balade" }).map((x) => x.id), ["b"]);
  assert.deepEqual(filtrerImpayes(unpaid, { search: "eliot" }).map((x) => x.id), ["a"]);
});

console.log("\n── Totaux et regroupements ──");

test("le résumé calcule total global, total filtré et compteurs", () => {
  const result = calculerResumeImpayes(unpaid, [unpaid[0]]);
  assert.equal(result.totalDue, 240);
  assert.equal(result.totalFiltre, 80);
  assert.equal(result.nbInvoice, 2);
  assert.equal(result.nbEcheance, 1);
});

test("les commandes d'un même événement sont regroupées et triées par famille", () => {
  const groups = grouperImpayesParEvenement([
    p({ id: "d", familyName: "Zulu", items: [{ activityTitle: "Concours", date: "2026-09-20" }] }),
    p({ id: "e", familyName: "Alpha", items: [{ activityTitle: "Concours", date: "2026-09-20" }] }),
    p({ id: "f", familyName: "Orpheline", items: [], date: ts(999) }),
  ]);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].isOrphan, false);
  assert.deepEqual(groups[0].payments.map((x) => x.familyName), ["Alpha", "Zulu"]);
  assert.equal(groups[1].isOrphan, true);
});

test("les factures sans événement restent dans le groupe Autres factures", () => {
  const groups = grouperImpayesParEvenement([
    p({ id: "old", items: [], date: ts(100) }),
    p({ id: "new", items: [], date: ts(200) }),
  ]);
  assert.deepEqual(groups[0].payments.map((x) => x.id), ["new", "old"]);
});

console.log("\n── Encaissement groupé ──");

test("seules les familles avec au moins deux factures réglables sont proposées", () => {
  const result = preparerMultiEncaissements([
    p({ id: "m1", familyId: "f1", familyName: "Martin", totalTTC: 100, paidAmount: 0 }),
    p({ id: "m2", familyId: "f1", familyName: "Martin", totalTTC: 50, paidAmount: 10 }),
    p({ id: "m3", familyId: "f2", familyName: "Durand" }),
    p({ id: "m4", familyId: "f3", familyName: "Sepa", paymentMode: "prelevement_sepa" }),
    p({ id: "m5", familyId: "f3", familyName: "Sepa" }),
  ]);
  assert.equal(result.length, 1);
  assert.equal(result[0].familyId, "f1");
  assert.equal(result[0].total, 140);
});

console.log(`\n✅ ${passes} tests passés\n`);
