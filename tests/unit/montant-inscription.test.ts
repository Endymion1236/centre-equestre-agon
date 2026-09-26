/**
 * tests/unit/montant-inscription.test.ts — corriger le montant d'une inscription depuis le panneau.
 *   npx tsx tests/unit/montant-inscription.test.ts
 */
import assert from "node:assert/strict";
import { analyserMontantInscription, ligneCorrigee, planifierMontantInscription } from "../../src/app/admin/planning/montant-inscription-utils";
import { estEcheance } from "../../src/app/admin/paiements/echeances-utils";
import { listerImpayes } from "../../src/app/admin/paiements/impayes-utils";

let passes = 0;
function test(nom: string, fn: () => void) {
  try { fn(); passes++; console.log(`  ✅ ${nom}`); }
  catch (e: any) { console.error(`  ❌ ${nom}\n     ${e.message}`); process.exitCode = 1; }
}

const lignes = [
  { activityTitle: "Forfait Galop 3", childId: "c1", priceHT: 663.51, tva: 5.5, priceTTC: 700 },
  { activityTitle: "Licence FFE", childId: "c1", priceHT: 36, tva: 0, priceTTC: 36 },
];
const sepa = { id: "p1", orderId: "O1", familyId: "f1", status: "sepa_scheduled", paymentMode: "prelevement_sepa", totalTTC: 736, sepaRestant: 736, paidAmount: 0, echeance: 1, echeancesTotal: 10, forfaitRef: "Galop 3 — mercredi 14:00", items: lignes };
const prelevements = Array.from({ length: 10 }, (_, i) => ({ id: `s${i}`, orderId: "O1", paymentId: null, status: "pending", montant: 73.6, dateEcheance: `2026-${String(10 + Math.floor(i / 3)).padStart(2, "0")}-0${(i % 3) + 1}` }));

test("SEPA planifié : nouveau total redistribué sur les 10 prélèvements, pré-notification à revoir", () => {
  const a = analyserMontantInscription([sepa], prelevements);
  assert.equal(a.forme, "sepa");
  assert.equal(a.total, 736);
  const corr = [{ ...a.lignes[0], priceTTC: 600 }, a.lignes[1]];
  const plan = planifierMontantInscription(a, [sepa], corr, prelevements);
  assert.equal(plan.possible, true, plan.raison);
  assert.equal(plan.nouveauTotal, 636);
  assert.equal(plan.prelevements.length, 10);
  assert.equal(Math.round(plan.prelevements.reduce((s, p) => s + p.montant * 100, 0)) / 100, 636);
  assert.equal(plan.miseAJour[0].data.sepaRestant, 636);
  assert.equal(plan.miseAJour[0].data.prenotificationSepa, "a_verifier");
  assert.equal(plan.prenotificationARevoir, true);
  assert.equal(plan.miseAJour[0].data.items[1].tva, 0, "la licence reste à 0 %");
});

test("SEPA : un prélèvement déjà remis à la banque bloque", () => {
  const a = analyserMontantInscription([sepa], [{ ...prelevements[0], status: "remis" }, ...prelevements.slice(1)]);
  assert.equal(a.possible, false);
  assert.match(a.raison!, /déjà remis/);
});

test("commande simple : lignes et total ; verrouillée si facturée ou déjà réglée", () => {
  const simple = { id: "p2", familyId: "f1", status: "pending", paidAmount: 0, totalTTC: 736, items: lignes };
  const a = analyserMontantInscription([simple]);
  assert.equal(a.forme, "simple");
  const plan = planifierMontantInscription(a, [simple], [{ ...a.lignes[0], priceTTC: 650 }, a.lignes[1]]);
  assert.equal(plan.miseAJour[0].data.totalTTC, 686);
  assert.equal(analyserMontantInscription([{ ...simple, invoiceNumber: "F-2026-0300" }]).possible, false);
  assert.equal(analyserMontantInscription([{ ...simple, paidAmount: 100, status: "partial" }]).possible, false);
});

test("commande dont l'échéancier SEPA a été annulé : commande ordinaire, visible dans Impayés dès aujourd'hui", () => {
  const annulee = { ...sepa, status: "pending", paymentMode: "", sepaRestant: undefined, echeancierAnnuleLe: "2026-09-26T08:00:00Z", echeanceDate: "2026-09-26" };
  assert.equal(estEcheance(annulee), false);
  assert.equal(listerImpayes([annulee], "2026-09-26").length, 1);
  assert.equal(analyserMontantInscription([annulee]).forme, "simple");
  // Replanifiée en SEPA ensuite : de nouveau suivie comme un prélèvement.
  assert.equal(estEcheance({ ...annulee, status: "sepa_scheduled", paymentMode: "prelevement_sepa" }), true);
});

test("paiement en 10 fois par carte : reste dû redécoupé sur le même nombre d'échéances", () => {
  const base = { familyId: "f1", familyName: "Martin", forfaitRef: "Galop 3", paymentMode: "cb_terminal", status: "pending", paidAmount: 0, echeancesTotal: 10 };
  const echs = Array.from({ length: 10 }, (_, i) => ({ ...base, id: `e${i + 1}`, orderId: `O${i + 1}`, echeance: i + 1, echeanceDate: `2026-${String(10 + (i % 3)).padStart(2, "0")}-05`, totalTTC: 73.6, items: i === 0 ? lignes : [{ activityTitle: `Échéance ${i + 1}/10 — Lou`, childId: "c1", tva: 5.5, priceTTC: 73.6 }] }));
  echs[0] = { ...echs[0], status: "paid", paidAmount: 73.6 };
  const a = analyserMontantInscription(echs);
  assert.equal(a.forme, "echeances");
  assert.equal(a.paye, 73.6);
  const plan = planifierMontantInscription(a, echs, [{ ...a.lignes[0], priceTTC: 600 }, a.lignes[1]], [], "2026-09-26");
  assert.equal(plan.possible, true, plan.raison);
  assert.equal(plan.miseAJour.length, 9, "les 9 échéances non payées sont réécrites");
  assert.equal(Math.round(plan.miseAJour.reduce((s, m) => s + m.data.totalTTC * 100, 0)) / 100, 562.4, "636 − 73,60 déjà payés");
  assert.ok(plan.miseAJour.every((m) => m.data.paymentMode === "cb_terminal"));
});

test("un total plus bas que ce qui est déjà payé est refusé (avoir)", () => {
  const base = { familyId: "f1", forfaitRef: "G", paymentMode: "cb_terminal", echeancesTotal: 2, items: lignes };
  const echs = [{ ...base, id: "a", echeance: 1, status: "paid", paidAmount: 400, totalTTC: 400 }, { ...base, id: "b", echeance: 2, status: "pending", paidAmount: 0, totalTTC: 336, echeanceDate: "2026-10-05" }];
  const a = analyserMontantInscription(echs);
  const plan = planifierMontantInscription(a, echs, [{ ...a.lignes[0], priceTTC: 300 }, { ...a.lignes[1], priceTTC: 36 }], [], "2026-09-26");
  assert.equal(plan.possible, false);
  assert.match(plan.raison!, /avoir/);
});

test("ligne corrigée : HT recalculé, 0 % respecté", () => {
  assert.equal(ligneCorrigee({ activityTitle: "F", priceTTC: 0, tva: 5.5 }, 105.5).priceHT, 100);
  assert.equal(ligneCorrigee({ activityTitle: "L", priceTTC: 0, tva: 0 }, 36).priceHT, 36);
});

console.log(`\n${process.exitCode ? "❌" : "✅"} ${passes} tests passés`);
