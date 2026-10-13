/**
 * tests/unit/solde-stage-rappel.test.ts — demande et relance du solde de stage.
 *   npx tsx tests/unit/solde-stage-rappel.test.ts
 */
import assert from "node:assert/strict";
import { doitDemanderSolde, doitRelancerSolde, joursAvantStage, libelleDelai, soldeRestant } from "../../src/lib/solde-stage-rappel";

let n = 0;
const test = (nom: string, fn: () => void) => { try { fn(); n++; } catch (e) { console.error(`❌ ${nom}`); throw e; } };
const p = (x: any) => ({ totalTTC: 175, paidAmount: 30, status: "partial", ...x });
const T = (iso: string) => Date.parse(iso + "T08:00:00Z");

test("le jour J-7 : demande envoyée", () => {
  assert.equal(doitDemanderSolde(p({ stageDate: "2026-10-20" }), "2026-10-13", "2026-10-20"), true);
});
test("passage manqué : rattrapé les jours suivants, jusqu'au début du stage", () => {
  assert.equal(doitDemanderSolde(p({ stageDate: "2026-10-19" }), "2026-10-13", "2026-10-20"), true);
  assert.equal(doitDemanderSolde(p({ stageDate: "2026-10-13" }), "2026-10-13", "2026-10-20"), true);
});
test("stage commencé, trop lointain, réglé, annulé ou déjà demandé : rien", () => {
  assert.equal(doitDemanderSolde(p({ stageDate: "2026-10-12" }), "2026-10-13", "2026-10-20"), false);
  assert.equal(doitDemanderSolde(p({ stageDate: "2026-10-21" }), "2026-10-13", "2026-10-20"), false);
  assert.equal(doitDemanderSolde(p({ stageDate: "2026-10-19", paidAmount: 175 }), "2026-10-13", "2026-10-20"), false);
  assert.equal(doitDemanderSolde(p({ stageDate: "2026-10-19", status: "cancelled" }), "2026-10-13", "2026-10-20"), false);
  assert.equal(doitDemanderSolde(p({ stageDate: "2026-10-19", soldeReminderSentAt: T("2026-10-12") }), "2026-10-13", "2026-10-20"), false);
  assert.equal(doitDemanderSolde(p({ stageDate: "" }), "2026-10-13", "2026-10-20"), false);
});
test("relance : deux jours après la demande, une seule fois", () => {
  const maintenant = T("2026-10-15");
  assert.equal(doitRelancerSolde(p({ stageDate: "2026-10-20", soldeReminderSentAt: T("2026-10-13") }), "2026-10-15", "2026-10-20", maintenant), true);
  assert.equal(doitRelancerSolde(p({ stageDate: "2026-10-20", soldeReminderSentAt: T("2026-10-14") }), "2026-10-15", "2026-10-20", maintenant), false);
  assert.equal(doitRelancerSolde(p({ stageDate: "2026-10-20", soldeReminderSentAt: T("2026-10-13"), soldeRelanceJ5SentAt: 1 }), "2026-10-15", "2026-10-20", maintenant), false);
  assert.equal(doitRelancerSolde(p({ stageDate: "2026-10-20" }), "2026-10-15", "2026-10-20", maintenant), false);
});
test("délais et libellés", () => {
  assert.equal(joursAvantStage("2026-10-20", "2026-10-13"), 7);
  assert.equal(libelleDelai(7), "dans 7 jours");
  assert.equal(libelleDelai(1), "demain");
  assert.equal(libelleDelai(0), "aujourd'hui");
  assert.equal(soldeRestant({ totalTTC: 175, paidAmount: 30 }), 145);
});
console.log(`✅ ${n} tests passés`);
