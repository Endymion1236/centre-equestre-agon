import assert from "node:assert/strict";
import { test } from "node:test";
import { groupesBalance, groupesMensuels } from "../../src/lib/regroupements-comptables";

test("sous-totaux par famille et classe : un compte mixte n'est ni perdu ni compté deux fois", () => {
  const comptes = [
    { compte: "44566000", libelle: "TVA", debit: 3000, credit: 0, solde: 3000 },
    { compte: "401FOURN", libelle: "Fournisseur fictif", debit: 5000, credit: 15000, solde: -10000 },
    { compte: "40910000", libelle: "Avance", debit: 2000, credit: 0, solde: 2000 },
    { compte: "51200000", libelle: "Banque", debit: 8000, credit: 3000, solde: 5000 },
  ];
  const copie = structuredClone(comptes), groupes = groupesBalance(comptes);
  assert.deepEqual(comptes, copie); // aucune mutation du jeu validé
  assert.deepEqual(groupes.map(c => c.classe), ["4", "5"]);
  assert.deepEqual(groupes[0].groupes.map(g => g.prefixe), ["40", "44"]);
  assert.deepEqual(groupes[0].groupes[0].total, { debit: 7000, credit: 15000, solde: -8000 });
  assert.deepEqual(groupes[0].total, { debit: 10000, credit: 15000, solde: -5000 });
  assert.equal(groupes.reduce((s, c) => s + c.total.debit, 0), 18000);
  assert.equal(groupes.reduce((s, c) => s + c.total.credit, 0), 18000);
  assert.equal(groupes.flatMap(c => c.groupes.flatMap(g => g.comptes)).length, comptes.length);
});

test("centralisateur : cumul mensuel indépendant de l'ordre et total annuel conservé", () => {
  const lignes = [
    { mois: "2025-01", journal: "VTE", lignes: 3, debit: 12000, credit: 12000 },
    { mois: "2024-12", journal: "BNQ", lignes: 2, debit: 9000, credit: 9000 },
    { mois: "2025-01", journal: "ACH", lignes: 3, debit: 6000, credit: 6000 },
  ];
  const groupes = groupesMensuels(lignes);
  assert.deepEqual(groupes.map(g => g.mois), ["2024-12", "2025-01"]);
  assert.deepEqual(groupes[1].journaux.map(j => j.journal), ["ACH", "VTE"]);
  assert.deepEqual(groupes[1].total, { lignes: 6, debit: 18000, credit: 18000 });
  assert.equal(groupes.reduce((s, g) => s + g.total.lignes, 0), 8);
  assert.equal(groupes.reduce((s, g) => s + g.total.debit, 0), 27000);
  assert.equal(groupes.reduce((s, g) => s + g.total.credit, 0), 27000);
});
