import assert from "node:assert/strict";
import { test } from "node:test";
import { nettoyerPiece, proposerAssociations, validerLienDevise } from "../../src/lib/justificatifs";
import { candidatsAutomatiques } from "../../src/lib/matching-automatique";
const p = nettoyerPiece({ devise: "usd", typeDocument: "achat", fournisseur: "Resend", numero: "F1", date: "2026-07-04", ht: 20, tva: 0, ttc: 20 });
const d = { id: "debit", source: "releve-bancaire", fournisseur: "Resend", dateOperation: "2026-07-05", montant: 18.47 };
test("20 USD et 18,47 EUR restent distincts dans l’association manuelle", () => {
  const avant = JSON.stringify([p, d]);
  assert.deepEqual(validerLienDevise(p, d, true), { deviseFacture: "USD", montantFacture: 20, montantDebiteEUR: 18.47 });
  assert.equal(JSON.stringify([p, d]), avant);
});
test("aucun matching numérique ou automatique entre devises, même si 20 égale 20", () => {
  assert.equal(proposerAssociations(p, [{ ...d, montant: 20 }]).length, 0);
  assert.equal(candidatsAutomatiques(p, [{ ...d, montant: 20 }]).length, 0);
  assert.equal(nettoyerPiece({ ttc: 20 }).devise, "");
  assert.equal(proposerAssociations({ ...p, devise: "" }, [{ ...d, montant: 20 }]).length, 0);
});
test("confirmation explicite, devise connue et débit positif requis", () => {
  assert.throws(() => validerLienDevise(p, d, false));
  assert.throws(() => validerLienDevise({ ...p, devise: "EUR" }, d, true));
  assert.throws(() => validerLienDevise({ ...p, devise: "" }, d, true));
  assert.throws(() => validerLienDevise({ ...p, typeDocument: "vente" }, d, true));
  assert.throws(() => validerLienDevise(p, { ...d, montant: -18.47 }, true));
  assert.throws(() => validerLienDevise(p, { ...d, source: "saisie" }, true));
});
