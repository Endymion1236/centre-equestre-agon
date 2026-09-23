/**
 * tests/unit/echeancier-cb.test.ts — régler une commande en N fois par CB.
 *   npx tsx tests/unit/echeancier-cb.test.ts
 */
import assert from "node:assert/strict";
import { idEcheanceSuivante, preparerEcheancierCb } from "../../src/app/admin/paiements/echeancier-cb-utils";

let passes = 0;
function test(nom: string, fn: () => void) {
  try { fn(); passes++; console.log(`  ✅ ${nom}`); }
  catch (e: any) { console.error(`  ❌ ${nom}\n     ${e.message}`); process.exitCode = 1; }
}

const commande = {
  id: "p1", familyId: "f1", familyName: "Lequertier", status: "pending", paidAmount: 0, totalTTC: 550,
  paymentMode: "", orderId: "CMD-1",
  items: [{ activityTitle: "Forfait annuel", priceTTC: 500, tva: 5.5 }, { activityTitle: "Licence FFE", priceTTC: 50, tva: 0 }],
};
const opts = { nombre: 10, dateDepart: "2026-10-05", lienCbMensuel: true };

console.log("\n── Découper une commande de 550 € en 10 fois ──");
test("dix échéances, la commande d'origine devient la première", () => {
  const plan = preparerEcheancierCb("p1", commande, opts);
  assert.equal(plan.possible, true);
  assert.equal(plan.premiere!.id, "p1");
  assert.equal(plan.suivantes.length, 9);
  assert.equal(plan.suivantes[0].id, "p1-echeance-02");
  assert.equal(plan.suivantes[8].id, "p1-echeance-10");
  assert.equal(idEcheanceSuivante("p1", 3), "p1-echeance-03");
});

test("la somme des échéances retombe au centime sur le total", () => {
  const plan = preparerEcheancierCb("p1", { ...commande, totalTTC: 551, items: [{ activityTitle: "Forfait", priceTTC: 551, tva: 5.5 }] }, opts);
  const toutes = [plan.premiere!, ...plan.suivantes];
  const somme = toutes.reduce((s, e) => s + Math.round(e.data.totalTTC * 100), 0);
  assert.equal(somme, 55100);
});

test("les dates avancent de mois en mois, et chaque échéance dit son rang", () => {
  const plan = preparerEcheancierCb("p1", commande, opts);
  assert.equal(plan.premiere!.data.echeanceDate, "2026-10-05");
  assert.equal(plan.suivantes[0].data.echeanceDate, "2026-11-05");
  assert.equal(plan.suivantes[8].data.echeanceDate, "2027-07-05");
  assert.equal(plan.suivantes[1].data.echeance, 3);
  assert.equal(plan.suivantes[1].data.echeancesTotal, 10);
});

test("mode CB, en attente, rattachées à la commande, repère du rappel posé", () => {
  const plan = preparerEcheancierCb("p1", commande, opts);
  for (const e of [plan.premiere!, ...plan.suivantes]) {
    assert.equal(e.data.paymentMode, "cb_terminal");
    assert.equal(e.data.status, "pending");
    assert.equal(e.data.sourcePaymentId, "p1");
    assert.equal(e.data.reglementParLienCb, true);
    assert.equal(e.data.forfaitRef, "Forfait annuel, Licence FFE");
  }
  assert.equal("id" in plan.suivantes[0].data, false, "l'identifiant de la commande d'origine n'est pas recopié");
});

test("la TVA à 0 % d'une licence reste à 0 % dans chaque échéance", () => {
  const plan = preparerEcheancierCb("p1", commande, opts);
  const licence = plan.suivantes[0].data.items.find((i: any) => String(i.activityTitle).startsWith("Licence"));
  assert.equal(licence.tva, 0);
  assert.equal(licence.priceHT, licence.priceTTC);
});

test("sans rappel demandé, le repère est à faux", () => {
  assert.equal(preparerEcheancierCb("p1", commande, { ...opts, lienCbMensuel: false }).premiere!.data.reglementParLienCb, false);
});

console.log("\n── Refus ──");
test("facture émise, règlement reçu, déjà découpée, SEPA, annulée, nombre hors bornes", () => {
  assert.equal(preparerEcheancierCb("p1", { ...commande, invoiceNumber: "F-2026-0001" }, opts).possible, false);
  assert.equal(preparerEcheancierCb("p1", { ...commande, paidAmount: 50 }, opts).possible, false);
  assert.equal(preparerEcheancierCb("p1", { ...commande, echeancesTotal: 10 }, opts).possible, false);
  assert.equal(preparerEcheancierCb("p1", { ...commande, status: "sepa_scheduled" }, opts).possible, false);
  assert.equal(preparerEcheancierCb("p1", { ...commande, status: "cancelled" }, opts).possible, false);
  assert.equal(preparerEcheancierCb("p1", commande, { ...opts, nombre: 1 }).possible, false);
  assert.equal(preparerEcheancierCb("p1", commande, { ...opts, nombre: 13 }).possible, false);
  assert.equal(preparerEcheancierCb("p1", commande, { ...opts, dateDepart: "demain" }).possible, false);
});

console.log(`\n✅ ${passes} tests passés\n`);
