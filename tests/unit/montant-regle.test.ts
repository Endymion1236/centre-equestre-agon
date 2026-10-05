/**
 * tests/unit/montant-regle.test.ts — une commande non réglée n'est jamais « réglée » sur la facture.
 *   npx tsx tests/unit/montant-regle.test.ts
 */
import assert from "node:assert/strict";
import { montantRegle } from "../../src/lib/montant-regle";

let passes = 0;
function test(nom: string, fn: () => void) {
  try { fn(); passes++; console.log(`  ✅ ${nom}`); }
  catch (e: any) { console.error(`  ❌ ${nom}\n     ${e.message}`); process.exitCode = 1; }
}

test("commande à régler, rien encaissé : 0 € (pas le total — facture Buidine 180 €)", () => {
  assert.equal(montantRegle({ status: "pending", paidAmount: 0, totalTTC: 180 }), 0);
  assert.equal(montantRegle({ status: "pending", totalTTC: 180 }), 0);
});
test("paiement partiel : le montant encaissé", () => {
  assert.equal(montantRegle({ status: "partial", paidAmount: 30, totalTTC: 180 }), 30);
});
test("commande réglée : son montant payé, ou son total si l'ancien enregistrement ne le notait pas", () => {
  assert.equal(montantRegle({ status: "paid", paidAmount: 180, totalTTC: 180 }), 180);
  assert.equal(montantRegle({ status: "paid", totalTTC: 180 }), 180);
});

console.log(`\n${process.exitCode ? "❌" : "✅"} ${passes} tests passés`);
