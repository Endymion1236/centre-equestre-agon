/**
 * tests/unit/format-stage.test.ts — le planning d'un stage sur la facture.
 *   npx tsx tests/unit/format-stage.test.ts
 */
import assert from "node:assert/strict";
import { completerHorairesLignes, formatStageSchedule } from "../../src/lib/format-stage";

let passes = 0;
function test(nom: string, fn: () => void) {
  try { fn(); passes++; console.log(`  ✅ ${nom}`); }
  catch (e: any) { console.error(`  ❌ ${nom}\n     ${e.message}`); process.exitCode = 1; }
}

const creneaux = new Map([
  ["c1", { date: "2026-10-26", startTime: "14:00", endTime: "16:00" }],
  ["c2", { date: "2026-10-27", startTime: "14:00", endTime: "16:00" }],
  ["c3", { date: "2026-10-28", startTime: "14:00", endTime: "16:00" }],
]);

test("ligne sans planning mais avec ses créneaux : dates et horaires retrouvés (cas COSTEGROSSE)", () => {
  const [l] = completerHorairesLignes<any>([{ activityTitle: "Stage — Léa", creneauIds: ["c3", "c1", "c2"], priceTTC: 108 }], creneaux);
  assert.equal(l.stageSchedule, formatStageSchedule([creneaux.get("c1")!, creneaux.get("c2")!, creneaux.get("c3")!]));
  assert.match(l.stageSchedule, /14:00–16:00/);
  assert.deepEqual(l.stageDates.map((d: any) => d.date), ["2026-10-26", "2026-10-27", "2026-10-28"], "triées");
});

test("un cours (un seul créneau) : jour et horaire", () => {
  const [l] = completerHorairesLignes<any>([{ activityTitle: "Galop 2", creneauId: "c2" }], creneaux);
  assert.match(l.stageSchedule, /27 octobre · 14:00–16:00/);
});

test("une ligne qui a déjà son planning, ou sans créneau connu, reste telle quelle", () => {
  const deja = { activityTitle: "x", stageSchedule: "du lun. au mer.", creneauIds: ["c1"] };
  const inconnu = { activityTitle: "y", creneauIds: ["zz"] };
  const sans = { activityTitle: "Assurance", priceTTC: 5 };
  assert.deepEqual(completerHorairesLignes([deja, inconnu, sans], creneaux), [deja, inconnu, sans]);
});

if (process.exitCode) { console.error("❌ échec"); } else console.log(`✅ ${passes} tests passés`);
