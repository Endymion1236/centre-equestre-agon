/**
 * tests/unit/creneaux-de-ligne.test.ts — créneaux à libérer quand on retire une ligne.
 *   npx tsx tests/unit/creneaux-de-ligne.test.ts
 */
import assert from "node:assert/strict";
import { creneauxDeLaLigne, datesDeLaLigne } from "../../src/lib/creneaux-de-ligne";

let n = 0;
const test = (nom: string, fn: () => void) => { try { fn(); n++; } catch (e) { console.error(`❌ ${nom}`); throw e; } };

const lundi = { id: "lun", date: "2026-10-19", startTime: "14:00", activityType: "stage", enrolled: [{ childId: "a" }] };
const mardi = { id: "mar", date: "2026-10-20", startTime: "14:00", activityType: "stage", enrolled: [{ childId: "a" }] };
const matin = { id: "lun-am", date: "2026-10-19", startTime: "10:00", activityType: "stage", enrolled: [{ childId: "a" }] };
const ligne = {
  childId: "a", creneauIds: ["mar"],
  stageDates: [{ date: "2026-10-19", startTime: "14:00" }, { date: "2026-10-20", startTime: "14:00" }],
};

test("lundi et mardi : le jour sans identifiant est retrouvé par date et heure, même renommé", () => {
  assert.deepEqual(creneauxDeLaLigne(ligne, [lundi, mardi, matin]).sort(), ["lun", "mar"]);
});
test("jamais le stage du matin, ni un créneau où le cavalier n'est pas", () => {
  const ids = creneauxDeLaLigne({ ...ligne, creneauIds: [] }, [{ ...lundi, enrolled: [] }, mardi, matin]);
  assert.deepEqual(ids, ["mar"]);
});
test("une ligne qui porte déjà ses identifiants n'en gagne pas d'autres", () => {
  assert.deepEqual(creneauxDeLaLigne({ ...ligne, creneauIds: ["lun", "mar"] }, [lundi, mardi]).sort(), ["lun", "mar"]);
});
test("dates à relire en base", () => {
  assert.deepEqual(datesDeLaLigne(ligne), ["2026-10-19", "2026-10-20"]);
  assert.deepEqual(datesDeLaLigne({}), []);
});
console.log(`✅ ${n} tests passés`);
