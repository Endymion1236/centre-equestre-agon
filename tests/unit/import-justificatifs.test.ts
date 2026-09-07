import assert from "node:assert/strict";
import { test } from "node:test";
import { traiterSelection } from "../../src/lib/import-justificatifs";
test("60 fichiers traités, progression complète et poursuite après erreur", async () => {
  const fichiers = Array.from({ length: 60 }, (_, i) => i);
  const envoyes: number[] = [], progression: number[] = [];
  const resultats = await traiterSelection(fichiers, async n => {
    envoyes.push(n);
    if (n === 25) throw new Error("Photo invalide");
    return n < 20 ? "Doublon" : "Conservé";
  }, (n, total) => { progression.push(n); assert.equal(total, 60); });
  assert.deepEqual(envoyes, fichiers);
  assert.equal(resultats.length, 60);
  assert.equal(resultats[25], "Photo invalide");
  assert.equal(resultats[59], "Conservé");
  assert.equal(progression.at(-1), 60);
});
