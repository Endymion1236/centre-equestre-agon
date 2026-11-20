/**
 * tests/unit/factures-reunies.test.ts — un PDF Amazon à plusieurs factures se lit en une pièce.
 *   npx tsx tests/unit/factures-reunies.test.ts
 */
import assert from "node:assert/strict";
import { reunirFactures, proposerAssociations } from "../../src/lib/justificatifs";

let passes = 0;
function test(nom: string, fn: () => void) {
  try { fn(); passes++; console.log(`  ✅ ${nom}`); }
  catch (e: any) { console.error(`  ❌ ${nom}\n     ${e.message}`); process.exitCode = 1; }
}
const f = (o: Record<string, unknown>) => ({ typeDocument: "achat", devise: "EUR", fournisseur: "Amazon", numero: "", date: "2026-11-18", ht: null, tva: null, ttc: null, ...o });

test("deux factures d'une commande Amazon : montants additionnés, détail gardé", () => {
  const p = reunirFactures([f({ fournisseur: "Vendeur A", numero: "FR1", ht: 6.82, tva: 1.36, ttc: 8.18 }), f({ fournisseur: "Vendeur B", numero: "FR2", date: "2026-11-19", ht: 12.8, tva: 2.56, ttc: 15.36 })]);
  assert.ok(typeof p !== "string");
  assert.equal(p.ttc, 23.54); assert.equal(p.ht, 19.62); assert.equal(p.tva, 3.92);
  assert.equal(p.fournisseur, "Vendeur A / Vendeur B"); assert.equal(p.numero, "FR1 + FR2");
  assert.equal(p.date, "2026-11-19"); assert.equal(p.factures?.length, 2); assert.equal(p.typeDocument, "achat");
});
test("même vendeur deux fois : nommé une fois ; HT absent d'une facture → HT inconnu, TTC gardé", () => {
  const p = reunirFactures([f({ ttc: 10, ht: 8.33, tva: 1.67 }), f({ fournisseur: "AMAZON", ttc: 5 })]);
  assert.ok(typeof p !== "string");
  assert.equal(p.fournisseur, "Amazon"); assert.equal(p.ttc, 15); assert.equal(p.ht, null);
});
test("page sans facture écartée ; une seule facture restante = cette facture", () => {
  const p = reunirFactures([f({ ttc: 8.18 }), { typeDocument: "autre" }]);
  assert.ok(typeof p !== "string"); assert.equal(p.ttc, 8.18); assert.equal(p.factures, undefined);
});
test("refus : bulletins de paie, vente, devises mêlées, rien de lisible", () => {
  assert.equal(typeof reunirFactures([{ typeDocument: "paie" }, { typeDocument: "paie" }]), "string");
  assert.equal(typeof reunirFactures([f({ ttc: 1 }), f({ typeDocument: "vente", ttc: 2 })]), "string");
  assert.equal(typeof reunirFactures([f({ ttc: 1 }), f({ devise: "USD", ttc: 2 })]), "string");
  assert.equal(typeof reunirFactures([{ typeDocument: "autre" }]), "string");
  assert.equal(typeof reunirFactures([]), "string");
});
test("la pièce réunie se propose pour le prélèvement de 23,54 €", () => {
  const p = reunirFactures([f({ ttc: 8.18 }), f({ ttc: 15.36 })]);
  assert.ok(typeof p !== "string");
  const props = proposerAssociations(p, [{ id: "d1", fournisseur: "Prélèvement AMAZON PAYMENTS EUROPE", montant: 23.54, dateOperation: "2026-11-20", source: "releve-bancaire" }]);
  assert.equal(props[0]?.id, "d1");
});

console.log(`\n✅ ${passes} tests passés`);
