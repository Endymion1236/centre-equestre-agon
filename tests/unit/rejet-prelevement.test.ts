/**
 * Prélèvement rejeté : la ligne « impayé » du relevé et l'annulation SEPA.
 */
import assert from "node:assert/strict";
import { apparierRejets, estRejetPrelevement, rejetsDuJournal } from "../../src/lib/rejet-prelevement";
import { fecDuMois } from "../../src/lib/envoi-comptable-utils";

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
  const correction = { id: "duhem", correctionDe: "z", montant: -650, mode: "prelevement_sepa", raison: "Correction : erreur de montant", dateIso: "2026-10-05" };
  assert.equal(rejetsDuJournal([correction], dateDe).length, 0, "une correction ordinaire n'est pas un rejet bancaire");
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

test("l'annulation d'un rejet (journal OD depuis le 04/11/2026) solde la liaison 58000000, jamais la banque", () => {
  const cp = { id: "cp", paymentId: "p1", familyName: "SAMSON", montant: -55, mode: "prelevement_sepa", modeLabel: "ANNUL. Prélèvement SEPA",
    correctionDe: "e1", raison: "Rejet bancaire du prélèvement du 28/10/2026", date: { seconds: Date.parse("2026-11-01T10:00:00Z") / 1000 } };
  const f = fecDuMois({ mois: "2026-11", factures: [], encaissements: [cp], payments: [], achatsBanque: { debits: [], credits: [] } });
  const rg = f.contenu.split("\n").map((l) => l.split("\t")).filter((c) => c[0] === "OD");
  assert.ok(rg.some((c) => c[4] === "58000000" && c[12] === "55,00"), "liaison au crédit");
  assert.ok(rg.some((c) => c[4] === "41100000" && c[11] === "55,00"), "client au débit");
  assert.ok(!rg.some((c) => c[4] === "51200000"), "la banque n'est pas touchée par l'annulation");
});

if (process.exitCode) { console.error("❌ échec"); } else console.log(`✅ ${passes} tests passés`);
