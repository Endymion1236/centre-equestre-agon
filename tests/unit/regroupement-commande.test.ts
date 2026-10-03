/**
 * tests/unit/regroupement-commande.test.ts — carte vendue « à régler » + adhésion au panier = une facture.
 *   npx tsx tests/unit/regroupement-commande.test.ts
 */
import assert from "node:assert/strict";
import { commandeAvecPanier, commandesRegroupables, questionRegroupement } from "../../src/app/admin/paiements/regroupement-commande";

let passes = 0;
function test(nom: string, fn: () => void) {
  try { fn(); passes++; console.log(`  ✅ ${nom}`); }
  catch (e: any) { console.error(`  ❌ ${nom}\n     ${e.message}`); process.exitCode = 1; }
}

const carte = { id: "c1", familyId: "golliot", status: "pending", paymentMode: "impaye", paidAmount: 0, totalTTC: 247, cardId: "k1", items: [{ activityTitle: "Carte 10 séances — Léa", priceTTC: 247, tva: 5.5 }] };
const pasSepa = () => false;

test("la carte vendue « à régler » reçoit le panier", () => {
  assert.deepEqual(commandesRegroupables([carte], [], "golliot", pasSepa).map(p => p.id), ["c1"]);
  const r = commandeAvecPanier(carte, [{ activityTitle: "Adhésion", priceTTC: 60, tva: 0 }], 60);
  assert.equal(r.totalTTC, 307);
  assert.deepEqual(r.items.map(i => i.activityTitle), ["Carte 10 séances — Léa", "Adhésion"]);
  assert.match(questionRegroupement(carte, 60), /UN encaissement de 307,00 €/);
});

test("jamais une commande facturée, encaissée, en SEPA, en chèques différés, en échéances ou d'une autre famille", () => {
  const cas = [
    { ...carte, invoiceNumber: "F-2026-0243" },
    { ...carte, paidAmount: 50 },
    { ...carte, paymentMode: "cheque_differe" },
    { ...carte, echeancesTotal: 10 },
    { ...carte, familyId: "autre" },
    { ...carte, status: "paid" },
  ];
  for (const c of cas) assert.equal(commandesRegroupables([c], [], "golliot", pasSepa).length, 0, JSON.stringify(c));
  assert.equal(commandesRegroupables([carte], [{ paymentId: "c1" }], "golliot", pasSepa).length, 0, "déjà un encaissement");
  assert.equal(commandesRegroupables([carte], [], "golliot", () => true).length, 0, "prélèvement SEPA");
});

console.log(`\n${process.exitCode ? "❌" : "✅"} ${passes} tests passés`);
