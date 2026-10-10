/**
 * tests/unit/annulation-echeancier.test.ts
 *   npx tsx tests/unit/annulation-echeancier.test.ts
 */
import assert from "node:assert/strict";
import { commandesSansPrelevementAVenir, planifierAnnulationEcheancier } from "../../src/app/admin/sepa/annulation-echeancier-utils";

let passes = 0;
function test(nom: string, fn: () => void) {
  try { fn(); passes++; console.log(`  ✅ ${nom}`); }
  catch (e: any) { console.error(`  ❌ ${nom}\n     ${e.message}`); process.exitCode = 1; }
}

const dix = Array.from({ length: 10 }, (_, i) => ({ id: `e${i + 1}`, paymentId: "p1", status: "pending", montant: 57 }));

console.log("\n── Annuler un échéancier créé par erreur ──");
test("dix échéances à venir : toutes retirées, commande remise en attente", () => {
  const plan = planifierAnnulationEcheancier("p1", dix, { paidAmount: 0, totalTTC: 570, paymentMode: "prelevement_sepa" });
  assert.equal(plan.possible, true);
  assert.equal(plan.aRetirer.length, 10);
  assert.equal(plan.montantRetire, 570);
  assert.deepEqual(plan.commande, { status: "pending", sepaRestant: null, paymentRef: "", paymentMode: "" });
});

test("les échéances d'une autre commande ne sont pas touchées", () => {
  const autres = [...dix, { id: "x1", paymentId: "p2", status: "pending", montant: 30 }];
  const plan = planifierAnnulationEcheancier("p1", autres, { paidAmount: 0, totalTTC: 570 });
  assert.ok(!plan.aRetirer.includes("x1"));
});

test("un acompte déjà encaissé : la commande repart en partielle, son mode reste", () => {
  const plan = planifierAnnulationEcheancier("p1", dix, { paidAmount: 100, totalTTC: 670, paymentMode: "cheque" });
  assert.equal(plan.commande.status, "partial");
  assert.equal("paymentMode" in plan.commande, false);
});

test("1re échéance prélevée (Éléonore GRENIER) : les 9 autres sont retirées, la commande repart en partielle", () => {
  const serie = dix.map((e, i) => (i === 0 ? { ...e, status: "preleve" } : e));
  const plan = planifierAnnulationEcheancier("p1", serie, { paidAmount: 57, totalTTC: 570, status: "sepa_scheduled", sepaRestant: 513 });
  assert.equal(plan.possible, true);
  assert.equal(plan.aRetirer.length, 9);
  assert.equal(plan.gardees.length, 1);
  assert.deepEqual(plan.commande, { status: "partial", sepaRestant: null, paymentRef: "" });
});

test("une échéance remise à la banque reste attendue : son montant n'est pas réclamé dans les impayés", () => {
  const serie = dix.map((e, i) => (i === 0 ? { ...e, status: "remis" } : e));
  const plan = planifierAnnulationEcheancier("p1", serie, { paidAmount: 0, totalTTC: 570, status: "sepa_scheduled" });
  assert.equal(plan.possible, true);
  assert.equal(plan.aRetirer.length, 9);
  assert.equal(plan.commande.sepaRestant, 57);
  assert.equal("paymentMode" in plan.commande, false, "le prélèvement attendu garde son mode");
});

test("réparation : plus aucune échéance à venir mais commande encore « programmée »", () => {
  const serie = [{ id: "e1", paymentId: "p1", status: "preleve", montant: 57 }];
  const plan = planifierAnnulationEcheancier("p1", serie, { paidAmount: 57, totalTTC: 570, status: "sepa_scheduled", sepaRestant: 513 });
  assert.equal(plan.possible, true);
  assert.equal(plan.aRetirer.length, 0);
  assert.equal(plan.commande.status, "partial");
  assert.equal(plan.commande.sepaRestant, null);
});

test("une échéance rejetée ne bloque pas, et n'est pas retirée", () => {
  const serie = dix.map((e, i) => (i === 0 ? { ...e, status: "rejete" } : e));
  const plan = planifierAnnulationEcheancier("p1", serie, { paidAmount: 0, totalTTC: 570 });
  assert.equal(plan.possible, true);
  assert.equal(plan.aRetirer.length, 9);
});

test("inscription annuelle : échéances reliées par le numéro de commande", () => {
  const annuel = Array.from({ length: 10 }, (_, i) => ({ id: `a${i}`, paymentId: null, orderId: "CMD-42", status: "pending", montant: 60 }));
  const plan = planifierAnnulationEcheancier("p9", [...annuel, { id: "z", paymentId: null, orderId: "CMD-43", status: "pending", montant: 5 }], { paidAmount: 0, totalTTC: 600, orderId: "CMD-42" });
  assert.equal(plan.aRetirer.length, 10);
  assert.ok(!plan.aRetirer.includes("z"));
});

test("rien à venir : refus explicite", () => {
  const plan = planifierAnnulationEcheancier("p1", [], { paidAmount: 0, totalTTC: 570 });
  assert.equal(plan.possible, false);
});

test("repérer les commandes « programmées » sans prélèvement à venir", () => {
  const cmds = [
    { id: "eleonore", status: "sepa_scheduled", sepaRestant: 513 },
    { id: "enCours", status: "sepa_scheduled" },
    { id: "annuel", orderId: "CMD-1", status: "sepa_scheduled" },
    { id: "reglee", status: "paid" },
    { id: "ordinaire", status: "pending" },
  ];
  const ech = [
    { id: "a", paymentId: "eleonore", status: "preleve", montant: 57 },
    { id: "b", paymentId: "enCours", status: "pending", montant: 50 },
    { id: "c", paymentId: null, orderId: "CMD-1", status: "remis", montant: 60 },
  ];
  assert.deepEqual(commandesSansPrelevementAVenir(cmds, ech).map((c) => c.id), ["eleonore"]);
});

console.log(`\n✅ ${passes} tests passés\n`);
