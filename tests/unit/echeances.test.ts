import assert from "node:assert/strict";
import {
  computeDefaultDate,
  dateEcheanceLisible,
  estEcheanceSepa,
  messageLienEcheance,
  preparerEcheanciers,
  resteDuEcheance,
} from "../../src/app/admin/paiements/echeances-utils";

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

const payment = (overrides: Record<string, any> = {}) => ({
  id: "p1",
  familyId: "f1",
  familyName: "Martin",
  forfaitRef: "FORFAIT-A",
  echeancesTotal: 3,
  echeance: 1,
  echeanceDate: "2026-09-15",
  totalTTC: 50,
  status: "pending",
  paymentMode: "cheque",
  ...overrides,
});

console.log("\n── Détection SEPA ──");

test("le mode prélèvement SEPA reste exclu même après passage en partial", () => {
  assert.equal(estEcheanceSepa(payment({ paymentMode: "prelevement_sepa", status: "partial" })), true);
});

test("le statut historique sepa_scheduled reste reconnu", () => {
  assert.equal(estEcheanceSepa(payment({ paymentMode: "", status: "sepa_scheduled" })), true);
});

console.log("\n── Date d'encaissement ──");

test("une échéance passée conserve sa date", () => {
  assert.equal(computeDefaultDate("2026-08-20", "2026-09-01"), "2026-08-20");
});

test("une échéance future utilise aujourd'hui", () => {
  assert.equal(computeDefaultDate("2026-09-20", "2026-09-01"), "2026-09-01");
});

test("sans date d'échéance, aujourd'hui est utilisé", () => {
  assert.equal(computeDefaultDate(undefined, "2026-09-01"), "2026-09-01");
});

console.log("\n── Regroupement et statistiques ──");

const payments = [
  payment({ id: "a2", echeance: 2, echeanceDate: "2026-10-15" }),
  payment({ id: "a1", echeance: 1, echeanceDate: "2026-08-31", totalTTC: 40 }),
  payment({ id: "a3", echeance: 3, echeanceDate: "2026-11-15", totalTTC: 60 }),
  payment({ id: "b1", familyId: "f2", familyName: "Durand", forfaitRef: "FORFAIT-B", echeanceDate: "2026-09-20", totalTTC: 70 }),
  payment({ id: "c1", familyId: "f3", familyName: "Alpha", forfaitRef: "FORFAIT-C", echeanceDate: "2026-12-01", totalTTC: 80 }),
  payment({ id: "sepa", familyId: "f4", familyName: "Sepa", paymentMode: "prelevement_sepa", status: "partial", totalTTC: 999 }),
  payment({ id: "cancel", familyId: "f5", familyName: "Annule", status: "cancelled", totalTTC: 999 }),
];

test("les échéances sont regroupées par famille et forfait, puis triées par numéro", () => {
  const result = preparerEcheanciers(payments, {}, "2026-09-01");
  const martin = result.groupesList.find(([key]) => key === "f1_FORFAIT-A");
  assert.ok(martin);
  assert.deepEqual(martin![1].map((p) => p.id), ["a1", "a2", "a3"]);
});

test("SEPA et paiements annulés n'entrent ni dans les groupes ni dans les stats", () => {
  const result = preparerEcheanciers(payments, {}, "2026-09-01");
  assert.equal(result.statsRecap.nbFamilies, 3);
  assert.equal(result.groupesList.some(([, group]) => group.some((p) => p.id === "sepa" || p.id === "cancel")), false);
});

test("les statistiques distinguent retards, mois courant et horizon trois mois", () => {
  const result = preparerEcheanciers(payments, {}, "2026-09-01");
  assert.equal(result.statsRecap.totalOverdue, 40);
  assert.equal(result.statsRecap.countOverdue, 1);
  assert.equal(result.statsRecap.totalThisMonth, 70);
  assert.equal(result.statsRecap.countThisMonth, 1);
  assert.equal(result.statsRecap.totalThreeMonths, 260);
  assert.equal(result.statsRecap.countThreeMonths, 4);
});

console.log("\n── Filtres et tris ──");

test("le filtre retard ne conserve que les familles avec impayé échu", () => {
  const result = preparerEcheanciers(payments, { onlyOverdue: true }, "2026-09-01");
  assert.deepEqual(result.groupesList.map(([, group]) => group[0].familyName), ["Martin"]);
  assert.equal(result.hasOverdue, true);
});

test("la recherche famille est insensible à la casse", () => {
  const result = preparerEcheanciers(payments, { search: "DUR" }, "2026-09-01");
  assert.deepEqual(result.groupesList.map(([, group]) => group[0].familyName), ["Durand"]);
});

test("le tri alpha classe les familles par nom", () => {
  const result = preparerEcheanciers(payments, { sortMode: "alpha" }, "2026-09-01");
  assert.deepEqual(result.groupesList.map(([, group]) => group[0].familyName), ["Alpha", "Durand", "Martin"]);
});

test("le tri retard place d'abord la famille ayant une échéance dépassée", () => {
  const result = preparerEcheanciers(payments, { sortMode: "retard" }, "2026-09-01");
  assert.equal(result.groupesList[0][1][0].familyName, "Martin");
});

test("la préparation ne modifie pas l'ordre du tableau source", () => {
  const ids = payments.map((p) => p.id);
  preparerEcheanciers(payments, { sortMode: "prochaine" }, "2026-09-01");
  assert.deepEqual(payments.map((p) => p.id), ids);
});

console.log("\n── Lien de paiement d'une échéance ──");

test("le reste dû tient compte d'un règlement partiel", () => {
  assert.equal(resteDuEcheance({ totalTTC: 69.9 }), 69.9);
  assert.equal(resteDuEcheance({ totalTTC: 69.9, paidAmount: 20 }), 49.9);
  assert.equal(resteDuEcheance({ totalTTC: 69.9, paidAmount: 69.9 }), 0);
});

test("un trop-perçu ne rend jamais un reste dû négatif", () => {
  assert.equal(resteDuEcheance({ totalTTC: 69.9, paidAmount: 100 }), 0);
  assert.equal(resteDuEcheance({}), 0);
  assert.equal(resteDuEcheance(null), 0);
});

test("la date d'échéance se lit en toutes lettres, ou pas du tout", () => {
  assert.equal(dateEcheanceLisible("2026-11-23"), "23 novembre 2026");
  assert.equal(dateEcheanceLisible(""), "");
  assert.equal(dateEcheanceLisible("23/11/2026"), "", "un format inattendu ne produit pas une date fausse");
});

test("le message dit de quelle échéance il s'agit", () => {
  const texte = messageLienEcheance(
    { echeance: 3, echeancesTotal: 10, echeanceDate: "2026-11-23" }, "2026-09-23");
  assert.ok(texte.includes("l'échéance 3/10"), texte);
  assert.ok(texte.includes("prévue pour le 23 novembre 2026"), texte);
});

test("une échéance dépassée se dit au passé", () => {
  const texte = messageLienEcheance(
    { echeance: 1, echeancesTotal: 10, echeanceDate: "2026-09-23" }, "2026-10-05");
  assert.ok(texte.includes("était attendue le 23 septembre 2026"), texte);
});

test("sans numéro ni date, le message reste correct", () => {
  const texte = messageLienEcheance({}, "2026-09-23");
  assert.ok(texte.includes("cette échéance"), texte);
  assert.ok(!texte.includes("undefined") && !texte.includes("NaN"), texte);
});

console.log(`\n✅ ${passes} tests passés\n`);
