import assert from "node:assert/strict";
import { avecAvancementSepa } from "../../src/app/admin/planning/sepa-avancement";
import { statutPaiementCavalier } from "../../src/app/admin/planning/types";

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

const ech = (n: number, status: string, extra: Record<string, any> = {}) => ({ echeance: n, status, paymentId: "p1", dateEcheance: `2026-${String(9 + n).padStart(2, "0")}-05`, ...extra });
const dix = (nbPreleves: number) => Array.from({ length: 10 }, (_, i) => ech(i + 1, i < nbPreleves ? "preleve" : "pending"));

test("10 prélèvements, le 1er passé : 1/10", () => {
  const [p] = avecAvancementSepa([{ id: "p1" }], dix(1));
  assert.deepEqual(p.sepaAvancement, { passes: 1, total: 10 });
});

test("réparti sur deux mandats : un mois compte une fois", () => {
  const e = [ech(1, "preleve", { mandatId: "A" }), ech(1, "preleve", { mandatId: "B" }), ech(2, "pending", { mandatId: "A" }), ech(2, "pending", { mandatId: "B" })];
  assert.deepEqual(avecAvancementSepa([{ id: "p1" }], e)[0].sepaAvancement, { passes: 1, total: 2 });
});

test("échéancier du planning : rattaché par numéro de commande", () => {
  const e = dix(2).map(x => ({ ...x, paymentId: null, orderId: "O1" }));
  assert.deepEqual(avecAvancementSepa([{ id: "p9", orderId: "O1" }], e)[0].sepaAvancement, { passes: 2, total: 10 });
});

test("rejet représenté : la ligne rejetée ne compte pas", () => {
  const e = [ech(1, "rejete"), ech(1, "pending"), ech(2, "pending")];
  assert.deepEqual(avecAvancementSepa([{ id: "p1" }], e)[0].sepaAvancement, { passes: 0, total: 2 });
});

test("commande sans prélèvement : inchangée", () => {
  assert.equal("sepaAvancement" in avecAvancementSepa([{ id: "zz" }], dix(1))[0], false);
});

// Le planning : même libellé pour tous, d'après le module SEPA.
const inscrit = { childId: "c1", familyId: "f1", paymentSource: "forfait" };
const CRENEAU = { id: "cr1", activityTitle: "Galop d'argent — mercredi 14h" };
const commande = (extra: Record<string, any>) => ({
  id: "p1", familyId: "f1", forfaitRef: "mercredi-14h", paymentMode: "prelevement_sepa", totalTTC: 699,
  items: [{ childId: "c1", activityTitle: "Forfait annuel — Louise" }], ...extra,
});

test("échéancier posé depuis Encaisser, 1er prélèvement passé : « forfait 1/10 SEPA »", () => {
  const payments = avecAvancementSepa([commande({ status: "sepa_scheduled", paidAmount: 69.9, paymentRef: "10× SEPA · M1" })], dix(1));
  assert.equal(statutPaiementCavalier(inscrit as any, payments, CRENEAU as any).label, "forfait 1/10 SEPA");
});

test("prélèvement passé mais 0 € sur la commande : orange « 1/10 », pas « rien prélevé »", () => {
  const payments = avecAvancementSepa([commande({ status: "sepa_scheduled", paidAmount: 0 })], dix(1));
  const s = statutPaiementCavalier(inscrit as any, payments, CRENEAU as any);
  assert.equal(s.etat, "partiel");
  assert.equal(s.label, "forfait 1/10 SEPA");
  assert.ok(s.detail.includes("Cohérence"), s.detail);
});

test("rien de prélevé : rouge « SEPA, rien prélevé »", () => {
  const payments = avecAvancementSepa([commande({ status: "sepa_scheduled", paidAmount: 0 })], dix(0));
  assert.equal(statutPaiementCavalier(inscrit as any, payments, CRENEAU as any).label, "SEPA, rien prélevé");
});

console.log(`\n✅ ${passes} tests passés\n`);
