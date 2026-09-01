import assert from "node:assert/strict";
import {
  attenduAdate,
  construirePostes,
  cumulPoste,
  exerciceDe,
  exercicesDisponibles,
  facturesDe,
  moisDe,
  nombreMoisEcoules,
  posteEnDepassement,
  totalDe,
  totalMois,
  type Depense,
} from "../../src/app/admin/comptabilite/depenses/depenses-utils";

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

const depenses: Depense[] = [
  { id: "1", mois: "2026-07", poste: "Vétérinaire", fournisseur: "Clinique A", montant: 100, note: "" },
  { id: "2", mois: "2026-07", poste: "Vétérinaire", fournisseur: "Clinique B", montant: 50, note: "" },
  { id: "3", mois: "2026-08", poste: "Foin", fournisseur: "Ferme", montant: 300, note: "" },
  { id: "4", mois: "2025-06", poste: "Ancien poste", fournisseur: "X", montant: 40, note: "" },
];

console.log("\n── Exercice juillet → juin ──");

test("juillet ouvre le nouvel exercice", () => {
  assert.equal(exerciceDe("2026-07"), "2026-2027");
});

test("juin appartient à l'exercice commencé l'année précédente", () => {
  assert.equal(exerciceDe("2027-06"), "2026-2027");
});

test("moisDe utilise la bonne année de part et d'autre de janvier", () => {
  assert.equal(moisDe("2026-2027", "12"), "2026-12");
  assert.equal(moisDe("2026-2027", "01"), "2027-01");
});

test("les exercices historiques sont conservés et l'exercice courant ajouté", () => {
  assert.deepEqual(exercicesDisponibles(depenses, "2026-09"), ["2024-2025", "2026-2027"]);
});

console.log("\n── Postes et factures ──");

test("les postes historiques et personnalisés complètent les postes par défaut sans doublon", () => {
  const postes = construirePostes(
    [{ nom: "Vétérinaire", ref: 1000 }],
    depenses,
    ["Communication", "Vétérinaire"],
  );
  assert.deepEqual(postes.map((p) => p.nom), ["Vétérinaire", "Ancien poste", "Communication", "Foin"]);
  assert.equal(postes.find((p) => p.nom === "Communication")?.ref, null);
});

test("facturesDe cible exactement poste et mois", () => {
  assert.deepEqual(facturesDe(depenses, "Vétérinaire", "2026-07").map((d) => d.id), ["1", "2"]);
});

test("totalDe additionne toutes les factures d'une case", () => {
  assert.equal(totalDe(depenses, "Vétérinaire", "2026-07"), 150);
});

console.log("\n── Pilotage à date ──");

test("en septembre, trois mois de l'exercice juillet-juin sont écoulés", () => {
  assert.equal(nombreMoisEcoules("2026-2027", "2026-09"), 3);
});

test("un exercice totalement passé compte douze mois", () => {
  assert.equal(nombreMoisEcoules("2024-2025", "2026-09"), 12);
});

test("un exercice futur ne compte aucun mois", () => {
  assert.equal(nombreMoisEcoules("2027-2028", "2026-09"), 0);
});

test("l'attendu est proratisé sur les mois écoulés", () => {
  assert.equal(attenduAdate(1200, 3), 300);
  assert.equal(attenduAdate(null, 3), null);
});

test("le signalement se déclenche seulement au-delà de 110 %", () => {
  assert.equal(posteEnDepassement(330, 300), false);
  assert.equal(posteEnDepassement(331, 300), true);
  assert.equal(posteEnDepassement(999, null), false);
});

console.log("\n── Totaux matrice ──");

test("cumulPoste additionne l'exercice choisi uniquement", () => {
  assert.equal(cumulPoste(depenses, "Vétérinaire", "2026-2027"), 150);
  assert.equal(cumulPoste(depenses, "Ancien poste", "2026-2027"), 0);
});

test("totalMois additionne les postes visibles", () => {
  assert.equal(totalMois(depenses, [
    { nom: "Vétérinaire", ref: 1000 },
    { nom: "Foin", ref: 2000 },
  ], "2026-2027", "07"), 150);
  assert.equal(totalMois(depenses, [
    { nom: "Vétérinaire", ref: 1000 },
    { nom: "Foin", ref: 2000 },
  ], "2026-2027", "08"), 300);
});

console.log(`\n✅ ${passes} tests passés\n`);
