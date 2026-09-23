import assert from "node:assert/strict";
import {
  construireLignesResultat,
  exerciceDe,
  exercicesDisponibles,
  moisDe,
  resultatMensuel,
  resumerResultat,
  type MoisResultat,
} from "../../src/app/admin/comptabilite/resultat/resultat-utils";

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

console.log("\n── Exercice ──");

test("juillet et juin appartiennent au même exercice juillet-juin", () => {
  assert.equal(exerciceDe("2026-07"), "2026-2027");
  assert.equal(exerciceDe("2027-06"), "2026-2027");
  assert.equal(moisDe("2026-2027", "07"), "2026-07");
  assert.equal(moisDe("2026-2027", "06"), "2027-06");
});

const donnees: MoisResultat[] = [
  { mois: "2026-07", ca: 10000, masse: 4000, depenses: 2000 },
  { mois: "2026-08", ca: 12000, masse: 4500, depenses: 2500 },
  { mois: "2025-06", ca: 8000, masse: 3000, depenses: 1000 },
];

test("les exercices disponibles gardent l'historique et ajoutent le courant", () => {
  assert.deepEqual(exercicesDisponibles(donnees, "2026-09"), ["2024-2025", "2026-2027"]);
});

console.log("\n── Lignes mensuelles ──");

test("l'exercice contient douze mois dans l'ordre juillet à juin", () => {
  const lignes = construireLignesResultat(donnees, "2026-2027", "2026-09");
  assert.equal(lignes.length, 12);
  assert.equal(lignes[0].mois, "2026-07");
  assert.equal(lignes[11].mois, "2027-06");
});

test("les mois postérieurs au mois courant sont marqués futurs", () => {
  const lignes = construireLignesResultat(donnees, "2026-2027", "2026-09");
  assert.equal(lignes.find((l) => l.mois === "2026-09")?.futur, false);
  assert.equal(lignes.find((l) => l.mois === "2026-10")?.futur, true);
});

test("les mois absents sont complétés à zéro", () => {
  const lignes = construireLignesResultat(donnees, "2026-2027", "2026-09");
  const septembre = lignes.find((l) => l.mois === "2026-09")!;
  assert.deepEqual({ ca: septembre.ca, masse: septembre.masse, depenses: septembre.depenses }, { ca: 0, masse: 0, depenses: 0 });
});

console.log("\n── CA repris de l'ancien logiciel (Celeris) ──");

test("le CA du mois additionne la caisse et le CA repris, affichés à part", () => {
  const avecCeleris: MoisResultat[] = [
    { mois: "2026-07", ca: 1200, masse: 0, depenses: 0, caExterne: 55981.26, caExterneNote: "Celeris" },
    { mois: "2026-08", ca: 0, masse: 0, depenses: 0, caExterne: 32344.5 },
  ];
  const lignes = construireLignesResultat(avecCeleris, "2026-2027", "2026-09");
  const juillet = lignes.find((l) => l.mois === "2026-07")!;
  assert.equal(juillet.caCaisse, 1200);
  assert.equal(juillet.caExterne, 55981.26);
  assert.equal(juillet.ca, 57181.26);
  assert.equal(juillet.caExterneNote, "Celeris");
  const aout = lignes.find((l) => l.mois === "2026-08")!;
  assert.equal(aout.ca, 32344.5);
  assert.equal(aout.caExterneNote, "");
});

test("sans CA repris, rien ne change", () => {
  const lignes = construireLignesResultat(donnees, "2026-2027", "2026-09");
  assert.ok(lignes.every((l) => l.caExterne === 0 && l.ca === l.caCaisse));
});

test("le cumul suit le CA repris et le reste en tient compte", () => {
  const avecCeleris: MoisResultat[] = [
    { mois: "2026-07", ca: 1000, masse: 500, depenses: 200, caExterne: 4000 },
    { mois: "2026-08", ca: 0, masse: 300, depenses: 100, caExterne: 2000 },
  ];
  const { cumul, reste } = resumerResultat(construireLignesResultat(avecCeleris, "2026-2027", "2026-09"));
  assert.equal(cumul.ca, 7000);
  assert.equal(cumul.caExterne, 6000);
  assert.equal(reste, 7000 - 800 - 300);
});

console.log("\n── Résultat ──");

test("le cumul ignore les mois futurs", () => {
  const lignes = construireLignesResultat([
    ...donnees,
    { mois: "2026-10", ca: 99999, masse: 99999, depenses: 99999 },
  ], "2026-2027", "2026-09");
  const result = resumerResultat(lignes);
  assert.deepEqual(result.cumul, { ca: 22000, caExterne: 0, masse: 8500, depenses: 4500 });
  assert.equal(result.reste, 9000);
});

test("la part salariale est calculée sur le CA et arrondie", () => {
  const result = resumerResultat(construireLignesResultat(donnees, "2026-2027", "2026-09"));
  assert.equal(result.pctMasse, 39);
});

test("sans CA, le pourcentage salarial reste indéterminé", () => {
  const result = resumerResultat(construireLignesResultat([], "2026-2027", "2026-09"));
  assert.equal(result.pctMasse, null);
});

test("le résultat mensuel soustrait masse et dépenses", () => {
  assert.deepEqual(resultatMensuel({ ca: 1000, masse: 400, depenses: 250 }), { reste: 350, pctMasse: 40 });
  assert.deepEqual(resultatMensuel({ ca: 0, masse: 100, depenses: 0 }), { reste: -100, pctMasse: null });
});

console.log(`\n✅ ${passes} tests passés\n`);
