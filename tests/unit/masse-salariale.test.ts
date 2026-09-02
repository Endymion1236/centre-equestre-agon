import assert from "node:assert/strict";
import {
  REF_CHARGES_PERSONNEL_AN,
  MOIS_EXERCICE,
  calculerMasseParMois,
  exerciceDe,
  exercicesDisponiblesMasse,
  lignesChargeDuMois,
  lignesSalaireDuMois,
  moisDeExercice,
  refBilanMois,
} from "../../src/app/admin/comptabilite/masse-salariale/masse-salariale-utils";

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

console.log("\n── Exercice juillet → juin ──");

test("juillet ouvre l'exercice et juin le termine", () => {
  assert.equal(exerciceDe("2025-07"), "2025-2026");
  assert.equal(exerciceDe("2026-06"), "2025-2026");
  assert.equal(moisDeExercice("2025-2026", "07"), "2025-07");
  assert.equal(moisDeExercice("2025-2026", "03"), "2026-03");
});

test("la référence mensuelle retombe exactement sur le total annuel du bilan", () => {
  const total = MOIS_EXERCICE.reduce((s, mm) => s + refBilanMois(mm), 0);
  assert.ok(Math.abs(total - REF_CHARGES_PERSONNEL_AN) < 0.001);
});

console.log("\n── Brut et coût employeur ──");

const lignes = [
  { type: "salaire" as const, mois: "2026-08", brut: 2000, coutEmployeur: 2800, montant: null },
  { type: "salaire" as const, mois: "2026-08", brut: 1000, coutEmployeur: null, montant: null },
  { type: "charge" as const, mois: "2026-08", brut: 0, coutEmployeur: null, montant: 350 },
];

test("le mode brut ignore charges et coût employeur", () => {
  const r = calculerMasseParMois(lignes, "brut");
  assert.equal(r.totalParMois.get("2026-08"), 3000);
  assert.equal(r.moisPartiels.size, 0);
});

test("le mode coût ajoute les charges et signale le fallback sur brut", () => {
  const r = calculerMasseParMois(lignes, "cout");
  assert.equal(r.totalParMois.get("2026-08"), 4150);
  assert.deepEqual([...r.moisPartiels], ["2026-08"]);
});

test("l'exercice courant reste visible sans donnée", () => {
  assert.deepEqual(
    exercicesDisponiblesMasse([{ mois: "2024-08" }], new Date(2026, 8, 1)),
    ["2024-2025", "2026-2027"],
  );
});

console.log("\n── Détail du mois ──");

test("les salariés et charges sont filtrés et triés séparément", () => {
  const donnees = [
    { type: "salaire" as const, mois: "2026-08", salarie: "Zoé", libelle: "", brut: 1, coutEmployeur: null, montant: null },
    { type: "charge" as const, mois: "2026-08", salarie: "", libelle: "TESA", brut: 0, coutEmployeur: null, montant: 1 },
    { type: "salaire" as const, mois: "2026-08", salarie: "Alice", libelle: "", brut: 1, coutEmployeur: null, montant: null },
    { type: "charge" as const, mois: "2026-08", salarie: "", libelle: "MSA", brut: 0, coutEmployeur: null, montant: 1 },
    { type: "salaire" as const, mois: "2026-07", salarie: "Hors mois", libelle: "", brut: 1, coutEmployeur: null, montant: null },
  ];
  assert.deepEqual(lignesSalaireDuMois(donnees, "2026-08").map(x => x.salarie), ["Alice", "Zoé"]);
  assert.deepEqual(lignesChargeDuMois(donnees, "2026-08").map(x => x.libelle), ["MSA", "TESA"]);
});

console.log(`\n✅ ${passes} tests passés\n`);
