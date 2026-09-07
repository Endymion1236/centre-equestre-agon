import assert from "node:assert/strict";
import { test } from "node:test";
import { verifierAssociationTableau } from "../../src/lib/tableau-depenses";
const debit = { id: "d", fournisseur: "Virement", source: "releve-bancaire", montant: 240 };
const facture = { typeDocument: "achat", devise: "EUR", fournisseur: "Les Pieux", numero: "2026000729", date: "2026-06-22", ht: 227.51, tva: 12.49, ttc: 240 };
test("association manuelle depuis une ligne : fournisseur bancaire différent permis, montant exact", () => {
  assert.equal(verifierAssociationTableau(facture, debit).nature, "facture");
  assert.throws(() => verifierAssociationTableau(facture, { ...debit, montant: 30 }));
});
test("bulletin : utiliser le net payé, pas le brut ni le net imposable", () => {
  const bulletin = { typeDocument: "paie", devise: "EUR", salarie: "Test", moisPaie: "2026-07", brut: 2500, netAPayer: 1875 };
  assert.equal(verifierAssociationTableau(bulletin, { ...debit, montant: 1875 }).nature, "paie");
  assert.throws(() => verifierAssociationTableau(bulletin, { ...debit, montant: 2500 }));
  assert.throws(() => verifierAssociationTableau({ ...bulletin, moisPaie: "" }, { ...debit, montant: 1875 }));
});
test("devise : conserver dollars et euros sans transformer les montants", () => {
  const p = { ...facture, devise: "USD", ttc: 20, ht: 20, tva: null }, d = { ...debit, montant: 18.47 };
  const avant = JSON.stringify([p, d]);
  assert.deepEqual(verifierAssociationTableau(p, d), { nature: "devise", montantPiece: 20, devisePiece: "USD", montantEUR: 18.47 });
  assert.equal(JSON.stringify([p, d]), avant);
});
test("refuser les ventes, les documents étrangers au parcours et les saisies sans débit", () => {
  for (const typeDocument of ["vente", "autre"]) assert.throws(() => verifierAssociationTableau({ ...facture, typeDocument }, debit));
  assert.throws(() => verifierAssociationTableau(facture, { ...debit, source: "saisie" }));
  assert.throws(() => verifierAssociationTableau(facture, { ...debit, montant: -240 }));
});
