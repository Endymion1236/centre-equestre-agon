/**
 * tests/unit/liens-cb-mensuels.test.ts
 * Le rappel de fin de mois des liens de paiement CB à envoyer.
 *   npx tsx tests/unit/liens-cb-mensuels.test.ts
 */
import assert from "node:assert/strict";
import { finDuMoisSuivant, liensCbAEnvoyer } from "../../src/app/admin/paiements/echeances-utils";

let passes = 0;
function test(nom: string, fn: () => void) {
  try { fn(); passes++; console.log(`  ✅ ${nom}`); }
  catch (e: any) { console.error(`  ❌ ${nom}\n     ${e.message}`); process.exitCode = 1; }
}

const ech = (id: string, n: number, date: string, extra: Record<string, any> = {}) => ({
  id, familyId: "f1", familyName: "Martin", forfaitRef: "forfait-1", echeance: n, echeancesTotal: 10,
  echeanceDate: date, totalTTC: 60, paidAmount: 0, status: "pending", paymentMode: "cb_terminal",
  reglementParLienCb: true, ...extra,
});

console.log("\n── Fin du mois suivant ──");
test("fin septembre → 31 octobre ; fin décembre → 31 janvier ; janvier → février", () => {
  assert.equal(finDuMoisSuivant("2026-09-30"), "2026-10-31");
  assert.equal(finDuMoisSuivant("2026-12-31"), "2027-01-31");
  assert.equal(finDuMoisSuivant("2027-01-31"), "2027-02-28");
});

console.log("\n── Ce que rappelle la fin de mois ──");
test("une ligne par échéancier : la prochaine échéance non réglée", () => {
  const r = liensCbAEnvoyer([ech("e1", 1, "2026-09-05", { status: "paid", paidAmount: 60 }), ech("e2", 2, "2026-10-05"), ech("e3", 3, "2026-11-05")], "2026-09-30");
  assert.equal(r.length, 1);
  assert.deepEqual([r[0].paymentId, r[0].numero, r[0].reste, r[0].enRetard], ["e2", 2, 60, false]);
});

test("une échéance trop lointaine n'est pas rappelée", () => {
  assert.equal(liensCbAEnvoyer([ech("e3", 3, "2026-11-05")], "2026-09-30").length, 0);
});

test("un retard est signalé, et les autres retards de la série comptés", () => {
  const r = liensCbAEnvoyer([ech("e2", 2, "2026-08-05"), ech("e3", 3, "2026-09-05"), ech("e4", 4, "2026-10-05")], "2026-09-30");
  assert.equal(r[0].paymentId, "e2");
  assert.equal(r[0].enRetard, true);
  assert.equal(r[0].autresEnRetard, 1);
});

test("sans le repère « lien CB », rien n'est rappelé", () => {
  assert.equal(liensCbAEnvoyer([ech("e2", 2, "2026-10-05", { reglementParLienCb: false })], "2026-09-30").length, 0);
});

test("un prélèvement SEPA ou une échéance annulée ne sont jamais rappelés", () => {
  assert.equal(liensCbAEnvoyer([ech("e2", 2, "2026-10-05", { paymentMode: "prelevement_sepa" })], "2026-09-30").length, 0);
  assert.equal(liensCbAEnvoyer([ech("e2", 2, "2026-10-05", { status: "cancelled" })], "2026-09-30").length, 0);
});

test("une échéance réglée en partie : on rappelle le reste dû", () => {
  const r = liensCbAEnvoyer([ech("e2", 2, "2026-10-05", { status: "partial", paidAmount: 20 })], "2026-09-30");
  assert.equal(r[0].reste, 40);
});

test("deux familles : deux lignes, triées par date", () => {
  const r = liensCbAEnvoyer([
    ech("b2", 2, "2026-10-10", { familyId: "f2", familyName: "Bernard" }),
    ech("e2", 2, "2026-10-05"),
  ], "2026-09-30");
  assert.deepEqual(r.map((l) => l.familyName), ["Martin", "Bernard"]);
});

console.log(`\n✅ ${passes} tests passés\n`);
