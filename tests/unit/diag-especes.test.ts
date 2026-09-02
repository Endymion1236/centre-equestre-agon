import assert from "node:assert/strict";
import { calculerDiagnosticEspeces } from "../../src/app/admin/comptabilite/diag-especes/diag-especes-utils";

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

const encs = [
  { id: "e1", montant: 100, remiseId: "r1" },
  { id: "e2", montant: 50 },
  { id: "e3", montant: -20, correctionDe: "e0" },
  { id: "e4", montant: 30 },
];
const remises = [
  { id: "r1", paymentMode: "especes", encaissementIds: ["e1", "e2"], total: 150 },
  { id: "r2", paymentMode: "cheque", encaissementIds: ["autre"], total: 99 },
  { id: "r3", paymentMode: "especes", encaissementIds: [], total: 0 },
];

console.log("\n── Totaux ──");

test("les entrées, sorties et total brut sont séparés", () => {
  const d = calculerDiagnosticEspeces(encs, remises);
  assert.equal(d.totalBrut, 160);
  assert.equal(d.totalPositif, 180);
  assert.equal(d.totalNegatif, -20);
});

test("le total sans remise reprend uniquement les lignes sans remiseId", () => {
  const d = calculerDiagnosticEspeces(encs, remises);
  assert.equal(d.totalRemis, 100);
  assert.equal(d.totalSansRemise, 60);
  assert.deepEqual(d.sansRemise.map((e) => e.id), ["e2", "e3", "e4"]);
});

console.log("\n── Remises espèces ──");

test("une remise est espèces par son mode ou parce qu'elle référence une ligne espèces", () => {
  const d = calculerDiagnosticEspeces(encs, [
    ...remises,
    { id: "r4", paymentMode: "mixte", encaissementIds: ["e4"], total: 30 },
  ]);
  assert.deepEqual(d.remisesEspeces.map((r) => r.id), ["r1", "r3", "r4"]);
});

test("les lignes référencées par une remise mais sans remiseId sont signalées", () => {
  const d = calculerDiagnosticEspeces(encs, remises);
  assert.deepEqual(d.incoherencesRemiseId.map((e) => e.id), ["e2"]);
});

test("une ligne avec remiseId n'est pas signalée comme incohérente", () => {
  const d = calculerDiagnosticEspeces(encs, remises);
  assert.equal(d.incoherencesRemiseId.some((e) => e.id === "e1"), false);
});

test("une remise d'un autre mode sans ligne espèces est ignorée", () => {
  const d = calculerDiagnosticEspeces(encs, remises);
  assert.equal(d.remisesEspeces.some((r) => r.id === "r2"), false);
});

console.log("\n── Arrondis ──");

test("les totaux monétaires sont arrondis au centime", () => {
  const d = calculerDiagnosticEspeces([
    { id: "a", montant: 0.1 },
    { id: "b", montant: 0.2 },
  ], []);
  assert.equal(d.totalBrut, 0.3);
  assert.equal(d.totalPositif, 0.3);
});

console.log(`\n✅ ${passes} tests passés\n`);
