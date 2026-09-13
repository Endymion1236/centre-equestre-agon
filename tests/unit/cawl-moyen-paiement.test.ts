/**
 * Le moyen réellement utilisé sur la page CAWL (carte, PayPal…) et son
 * libellé au journal (src/lib/cawl-moyen-paiement.ts).
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { moyenPaiementCawl, libelleEncaissementCawl } from "../../src/lib/cawl-moyen-paiement";

test("PayPal est reconnu par son produit 840 en sortie redirigée", () => {
  const m = moyenPaiementCawl({ paymentMethod: "redirect", redirectPaymentMethodSpecificOutput: { paymentProductId: 840 } });
  assert.deepEqual(m, { moyen: "paypal", libelle: "PayPal", produit: 840 });
  assert.equal(libelleEncaissementCawl(m), "PayPal via CAWL");
  assert.equal(libelleEncaissementCawl(m, "acompte"), "PayPal via CAWL (acompte)");
});

test("une carte garde le libellé historique du journal", () => {
  const m = moyenPaiementCawl({ paymentMethod: "card", cardPaymentMethodSpecificOutput: { paymentProductId: 130, token: "t" } });
  assert.equal(m.moyen, "carte"); assert.equal(m.libelle, "Carte bancaire (CB)");
  assert.equal(libelleEncaissementCawl(m), "CB en ligne (CAWL)");
  assert.equal(libelleEncaissementCawl(m, "paiement partiel 30.00€"), "CB en ligne CAWL (paiement partiel 30.00€)");
});

test("sans sortie exploitable : carte par défaut ; produit inconnu nommé par son numéro", () => {
  assert.equal(moyenPaiementCawl(undefined).moyen, "carte");
  assert.equal(moyenPaiementCawl({}).libelle, "Carte bancaire");
  const inconnu = moyenPaiementCawl({ paymentMethod: "redirect", redirectPaymentMethodSpecificOutput: { paymentProductId: 9999 } });
  assert.equal(inconnu.moyen, "autre"); assert.match(inconnu.libelle, /produit 9999/);
  assert.equal(moyenPaiementCawl({ paymentMethod: "mobile", mobilePaymentMethodSpecificOutput: { paymentProductId: 302 } }).moyen, "apple_pay");
});
