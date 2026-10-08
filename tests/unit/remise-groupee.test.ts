/**
 * tests/unit/remise-groupee.test.ts — remise en % sur plusieurs commandes encaissées ensemble.
 *   npx tsx tests/unit/remise-groupee.test.ts
 */
import assert from "node:assert/strict";
import { lignesRemisees, planRemiseGroupee, pourcentageRemise } from "../../src/app/admin/paiements/remise-groupee";

let passes = 0;
function test(nom: string, fn: () => void) {
  try { fn(); passes++; console.log(`  ✅ ${nom}`); }
  catch (e: any) { console.error(`  ❌ ${nom}\n     ${e.message}`); process.exitCode = 1; }
}

const cmdA = { id: "A", items: [{ activityTitle: "Engagement — Cadet 2 paire", priceTTC: 30, tva: 5.5 }, { activityTitle: "Coaching", priceTTC: 15, tva: 5.5 }], totalTTC: 45 };
const cmdB = { id: "B", items: [{ activityTitle: "Engagement — Poussin 2 paire", priceTTC: 51, tva: 5.5 }], totalTTC: 51 };

test("10 % sur deux commandes : 96 € → 86,40 €", () => {
  const plan = planRemiseGroupee([cmdA, cmdB], 10);
  assert.deepEqual(plan.remisees.map((r) => [r.id, r.totalTTC]), [["A", 40.5], ["B", 45.9]]);
  assert.equal(plan.remiseTotale, 9.6);
  assert.equal(plan.exclues.length, 0);
});

test("lignes au prorata, somme exacte, prix d'origine et motif gardés", () => {
  const r = lignesRemisees([{ priceTTC: 10, tva: 5.5 }, { priceTTC: 10, tva: 5.5 }, { priceTTC: 10.01, tva: 0 }], 15);
  const somme = Math.round(r.items.reduce((s, i) => s + i.priceTTC * 100, 0));
  assert.equal(somme, Math.round(r.totalTTC * 100));
  assert.equal(r.totalTTC, 25.51);
  assert.equal(r.items[2].originalPriceTTC, 10.01);
  assert.equal(r.items[2].priceHT, r.items[2].priceTTC, "TVA 0 % gardée");
  assert.deepEqual(r.items[0].discountReasons, ["Remise globale 15 %"]);
});

test("facture émise ou acompte reçu : commande laissée telle quelle", () => {
  const plan = planRemiseGroupee([cmdA, { ...cmdB, invoiceNumber: "F-2026-0300" }, { id: "C", items: [{ priceTTC: 20 }], paidAmount: 5 }], 10);
  assert.deepEqual(plan.remisees.map((r) => r.id), ["A"]);
  assert.deepEqual(plan.exclues, [{ id: "B", motif: "facture F-2026-0300 déjà émise" }, { id: "C", motif: "un règlement a déjà été reçu" }]);
});

test("une ligne de remise existante n'est pas remisée une seconde fois", () => {
  const r = lignesRemisees([{ priceTTC: 100, tva: 5.5 }, { activityTitle: "Remise fratrie", priceTTC: -10, tva: 5.5 }], 10);
  assert.equal(r.totalTTC, 81);
  assert.equal(r.items[1].priceTTC, -10);
});

test("pourcentage saisi", () => {
  assert.equal(pourcentageRemise("10"), 10);
  assert.equal(pourcentageRemise("7,5"), 7.5);
  assert.equal(pourcentageRemise(""), null);
  assert.equal(pourcentageRemise("0"), null);
  assert.equal(pourcentageRemise("150"), 100);
});

console.log(`\n${process.exitCode ? "❌" : "✅"} ${passes} tests passés`);
