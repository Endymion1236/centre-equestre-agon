/**
 * tests/unit/sepa-unique.test.ts — une inscription réglée par prélèvement SEPA n'est pas « réglée » le jour même.
 *   npx tsx tests/unit/sepa-unique.test.ts
 */
import assert from "node:assert/strict";
import { champsCommandeSepaUnique, echeanceSepaUnique, estModeSepa, mandatLePlusRecent } from "../../src/lib/sepa-unique";

let passes = 0;
function test(nom: string, fn: () => void) {
  try { fn(); passes++; console.log(`  ✅ ${nom}`); }
  catch (e: any) { console.error(`  ❌ ${nom}\n     ${e.message}`); process.exitCode = 1; }
}

test("la commande est programmée, ni réglée ni encaissée", () => {
  const c = champsCommandeSepaUnique(51, "MDT-12");
  assert.equal(c.status, "sepa_scheduled");
  assert.equal(c.paidAmount, 0);
  assert.equal(c.sepaRestant, 51);
  assert.equal(c.paymentMode, "prelevement_sepa");
  assert.equal(c.prenotificationSepa, "a_verifier", "pré-notification à relire avant envoi");
  assert.equal(estModeSepa("prelevement_sepa"), true);
  assert.equal(estModeSepa("cb_terminal"), false);
});

test("une échéance unique rattachée à la commande", () => {
  const e = echeanceSepaUnique({ familyId: "f1", familyName: "LENGRONNE", mandatId: "MDT-12", montant: 51.004, description: "Engagement — junior", paymentId: "p1", dateEcheance: "2026-10-08" });
  assert.deepEqual(e, {
    familyId: "f1", familyName: "LENGRONNE", mandatId: "MDT-12", montant: 51, dateEcheance: "2026-10-08",
    reference: "Paiement p1", description: "Engagement — junior — 1/1", status: "pending", remiseId: null,
    paymentId: "p1", echeance: 1, echeancesTotal: 1,
  });
});

test("mandat : le plus récent des actifs", () => {
  const m = mandatLePlusRecent([
    { mandatId: "ancien", status: "active", createdAt: { seconds: 100 } },
    { mandatId: "revoque", status: "revoked", createdAt: { seconds: 300 } },
    { mandatId: "recent", status: "active", createdAt: { seconds: 200 } },
  ]);
  assert.equal((m as any).mandatId, "recent");
  assert.equal(mandatLePlusRecent([]), null);
});

console.log(`\n${process.exitCode ? "❌" : "✅"} ${passes} tests passés`);
