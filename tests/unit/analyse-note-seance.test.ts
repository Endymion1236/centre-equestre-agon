/**
 * tests/unit/analyse-note-seance.test.ts
 *   npx tsx tests/unit/analyse-note-seance.test.ts
 */
import assert from "node:assert/strict";
import { SCHEMA_ANALYSE_NOTE, construireDemande, normaliserAnalyse, prenomSeul } from "../../src/lib/analyse-note-seance";

let passes = 0;
function test(nom: string, fn: () => void) {
  try { fn(); passes++; console.log(`  ✅ ${nom}`); }
  catch (e: any) { console.error(`  ❌ ${nom}\n     ${e.message}`); process.exitCode = 1; }
}

console.log("\n── Ce qui part vers l'IA ──");
test("seul le prénom des cavaliers part, les absents sont écartés", () => {
  assert.equal(prenomSeul("Aliénor Dupont"), "Aliénor");
  const demande = construireDemande("Bonne séance, Aloïs a trotté enlevé.", {
    activityTitle: "Premiers Sabots", date: "2026-09-30", startTime: "14:00", monitor: "Emmeline",
    cavaliers: [{ prenom: "Aloïs", poney: "Caramel" }, { prenom: "Zoé", absent: true }],
  });
  assert.match(demande, /Premiers Sabots, le 2026-09-30 à 14:00, moniteur Emmeline/);
  assert.match(demande, /Cavaliers présents : Aloïs \(Caramel\)\./);
  assert.doesNotMatch(demande, /Zoé/);
  assert.match(demande, /« Bonne séance, Aloïs a trotté enlevé\. »/);
});

test("la préparation et le thème accompagnent la note quand ils existent", () => {
  const d = construireDemande("ok", { themeStage: "Galop 1", notePreparation: "  travail des transitions " });
  assert.match(d, /Thème prévu : Galop 1\./);
  assert.match(d, /« travail des transitions »/);
});

console.log("\n── Ce qui revient ──");
test("une réponse complète est gardée telle quelle", () => {
  const a = normaliserAnalyse({
    resume: "Séance calme.", pointsPositifs: ["Bon groupe"], difficultes: [], aRetravailler: ["Arrêts"],
    prochaineSeance: "Reprendre les arrêts au pas.", alertes: [{ type: "cheval", texte: "Caramel boite" }],
    cavaliers: [{ prenom: "Aloïs", observation: "Trot enlevé acquis" }],
  });
  assert.equal(a.alertes[0].type, "cheval");
  assert.equal(a.cavaliers[0].prenom, "Aloïs");
});

test("une réponse abîmée donne une analyse vide mais valide", () => {
  const a = normaliserAnalyse(null);
  assert.deepEqual(a, { resume: "", pointsPositifs: [], difficultes: [], aRetravailler: [], prochaineSeance: "", alertes: [], cavaliers: [] });
});

test("type d'alerte inconnu → « autre », lignes vides écartées, textes bornés", () => {
  const a = normaliserAnalyse({ alertes: [{ type: "inconnu", texte: "x" }, { type: "securite", texte: "  " }], pointsPositifs: ["", "a".repeat(500)] });
  assert.deepEqual(a.alertes, [{ type: "autre", texte: "x" }]);
  assert.equal(a.pointsPositifs.length, 1);
  assert.equal(a.pointsPositifs[0].length, 300);
});

test("le schéma exige tous les champs et refuse les champs en trop", () => {
  assert.equal(SCHEMA_ANALYSE_NOTE.additionalProperties, false);
  assert.deepEqual([...SCHEMA_ANALYSE_NOTE.required].sort(), Object.keys(SCHEMA_ANALYSE_NOTE.properties).sort());
});

console.log(`\n✅ ${passes} tests passés\n`);
