import assert from "node:assert/strict";
import {
  construireEcheancier,
  datesEcheances,
  nombreEcheances,
} from "../../src/lib/echeancier-paiement";

assert.equal(nombreEcheances("1x"), 1);
assert.equal(nombreEcheances("3x"), 3);
assert.equal(nombreEcheances("10x"), 10);

const dix = construireEcheancier({
  totalTTC: 699,
  paymentPlan: "10x",
  dateDepart: "2026-09-02",
  items: [
    { childId: "leana", activityTitle: "Adhésion", priceTTC: 60, tva: 5.5 },
    { childId: "leana", activityTitle: "Licence", priceTTC: 25, tva: 5.5 },
    { childId: "leana", activityTitle: "Forfait", priceTTC: 614, tva: 5.5 },
  ],
});

assert.equal(dix.length, 10);
assert.deepEqual(dix.map((e) => e.totalTTC), Array.from({ length: 10 }, () => 69.9));
assert.equal(Math.round(dix.reduce((s, e) => s + e.totalTTC, 0) * 100), 69_900);
assert.deepEqual(dix.map((e) => e.echeance), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
assert.ok(dix.every((e) => e.echeancesTotal === 10));
assert.ok(dix.every((e) => Math.abs(e.items.reduce((s, item) => s + Number(item.priceTTC), 0) - e.totalTTC) < 0.001));

const trois = construireEcheancier({
  totalTTC: 100,
  paymentPlan: "3x",
  dateDepart: "2026-01-31",
  items: [{ activityTitle: "Forfait", priceTTC: 100 }],
});
assert.deepEqual(trois.map((e) => e.totalTTC), [33.34, 33.33, 33.33]);
assert.equal(Math.round(trois.reduce((s, e) => s + e.totalTTC, 0) * 100), 10_000);
assert.deepEqual(datesEcheances("2026-01-31", 3), ["2026-01-31", "2026-02-28", "2026-03-31"]);

console.log("✅ Échéanciers 1×/3×/10× répartis aux centimes et datés mois par mois");
