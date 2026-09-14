/**
 * Mail de reprise des cours (src/lib/rappel-saison.ts) : le prénom de
 * l'enfant sous chaque créneau, l'ordre des jours, le mot pour les parents.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { ajouterEnfantAuCreneau, cleCreneauSaison, corpsRappelSaison, panneauxCreneauxSaison, MOT_ACCUEIL_PARENTS, type CreneauSaison } from "../../src/lib/rappel-saison";

function famille() {
  const slots = new Map<string, CreneauSaison>();
  ajouterEnfantAuCreneau(slots, cleCreneauSaison("Galop 2", "mercredi", "14:00"), { title: "Galop 2", jour: "mercredi", horaire: "14:00–15:00", moniteur: "Nicolas" }, "Léa");
  ajouterEnfantAuCreneau(slots, cleCreneauSaison("Baby poney", "lundi", "17:00"), { title: "Baby poney", jour: "lundi", horaire: "17:00–17:45", moniteur: "" }, "Tom");
  // Deux fois le même créneau dans la semaine (deux dates) : un seul panneau, un seul prénom.
  ajouterEnfantAuCreneau(slots, cleCreneauSaison("Galop 2", "mercredi", "14:00"), { title: "Galop 2", jour: "mercredi", horaire: "14:00–15:00", moniteur: "Nicolas" }, "Léa");
  return slots;
}

test("chaque créneau nomme son cavalier ; deux enfants sur le même cours sont listés ensemble", () => {
  const slots = famille();
  ajouterEnfantAuCreneau(slots, cleCreneauSaison("Galop 2", "mercredi", "14:00"), { title: "Galop 2", jour: "mercredi", horaire: "14:00–15:00", moniteur: "Nicolas" }, "Zoé");
  const html = panneauxCreneauxSaison(slots.values());
  assert.match(html, /Cavalier<\/td>[\s\S]*?Tom</);
  assert.match(html, /Cavaliers<\/td>[\s\S]*?Léa, Zoé</);
  assert.equal(slots.size, 2);
});

test("les créneaux sont dans l'ordre de la semaine, pas alphabétique", () => {
  const html = panneauxCreneauxSaison(famille().values());
  assert.ok(html.indexOf("Baby poney") < html.indexOf("Galop 2"), "lundi avant mercredi");
});

test("le corps du mail annonce la date, le planning et le café pour les parents", () => {
  const html = corpsRappelSaison({ parentName: "Mme Martin", debut: new Date(2026, 8, 21, 12), slots: famille().values() });
  assert.match(html, /Bonjour Mme Martin/);
  assert.match(html, /lundi 21 septembre/);
  assert.match(html, /Léa/); assert.match(html, /Tom/);
  assert.match(html, new RegExp(MOT_ACCUEIL_PARENTS.slice(0, 30)));
  assert.match(MOT_ACCUEIL_PARENTS, /café et thé/);
});
