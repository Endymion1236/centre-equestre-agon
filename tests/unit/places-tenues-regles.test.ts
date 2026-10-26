/**
 * tests/unit/places-tenues-regles.test.ts — un paiement ne confirme que ce qu'il désigne.
 *   npx tsx tests/unit/places-tenues-regles.test.ts
 */
import assert from "node:assert/strict";
import { ciblesDeCommande, freresAConfirmer, recreerSiAbsent } from "../../src/lib/places-tenues-regles";

let n = 0;
const test = (nom: string, fn: () => void) => { try { fn(); n++; } catch (e) { console.error(`❌ ${nom}`); throw e; } };

const ligne = {
  childId: "e1", creneauIds: ["lun-am", "mar-am"],
  stageDates: [{ date: "2026-10-26", startTime: "10:00" }, { date: "2026-10-27", startTime: "10:00" }],
};
const semaine = [
  { id: "lun-am", date: "2026-10-26", startTime: "10:00" }, { id: "mar-am", date: "2026-10-27", startTime: "10:00" },
  { id: "mer-am", date: "2026-10-28", startTime: "10:00" }, { id: "jeu-am", date: "2026-10-29", startTime: "10:00" },
  { id: "lun-pm", date: "2026-10-26", startTime: "14:00" },
];

test("2 jours réglés : seuls ces 2 créneaux sont désignés", () => {
  const { explicites } = ciblesDeCommande([ligne]);
  assert.deepEqual([...explicites.keys()].sort(), ["lun-am", "mar-am"]);
});
test("filet des anciennes commandes : jamais au-delà des dates annoncées, jamais un autre horaire", () => {
  const ancienne = { childId: "e1", creneauIds: ["lun-am"], stageDates: ligne.stageDates };
  const { datesParEnfant } = ciblesDeCommande([ancienne]);
  assert.deepEqual(freresAConfirmer(semaine[0], semaine, datesParEnfant.get("e1")), ["mar-am"]);
});
test("ligne sans dates : aucune extension", () => {
  assert.deepEqual(freresAConfirmer(semaine[0], semaine, undefined), []);
  assert.deepEqual(freresAConfirmer(semaine[0], semaine, new Set()), []);
});
test("une place disparue ne se recrée que pour une commande passée en ligne", () => {
  assert.equal(recreerSiAbsent({ source: "client" }), true);
  assert.equal(recreerSiAbsent({ source: "admin" }), false);
  assert.equal(recreerSiAbsent({}), false);
  assert.equal(recreerSiAbsent(null), false);
});
console.log(`✅ ${n} tests passés`);
