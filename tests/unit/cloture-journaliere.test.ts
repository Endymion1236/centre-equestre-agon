import assert from "node:assert/strict";
import {
  calculerSyntheseCloture,
  cloturePourDate,
  cloturePrecedente,
  numeroZ,
  prochainNumeroCloture,
} from "../../src/app/admin/comptabilite/cloture-journaliere/cloture-utils";

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

console.log("\n── Synthèse ticket Z ──");

test("les mouvements de trésorerie sont scellés mais exclus des recettes", () => {
  const result = calculerSyntheseCloture([
    { id: "cb", mode: "cb_terminal", montant: 100 },
    { id: "cash", mode: "especes", montant: 20 },
    { id: "apport", mode: "especes", montant: 50, isApportCaisse: true },
    { id: "banque", mode: "especes", montant: -30, isVersementBanque: true },
  ]);
  assert.deepEqual(result.recettesDuJour.map((e) => e.id), ["cb", "cash"]);
  assert.deepEqual(result.mouvementsTresorerie.map((e) => e.id), ["apport", "banque"]);
  assert.equal(result.totalGeneral, 120);
  assert.equal(result.totalTresorerie, 20);
});

test("les recettes sont totalisées et arrondies par mode", () => {
  const result = calculerSyntheseCloture([
    { mode: "cb_terminal", montant: 10.005 },
    { mode: "cb_terminal", montant: 4.005 },
    { mode: "cheque", montant: 12.5 },
  ]);
  assert.deepEqual(result.totauxParMode, { cb_terminal: 14.01, cheque: 12.5 });
  assert.equal(result.totalGeneral, 26.51);
});

test("un mode absent est rangé dans inconnu", () => {
  const result = calculerSyntheseCloture([{ montant: 7 }]);
  assert.deepEqual(result.totauxParMode, { inconnu: 7 });
});

test("une journée vide produit un ticket Z à zéro", () => {
  const result = calculerSyntheseCloture([]);
  assert.equal(result.totalGeneral, 0);
  assert.equal(result.totalTresorerie, 0);
  assert.deepEqual(result.totauxParMode, {});
});

console.log("\n── Chaînage des clôtures ──");

const historique = [
  { date: "2026-08-31", numero: 12, hash: "h12" },
  { date: "2026-08-30", numero: 11, hash: "h11" },
  { date: "2026-08-29", numero: 9, hash: "h9" },
];

test("le prochain numéro suit le maximum même si l'ordre change", () => {
  assert.equal(prochainNumeroCloture([historique[1], historique[2], historique[0]]), 13);
  assert.equal(prochainNumeroCloture([]), 1);
});

test("la clôture précédente est celle au numéro le plus élevé", () => {
  assert.equal(cloturePrecedente([historique[1], historique[0], historique[2]])?.hash, "h12");
  assert.equal(cloturePrecedente([]), null);
});

test("une clôture existante est retrouvée par sa date", () => {
  assert.equal(cloturePourDate(historique, "2026-08-30")?.numero, 11);
  assert.equal(cloturePourDate(historique, "2026-09-01"), undefined);
});

test("le numéro Z est toujours formaté sur quatre chiffres", () => {
  assert.equal(numeroZ(1), "Z0001");
  assert.equal(numeroZ(123), "Z0123");
});

console.log(`\n✅ ${passes} tests passés\n`);
