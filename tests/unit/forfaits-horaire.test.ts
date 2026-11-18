/**
 * tests/unit/forfaits-horaire.test.ts — cours annuel déplacé : les fiches forfait suivent.
 *   npx tsx tests/unit/forfaits-horaire.test.ts
 */
import assert from "node:assert/strict";
import { commandeDuForfait, majForfaitsChangementHoraire } from "../../src/lib/forfaits";

let n = 0;
const test = (nom: string, fn: () => void) => { try { fn(); n++; } catch (e) { console.error(`❌ ${nom}`); throw e; } };

const forfaits = [
  { id: "a", activityTitle: "Galop 2", dayLabel: "samedi", startTime: "17:00", slotKey: "Galop 2 — samedi 17:00", status: "actif", familyId: "F", childId: "c1" },
  { id: "b", activityTitle: "Galop 2", dayLabel: "Samedi", startTime: "17:00", slotKey: "Galop 2 — samedi 17:00", status: "active" },
  { id: "c", activityTitle: "Galop 2", dayLabel: "mercredi", startTime: "17:00", slotKey: "Galop 2 — mercredi 17:00", status: "actif" },
  { id: "d", activityTitle: "Galop 2", dayLabel: "samedi", startTime: "17:00", slotKey: "x", status: "cancelled" },
];

test("samedi 17:00 → 14:30 : seules les fiches de ce cours, ce jour-là, non résiliées", () => {
  const maj = majForfaitsChangementHoraire(forfaits, { activityTitle: "Galop 2", jour: "Samedi", startTime: "17:00" }, { activityTitle: "Galop 2", startTime: "14:30", endTime: "15:30" });
  assert.deepEqual(maj.map((m) => m.id), ["a", "b"]);
  assert.deepEqual(maj[0].patch, { activityTitle: "Galop 2", startTime: "14:30", endTime: "15:30", slotKey: "Galop 2 — samedi 14:30" });
  assert.equal(maj[0].ancienneRef, "Galop 2 — samedi 17:00");
});

test("la commande facturée sous l'ancien horaire reste rattachée à la fiche", () => {
  const [m] = majForfaitsChangementHoraire(forfaits, { activityTitle: "Galop 2", jour: "samedi", startTime: "17:00" }, { activityTitle: "Galop 2", startTime: "14:30", endTime: "15:30" });
  const fiche = { ...forfaits[0], ...m.patch, slotKeysAnterieurs: [m.ancienneRef!] };
  const commande = { familyId: "F", status: "partial", forfaitRef: "Galop 2 — samedi 17:00", items: [{ childId: "c1", activityTitle: "Échéance 2/10" }] };
  assert.ok(commandeDuForfait(commande, fiche));
});

test("rien à faire si l'heure ne change pas", () => {
  assert.equal(majForfaitsChangementHoraire(forfaits, { activityTitle: "Galop 2", jour: "samedi", startTime: "17:00" }, { activityTitle: "Galop 2", startTime: "17:00", endTime: "18:00" }).length, 0);
});
console.log(`✅ ${n} tests passés`);
