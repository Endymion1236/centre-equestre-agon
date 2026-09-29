import assert from "node:assert/strict";
import { construireDemandePreparation, normaliserAnalysePreparation } from "../../src/lib/analyse-preparation-seance";

let passes = 0;
function test(nom: string, fn: () => void) {
  try {
    fn();
    passes++;
    console.log(`  ✅ ${nom}`);
  } catch (e: any) {
    console.error(`  ❌ ${nom}\n     ${e.message}`);
    process.exitCode = 1;
  }
}

test("la demande porte la reprise, les prénoms (niveau, poney) et la note, sans nom de famille", () => {
  const d = construireDemandePreparation("  Échauffement au trot, puis slalom entre les plots. ", {
    activityTitle: "Cours galop bronze/argent", date: "2026-09-30", startTime: "11:00", endTime: "12:00", monitor: "Anne",
    cavaliers: [{ prenom: "Lena", niveau: "Argent", poney: "Caramel" }, { prenom: "Mia" }],
  });
  assert.ok(d.includes("Cours galop bronze/argent, 2026-09-30 11:00–12:00, moniteur Anne"), d);
  assert.ok(d.includes("Lena · Argent · Caramel, Mia"), d);
  assert.ok(d.includes("« Échauffement au trot, puis slalom entre les plots. »"), d);
});

test("réponse nettoyée : listes bornées, entrées vides écartées, 4 suggestions au plus", () => {
  const a = normaliserAnalysePreparation({
    objectif: "  Travailler   l'équilibre ",
    deroule: [{ etape: "Échauffement", contenu: "Trot enlevé" }, { etape: "Vide", contenu: "" }],
    materiel: ["plots", "", "barres"],
    vigilance: ["Poney Caramel nerveux près des plots"],
    adaptations: [{ prenom: "Mia", conseil: "Rester au pas si besoin" }, { prenom: "", conseil: "x" }],
    suggestions: ["a", "b", "c", "d", "e"],
  });
  assert.equal(a.objectif, "Travailler l'équilibre");
  assert.equal(a.deroule.length, 1);
  assert.deepEqual(a.materiel, ["plots", "barres"]);
  assert.equal(a.adaptations.length, 1);
  assert.equal(a.suggestions.length, 4);
});

test("réponse inattendue : analyse vide, pas d'erreur", () => {
  const a = normaliserAnalysePreparation(null);
  assert.equal(a.objectif, "");
  assert.deepEqual(a.deroule, []);
});

console.log(`\n✅ ${passes} tests passés\n`);
