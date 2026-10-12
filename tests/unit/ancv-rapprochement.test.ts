import assert from "node:assert/strict";
import { estLigneAncv, estModeAncv, ecartAncv, libelleEcartAncv } from "../../src/lib/ancv-rapprochement";

let n = 0;
const test = (nom: string, fn: () => void) => { try { fn(); n++; } catch (e) { console.error(`❌ ${nom}`); throw e; } };

test("libellé DRFIP de l'ANCV reconnu", () => {
  assert.equal(estLigneAncv("Virement en votre faveur DRFIP ILE DE FRANCE ET DE PARIS - P 865162E001P001 BDR 069078660 1D0750000 -ANCV-DC2699G6EL-1"), true);
  assert.equal(estLigneAncv("VIR SEPA DUPONT CHANCVILLE"), false);
  assert.equal(estLigneAncv(undefined), false);
});

test("modes remboursés par l'ANCV", () => {
  assert.equal(estModeAncv("cheque_vacances_connect"), true);
  assert.equal(estModeAncv("cheque_vacances"), true);
  assert.equal(estModeAncv("virement"), false);
});

test("460 € Connect → 448,50 € : commission de 2,5 %", () => {
  const e = ecartAncv(460, 448.5);
  assert.equal(e.commission, 11.5);
  assert.equal(e.taux, 2.5);
  assert.equal(e.plausible, true);
  assert.equal(libelleEcartAncv(460, 448.5), "460,00 € − commission ANCV 11,50 € (2,5 %) = 448,50 €");
});

test("montant exact : pas de commission", () => {
  assert.deepEqual(ecartAncv(100, 100), { commission: 0, taux: 0, plausible: true });
  assert.equal(libelleEcartAncv(100, 100), "100,00 €");
});

test("net supérieur au brut, ou écart trop grand : pas plausible", () => {
  assert.equal(ecartAncv(400, 448.5).plausible, false);
  assert.equal(ecartAncv(600, 448.5).plausible, false);
  assert.equal(ecartAncv(0, 10).plausible, false);
});

console.log(`✅ ${n} tests passés`);
