/**
 * tests/unit/tarifs-passages.test.ts — tarif d'une compétition selon le nombre de passages.
 *   npx tsx tests/unit/tarifs-passages.test.ts
 */
import assert from "node:assert/strict";
import { nettoyerPrixPassages, offrePassages, prixMinimumPassages, proposerPrixPassages, titreAvecPassages } from "../../src/lib/tarifs-passages";

let n = 0;
const test = (nom: string, fn: () => void) => { try { fn(); n++; } catch (e) { console.error(`❌ ${nom}`); throw e; } };

test("saisie nettoyée : virgule, vides, rien de saisi", () => {
  assert.deepEqual(nettoyerPrixPassages(["15", "25,5", ""]), [15, 25.5, 0]);
  assert.deepEqual(nettoyerPrixPassages(["", "", ""]), []);
  assert.deepEqual(nettoyerPrixPassages(undefined), []);
  assert.deepEqual(nettoyerPrixPassages([-3, "abc", 30]), [0, 0, 30]);
});
test("offre proposée et prix « à partir de »", () => {
  assert.deepEqual(offrePassages({ prixPassages: [15, 25, 32] }), [{ n: 1, prix: 15 }, { n: 2, prix: 25 }, { n: 3, prix: 32 }]);
  assert.deepEqual(offrePassages({ prixPassages: [0, 25, 32] }), [{ n: 2, prix: 25 }, { n: 3, prix: 32 }]);
  assert.deepEqual(offrePassages({}), []);
  assert.equal(prixMinimumPassages([0, 25, 32]), 25);
  assert.equal(prixMinimumPassages([]), null);
});
test("titre de la ligne, sans doublon de suffixe", () => {
  assert.equal(titreAvecPassages("Challenge interne", 1), "Challenge interne — 1 passage");
  assert.equal(titreAvecPassages("Challenge interne — 1 passage", 3), "Challenge interne — 3 passages");
});
test("bloc proposé sur une compétition ou un challenge", () => {
  assert.ok(proposerPrixPassages({ activityType: "competition" }));
  assert.ok(proposerPrixPassages({ activityType: "cours", activityTitle: "Challenge interne" }));
  assert.ok(!proposerPrixPassages({ activityType: "balade", activityTitle: "Promenade plage" }));
});
console.log(`✅ ${n} tests passés`);
