/**
 * Une commande « je paierai au bureau » doit porter les mêmes informations
 * qu'une commande du panier CB : réglée plus tard en ligne, sa confirmation
 * doit retrouver le stage, ses dates, ses horaires (src/lib/commande-items.ts).
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { construireLigneCommande, champsStageCommande } from "../../src/lib/commande-items";
import { datesStage, horairesStage } from "../../src/lib/email-prestations";
import { declarationADeclasser } from "../../src/lib/declarations-reglees";

const creneaux = [
  { id: "c1", date: "2026-10-26", startTime: "10:00", endTime: "12:00", monitor: "Nicolas" },
  { id: "c2", date: "2026-10-27", startTime: "10:00", endTime: "12:00" },
  { id: "c3", date: "2026-10-28", startTime: "10:00", endTime: "12:00" },
];

test("un stage porte activityType, toutes ses journées et son premier jour", () => {
  const l = construireLigneCommande({ childId: "e1", childName: "Léa", activityTitle: "Stage Poney", isStage: true, creneauIds: ["c3", "c1", "c2"], prixFinal: 105.5 }, creneaux);
  assert.equal(l.activityType, "stage");
  assert.equal(l.activityTitle, "Stage Poney — Léa");
  assert.deepEqual(l.stageDates?.map((d) => d.date), ["2026-10-26", "2026-10-27", "2026-10-28"]);
  assert.equal(l.date, "2026-10-26"); assert.equal(l.startTime, "10:00"); assert.equal(l.endTime, "12:00");
  assert.deepEqual(l.creneauIds, ["c3", "c1", "c2"]);
  assert.equal(l.priceTTC, 105.5); assert.equal(Math.round(l.priceHT * 100) / 100, 100);
  // Ce que l'email de confirmation en fait :
  assert.match(datesStage([l]), /du lundi 26 au mercredi 28 octobre \(3 jours\)/);
  assert.equal(horairesStage([l]), "10:00–12:00");
  assert.deepEqual(champsStageCommande([l]), { stageDate: "2026-10-26", stageTitle: "Stage Poney" });
});

test("un cours ponctuel garde sa date, son horaire et son moniteur, sans stageDates", () => {
  const l = construireLigneCommande({ childId: "e2", childName: "Tom", activityTitle: "Cours Galop 2", isStage: false, creneauIds: ["c1"], prixFinal: 25 }, creneaux);
  assert.equal(l.activityType, "cours");
  assert.equal(l.stageDates, null); assert.equal(l.stageKey, null);
  assert.equal(l.date, "2026-10-26"); assert.equal(l.monitor, "Nicolas");
  assert.deepEqual(champsStageCommande([l]), {});
});

test("un créneau introuvable ne fait pas échouer la commande : ligne sans date", () => {
  const l = construireLigneCommande({ childId: "e3", childName: "Zoé", activityTitle: "Stage", isStage: true, creneauIds: ["inconnu"], prixFinal: 60 }, creneaux);
  assert.equal(l.date, null); assert.deepEqual(l.stageDates, []); assert.equal(l.stageSchedule, null);
});

test("seule une déclaration encore en attente est refermée par un règlement en ligne", () => {
  assert.equal(declarationADeclasser({ status: "pending_confirmation" }), true);
  assert.equal(declarationADeclasser({ status: "confirmed" }), false);
  assert.equal(declarationADeclasser({ status: "rejected" }), false);
  assert.equal(declarationADeclasser(null), false);
});
