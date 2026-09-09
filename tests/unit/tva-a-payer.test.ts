/**
 * La TVA du mois d'un coup d'œil (src/lib/tva-a-payer.ts) : collectée moins
 * déductible justifiée, crédit quand la seconde dépasse la première, et
 * l'enjeu des lignes encore à vérifier.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { calculerTvaAPayer, phraseTvaAPayer } from "../../src/lib/tva-a-payer";

test("collectée moins déductible : ce qu'il reste à payer", () => {
  const r = calculerTvaAPayer({ collectee: 1234.56, deductibleJustifiee: 234.56 });
  assert.equal(r.aPayer, 1000); assert.equal(r.credit, 0);
  assert.match(phraseTvaAPayer(r), /^1000,00 € à payer/);
});

test("déductible supérieure : crédit de TVA, rien à payer", () => {
  const r = calculerTvaAPayer({ collectee: 300, deductibleJustifiee: 450.5 });
  assert.equal(r.aPayer, 0); assert.equal(r.credit, 150.5);
  assert.match(phraseTvaAPayer(r), /^Crédit de TVA de 150,50 €/);
});

test("les lignes à vérifier ne déduisent rien, mais l'enjeu est chiffré (TVA à 20 % incluse dans le TTC)", () => {
  const r = calculerTvaAPayer({ collectee: 500, deductibleJustifiee: 100, aVerifier: { nb: 3, ttc: 120 } });
  assert.equal(r.aPayer, 400);
  assert.equal(r.aVerifierNb, 3); assert.equal(r.aVerifierTtc, 120);
  assert.equal(r.deductiblePotentielle, 20);
});

test("valeurs absentes ou négatives : traitées comme zéro", () => {
  const r = calculerTvaAPayer({ collectee: -5, deductibleJustifiee: NaN as unknown as number });
  assert.deepEqual([r.collectee, r.deductible, r.aPayer, r.credit, r.aVerifierNb, r.deductiblePotentielle], [0, 0, 0, 0, 0, 0]);
});
