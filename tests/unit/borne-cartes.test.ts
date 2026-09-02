/**
 * tests/unit/borne-cartes.test.ts
 *
 * Les cartes que la borne Câlin affiche à l'écran à partir des créneaux
 * publics : un stage d'une semaine tient sur UNE carte, un cours sur la
 * sienne, et une carte de stage annonce le pire des places restantes.
 *   npx tsx tests/unit/borne-cartes.test.ts
 */
import assert from "node:assert/strict";
import { cartesPourEcran } from "../../src/lib/borne-creneaux";
import type { PublicPlanningSlot } from "../../src/lib/public-planning";

let passes = 0;
function test(nom: string, fn: () => void) {
  try { fn(); passes++; console.log(`  ✅ ${nom}`); }
  catch (e: any) { console.error(`  ❌ ${nom}\n     ${e.message}`); process.exitCode = 1; }
}

const slot = (o: Partial<PublicPlanningSlot>): PublicPlanningSlot => ({
  id: "x", activityTitle: "Cours", activityType: "cours", date: "2026-10-07",
  startTime: "14h00", endTime: "15h00", monitor: "", maxPlaces: 8, enrolledCount: 3, priceTTC: 24, ...o,
});

console.log("\n── Cartes de la borne ──");

test("un cours donne une carte avec ses places restantes", () => {
  const [c] = cartesPourEcran([slot({ id: "c1" })]);
  assert.equal(c.id, "c1");
  assert.equal(c.nbJours, 1);
  assert.equal(c.placesRestantes, 5);
  assert.equal(c.priceTTC, 24);
});

test("un stage de cinq jours tient sur une seule carte, du lundi au vendredi", () => {
  const jours = ["2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30"];
  const slots = jours.map((date, i) => slot({
    id: `s${i}`, activityTitle: "Stage poney", activityType: "stage", date,
    startTime: "10h00", endTime: "12h00", priceTTC: 175, maxPlaces: 10, enrolledCount: i === 3 ? 9 : 4,
  }));
  const cartes = cartesPourEcran(slots);
  assert.equal(cartes.length, 1, "cinq jours ont donné plusieurs cartes");
  assert.equal(cartes[0].id, "s0", "le lien doit pointer sur le premier jour");
  assert.equal(cartes[0].date, "2026-10-26");
  assert.equal(cartes[0].dateFin, "2026-10-30");
  assert.equal(cartes[0].nbJours, 5);
  assert.equal(cartes[0].placesRestantes, 1, "le jour le plus rempli commande");
});

test("deux stages de semaines différentes restent deux cartes", () => {
  const slots = [
    slot({ id: "a", activityTitle: "Stage poney", activityType: "stage", date: "2026-10-26" }),
    slot({ id: "b", activityTitle: "Stage poney", activityType: "stage", date: "2026-11-02" }),
  ];
  assert.equal(cartesPourEcran(slots).length, 2);
});

test("la journée isolée d'un stage est annoncée quand elle est ouverte", () => {
  const [c] = cartesPourEcran([slot({ id: "j", activityType: "stage", allowDayBooking: true, priceTTCDay: 40 })]);
  assert.equal(c.priceTTCDay, 40);
  const [sans] = cartesPourEcran([slot({ id: "k", activityType: "stage", allowDayBooking: false, priceTTCDay: 40 })]);
  assert.equal(sans.priceTTCDay, null);
});

test("un prix absent devient null, jamais 0", () => {
  const [c] = cartesPourEcran([slot({ id: "p", priceTTC: undefined })]);
  assert.equal(c.priceTTC, null);
});

test("l'écran ne reçoit jamais plus de douze cartes", () => {
  const slots = Array.from({ length: 30 }, (_, i) => slot({ id: `n${i}`, date: `2026-10-${String(1 + (i % 28)).padStart(2, "0")}` }));
  assert.equal(cartesPourEcran(slots).length, 12);
});

console.log(`\n✅ ${passes} tests passés\n`);
