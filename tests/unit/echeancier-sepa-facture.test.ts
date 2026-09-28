import assert from "node:assert/strict";
import { echeancierSepaFacture } from "../../src/lib/echeancier-sepa-facture";

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

test("forfait entièrement prélevé : échéancier listé, rien à virer", () => {
  const r = echeancierSepaFacture([
    { dateEcheance: "2026-11-05", montant: 150, status: "pending" },
    { dateEcheance: "2026-10-05", montant: 150, status: "pending" },
  ], 300);
  assert.ok(r);
  assert.deepEqual(r!.lignes, ["05/10/2026 : 150.00 €", "05/11/2026 : 150.00 €"]);
  assert.equal(r!.montantPrevu, 300);
  assert.equal(r!.resteHorsPrelevement, 0);
});

test("moitié prélevée, moitié à régler autrement : seule cette part reste à virer", () => {
  const r = echeancierSepaFacture([{ dateEcheance: "2026-10-05", montant: 325, status: "pending" }], 650);
  assert.equal(r!.resteHorsPrelevement, 325);
});

test("les prélèvements passés ou rejetés ne comptent pas ; une remise en cours oui", () => {
  const r = echeancierSepaFacture([
    { dateEcheance: "2026-09-05", montant: 100, status: "preleve" },
    { dateEcheance: "2026-09-20", montant: 100, status: "rejete" },
    { dateEcheance: "2026-10-05", montant: 100, status: "remis" },
  ], 200);
  assert.equal(r!.montantPrevu, 100);
  assert.equal(r!.resteHorsPrelevement, 100);
});

test("aucun prélèvement à venir : rendu ordinaire (virement, QR)", () => {
  assert.equal(echeancierSepaFacture([], 300), null);
  assert.equal(echeancierSepaFacture([{ montant: 50, status: "preleve" }], 300), null);
});

console.log(`\n✅ ${passes} tests passés\n`);
