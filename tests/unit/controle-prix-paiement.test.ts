/**
 * tests/unit/controle-prix-paiement.test.ts — le contrôle des prix au paiement CAWL
 * ne refuse ni un lien partiel choisi par l'admin, ni le solde d'une commande déjà réglée en partie.
 *   npx tsx tests/unit/controle-prix-paiement.test.ts
 */
import assert from "node:assert/strict";
import { evaluatePaymentEnforcement, type PricingAuditResult } from "../../src/lib/server-pricing";

let passes = 0;
function test(nom: string, fn: () => void) {
  try { fn(); passes++; console.log(`  ✅ ${nom}`); }
  catch (e: any) { console.error(`  ❌ ${nom}\n     ${e.message}`); process.exitCode = 1; }
}

const audit = (charge: number): PricingAuditResult => ({
  paymentId: "p", ok: true, reliable: true, isDeposit: false, claimedTotalTTC: 180, claimedChargeTTC: charge,
  minLegitTotalTTC: 180, maxLegitTotalTTC: 180, nbStageChildren: 1, expectedDepositTTC: null, items: [], globalIssues: [],
});

test("un vrai sous-paiement reste bloqué (30 € pour une commande de 180 €, rien de payé)", () => {
  assert.equal(evaluatePaymentEnforcement(audit(30)).block, true);
});

test("lien de 30 € envoyé par l'admin : jamais bloqué", () => {
  assert.equal(evaluatePaymentEnforcement(audit(30), { montantChoisiParAdmin: true }).block, false);
});

test("solde de 150 € après 30 € déjà payés : accepté ; 100 € restent un sous-paiement", () => {
  assert.equal(evaluatePaymentEnforcement(audit(150), { dejaPaye: 30 }).block, false);
  assert.equal(evaluatePaymentEnforcement(audit(100), { dejaPaye: 30 }).block, true);
});

console.log(`\n${process.exitCode ? "❌" : "✅"} ${passes} tests passés`);
