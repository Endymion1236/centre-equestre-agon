/**
 * tests/unit/conflit-horaire.test.ts — un cavalier ne peut pas être à deux endroits.
 *   npx tsx tests/unit/conflit-horaire.test.ts
 */
import assert from "node:assert/strict";
import { chevauche, creneauxEnConflit, doublonsInscriptions, libelleConflit } from "../../src/lib/conflit-horaire";

let passes = 0;
function test(nom: string, fn: () => void) {
  try { fn(); passes++; console.log(`  ✅ ${nom}`); }
  catch (e: any) { console.error(`  ❌ ${nom}\n     ${e.message}`); process.exitCode = 1; }
}

const leonie = { childId: "leonie", childName: "Léonie VASSEUR" };
const charlie = { childId: "charlie", childName: "Charlie VASSEUR" };
const lisa = { childId: "lisa", childName: "Lisa VASSEUR" };

const poneyAventure = { id: "pa-28", date: "2026-10-28", startTime: "14:00", endTime: "16:00", activityTitle: "Poney Aventure", enrolled: [lisa, leonie, charlie] };
const stageBronze = { id: "sb-28", date: "2026-10-28", startTime: "14:00", endTime: "16:00", activityTitle: "Stage bronze et argent 6 à 9 ans Après-midi", enrolled: [leonie, charlie] };
const matin = { id: "m-28", date: "2026-10-28", startTime: "10:00", endTime: "12:00", activityTitle: "Stage matin", enrolled: [leonie] };
const veille = { id: "pa-27", date: "2026-10-27", startTime: "14:00", endTime: "16:00", activityTitle: "Poney Aventure", enrolled: [leonie] };

test("chevauchement : même jour et heures qui se recouvrent ; bornes exclues ; autre jour non", () => {
  assert.equal(chevauche(poneyAventure, stageBronze), true);
  assert.equal(chevauche(matin, stageBronze), false, "10–12 puis 14–16");
  assert.equal(chevauche({ date: "2026-10-28", startTime: "12:00", endTime: "14:00" }, stageBronze), false, "l'un finit quand l'autre commence");
  assert.equal(chevauche({ date: "2026-10-28", startTime: "15:00", endTime: "17:00" }, stageBronze), true, "recouvrement partiel");
  assert.equal(chevauche(veille, stageBronze), false, "la veille");
});

test("sans horaires connus des deux côtés, pas de conflit", () => {
  assert.equal(chevauche({ date: "2026-10-28" }, stageBronze), false);
});

test("Léonie, déjà sur Poney Aventure à 14 h, ne peut pas rejoindre le stage bronze à 14 h", () => {
  const conflits = creneauxEnConflit("leonie", stageBronze, [poneyAventure, matin, veille]);
  assert.deepEqual(conflits.map(c => c.id), ["pa-28"]);
  assert.equal(libelleConflit(conflits[0]), "« Poney Aventure » de 14:00 à 16:00");
});

test("Lisa, sur Poney Aventure seulement, peut rejoindre le stage du matin", () => {
  assert.deepEqual(creneauxEnConflit("lisa", matin, [poneyAventure, stageBronze]), []);
});

test("le créneau visé lui-même et les créneaux à ignorer (changement de groupe) ne comptent pas", () => {
  assert.deepEqual(creneauxEnConflit("leonie", stageBronze, [stageBronze, poneyAventure]).map(c => c.id), ["pa-28"]);
  assert.deepEqual(creneauxEnConflit("leonie", stageBronze, [poneyAventure], ["pa-28"]), []);
});

test("doublons : Léonie et Charlie à deux endroits le 28, Lisa non ; rien la veille", () => {
  const cas = doublonsInscriptions([veille, matin, stageBronze, poneyAventure]);
  assert.deepEqual(cas.map(c => `${c.date} ${c.childName}`), ["2026-10-28 Charlie VASSEUR", "2026-10-28 Léonie VASSEUR"]);
  assert.deepEqual(cas[1].creneaux.map(c => c.id), ["sb-28", "pa-28"]);
});

test("doublons : aucun cas quand rien ne se chevauche", () => {
  assert.deepEqual(doublonsInscriptions([matin, veille, { id: "x", date: "2026-10-28", startTime: "16:00", endTime: "17:00", enrolled: [leonie] }]), []);
});

if (process.exitCode) { console.error("❌ échec"); } else console.log(`✅ ${passes} tests passés`);
