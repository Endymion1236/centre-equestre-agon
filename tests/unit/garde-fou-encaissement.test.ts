/**
 * tests/unit/garde-fou-encaissement.test.ts — avant d'encaisser une échéance.
 *   npx tsx tests/unit/garde-fou-encaissement.test.ts
 */
import assert from "node:assert/strict";
import { confirmationEncaissementEcheance } from "../../src/app/admin/paiements/echeances-utils";
import { refusDateEncaissement } from "../../src/lib/date-encaissement";

let passes = 0;
function test(nom: string, fn: () => void) {
  try { fn(); passes++; console.log(`  ✅ ${nom}`); }
  catch (e: any) { console.error(`  ❌ ${nom}\n     ${e.message}`); process.exitCode = 1; }
}

const ech = (n: number, date: string, status = "pending") => ({ id: `p${n}`, echeance: n, echeancesTotal: 10, echeanceDate: date, totalTTC: 69.9, familyName: "Martin", status });
const echeancier = [ech(1, "2026-09-30"), ech(2, "2026-10-30"), ech(3, "2026-11-30")];
const AUJ = "2026-09-24";

test("virement : on rappelle de vérifier le relevé et que le journal ne s'efface pas", () => {
  const c = confirmationEncaissementEcheance(ech(1, "2026-09-20"), echeancier, "virement", "2026-09-20", AUJ);
  assert.equal(c.titre, "Encaisser 69,90 € par virement ?");
  assert.ok(c.details.some((d) => /virement est bien arrivé/.test(d)));
  assert.ok(c.details.some((d) => /ne s'efface plus/.test(d)));
  assert.equal(c.danger, false);
});

test("échéance future : alerte, on encaisserait de l'argent pas encore reçu", () => {
  const c = confirmationEncaissementEcheance(echeancier[0], echeancier, "virement", AUJ, AUJ);
  assert.equal(c.danger, true);
  assert.ok(c.details.some((d) => /prévue le 30 septembre 2026/.test(d)));
});

test("une échéance plus ancienne reste impayée : alerte « bonne ligne ? »", () => {
  const c = confirmationEncaissementEcheance(echeancier[2], echeancier, "cheque", AUJ, AUJ);
  assert.ok(c.details.some((d) => /échéances 1, 2 ne sont pas encore payées/.test(d)));
  const payees = [ech(1, "2026-09-01", "paid"), ech(2, "2026-09-10")];
  const c2 = confirmationEncaissementEcheance(payees[1], payees, "cheque", "2026-09-10", AUJ);
  assert.equal(c2.danger, false);
});

test("bloqué : date d'encaissement future ou montant nul", () => {
  assert.match(confirmationEncaissementEcheance(echeancier[0], echeancier, "virement", "2026-09-25", AUJ).bloque!, /futur/);
  assert.match(confirmationEncaissementEcheance({ ...echeancier[0], totalTTC: 0 }, echeancier, "cb_terminal", AUJ, AUJ).bloque!, /sans montant/);
});

test("verrou commun : jamais d'encaissement daté du futur, heure de Paris", () => {
  // 24/09 à 23h30 UTC = 25/09 à 1h30 à Paris : le 25 n'est plus le futur.
  const soir = new Date("2026-09-24T23:30:00Z");
  assert.equal(refusDateEncaissement("2026-09-25", soir), null);
  assert.match(refusDateEncaissement("2026-09-26", soir)!, /futur \(26\/09\/2026\)/);
  assert.equal(refusDateEncaissement("2026-09-01", soir), null);
  assert.equal(refusDateEncaissement(undefined, soir), null);
  assert.equal(refusDateEncaissement("", soir), null);
});

console.log(`\n${process.exitCode ? "❌" : "✅"} ${passes} tests passés`);
