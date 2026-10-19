/**
 * tests/unit/jours-supplementaires.test.ts — jours ajoutés à un stage pris « ce jour ».
 *   npx tsx tests/unit/jours-supplementaires.test.ts
 */
import assert from "node:assert/strict";
import { commandeDuStage, complementJour, prixPourJours } from "../../src/app/admin/planning/jours-supplementaires-utils";

let n = 0;
const test = (nom: string, fn: () => void) => { try { fn(); n++; } catch (e) { console.error(`❌ ${nom}`); throw e; } };

const marin = { activityType: "stage", childId: "marin", activityTitle: "🌱 Premiers Sabots (1j) — Marin", stageKey: "🌱 Premiers Sabots_2026-10-19", creneauIds: ["lun-pm"], priceTTC: 27 };

test("la commande payée de Marin est retrouvée (elle était cherchée parmi les seules impayées)", () => {
  const cmd = commandeDuStage([{ id: "p1", status: "paid", paidAmount: 27, items: [marin] }], "🌱 Premiers Sabots", "lun-pm", ["marin"]);
  assert.equal(cmd?.id, "p1");
});
test("jamais la commande d'un autre stage ou d'un autre cavalier", () => {
  const autre = { id: "p2", status: "pending", items: [{ ...marin, childId: "lisa" }] };
  const autreStage = { id: "p3", status: "pending", items: [{ ...marin, activityTitle: "Stage Galop d'or (5j) — Marin", stageKey: "Stage Galop d'or_2026-10-19", creneauIds: ["x"] }] };
  assert.equal(commandeDuStage([autre, autreStage], "🌱 Premiers Sabots", "lun-pm", ["marin"]), null);
  assert.equal(commandeDuStage([{ id: "p4", status: "cancelled", items: [marin] }], "🌱 Premiers Sabots", "lun-pm", ["marin"]), null);
});
test("complément facturé : jours × prix jour, plafonné au prix semaine", () => {
  assert.equal(prixPourJours(2, 5, 27, 120), 54);
  assert.equal(prixPourJours(5, 5, 27, 120), 120);
  assert.equal(complementJour(27, 2, 5, 27, 120), 27);
  assert.equal(complementJour(108, 5, 5, 27, 120), 12);
  assert.equal(complementJour(130, 5, 5, 27, 120), 0);
});
console.log(`✅ ${n} tests passés`);
