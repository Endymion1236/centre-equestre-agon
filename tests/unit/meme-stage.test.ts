/**
 * tests/unit/meme-stage.test.ts — deux créneaux appartiennent-ils au même stage ?
 *   npx tsx tests/unit/meme-stage.test.ts
 */
import assert from "node:assert/strict";
import { memeStage } from "../../src/lib/meme-stage";

let passes = 0;
function test(nom: string, fn: () => void) {
  try { fn(); passes++; console.log(`  ✅ ${nom}`); }
  catch (e: any) { console.error(`  ❌ ${nom}\n     ${e.message}`); process.exitCode = 1; }
}

const matin = { activityId: "sabot", activityTitle: "Stage Premier sabot", date: "2026-10-19", startTime: "10:00", stageGroupId: "lot-matin" };
const soir = { activityId: "sabot", activityTitle: "Stage Premier sabot", date: "2026-10-19", startTime: "16:30", stageGroupId: "lot-soir" };

test("deux stages homonymes créés séparément : distincts", () => {
  assert.equal(memeStage(matin, soir), false);
  assert.equal(memeStage(matin, { ...matin, date: "2026-10-21" }), true);
});

test("un des deux sans identifiant de lot : l'horaire les distingue", () => {
  const { stageGroupId: _, ...matinAncien } = matin;
  assert.equal(memeStage(matinAncien, soir), false, "10 h et 16 h 30 ne sont pas le même stage");
  assert.equal(memeStage(matinAncien, { ...matinAncien, date: "2026-10-20" }), true, "les jours d'un stage ancien restent ensemble");
});

test("même nom, autre semaine : jamais le même stage", () => {
  assert.equal(memeStage(matin, { ...matin, date: "2026-10-26" }), false);
});

console.log(`\n${process.exitCode ? "❌" : "✅"} ${passes} tests passés`);
