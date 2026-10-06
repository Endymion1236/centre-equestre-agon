import assert from "node:assert/strict";
import { MODE_CHEQUES_VACANCES_CONNECT, passeParRemise } from "../../src/lib/modes-remise";
import { COMPTES_REGLEMENT } from "../../src/lib/fec-complet";
import { paymentModes, manualPaymentModes } from "../../src/app/admin/paiements/types";

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

test("les chèques vacances papier passent par une remise", () => {
  assert.equal(passeParRemise("cheque_vacances"), true);
  assert.equal(passeParRemise("ancv"), true);
});

test("les chèques vacances Connect n'y passent pas : l'ANCV vire au club", () => {
  assert.equal(passeParRemise(MODE_CHEQUES_VACANCES_CONNECT), false);
  assert.equal(MODE_CHEQUES_VACANCES_CONNECT, "cheque_vacances_connect");
});

test("chèques, espèces et CB terminal restent dans les remises", () => {
  for (const m of ["cheque", "cheque_differe", "especes", "cb_terminal", "pass_sport"]) {
    assert.equal(passeParRemise(m), true, m);
  }
});

test("virement, SEPA, carte en ligne et avoir n'y passent pas", () => {
  for (const m of ["virement", "prelevement_sepa", "cb_online", "cb_cawl", "cb", "avoir"]) {
    assert.equal(passeParRemise(m), false, m);
  }
});

test("un mode absent ou inconnu reste visible dans les remises (on ne cache rien par défaut)", () => {
  assert.equal(passeParRemise(undefined), true);
  assert.equal(passeParRemise(""), true);
  assert.equal(passeParRemise("mode_inconnu"), true);
});

test("le FEC sait où ranger un règlement Connect", () => {
  assert.equal(COMPTES_REGLEMENT[MODE_CHEQUES_VACANCES_CONNECT]?.compte, "51180000");
});

test("Connect se choisit à la main, à côté du papier", () => {
  const ids = manualPaymentModes.map((m) => m.id);
  assert.ok(ids.includes(MODE_CHEQUES_VACANCES_CONNECT));
  assert.equal(paymentModes.find((m) => m.id === "cheque_vacances")?.label, "Chèques vacances papier");
});

if (!process.exitCode) console.log(`✅ ${passes} tests passés`);
