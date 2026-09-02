import assert from "node:assert/strict";
import { construireDiagnosticRemises } from "../../src/app/admin/comptabilite/diagnostic-remises-utils";

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

const remises = [
  {
    id: "ancienne",
    createdAt: { seconds: Date.UTC(2026, 6, 3, 12) / 1000 },
    total: 150,
    pointee: true,
    paymentMode: "cheque",
    encaissementIds: ["e1", "e2"],
  },
  {
    id: "recente",
    createdAt: { seconds: Date.UTC(2026, 7, 5, 12) / 1000 },
    total: 220,
    pointee: false,
    mode: "especes",
    paymentIds: ["legacy"],
  },
  {
    id: "sans-date",
    total: 30,
    pointee: false,
  },
];

const encaissements = [
  { mode: "cb_terminal", reconciledByBank: true },
  { mode: "cb_terminal", reconciledByBank: false },
  { mode: "especes", reconciledByBank: true },
];

console.log("\n── Diagnostic des remises ──");

test("les remises sont regroupées par mois, y compris celles sans date", () => {
  const rapport = construireDiagnosticRemises(remises, encaissements);
  assert.deepEqual(rapport.parMois["2026-07"], { count: 1, totalEur: 150, pointees: 1 });
  assert.deepEqual(rapport.parMois["2026-08"], { count: 1, totalEur: 220, pointees: 0 });
  assert.deepEqual(rapport.parMois["???"], { count: 1, totalEur: 30, pointees: 0 });
});

test("le rapport distingue les remises pointées et les modes", () => {
  const rapport = construireDiagnosticRemises(remises, encaissements);
  assert.deepEqual(rapport.parEtat, { pointees: 1, nonPointees: 2 });
  assert.deepEqual(rapport.parMode, { cheque: 1, especes: 1, "?": 1 });
});

test("les remises récentes sont triées sans modifier l'entrée", () => {
  const idsAvant = remises.map((remise) => remise.id);
  const rapport = construireDiagnosticRemises(remises, encaissements);
  assert.deepEqual(rapport.recentes.map((remise) => remise.id), ["recente", "ancienne", "sans-date"]);
  assert.deepEqual(remises.map((remise) => remise.id), idsAvant);
});

test("les compteurs récents conservent les formats actuel et historique", () => {
  const rapport = construireDiagnosticRemises(remises, encaissements);
  assert.equal(rapport.recentes[1].nbEncaissements, 2);
  assert.equal(rapport.recentes[0].nbPaymentsLegacy, 1);
});

test("les encaissements rapprochés et CB terminal sont comptés", () => {
  const rapport = construireDiagnosticRemises(remises, encaissements);
  assert.deepEqual(rapport.encaissements, { total: 3, reconciled: 2, cbTerminal: 2 });
});

test("seules les quinze remises les plus récentes sont exposées", () => {
  const nombreuses = Array.from({ length: 20 }, (_, index) => ({
    id: String(index),
    createdAt: { seconds: index + 1 },
  }));
  const rapport = construireDiagnosticRemises(nombreuses, []);
  assert.equal(rapport.recentes.length, 15);
  assert.equal(rapport.recentes[0].id, "19");
  assert.equal(rapport.recentes[14].id, "5");
});

console.log(`\n✅ ${passes} tests passés\n`);
