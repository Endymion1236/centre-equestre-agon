import assert from "node:assert/strict";
import { prelevementsDeLaFamille } from "../../src/app/admin/paiements/prelevements-famille-utils";

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

const commande = { id: "p1", familyId: "f1", status: "sepa_scheduled", paymentMode: "prelevement_sepa", totalTTC: 600, paidAmount: 0, sepaRestant: 600, items: [{ activityTitle: "Forfait Baby" }] };
const ech = (id: string, extra: Record<string, any>) => ({ id, familyId: "f1", status: "pending", paymentId: "p1", ...extra });

test("commande en 2× répartie sur deux mandats : 4 prélèvements, 2 mandats, prochaine date", () => {
  const r = prelevementsDeLaFamille("f1", [commande], [
    ech("a1", { mandatId: "M-PERE", montant: 150, dateEcheance: "2026-10-05" }),
    ech("a2", { mandatId: "M-PERE", montant: 150, dateEcheance: "2026-11-05" }),
    ech("b1", { mandatId: "M-MERE", montant: 150, dateEcheance: "2026-10-05" }),
    ech("b2", { mandatId: "M-MERE", montant: 150, dateEcheance: "2026-11-05" }),
  ]);
  assert.equal(r.commandes.length, 1);
  const c = r.commandes[0];
  assert.equal(c.aVenir, 4);
  assert.equal(c.montantAVenir, 600);
  assert.equal(c.prochaineDate, "2026-10-05");
  assert.deepEqual(c.mandats.sort(), ["M-MERE", "M-PERE"]);
  assert.equal(c.sansEcheance, false);
  assert.equal(r.echeancesSansCommande, 0);
});

test("forfait inscrit depuis le planning : échéances rattachées par orderId", () => {
  const r = prelevementsDeLaFamille("f1", [{ ...commande, orderId: "O1" }], [
    ech("a1", { paymentId: null, orderId: "O1", mandatId: "M", montant: 60, dateEcheance: "2026-09-26" }),
  ]);
  assert.equal(r.commandes[0].aVenir, 1);
});

test("les prélèvements déjà passés ou rejetés ne comptent pas comme à venir", () => {
  const r = prelevementsDeLaFamille("f1", [commande], [
    ech("a1", { status: "preleve", montant: 300, dateEcheance: "2026-09-05" }),
    ech("a2", { status: "remis", montant: 300, dateEcheance: "2026-10-05" }),
  ]);
  assert.equal(r.commandes[0].aVenir, 1);
  assert.equal(r.commandes[0].montantAVenir, 300);
});

test("commande marquée SEPA sans aucune échéance : signalée", () => {
  const r = prelevementsDeLaFamille("f1", [commande], []);
  assert.equal(r.commandes[0].sansEcheance, true);
});

test("échéancier saisi dans Prélèvements SEPA sans commande : compté à part", () => {
  const r = prelevementsDeLaFamille("f1", [], [ech("x", { paymentId: null, montant: 50 })]);
  assert.equal(r.commandes.length, 0);
  assert.equal(r.echeancesSansCommande, 1);
});

test("autres familles, commandes payées ou annulées, commandes non SEPA : ignorées", () => {
  const r = prelevementsDeLaFamille("f1", [
    { ...commande, id: "p2", familyId: "f2" },
    { ...commande, id: "p3", status: "paid" },
    { ...commande, id: "p4", status: "cancelled" },
    { id: "p5", familyId: "f1", status: "pending", paymentMode: "cb_terminal", totalTTC: 50 },
  ], [ech("z", { familyId: "f2", paymentId: "p2" })]);
  assert.equal(r.commandes.length, 0);
  assert.equal(r.echeancesSansCommande, 0);
});

console.log(`\n✅ ${passes} tests passés\n`);
