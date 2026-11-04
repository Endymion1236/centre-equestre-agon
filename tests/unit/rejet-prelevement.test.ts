/**
 * Prélèvement rejeté : la ligne « impayé » du relevé et l'annulation SEPA.
 */
import assert from "node:assert/strict";
import { apparierRejets, estRejetPrelevement, rejetsDuJournal } from "../../src/lib/rejet-prelevement";

let passes = 0;
function test(nom: string, fn: () => void) {
  try { fn(); passes++; console.log(`  ✅ ${nom}`); }
  catch (e) { console.error(`  ❌ ${nom}`); console.error(e); process.exitCode = 1; }
}

test("les libellés d'impayé du relevé sont reconnus, pas les prélèvements ordinaires", () => {
  assert.equal(estRejetPrelevement("Impayé Prel Mr Samson Mickael CEDC6PRLVP Du 28/10/26"), true);
  assert.equal(estRejetPrelevement("REJET PRLV SEPA DUPONT"), true);
  assert.equal(estRejetPrelevement("PRLV SEPA ORANGE"), false);
  assert.equal(estRejetPrelevement("Facture impayée Agrial"), false, "pas un prélèvement");
});

const dateDe = (e: any) => e.dateIso;
test("les rejets du journal : contre-passations d'un prélèvement, en positif", () => {
  const r = rejetsDuJournal([
    { id: "cp", correctionDe: "x", montant: -55, mode: "prelevement_sepa", raison: "Rejet bancaire du prélèvement du 28/10/2026", dateIso: "2026-11-01", familyName: "SAMSON" },
    { id: "autre", correctionDe: "y", montant: -69.9, mode: "virement", raison: "Correction : doublon", dateIso: "2026-11-03" },
    { id: "vente", montant: 55, mode: "prelevement_sepa", dateIso: "2026-10-28" },
  ], dateDe);
  assert.deepEqual(r.map((x) => [x.id, x.montant]), [["cp", 55]]);
});

test("SAMSON : la ligne « impayé » retrouve son rejet ; un 2e impayé du même montant sans rejet reste seul", () => {
  const rejets = [{ id: "cp", montant: 55, dateIso: "2026-11-01" }];
  const m = apparierRejets([
    { id: "l1", montant: 55, dateOperation: "2026-10-30" },
    { id: "l2", montant: 55, dateOperation: "2026-10-31" },
  ], rejets);
  assert.equal(m.get("l1")?.id, "cp");
  assert.equal(m.get("l2"), null);
  assert.equal(apparierRejets([{ id: "l", montant: 55, dateOperation: "2026-06-01" }], rejets).get("l"), null, "plus de 60 jours : pas lié");
});

if (process.exitCode) { console.error("❌ échec"); } else console.log(`✅ ${passes} tests passés`);
