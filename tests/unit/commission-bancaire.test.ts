import assert from "node:assert/strict";
import { test } from "node:test";
import { posteCommissionCarte } from "../../src/lib/postes-depenses";
const FRAIS = "Frais bancaires & commissions (CB, Stripe)";
test("les commissions et frais prélevés par la banque sont reconnus", () => {
  for (const l of ["Com Carte", "COMMISSION CARTE", "Commission vente distance", "Commission vente à distance", "COMMISSIONS VAD", "Commission paiement", "Frais bancaires", "Frais de tenue de compte", "Cotisation carte", "Commission s/emprunt", "Commissions sur emprunt"]) assert.equal(posteCommissionCarte(l), FRAIS, l);
});
test("un paiement par carte ou un fournisseur ordinaire n'est pas une commission", () => {
  for (const l of ["CARTE POINT.P", "Carte Amazon", "ORANGE SA", "Commission de sécurité", "Frais de port", ""]) assert.equal(posteCommissionCarte(l), null, l);
});
