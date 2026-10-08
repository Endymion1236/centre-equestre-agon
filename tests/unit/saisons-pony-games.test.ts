/**
 * tests/unit/saisons-pony-games.test.ts
 *
 * Saisons de Pony Games : nom de saison, équipes, résultats, points cumulés.
 *   npx tsx tests/unit/saisons-pony-games.test.ts
 */
import assert from "node:assert/strict";
import {
  nomSaison, saisonDeLaDate, normaliserNomSaison, saisonAProposer, trierSaisons,
  retirerCavalier, retirerEquipe, saisirClassement, lireNombre, resultatsTries,
  bilanSaison, nomsCavaliers, equipesDuCavalier, messageErreurSaison, type SaisonPonyGames,
} from "../../src/lib/concours/saisons";

let passes = 0;
function test(nom: string, fn: () => void) {
  try { fn(); passes++; console.log(`  ✅ ${nom}`); }
  catch (e: any) { console.error(`  ❌ ${nom}\n     ${e.message}`); process.exitCode = 1; }
}

function saison(): SaisonPonyGames {
  return {
    id: "s1",
    nom: "2026/2027",
    cavaliers: [
      { id: "zoe", prenom: "Zoé", nom: "Martin" },
      { id: "leo", prenom: "Léo" },
      { id: "ines", prenom: "Inès" },
    ],
    equipes: [
      { id: "eq1", nom: "Les Fusées", categorie: "Benjamin", indice: "Club 2", cavalierIds: ["zoe", "leo"] },
      { id: "eq2", nom: "Les Comètes", categorie: "Benjamin", indice: "Club 2", cavalierIds: ["ines"] },
      { id: "eq3", nom: "Les Poussins", categorie: "Poussin", indice: "Club 4", cavalierIds: ["leo"] },
    ],
    resultats: [
      { id: "r2", nom: "Pieux", date: "2026-11-15", classements: [
        { equipeId: "eq1", rang: 3, points: 8 }, { equipeId: "eq2", rang: 1, points: 12 },
      ] },
      { id: "r1", nom: "Agon", date: "2026-10-04", classements: [
        { equipeId: "eq1", rang: 1, points: 12 }, { equipeId: "eq2", rang: 4, points: 6.5 },
      ] },
    ],
  };
}

console.log("\n── Nom de saison ──");

test("une saison va de septembre à août", () => {
  assert.equal(nomSaison(2026), "2026/2027");
  assert.equal(saisonDeLaDate("2026-09-01"), "2026/2027");
  assert.equal(saisonDeLaDate("2027-08-31"), "2026/2027");
  assert.equal(saisonDeLaDate("2026-08-31"), "2025/2026");
});

test("la saisie du nom est tolérante mais cohérente", () => {
  assert.equal(normaliserNomSaison("2026/2027"), "2026/2027");
  assert.equal(normaliserNomSaison(" 2026 - 2027 "), "2026/2027");
  assert.equal(normaliserNomSaison("2026/2028"), null);
  assert.equal(normaliserNomSaison("saison 2026"), null);
});

test("on propose la saison en cours, puis la suivante libre", () => {
  assert.equal(saisonAProposer([], "2026-10-08"), "2026/2027");
  assert.equal(saisonAProposer(["2026/2027"], "2026-10-08"), "2027/2028");
  assert.equal(saisonAProposer(["2026/2027", "2027/2028"], "2026-10-08"), "2028/2029");
});

test("la plus récente en premier", () => {
  const t = trierSaisons([{ nom: "2026/2027" }, { nom: "2028/2029" }, { nom: "2027/2028" }]);
  assert.deepEqual(t.map((s) => s.nom), ["2028/2029", "2027/2028", "2026/2027"]);
});

console.log("\n── Cavaliers et équipes ──");

test("retirer un cavalier le sort aussi de ses équipes", () => {
  const s = retirerCavalier(saison(), "leo");
  assert.equal(s.cavaliers.length, 2);
  assert.deepEqual(s.equipes.find((e) => e.id === "eq1")!.cavalierIds, ["zoe"]);
  assert.deepEqual(s.equipes.find((e) => e.id === "eq3")!.cavalierIds, []);
});

