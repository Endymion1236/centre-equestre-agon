/**
 * Pourquoi un paiement CAWL n'a pas abouti (src/lib/cawl-echec.ts) : lecture
 * du statut, du code hérité, des erreurs et du 3-D Secure, et conseil donné
 * à la famille.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { resumerEchecCawl, conseilApresEchec } from "../../src/lib/cawl-echec";

test("refus bancaire classique : code 2, carte, montant", () => {
  const r = resumerEchecCawl({
    id: "p1", status: "REJECTED",
    statusOutput: { statusCode: 2, statusCategory: "UNSUCCESSFUL", errors: [{ id: "AUTHORISATION_DECLINED", errorCode: "430285", message: "Not authorised" }] },
    paymentOutput: { amountOfMoney: { amount: 6000 }, paymentMethod: "card", cardPaymentMethodSpecificOutput: { paymentProductId: 130 } },
  });
  assert.equal(r.statut, "REJECTED"); assert.equal(r.code, 2); assert.equal(r.montant, 60);
  assert.match(r.explication, /^Autorisation refusée par la banque du client/);
  assert.match(r.explication, /AUTHORISATION_DECLINED — Not authorised/);
  assert.match(r.explication, /\(code 2\)/);
  assert.match(conseilApresEchec(r), /banque a refusé/);
});

test("abandon par le client : code 1 ou statut CANCELLED, conseil rassurant", () => {
  const a = resumerEchecCawl({ status: "CANCELLED", statusOutput: { statusCode: 1 }, paymentOutput: { amountOfMoney: { amount: 3000 } } });
  assert.match(a.explication, /annulé par le client/);
  assert.match(conseilApresEchec(a), /rien n'a été débité/i);
  const b = resumerEchecCawl({ status: "CANCELLED", paymentOutput: {} });
  assert.match(b.explication, /annulé par le client/);
});

test("3-D Secure échoué : dit à la famille de garder son application bancaire", () => {
  const r = resumerEchecCawl({
    status: "REJECTED", statusOutput: { statusCode: 57 },
    paymentOutput: { paymentMethod: "card", cardPaymentMethodSpecificOutput: { paymentProductId: 3, threeDSecureResults: { authenticationStatus: "N" } } },
  });
  assert.match(r.explication, /3-D Secure échouée/); assert.match(r.explication, /Mastercard/);
  assert.match(conseilApresEchec(r), /3-D Secure/);
});

test("PayPal refusé : le moyen est nommé ; statut inconnu : phrase générique sans plantage", () => {
  const r = resumerEchecCawl({ status: "REJECTED", statusOutput: { statusCode: 93 }, paymentOutput: { paymentMethod: "redirect", redirectPaymentMethodSpecificOutput: { paymentProductId: 840 } } });
  assert.match(r.explication, /Paiement refusé .*PayPal/);
  const x = resumerEchecCawl({ status: "BIZARRE" });
  assert.equal(x.explication, "Paiement non abouti (statut BIZARRE)");
  assert.equal(resumerEchecCawl(undefined).explication, "Paiement non abouti");
});
