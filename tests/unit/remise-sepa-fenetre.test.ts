/**
 * tests/unit/remise-sepa-fenetre.test.ts — date bancaire d'une remise SEPA.
 *   npx tsx tests/unit/remise-sepa-fenetre.test.ts
 */
import assert from "node:assert/strict";
import { remiseSepaDansFenetre } from "../../src/app/admin/comptabilite/rapprochement-utils";

let n = 0;
const test = (nom: string, fn: () => void) => { try { fn(); n++; } catch (e) { console.error(`❌ ${nom}`); throw e; } };
const d = (iso: string) => new Date(iso + "T00:00:00");

test("remise n°4 : demandée le 28/09, générée le 08/10, prélevée le 12/10", () => {
  assert.equal(remiseSepaDansFenetre({ datePrelevement: "2026-09-28", dateRemise: "2026-10-08" }, d("2026-10-12"), "2026-10"), true);
});
test("sans date de génération, ±7 jours / +10 jours autour de la date demandée", () => {
  assert.equal(remiseSepaDansFenetre({ datePrelevement: "2026-09-28" }, d("2026-10-12"), "2026-10"), false);
  assert.equal(remiseSepaDansFenetre({ datePrelevement: "2026-09-28" }, d("2026-10-05"), "2026-10"), true);
});
test("même mois : toujours admise", () => {
  assert.equal(remiseSepaDansFenetre({ datePrelevement: "2026-10-12" }, d("2026-11-30"), "2026-10"), true);
});
test("bien avant la date demandée, ou bien après le dépôt : refusée", () => {
  assert.equal(remiseSepaDansFenetre({ datePrelevement: "2026-10-20", dateRemise: "2026-10-01" }, d("2026-10-05"), "2026-11"), false);
  assert.equal(remiseSepaDansFenetre({ datePrelevement: "2026-09-28", dateRemise: "2026-10-08" }, d("2026-11-02"), "2026-11"), false);
});
test("pas de date bancaire : refusée hors du mois", () => {
  assert.equal(remiseSepaDansFenetre({ datePrelevement: "2026-09-28" }, null, "2026-10"), false);
});
console.log(`✅ ${n} tests passés`);
