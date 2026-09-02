import assert from "node:assert/strict";
import {
  arrondirLivreCaisse,
  calculerSyntheseLivreCaisse,
  extrairePeriodeLivreCaisse,
  totaliserMontantsLivreCaisse,
} from "../../src/app/admin/comptabilite/livre-caisse/livre-caisse-utils";

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

console.log("\n── Arrondis ──");

test("les centimes sont arrondis et -0 est normalisé", () => {
  assert.equal(arrondirLivreCaisse(10.005), 10.01);
  assert.equal(arrondirLivreCaisse(-0.0001), 0);
  assert.equal(Object.is(arrondirLivreCaisse(-0.0001), -0), false);
});

console.log("\n── Période mensuelle ──");

const mouvements = [
  { id: "ancien", date: new Date(2026, 7, 31, 23, 59), montant: 50 },
  { id: "b", date: new Date(2026, 8, 15, 12, 0), montant: -20 },
  { id: "a", date: new Date(2026, 8, 1, 0, 0), montant: 100 },
  { id: "suivant", date: new Date(2026, 9, 1, 0, 0), montant: 30 },
];

test("le mois est borné à [début, début du mois suivant[ et trié", () => {
  const resultat = extrairePeriodeLivreCaisse(mouvements, 2026, 8);
  assert.deepEqual(resultat.mouvementsDuMois.map((m) => m.id), ["a", "b"]);
  assert.equal(resultat.soldeInitial, 50);
});

test("le calcul de période ne modifie pas l'ordre du tableau source", () => {
  const copie = [...mouvements];
  extrairePeriodeLivreCaisse(mouvements, 2026, 8);
  assert.deepEqual(mouvements.map((m) => m.id), copie.map((m) => m.id));
});

console.log("\n── Soldes et totaux ──");

test("le solde est cumulé ligne par ligne au centime", () => {
  const resume = calculerSyntheseLivreCaisse(
    [
      { id: "1", montant: 100.1 },
      { id: "2", montant: 0.2 },
      { id: "3", montant: -40.15 },
    ],
    25,
  );
  assert.deepEqual(resume.lignes.map((l) => l.soldeApres), [125.1, 125.3, 85.15]);
  assert.equal(resume.totalEntrees, 100.3);
  assert.equal(resume.totalSorties, 40.15);
  assert.equal(resume.soldeFinal, 85.15);
});

test("un mois vide conserve le solde d'ouverture", () => {
  const resume = calculerSyntheseLivreCaisse([], 123.45);
  assert.deepEqual(resume.lignes, []);
  assert.equal(resume.totalEntrees, 0);
  assert.equal(resume.totalSorties, 0);
  assert.equal(resume.soldeFinal, 123.45);
});

test("le solde physique additionne tous les mouvements", () => {
  assert.equal(
    totaliserMontantsLivreCaisse([{ montant: 100 }, { montant: -35.2 }, { montant: 0.1 }]),
    64.9,
  );
});

console.log(`\n✅ ${passes} tests passés\n`);
