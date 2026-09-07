import assert from "node:assert/strict";
import { test } from "node:test";
import { nettoyerPiece, alertesPiece, proposerAssociations, validerLienDevise } from "../../src/lib/justificatifs";
import { candidatsAutomatiques } from "../../src/lib/matching-automatique";
test("bulletin : garder brut/net/cotisations séparés, jamais HT/TVA/TTC", () => {
  const p = nettoyerPiece({ typeDocument: "paie", devise: "EUR", salarie: "Salarié test", employeur: "Centre", moisPaie: "2026-07", brut: 2500,
    netAPayer: 1875, cotisationsSalariales: 500, cotisationsPatronales: 850, prelevementSource: 125, ht: 2500, tva: 0, ttc: 1875, nir: "NE_PAS_CONSERVER" });
  assert.equal(p.brut, 2500); assert.equal(p.netAPayer, 1875); assert.equal(p.prelevementSource, 125);
  assert.equal(p.ht, null); assert.equal(p.tva, null); assert.equal(p.ttc, null);
  assert.equal("nir" in p, false); assert.equal(alertesPiece(p).length, 0);
});
test("bulletin incomplet : ne pas inventer le net à partir du brut", () => {
  const p = nettoyerPiece({ typeDocument: "paie", moisPaie: "2026-99", brut: 2500, netImposable: 2000 });
  assert.equal(p.moisPaie, ""); assert.equal(p.netAPayer, null); assert.ok(alertesPiece(p).length);
});
test("bulletin et document hors sujet ne sont jamais des factures à rapprocher", () => {
  const d = { id: "d", source: "releve-bancaire", fournisseur: "Centre", montant: 100, dateOperation: "2026-07-02" };
  for (const typeDocument of ["paie", "autre"] as const) {
    const p = { ...nettoyerPiece({ devise: "EUR", fournisseur: "Centre", numero: "n1", date: "2026-07-01", ht: 100, tva: 0, ttc: 100 }), typeDocument };
    assert.equal(proposerAssociations(p, [d]).length, 0); assert.equal(candidatsAutomatiques(p, [d]).length, 0);
    assert.throws(() => validerLienDevise({ ...p, devise: "USD" }, d, true));
  }
});
