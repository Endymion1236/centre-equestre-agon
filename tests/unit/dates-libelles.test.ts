/**
 * Deux cent trente-cinq lignes sans date de règlement, dont une majorité de
 * commissions bancaires à quelques centimes : les ressaisir n'était pas
 * envisageable. La banque écrit pourtant la date dans le libellé.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { dateDepuisLibelle, finDuMois, planifierCompletionDates } from "../../src/lib/dates-libelles";

test("la date écrite par la banque est lue là où elle se trouve", () => {
  assert.equal(dateDepuisLibelle("Paiement par carte X4673 UEP*U EXPRESS AGON C 01/09", "2026-09"), "2026-09-01");
  assert.equal(dateDepuisLibelle("Remboursement de prêt 10003551300 01/09/26 INTERETS", "2026-09"), "2026-09-01");
  assert.equal(dateDepuisLibelle("CB U EXPRESS AGON 28/07", "2026-07"), "2026-07-28");
  assert.equal(dateDepuisLibelle("Achat 03.07 Agrial", "2026-07"), "2026-07-03");
  assert.equal(dateDepuisLibelle("Carte 9/7 Padd", "2026-07"), "2026-07-09");
});

test("une date d'un autre mois n'est pas plaquée sur la ligne", () => {
  // « 28/07 » sur une opération d'août est la date de l'achat, pas du débit :
  // la placer telle quelle rendrait la ligne incohérente avec son mois.
  assert.equal(dateDepuisLibelle("CB U EXPRESS AGON 28/07", "2026-08"), "");
  // Année explicite contradictoire : on s'abstient.
  assert.equal(dateDepuisLibelle("Prlv 05/07/25 GHN", "2026-07"), "");
  assert.equal(dateDepuisLibelle("Prlv 05/07/2026 GHN", "2026-07"), "2026-07-05");
});

test("aucune date inventée à partir de nombres qui n'en sont pas", () => {
  assert.equal(dateDepuisLibelle("Com Carte", "2026-07"), "");
  assert.equal(dateDepuisLibelle("Prlv GHN", "2026-07"), "");
  // Un 31 avril ou un 30 février n'existent pas.
  assert.equal(dateDepuisLibelle("Achat 31/04 X", "2026-04"), "");
  assert.equal(dateDepuisLibelle("Achat 30/02 X", "2026-02"), "");
  // Un mois invalide sur la ligne interdit toute déduction.
  assert.equal(dateDepuisLibelle("CB 28/07", "2026-13"), "");
  assert.equal(dateDepuisLibelle("CB 28/07", ""), "");
});

test("le dernier jour du mois est calculé, pas approché", () => {
  assert.equal(finDuMois("2026-07"), "2026-07-31");
  assert.equal(finDuMois("2026-02"), "2026-02-28");
  assert.equal(finDuMois("2024-02"), "2024-02-29");
  assert.equal(finDuMois("2026-09"), "2026-09-30");
  assert.equal(finDuMois("2026-12"), "2026-12-31");
  assert.equal(finDuMois("pas un mois"), "");
});

test("les dates lues et les dates de convention restent séparées", () => {
  const plan = planifierCompletionDates([
    { id: "a", fournisseur: "CB U EXPRESS AGON 28/07", mois: "2026-07" },
    { id: "b", fournisseur: "Com Carte", mois: "2026-07" },
    { id: "c", fournisseur: "Prlv GHN", mois: "2026-07" },
    // Déjà datée : intouchable.
    { id: "d", fournisseur: "Agrial", mois: "2026-07", dateOperation: "2026-07-04" },
    // Sans mois exploitable : aucune convention possible.
    { id: "e", fournisseur: "Inconnu", mois: "" },
  ]);
  assert.deepEqual(plan.lues.map(x => [x.id, x.date, x.origine]), [["a", "2026-07-28", "libelle"]]);
  assert.deepEqual(plan.finDeMois.map(x => [x.id, x.date]), [["b", "2026-07-31"], ["c", "2026-07-31"]]);
  assert.deepEqual(plan.sansSolution.map(x => x.id), ["e"]);
  // La ligne déjà datée n'apparaît nulle part : rien n'est réécrit.
  for (const groupe of [plan.lues, plan.finDeMois, plan.sansSolution]) assert.ok(!groupe.some(x => x.id === "d"));
});

test("la note du relevé sert de recours quand le libellé est muet", () => {
  const plan = planifierCompletionDates([{ id: "a", fournisseur: "Com Carte", note: "Relevé du 15/07 page 2", mois: "2026-07" }]);
  assert.deepEqual(plan.lues.map(x => x.date), ["2026-07-15"]);
});
