import assert from "node:assert/strict";
import { test } from "node:test";
import { estVirementPlateforme, separerVirementsPlateforme, regrouperPages } from "../../src/lib/import-releve-pages";

test("un virement reçu de Stripe, CAWL ou SumUp n'est pas un débit", () => {
  for (const l of ["VIR SEPA STRIPE", "Stripe Payments Europe", "VIR CAWL", "WORLDLINE SA", "SumUp Payments", "HelloAsso", "STP virement"]) assert.equal(estVirementPlateforme(l), true, l);
});
test("une commission ou un prélèvement de plateforme reste un débit possible", () => {
  for (const l of ["COMMISSION STRIPE", "Frais Stripe", "PRLV SUMUP", "Com carte", "POINT.P", "Orange SA"]) assert.equal(estVirementPlateforme(l), false, l);
});
test("séparation : les écartées sont rendues, jamais perdues en silence", () => {
  const ops = [{ libelle: "VIR STRIPE", montant: 70.42 }, { libelle: "ORANGE", montant: 66 }, { libelle: "Stripe Payments", montant: 1798.86 }];
  const r = separerVirementsPlateforme(ops);
  assert.deepEqual(r.operations.map(o => o.libelle), ["ORANGE"]);
  assert.deepEqual(r.ecartees.map(o => o.montant), [70.42, 1798.86]);
});
test("regrouperPages remonte les écartées avec leur page", () => {
  const op = { date: "2026-08-28", mois: "2026-08", libelle: "VIR STRIPE", montant: 1798.86, poste: "hors-depenses" };
  const r = regrouperPages([{ index: 1, resultat: { operations: [], creditsClients: 1798.86, ecartees: [op] } }, { index: 0, resultat: { operations: [], creditsClients: 0 } }], 2, "abc");
  assert.deepEqual(r.ecartees, [{ ...op, pageReleve: 2 }]);
  assert.equal(r.manquantes.length, 0);
});
