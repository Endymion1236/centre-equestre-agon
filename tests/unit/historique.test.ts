import assert from "node:assert/strict";
import {
  calculerTotauxHistorique,
  creerAvoirsOrphelins,
  filtrerHistorique,
  timestampMillis,
  trierHistorique,
} from "../../src/app/admin/paiements/historique-utils";

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
  { id: "p-paid", familyId: "f1", familyName: "Martin", status: "paid", paymentMode: "cheque", totalTTC: 50, date: ts(100), items: [{ activityTitle: "Stage" }], invoiceNumber: "F-2026-002" },
  { id: "p-pending", familyId: "f1", familyName: "Martin", status: "pending", paymentMode: "virement", totalTTC: 70, date: ts(200), items: [{ activityTitle: "Promenade" }] },
  { id: "p-invoice", familyId: "f2", familyName: "Durand", status: "pending", paymentMode: "cb_terminal", totalTTC: 80, date: ts(300), items: [{ activityTitle: "Cours" }], invoiceNumber: "F-2026-003" },
  { id: "p-partial", familyId: "f3", familyName: "Robert", status: "partial", paymentMode: "cheque", totalTTC: 30, date: ts(400), items: [{ activityTitle: "Baby poney" }], invoiceNumber: "F-2026-001" },
];

const encaissements = [
  { id: "e1", paymentId: "p-paid", mode: "cheque", montant: 50, createdAt: ts(500), date: ts(100) },
  { id: "e2", paymentId: "p-partial", mode: "cheque", montant: 15, createdAt: ts(450), date: ts(400) },
  { id: "av1", paymentId: "disparu", familyId: "f4", familyName: "Petit", mode: "avoir", montant: 12, date: ts(350), activityTitle: "Avoir utilisé" },
];

console.log("\n── Horodatages ──");

test("timestampMillis lit les timestamps Firestore", () => {
  assert.equal(timestampMillis({ seconds: 12, nanoseconds: 500_000_000 }), 12_500);
});

console.log("\n── Avoirs orphelins ──");

test("un encaissement avoir sans paiement lié devient une ligne d'historique", () => {
  const avoirs = creerAvoirsOrphelins(payments, encaissements);
  assert.equal(avoirs.length, 1);
  assert.equal(avoirs[0].id, "av1");
  assert.equal(avoirs[0]._fromEncaissement, true);
  assert.equal(avoirs[0].paymentMode, "avoir");
});

console.log("\n── Filtres ──");

test("les proformas pending sans numéro de facture sont exclues", () => {
  const result = filtrerHistorique(payments, encaissements, { sortBy: "commande" });
  assert.equal(result.some((p) => p.id === "p-pending"), false);
  assert.equal(result.some((p) => p.id === "p-invoice"), true);
});

test("le filtre famille cible uniquement l'identifiant demandé", () => {
  const result = filtrerHistorique(payments, encaissements, { familyId: "f1", sortBy: "commande" });
  assert.deepEqual(result.map((p) => p.id), ["p-paid"]);
});

test("la recherche couvre famille et prestation", () => {
  const byFamily = filtrerHistorique(payments, encaissements, { search: "durand", sortBy: "commande" });
  assert.deepEqual(byFamily.map((p) => p.id), ["p-invoice"]);
  const byActivity = filtrerHistorique(payments, encaissements, { search: "baby", sortBy: "commande" });
  assert.deepEqual(byActivity.map((p) => p.id), ["p-partial"]);
});

test("mode et statut se combinent", () => {
  const result = filtrerHistorique(payments, encaissements, { mode: "cheque", status: "partial", sortBy: "commande" });
  assert.deepEqual(result.map((p) => p.id), ["p-partial"]);
});

console.log("\n── Tri ──");

test("le tri commande suit la date fiscale", () => {
  const result = trierHistorique([payments[0], payments[3]], encaissements, "commande");
  assert.deepEqual(result.map((p) => p.id), ["p-partial", "p-paid"]);
});

test("le tri encaissement suit le dernier encaissement reçu", () => {
  const result = trierHistorique([payments[0], payments[3]], encaissements, "encaissement");
  assert.deepEqual(result.map((p) => p.id), ["p-paid", "p-partial"]);
});

test("le tri facture privilégie les numéros F- et les trie en descendant", () => {
  const result = trierHistorique([payments[0], payments[2], payments[3]], encaissements, "facture");
  assert.deepEqual(result.map((p) => p.id), ["p-invoice", "p-paid", "p-partial"]);
});

console.log("\n── Totaux ──");

test("les totaux par mode et le total général sont calculés sur la sélection", () => {
  const result = calculerTotauxHistorique([payments[0], payments[3]]);
  assert.deepEqual(result.totalsByMode, { cheque: 80 });
  assert.equal(result.grandTotal, 80);
});

console.log(`\n✅ ${passes} tests passés\n`);
