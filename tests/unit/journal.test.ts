import assert from "node:assert/strict";
import {
  calculerTotauxJournal,
  creerLignesJournalFallback,
  filtrerJournal,
  journalTimestamp,
} from "../../src/app/admin/paiements/journal-utils";

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

const ts = (seconds: number) => ({ seconds, nanoseconds: 0 });
const payments = [
  { id: "p1", familyId: "f1", familyName: "Martin", status: "paid", paidAmount: 50, totalTTC: 50, paymentMode: "cheque", paymentRef: "CH-1", date: ts(100), items: [{ activityTitle: "Stage" }] },
  { id: "p2", familyId: "f2", familyName: "Durand", status: "partial", paidAmount: 20, totalTTC: 40, paymentMode: "virement", paymentRef: "VIR-2", date: ts(200), items: [{ activityTitle: "Promenade" }] },
  { id: "p3", familyId: "f3", familyName: "Robert", status: "cancelled", paidAmount: 30, totalTTC: 30, paymentMode: "cb_terminal", date: ts(300), items: [] },
];
const encaissements = [
  { id: "e2", paymentId: "p2", familyName: "Durand", montant: 20, mode: "virement", ref: "VIR-2", activityTitle: "Promenade", date: ts(220), createdAt: ts(250) },
];

console.log("\n── Fallback journal ──");

test("un paiement encaissé sans ligne d'encaissement reçoit une ligne fallback", () => {
  const fallback = creerLignesJournalFallback(payments, encaissements);
  assert.deepEqual(fallback.map((line) => line.id), ["fallback_p1"]);
  assert.equal(fallback[0].montant, 50);
  assert.equal(fallback[0].modeLabel, "Chèque");
});

test("un paiement déjà représenté par un encaissement n'est pas dupliqué", () => {
  const fallback = creerLignesJournalFallback(payments, encaissements);
  assert.equal(fallback.some((line) => line.paymentId === "p2"), false);
});

console.log("\n── Tri et filtres ──");

test("createdAt prime sur date pour l'ordre du journal", () => {
  assert.equal(journalTimestamp(encaissements[0]), 250_000);
});

test("le journal filtre par mode, recherche et montant", () => {
  const lines = [
    ...encaissements,
    ...creerLignesJournalFallback(payments, encaissements),
  ];
  assert.deepEqual(filtrerJournal(lines, { mode: "cheque" }).map((line) => line.id), ["fallback_p1"]);
  assert.deepEqual(filtrerJournal(lines, { search: "promenade" }).map((line) => line.id), ["e2"]);
  assert.deepEqual(filtrerJournal(lines, { montantMin: "30" }).map((line) => line.id), ["fallback_p1"]);
});

test("les lignes sont triées de la plus récente à la plus ancienne", () => {
  const lines = [
    ...encaissements,
    ...creerLignesJournalFallback(payments, encaissements),
  ];
  assert.deepEqual(filtrerJournal(lines, {}).map((line) => line.id), ["e2", "fallback_p1"]);
});

console.log("\n── Totaux ──");

test("les totaux sont ventilés par mode", () => {
  const result = calculerTotauxJournal([
    { mode: "cheque", montant: 50 },
    { mode: "cheque", montant: -10 },
    { mode: "virement", montant: 20 },
  ]);
  assert.deepEqual(result.totalsByMode, { cheque: 40, virement: 20 });
  assert.equal(result.grandTotal, 60);
});

console.log(`\n✅ ${passes} tests passés\n`);
