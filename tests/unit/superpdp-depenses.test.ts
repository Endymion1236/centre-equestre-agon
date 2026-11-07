/**
 * tests/unit/superpdp-depenses.test.ts — facture reçue par la plateforme, vue dans Dépenses.
 *   npx tsx tests/unit/superpdp-depenses.test.ts
 */
import assert from "node:assert/strict";
import { apercuDepense, pieceDepuisPlateforme } from "../../src/lib/superpdp-depenses";

let n = 0;
const test = (nom: string, fn: () => void) => { try { fn(); n++; } catch (e) { console.error(`❌ ${nom}`); throw e; } };

const agrial = {
  number: "FA-2026-118", issue_date: "2026-10-20", currency_code: "EUR",
  seller: { name: "AGRIAL" }, buyer: { name: "Centre équestre" },
  totals: { total_without_vat: "300.00", total_vat_amount: "16.50", total_with_vat: "316.50" },
};
const debits = [
  { id: "d1", fournisseur: "PRLV AGRIAL", montant: 316.5, dateOperation: "2026-10-28", source: "releve-bancaire", mois: "2026-10" },
  { id: "d2", fournisseur: "CARTE LECLERC", montant: 316.5, dateOperation: "2026-10-29", source: "releve-bancaire", mois: "2026-10" },
  { id: "d3", fournisseur: "PRLV AGRIAL", montant: 120, dateOperation: "2026-10-05", source: "releve-bancaire", mois: "2026-10" },
];

test("les montants arrivent justes, sans lecture : HT, TVA, TTC, numéro, date", () => {
  const p = pieceDepuisPlateforme(agrial);
  assert.deepEqual([p.fournisseur, p.numero, p.date, p.ht, p.tva, p.ttc, p.devise, p.typeDocument], ["AGRIAL", "FA-2026-118", "2026-10-20", 300, 16.5, 316.5, "EUR", "achat"]);
});
test("compte du fournisseur, débit du relevé proposé (fournisseur concordant d'abord), aucune alerte", () => {
  const a = apercuDepense(agrial, debits);
  assert.equal(a.compteFournisseur.compte, "401AGRIAL");
  assert.deepEqual(a.alertes, []);
  assert.equal(a.debits[0].id, "d1");
  assert.ok(!a.debits.some((d) => d.id === "d3"));
  assert.equal(a.dejaLa, false);
});
test("fournisseur inconnu : compte collectif ; facture déjà rattachée : signalée", () => {
  const a = apercuDepense({ ...agrial, seller: { name: "Tricatel" } }, [{ ...debits[0], piece: { extraction: { numero: "FA-2026-118" } } }]);
  assert.equal(a.compteFournisseur.collectif, true);
  assert.equal(a.dejaLa, true);
});
test("facture incomplète : alertes des dépenses", () => {
  const a = apercuDepense({ seller: { name: "X" }, totals: {} }, []);
  assert.ok(a.alertes.length > 0);
});
console.log(`✅ ${n} tests passés`);
