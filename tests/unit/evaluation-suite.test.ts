/**
 * tests/unit/evaluation-suite.test.ts — évaluations enchaînées d'une séance.
 *   npx tsx tests/unit/evaluation-suite.test.ts
 */
import assert from "node:assert/strict";
import { decoderSuite, encoderSuite, positionDans, urlEvaluation } from "../../src/lib/evaluation-suite";

let n = 0;
const test = (nom: string, fn: () => void) => { try { fn(); n++; } catch (e) { console.error(`❌ ${nom}`); throw e; } };

const liste = [
  { childId: "c1", familyId: "f1", prenom: "Aurèle" },
  { childId: "c2", familyId: "f2", prenom: "Louis, dit « Lou »" },
  { childId: "c3", familyId: "", prenom: "Zoé:B" },
];

test("aller-retour par l'URL, prénoms accentués et ponctuation compris", () => {
  assert.deepEqual(decoderSuite(encoderSuite(liste)), liste);
  assert.deepEqual(decoderSuite(new URLSearchParams(`suite=${encodeURIComponent(encoderSuite(liste))}`).get("suite")), liste);
  assert.deepEqual(decoderSuite(null), []);
});
test("position et suivant ; le dernier n'a pas de suivant", () => {
  assert.deepEqual(positionDans(liste, "c1"), { rang: 1, total: 3, suivant: liste[1] });
  assert.equal(positionDans(liste, "c3").suivant, null);
  assert.deepEqual(positionDans(liste, "inconnu"), { rang: 0, total: 3, suivant: null });
});
test("adresse du suivant, suite conservée", () => {
  const p = encoderSuite(liste);
  const url = urlEvaluation(liste[1], p);
  assert.ok(url.startsWith("/admin/progression/c2?familyId=f2&suite="));
  assert.equal(new URLSearchParams(url.split("?")[1]).get("suite"), p);
});
console.log(`✅ ${n} tests passés`);
