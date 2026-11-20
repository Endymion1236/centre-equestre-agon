/**
 * tests/unit/saison-facturation.test.ts — tours courus par cavalier à un concours (facturation).
 *   npx tsx tests/unit/saison-facturation.test.ts
 */
import assert from "node:assert/strict";
import { toursParCavalier, texteFacturation } from "../../src/lib/concours/saison-facturation";

let passes = 0;
function test(nom: string, fn: () => void) {
  try { fn(); passes++; console.log(`  ✅ ${nom}`); }
  catch (e: any) { console.error(`  ❌ ${nom}\n     ${e.message}`); process.exitCode = 1; }
}
const saison: any = {
  id: "s", nom: "2026/2027",
  cavaliers: [{ id: "fred", prenom: "Fred" }, { id: "nico", prenom: "Nicolas" }, { id: "zoe", prenom: "Zoé" }, { id: "malo", prenom: "Malo" }],
  equipes: [
    { id: "p1", nom: "Fred et Nico", categorie: "Paire open", indice: "", cavalierIds: ["fred", "nico"] },
    { id: "e1", nom: "Les speed pony", categorie: "Open", indice: "", cavalierIds: ["fred", "zoe", "fantome"] },
  ],
  resultats: [],
};
const concours: any = { id: "c", nom: "Pony games agon", date: "2026-11-22", classements: [], engagements: [
  { equipeId: "e1", heure: "11:30", poneys: { fred: "JAVA", zoe: "GUCCI" }, roles: { cavalierRemplacant: "malo" } },
  { equipeId: "p1", heure: "11:00", poneys: { fred: "JAVA", nico: "MINEOS" } },
] };

test("un tour par passage d'une équipe du cavalier ; deux équipes = deux tours", () => {
  const l = toursParCavalier(saison, concours);
  const fred = l.find(x => x.cavalierId === "fred")!;
  assert.equal(fred.tours, 2);
  assert.deepEqual(fred.detail.map(d => [d.equipe, d.heure, d.poney]), [["Fred et Nico", "11h00", "JAVA"], ["Les speed pony", "11h30", "JAVA"]]);
  assert.equal(l.find(x => x.cavalierId === "nico")!.tours, 1);
  assert.ok(!l.some(x => x.cavalierId === "fantome"), "cavalier supprimé de la saison : ignoré");
});
test("cavalier du poney remplaçant : noté à part, pas un tour", () => {
  const malo = toursParCavalier(saison, concours).find(x => x.cavalierId === "malo")!;
  assert.equal(malo.tours, 0); assert.deepEqual(malo.remplacant, ["Les speed pony (11h30)"]);
});
test("sans organisation : les équipes classées comptent", () => {
  const l = toursParCavalier(saison, { ...concours, engagements: [], classements: [{ equipeId: "p1", rang: 1 }] });
  assert.deepEqual(l.map(x => [x.nom, x.tours]), [["Fred", 1], ["Nicolas", 1]]);
});
test("texte à copier", () => {
  const t = texteFacturation(concours, toursParCavalier(saison, concours));
  assert.match(t, /^Pony games agon — 22\/11\/2026 : 4 tours/);
  assert.match(t, /Fred : 2 tours \(Fred et Nico, Les speed pony\)/);
  assert.ok(!/Malo/.test(t));
});

console.log(`\n✅ ${passes} tests passés`);
