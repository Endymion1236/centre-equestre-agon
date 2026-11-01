/**
 * Email « prélèvement rejeté » : variables du gabarit et garde-fous d'envoi.
 */
import assert from "node:assert/strict";
import { variablesEmailRejet, controleEnvoiRejet, jourLong } from "../../src/lib/sepa-rejet-email";

let passes = 0;
function test(nom: string, fn: () => void) {
  try { fn(); passes++; console.log(`  ✅ ${nom}`); }
  catch (e) { console.error(`  ❌ ${nom}`); console.error(e); process.exitCode = 1; }
}

const ech = { id: "e1", familyName: "SAMSON Mickael", montant: 55, dateEcheance: "2026-10-30", description: "Forfait annuel 3/10", status: "rejete" };

test("variables : montant à la virgule, date en toutes lettres, prestation entre parenthèses", () => {
  const v = variablesEmailRejet(ech);
  assert.equal(v.parentName, "SAMSON Mickael");
  assert.equal(v.montant, "55,00");
  assert.equal(v.dateEcheance, "30 octobre 2026");
  assert.equal(v.prestation, " (Forfait annuel 3/10)");
  assert.equal(v.representation, "");
});

test("représentation annoncée quand une nouvelle échéance existe", () => {
  const v = variablesEmailRejet(ech, "2026-11-30");
  assert.match(v.representation, /30 novembre 2026/);
});

test("sans description ni référence : pas de parenthèse vide", () => {
  assert.equal(variablesEmailRejet({ ...ech, description: "", reference: null }).prestation, "");
  assert.equal(jourLong("n'importe quoi"), "n'importe quoi");
});

test("garde-fous : rejet enregistré, montant, email", () => {
  assert.equal(controleEnvoiRejet(ech, "a@b.fr").ok, true);
  assert.equal(controleEnvoiRejet({ ...ech, status: "preleve" }, "a@b.fr").ok, false);
  assert.equal(controleEnvoiRejet(ech, "").ok, false);
  assert.equal(controleEnvoiRejet(null, "a@b.fr").ok, false);
});

if (process.exitCode) { console.error("❌ échec"); } else console.log(`✅ ${passes} tests passés`);
