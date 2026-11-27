/**
 * tests/unit/tarif-stage-jours.test.ts — semaine de stage courte : tarif « N jours » (27/11/2026).
 *   npx tsx tests/unit/tarif-stage-jours.test.ts
 */
import assert from "node:assert/strict";
import { nbJoursDistincts, prixPleinStage, tarifSemaineStage } from "../../src/lib/tarif-stage-jours";

let passes = 0;
function test(nom: string, fn: () => void) {
  try { fn(); passes++; console.log(`  ✅ ${nom}`); }
  catch (e: any) { console.error(`  ❌ ${nom}\n     ${e.message}`); process.exitCode = 1; }
}
const bronze = { priceTTC: 160, price4days: 144, price3days: 110 };

test("semaine de Noël à 4 jours : 144 € au lieu de 160 €", () => {
  assert.equal(tarifSemaineStage(bronze, 4), 144);
  assert.equal(tarifSemaineStage(bronze, 3), 110);
});
test("5 jours, ou nombre de jours sans tarif : prix plein", () => {
  assert.equal(tarifSemaineStage(bronze, 5), 160);
  assert.equal(tarifSemaineStage(bronze, 2), 160);
  assert.equal(tarifSemaineStage({ priceTTC: 160 }, 4), 160);
});
test("un tarif configuré au-dessus du prix plein est ignoré ; 0 ou vide ignoré", () => {
  assert.equal(tarifSemaineStage({ priceTTC: 100, price4days: 120 }, 4), 100);
  assert.equal(tarifSemaineStage({ priceTTC: 100, price4days: 0 }, 4), 100);
  assert.equal(tarifSemaineStage({ priceTTC: 100, price4days: null }, 4), 100);
});
test("prix plein depuis le HT quand le TTC manque ; créneau absent : 0", () => {
  assert.equal(prixPleinStage({ priceHT: 100, tvaTaux: 5.5 }), 105.5);
  assert.equal(prixPleinStage({ priceHT: 100 }), 105.5);
  assert.equal(tarifSemaineStage(null, 4), 0);
});
test("jours distincts : deux créneaux le même jour comptent pour un", () => {
  assert.equal(nbJoursDistincts([{ date: "2026-12-21" }, { date: "2026-12-22" }, { date: "2026-12-22" }, { date: "2026-12-23" }, { date: "2026-12-24" }]), 4);
  assert.equal(nbJoursDistincts([]), 1);
});

console.log(`\n✅ ${passes} tests passés`);
