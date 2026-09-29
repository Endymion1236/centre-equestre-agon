import assert from "node:assert/strict";
import { reglementSeanceParCarte } from "../../src/app/admin/montoir/seance-par-carte";

let passes = 0;
function test(nom: string, fn: () => void) {
  try {
    fn();
    passes++;
    console.log(`  ✅ ${nom}`);
  } catch (e: any) {
    console.error(`  ❌ ${nom}\n     ${e.message}`);
    process.exitCode = 1;
  }
}

const seance = { childId: "anne", creneauId: "pg-30-09", activityTitle: "Pony games Ados / Adultes", priceTTC: 26 };
const commande = (extra: Record<string, any> = {}) => ({ id: "p1", status: "pending", paidAmount: 0, totalTTC: 26, items: [seance], ...extra });

test("inscrite « à payer » (26 €), carte vendue ensuite : carte débitée, commande annulée", () => {
  const r = reglementSeanceParCarte([commande()], "anne", "pg-30-09");
  assert.ok(r.debiterCarte);
  if (!r.debiterCarte) return;
  assert.deepEqual(r.ajustements, [{ paymentId: "p1", annuler: true, items: [], totalTTC: 0 }]);
});

test("commande avec d'autres lignes : seule la séance en sort, total recalculé", () => {
  const autre = { childId: "anne", creneauId: "autre", priceTTC: 30 };
  const r = reglementSeanceParCarte([commande({ totalTTC: 56, items: [seance, autre] })], "anne", "pg-30-09");
  assert.ok(r.debiterCarte);
  if (!r.debiterCarte) return;
  assert.equal(r.ajustements[0].annuler, false);
  assert.deepEqual(r.ajustements[0].items, [autre]);
  assert.equal(r.ajustements[0].totalTTC, 30);
});

test("séance déjà réglée (même en partie) ou facturée : carte non débitée", () => {
  assert.equal(reglementSeanceParCarte([commande({ status: "paid", paidAmount: 26 })], "anne", "pg-30-09").debiterCarte, false);
  assert.equal(reglementSeanceParCarte([commande({ status: "partial", paidAmount: 10 })], "anne", "pg-30-09").debiterCarte, false);
  const f = reglementSeanceParCarte([commande({ invoiceNumber: "F-2026-0042" })], "anne", "pg-30-09");
  assert.equal(f.debiterCarte, false);
  if (!f.debiterCarte) assert.ok(f.raison.includes("F-2026-0042"));
});

test("aucune commande, ou commande annulée, ou d'un autre cavalier : carte débitée sans rien toucher", () => {
  for (const cmds of [[], [commande({ status: "cancelled" })], [commande({ items: [{ ...seance, childId: "zoe" }] })]]) {
    const r = reglementSeanceParCarte(cmds, "anne", "pg-30-09");
    assert.ok(r.debiterCarte);
    if (r.debiterCarte) assert.deepEqual(r.ajustements, []);
  }
});

console.log(`\n✅ ${passes} tests passés\n`);
