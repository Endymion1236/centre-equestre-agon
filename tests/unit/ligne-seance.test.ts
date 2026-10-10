/**
 * tests/unit/ligne-seance.test.ts — la ligne de commande d'une séance, et pas celle d'une autre semaine.
 *   npx tsx tests/unit/ligne-seance.test.ts
 */
import assert from "node:assert/strict";
import { ligneDeLaSeance, trouverLigneLiee } from "../../src/lib/ligne-seance";

let passes = 0;
function test(nom: string, fn: () => void) {
  try { fn(); passes++; console.log(`  ✅ ${nom}`); }
  catch (e: any) { console.error(`  ❌ ${nom}\n     ${e.message}`); process.exitCode = 1; }
}

const lisa = { childId: "lisa", creneauId: "cr-10-10", activityTitle: "Galop 2", date: "2026-10-10" };
const semainePasseeReglee = { id: "p-old", status: "paid", items: [{ childId: "lisa", creneauId: "cr-03-10", activityTitle: "Galop 2", priceTTC: 26 }] };

test("préinscription sans commande : la séance d'une autre semaine, déjà réglée, n'est PAS prise (cas Lisa MARTINET)", () => {
  assert.equal(trouverLigneLiee([semainePasseeReglee], lisa), null);
});

test("la ligne du bon créneau est trouvée, même si une autre commande a le même titre avant", () => {
  const bonne = { id: "p-new", status: "pending", items: [{ childId: "lisa", creneauId: "cr-10-10", activityTitle: "Galop 2", priceTTC: 26 }] };
  const r = trouverLigneLiee([semainePasseeReglee, bonne], lisa);
  assert.equal(r?.commande.id, "p-new");
});

test("stage (ligne sans créneau) : titre et date de la séance dans les dates du stage", () => {
  const stage = { childId: "lisa", activityTitle: "Stage Toussaint (5j) — Lisa", stageKey: "Stage Toussaint", stageDates: [{ date: "2026-10-19" }, { date: "2026-10-20" }] };
  assert.equal(ligneDeLaSeance(stage, { childId: "lisa", creneauId: "x", activityTitle: "Stage Toussaint", date: "2026-10-20" }), true);
  assert.equal(ligneDeLaSeance(stage, { childId: "lisa", creneauId: "x", activityTitle: "Stage Toussaint", date: "2027-02-15" }), false, "même titre, autres vacances");
});

test("autre cavalier, ancien format sans cavalier", () => {
  assert.equal(ligneDeLaSeance({ childId: "autre", creneauId: "cr-10-10" }, lisa), false);
  const ancien = { id: "p-anc", status: "pending", items: [{ activityTitle: "Galop 2", priceTTC: 26 }] };
  assert.equal(trouverLigneLiee([ancien], lisa)?.commande.id, "p-anc");
  assert.equal(trouverLigneLiee([{ ...ancien, status: "cancelled" }], lisa), null);
});

console.log(`\n${process.exitCode ? "❌" : "✅"} ${passes} tests passés`);
