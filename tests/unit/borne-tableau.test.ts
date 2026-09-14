/**
 * Tableau du jour de la borne (src/lib/borne-tableau.ts) : prénoms seuls,
 * cours en cours mis en avant, cours finis retirés, places tenues exclues.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { construireTableauDuJour, prenomAffiche } from "../../src/lib/borne-tableau";

const creneaux = [
  { id: "a", startTime: "14:00", endTime: "15:00", activityTitle: "Galop 2", monitor: "Nicolas",
    enrolled: [{ childName: "Léa Martin", horseName: "Caramel" }, { childName: "MARTIN Zoé" }, { childName: "Tom Durand", pending: true }, { childName: "Ana Silva", presence: "absent" }] },
  { id: "b", startTime: "15:30", endTime: "16:15", activityTitle: "Baby poney", monitor: "Camille", enrolled: [{ childName: "jean-baptiste roy" }] },
  { id: "c", startTime: "10:00", endTime: "11:00", activityTitle: "Galop 4", enrolled: [{ childName: "Inès" }] },
  { id: "d", startTime: "17:00", endTime: "18:00", activityTitle: "Cours fermé", status: "closed", enrolled: [{ childName: "Paul" }] },
  { id: "e", startTime: "18:00", endTime: "19:00", activityTitle: "Vide", enrolled: [] },
];

test("prénom seul : nom de famille retiré, capitales normalisées, prénom composé gardé", () => {
  assert.equal(prenomAffiche("Léa Martin"), "Léa");
  assert.equal(prenomAffiche("MARTIN Zoé"), "Zoé");
  assert.equal(prenomAffiche("jean-baptiste roy"), "Jean-Baptiste");
  assert.equal(prenomAffiche(""), "");
});

test("à 14h50 : le Galop 2 est en cours, le baby poney (dans 40 min) bientôt, le cours de 10h a disparu", () => {
  const t = construireTableauDuJour(creneaux, "14:50");
  assert.deepEqual(t.map((c) => [c.titre, c.etat]), [["Galop 2", "en_cours"], ["Baby poney", "bientot"]]);
  assert.deepEqual(t[0].cavaliers, [{ prenom: "Léa", poney: "Caramel" }, { prenom: "Zoé", poney: "" }], "place tenue et absent exclus, triés, poney du Montoir");
  assert.equal(t[0].moniteur, "Nicolas"); assert.equal(t[0].horaire, "14:00–15:00");
});

test("le cours fini reste un quart d'heure, un cours fermé ou vide n'apparaît jamais", () => {
  assert.ok(construireTableauDuJour(creneaux, "11:10").some((c) => c.titre === "Galop 4"));
  assert.ok(!construireTableauDuJour(creneaux, "11:20").some((c) => c.titre === "Galop 4"));
  const titres = construireTableauDuJour(creneaux, "09:00").map((c) => c.titre);
  assert.ok(!titres.includes("Cours fermé") && !titres.includes("Vide"));
  assert.equal(construireTableauDuJour(creneaux, "09:00")[0].etat, "a_venir");
});

test("jamais autre chose que titre, horaire, moniteur, état, prénoms et poneys", () => {
  const [c] = construireTableauDuJour(creneaux, "14:20");
  assert.deepEqual(Object.keys(c).sort(), ["cavaliers", "debut", "etat", "fin", "horaire", "id", "moniteur", "titre"]);
  assert.deepEqual(Object.keys(c.cavaliers[0]).sort(), ["poney", "prenom"]);
});