test("retirer une équipe efface ses résultats", () => {
  const s = retirerEquipe(saison(), "eq1");
  assert.equal(s.equipes.length, 2);
  assert.ok(s.resultats.every((r) => r.classements.every((c) => c.equipeId !== "eq1")));
});

test("noms des cavaliers et équipes d'un cavalier", () => {
  const s = saison();
  assert.deepEqual(nomsCavaliers(s, s.equipes[0]), ["Zoé Martin", "Léo"]);
  assert.deepEqual(equipesDuCavalier(s, "leo").map((e) => e.id), ["eq1", "eq3"]);
});

console.log("\n── Résultats ──");

test("saisir, modifier puis vider un classement", () => {
  let s = saisirClassement(saison(), "r1", "eq3", { rang: 2, points: 10 });
  assert.deepEqual(s.resultats.find((r) => r.id === "r1")!.classements.find((c) => c.equipeId === "eq3"), { equipeId: "eq3", rang: 2, points: 10 });
  s = saisirClassement(s, "r1", "eq3", { points: 9 });
  assert.deepEqual(s.resultats.find((r) => r.id === "r1")!.classements.find((c) => c.equipeId === "eq3"), { equipeId: "eq3", points: 9 });
  s = saisirClassement(s, "r1", "eq3", {});
  assert.equal(s.resultats.find((r) => r.id === "r1")!.classements.find((c) => c.equipeId === "eq3"), undefined);
  // L'autre concours n'a pas bougé
  assert.equal(s.resultats.find((r) => r.id === "r2")!.classements.length, 2);
});

test("lecture des nombres saisis", () => {
  assert.equal(lireNombre("12"), 12);
  assert.equal(lireNombre("6,5"), 6.5);
  assert.equal(lireNombre(""), undefined);
  assert.equal(lireNombre("abc"), undefined);
  assert.equal(lireNombre("-3"), undefined);
  assert.equal(lireNombre("0"), 0);
});

test("concours dans l'ordre des dates", () => {
  assert.deepEqual(resultatsTries(saison()).map((r) => r.id), ["r1", "r2"]);
});

console.log("\n── Bilan de la saison ──");

test("points cumulés, groupés par catégorie, meilleur total en tête", () => {
  const b = bilanSaison(saison());
  assert.deepEqual(b.map((g) => g.categorie), ["Benjamin", "Poussin"]);
  const benj = b[0].equipes;
  assert.deepEqual(benj.map((x) => x.equipe.id), ["eq1", "eq2"]);
  assert.equal(benj[0].pointsTotal, 20);
  assert.equal(benj[0].nbConcours, 2);
  assert.equal(benj[0].meilleurRang, 1);
  assert.equal(benj[1].pointsTotal, 18.5);
  assert.equal(b[1].equipes[0].nbConcours, 0);
  assert.equal(b[1].equipes[0].meilleurRang, undefined);
});

test("une équipe sans catégorie reste visible", () => {
  const s = saison();
  s.equipes.push({ id: "eq4", nom: "Nouvelle", categorie: " ", indice: "", cavalierIds: [] });
  assert.ok(bilanSaison(s).some((g) => g.categorie === "Sans catégorie"));
});

console.log("\n── Erreurs ──");

test("un refus d'accès renvoie vers la règle Firebase à publier", () => {
  const m = messageErreurSaison({ code: "permission-denied", message: "Missing or insufficient permissions." }, "Échec de la création");
  assert.match(m, /règle « saisons-pony-games »/);
  assert.equal(messageErreurSaison({ code: "unavailable", message: "hors ligne" }, "Échec"), "Échec : hors ligne");
  assert.equal(messageErreurSaison(null, "Échec"), "Échec");
});

console.log(process.exitCode ? "\n❌ des tests ont échoué" : `\n✅ ${passes} tests passés`);
