import assert from "node:assert/strict";
import { test } from "node:test";
import { doublonPossible, groupesDoublons } from "../../src/lib/doublons-depenses";
const a = { id: "datee", fournisseur: "Arrosage Distrib Ste", montant: 77.49, mois: "2026-07", dateOperation: "2026-07-09", source: "releve-bancaire" };
const b = { ...a, id: "ancienne", dateOperation: "" };
test("ancien import sans date + relecture datée : à examiner, pas supprimé", () => {
  assert.ok(doublonPossible(a, b));
  assert.equal(groupesDoublons([a, b]).length, 1);
  assert.equal(groupesDoublons([a, b])[0].length, 2);
});
test("paiements distincts par date, compte, montant, mois ou fournisseur non fusionnés", () => {
  for (const patch of [{ dateOperation: "2026-07-10" }, { montant: 77.50 }, { mois: "2026-08" }, { fournisseur: "Autre" }, { source: "saisie" }]) assert.equal(doublonPossible(a, { ...b, ...patch }), false);
  assert.equal(doublonPossible({ ...a, compte: "courant" }, { ...b, compte: "epargne" }), false);
  assert.equal(doublonPossible(a, a), false);
});
test("aucune identité déduite du seul montant ; accents normalisés", () => {
  assert.equal(doublonPossible({ ...a, fournisseur: "" }, { ...b, fournisseur: "" }), false);
  assert.ok(doublonPossible({ ...a, fournisseur: "Vétérinaire" }, { ...b, fournisseur: "VETERINAIRE" }));
});
