import assert from "node:assert/strict";
import { test } from "node:test";
import { nettoyerPiece, proposerAssociations } from "../../src/lib/justificatifs";
import { planifierMatching, type PieceMatching } from "../../src/lib/matching-automatique";
const extraction = nettoyerPiece({ devise: "EUR", typeDocument: "achat", fournisseur: "Vétérinaire Agon", numero: "F-12", date: "2026-07-01", ht: 100, tva: 20, ttc: 120 });
const p: PieceMatching = { id: "p", extraction };
const d = { id: "d", fournisseur: "Veterinaire Agon", montant: 120, dateOperation: "2026-07-03", source: "releve-bancaire" };
const plan = (pieces = [p], depenses = [d], lies = new Set<string>()) => planifierMatching(pieces, depenses, lies).associations;
test("achat cohérent et unique : un seul lien ; montant/date comptables conservés", () => {
  const avant = JSON.stringify([p, d]);
  assert.deepEqual(plan(), [{ pieceId: "p", depenseId: "d" }]);
  assert.equal(JSON.stringify([p, d]), avant);
});
test("score élevé insuffisant : nom partiel, date absente/lointaine, vente, incohérence, numéro absent", () => {
  for (const patch of [{ fournisseur: "Cabinet Veterinaire Agon" }, { dateOperation: "" }, { dateOperation: "2026-07-09" }, { dateOperation: "2026-06-30" }, { montant: 119.99 }]) {
    assert.equal(plan([p], [{ ...d, ...patch }]).length, 0);
  }
  assert.equal(proposerAssociations(extraction, [{ ...d, fournisseur: "Cabinet Veterinaire Agon" }])[0].score, 100);
  for (const patch of [{ typeDocument: "vente" }, { typeDocument: "inconnu" }, { ht: null }, { tva: 10 }, { numero: "" }, { ttc: -120 }]) {
    assert.equal(plan([{ ...p, extraction: nettoyerPiece({ ...extraction, ...patch }) }]).length, 0);
  }
});
test("ambiguïtés dans les deux sens et copies PDF/photo exclues", () => {
  assert.equal(plan([p], [d, { ...d, id: "d2" }]).length, 0);
  assert.equal(plan([p], [d, { ...d, id: "ancien", dateOperation: "" }]).length, 0);
  assert.equal(plan([p, { ...p, id: "p2" }]).length, 0);
  assert.equal(plan([p, { id: "p2", extraction: { ...extraction, numero: "autre", date: "" } }]).length, 0);
  assert.equal(plan([p, { ...p, id: "p2", depenseId: "ancien" }]).length, 0);
});
test("choix manuel, lien existant et analyse incomplète priment sur l’automatisation", () => {
  assert.equal(plan([{ ...p, autoBloque: true }]).length, 0);
  assert.equal(plan([{ ...p, depenseId: "d" }]).length, 0);
  assert.equal(plan([p], [d], new Set(["d"])).length, 0);
  assert.equal(plan([p, { id: "inconnu" }]).length, 0);
  assert.equal(plan([p, { id: "retire", retire: true }]).length, 1);
  assert.equal(planifierMatching([p, { id: "inconnu" }], [d], new Set()).analyseIncomplete, true);
});
