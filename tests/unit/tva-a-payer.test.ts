/**
 * La TVA du mois d'un coup d'œil (src/lib/tva-a-payer.ts) : collectée moins
 * déductible justifiée, crédit quand la seconde dépasse la première, et
 * l'enjeu des lignes encore à vérifier.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { calculerTvaAPayer, phraseTvaAPayer, trimestreDe, calculerTvaTrimestre } from "../../src/lib/tva-a-payer";

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

test("trimestres civils : janvier–mars, avril–juin, juillet–septembre, octobre–décembre", () => {
  assert.deepEqual(trimestreDe("2026-09").mois, ["2026-07", "2026-08", "2026-09"]);
  assert.equal(trimestreDe("2026-09").libelle, "T3 2026");
  assert.equal(trimestreDe("2026-09").periode, "juillet à septembre 2026");
  assert.deepEqual(trimestreDe("2026-01").mois, ["2026-01", "2026-02", "2026-03"]);
  assert.deepEqual(trimestreDe("2026-12").mois, ["2026-10", "2026-11", "2026-12"]);
  assert.equal(trimestreDe("2026-04").libelle, "T2 2026");
});

test("le trimestre additionne les mois disponibles et nomme ceux qui manquent", () => {
  const r = calculerTvaTrimestre("2026-08", {
    "2026-07": { collectee: 1000, deductibleJustifiee: 200, aVerifier: { nb: 2, ttc: 60 } },
    "2026-08": { collectee: 800, deductibleJustifiee: 300 },
  });
  assert.equal(r.trimestre.libelle, "T3 2026");
  assert.equal(r.collectee, 1800); assert.equal(r.deductible, 500); assert.equal(r.aPayer, 1300);
  assert.equal(r.aVerifierNb, 2); assert.equal(r.aVerifierTtc, 60); assert.equal(r.deductiblePotentielle, 10);
  assert.deepEqual(r.moisManquants, ["2026-09"]);
  assert.equal(r.parMois.length, 3); assert.equal(r.parMois[2].resultat, null);
});
