import assert from "node:assert/strict";
import { fmtDate, isStage, nomCompletCavalier } from "../../src/app/espace-cavalier/reserver/panier-ajout";

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

console.log("── Aides de l'ajout au panier ──");

test("nomCompletCavalier : « Prénom Nom », suffixe de famille liée retiré", () => {
  assert.equal(nomCompletCavalier({ firstName: "Léa", lastName: "Dupont" }), "Léa Dupont");
  assert.equal(nomCompletCavalier({ firstName: "Tom (Martin)", lastName: "" }), "Tom");
  assert.equal(nomCompletCavalier({ firstName: "Zoé" }), "Zoé");
  assert.equal(nomCompletCavalier(null), "?");
});

test("isStage : stage et stage journée, rien d'autre", () => {
  assert.equal(isStage({ activityType: "stage" }), true);
  assert.equal(isStage({ activityType: "stage_journee" }), true);
  assert.equal(isStage({ activityType: "cours" }), false);
  assert.equal(isStage({ activityType: "balade" }), false);
});

test("fmtDate : AAAA-MM-JJ en heure locale, zéros de tête", () => {
  assert.equal(fmtDate(new Date(2026, 8, 6)), "2026-09-06");
  assert.equal(fmtDate(new Date(2026, 0, 1)), "2026-01-01");
});

console.log(`\n✅ ${passes} tests passés\n`);
