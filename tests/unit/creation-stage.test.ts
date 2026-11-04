/**
 * Création d'un stage : prix semaine, journée, copies sur les semaines suivantes.
 */
import assert from "node:assert/strict";
import { champsPrixStage, joursDesCopies, prixJourneeProrata } from "../../src/app/admin/planning/creation-stage-utils";

let passes = 0;
function test(nom: string, fn: () => void) {
  try { fn(); passes++; console.log(`  ✅ ${nom}`); }
  catch (e) { console.error(`  ❌ ${nom}`); console.error(e); process.exitCode = 1; }
}

test("prix de la semaine : celui saisi, sinon celui de l'activité", () => {
  assert.deepEqual(champsPrixStage({ prixSemaine: "180", ouvertJournee: false, prixJournee: "" }, 160, 5.5),
    { priceTTC: 180, priceHT: 170.62, allowDayBooking: false, priceTTCDay: 0 });
  assert.equal(champsPrixStage({ prixSemaine: "", ouvertJournee: false, prixJournee: "" }, 160, 5.5).priceTTC, 160);
  assert.equal(champsPrixStage({ prixSemaine: "152,50", ouvertJournee: false, prixJournee: "" }, 160, 5.5).priceTTC, 152.5);
});

test("ouvert à la journée : son prix, vide = prorata (0 enregistré, comme en modification)", () => {
  assert.deepEqual(champsPrixStage({ prixSemaine: 160, ouvertJournee: true, prixJournee: "45" }, 160, 5.5).priceTTCDay, 45);
  assert.equal(champsPrixStage({ prixSemaine: 160, ouvertJournee: true, prixJournee: "" }, 160, 5.5).priceTTCDay, 0);
  assert.equal(champsPrixStage({ prixSemaine: 160, ouvertJournee: false, prixJournee: "45" }, 160, 5.5).priceTTCDay, 0, "fermé à la journée : pas de prix journée");
  assert.equal(prixJourneeProrata(160, 4), 40);
});

test("TVA à 0 % : HT = TTC", () => {
  assert.equal(champsPrixStage({ prixSemaine: 100, ouvertJournee: false, prixJournee: "" }, 100, 0).priceHT, 100);
});

test("dupliquer sur 3 semaines : chaque copie décalée de 7 jours, passage d'année compris", () => {
  const stage = ["2026-12-21", "2026-12-22", "2026-12-23", "2026-12-24"];
  const c = joursDesCopies(stage, 3);
  assert.equal(c.length, 3);
  assert.deepEqual(c[0], stage);
  assert.deepEqual(c[1], ["2026-12-28", "2026-12-29", "2026-12-30", "2026-12-31"]);
  assert.deepEqual(c[2], ["2027-01-04", "2027-01-05", "2027-01-06", "2027-01-07"]);
  assert.equal(joursDesCopies(stage, 0).length, 1, "au moins le stage lui-même");
  assert.equal(joursDesCopies(stage, 99).length, 20, "au plus 20 semaines");
});

if (process.exitCode) { console.error("❌ échec"); } else console.log(`✅ ${passes} tests passés`);
