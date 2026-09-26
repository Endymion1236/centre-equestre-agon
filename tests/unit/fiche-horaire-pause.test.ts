/**
 * tests/unit/fiche-horaire-pause.test.ts — le midi de la fiche horaire suit la tâche « pause ».
 *   npx tsx tests/unit/fiche-horaire-pause.test.ts
 */
import assert from "node:assert/strict";
import { calculerJournee, plagesFicheHoraire } from "../../src/lib/temps-travail";

let passes = 0;
function test(nom: string, fn: () => void) {
  try { fn(); passes++; console.log(`  ✅ ${nom}`); }
  catch (e: any) { console.error(`  ❌ ${nom}\n     ${e.message}`); process.exitCode = 1; }
}
const t = (heureDebut: string, dureeMinutes: number, categorie = "ecuries") => ({ heureDebut, dureeMinutes, categorie });

test("battement avant et après la pause : la fiche imprime les heures de la pause", () => {
  // Soins 8h–11h45, pause 12h–13h, reprise 13h30–17h.
  const j = calculerJournee([t("08:00", 225), t("12:00", 60, "pause"), t("13:30", 210)]);
  const f = plagesFicheHoraire(j);
  assert.deepEqual([f.debut, f.fin, f.debutAprem, f.finAprem], ["08:00", "12:00", "13:00", "17:00"]);
  assert.equal(j.dureeMin, 435, "7 h 15 travaillées, inchangé");
  assert.equal(f.pauseMin, 105, "tout le non-travaillé entre 8 h et 17 h");
});

test("pause courte au milieu d'une journée continue : elle coupe quand même la fiche", () => {
  const j = calculerJournee([t("08:00", 240), t("12:00", 20, "pause"), t("12:20", 280)]);
  const f = plagesFicheHoraire(j);
  assert.deepEqual([f.fin, f.debutAprem], ["12:00", "12:20"]);
  assert.equal(f.pauseMin, 20);
});

test("sans pause saisie : la plus longue coupure, comme avant", () => {
  const j = calculerJournee([t("09:00", 180), t("14:00", 180)]);
  const f = plagesFicheHoraire(j);
  assert.deepEqual([f.debut, f.fin, f.debutAprem, f.finAprem], ["09:00", "12:00", "14:00", "17:00"]);
  assert.equal(f.pauseMin, 120);
});

test("deux pauses : la plus longue fait le midi", () => {
  const j = calculerJournee([t("08:00", 180), t("10:00", 15, "pause"), t("12:30", 60, "pause"), t("13:30", 210)]);
  const f = plagesFicheHoraire(j);
  assert.deepEqual([f.fin, f.debutAprem], ["12:30", "13:30"]);
});

test("pause en bord de journée (avant la première tâche) : ignorée pour le midi", () => {
  const j = calculerJournee([t("07:30", 30, "pause"), t("08:00", 480)]);
  const f = plagesFicheHoraire(j);
  assert.equal(f.debutAprem, "");
  assert.deepEqual([f.debut, f.fin], ["08:00", "16:00"]);
});

test("journée sans tâche : rien d'imprimé", () => {
  assert.deepEqual(plagesFicheHoraire(calculerJournee([])), { debut: "", fin: "", debutAprem: "", finAprem: "", pauseMin: 0 });
});

console.log(`\n${process.exitCode ? "❌" : "✅"} ${passes} tests passés`);
