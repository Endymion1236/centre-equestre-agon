/**
 * « En savoir plus sur cette activité » (src/lib/public-planning.ts) : la
 * fiche du catalogue, réduite à ce qui est public, et mise en phrases.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { detailsActivitePublique, renseignementsActivite, trancheAge, toPublicPlanningSlot } from "../../src/lib/public-planning";

test("une fiche donne sa description, ses âges, son niveau et ses conditions", () => {
  const d = detailsActivitePublique({
    description: "  Une journée de défis costumés, en équipe, pour finir par une distribution de bonbons.  ",
    ageMin: 6, ageMax: 12, galopRequired: "Galop 1", conditionsAcces: "Costume bienvenu, pique-nique tiré du sac.",
    priceTTC: 50, articles: [{ secret: true }],
  });
  assert.equal(d?.description?.startsWith("Une journée de défis"), true);
  assert.deepEqual(Object.keys(d || {}).sort(), ["ageMax", "ageMin", "conditionsAcces", "description", "galopRequired"], "aucun autre champ ne sort");
  const infos = renseignementsActivite(d);
  assert.deepEqual(infos.puces, ["De 6 à 12 ans", "Niveau : Galop 1", "Costume bienvenu, pique-nique tiré du sac."]);
});

test("une fiche vide ne produit aucun panneau", () => {
  assert.equal(detailsActivitePublique({ description: "   ", priceTTC: 50 }), undefined);
  assert.equal(detailsActivitePublique(null), undefined);
  assert.deepEqual(renseignementsActivite(undefined), { description: "", puces: [] });
});

test("les tranches d'âge se disent en clair", () => {
  assert.equal(trancheAge({ ageMin: 6, ageMax: 12 }), "De 6 à 12 ans");
  assert.equal(trancheAge({ ageMin: 4, ageMax: null }), "À partir de 4 ans");
  assert.equal(trancheAge({ ageMax: 10 }), "Jusqu'à 10 ans");
  assert.equal(trancheAge({ ageMin: 8, ageMax: 8 }), "8 ans");
  assert.equal(trancheAge({ ageMin: 0, ageMax: null }), "");
});

test("le créneau public porte l'identifiant de sa fiche, jamais les inscrits", () => {
  const slot = toPublicPlanningSlot("c1", {
    date: "2026-10-24", startTime: "10:00", endTime: "16:00", activityTitle: "🎃 Le Grand Défi d'Halloween",
    activityType: "animation", activityId: "act-halloween", maxPlaces: 18,
    enrolled: [{ childName: "Léa" }, { childName: "Tom" }],
  });
  assert.equal(slot?.activityId, "act-halloween");
  assert.equal(slot?.enrolledCount, 2);
  assert.equal((slot as any)?.enrolled, undefined);
});
