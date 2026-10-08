/**
 * tests/unit/sepa-prenotification-resume.test.ts — une pré-notification SEPA par famille, toutes commandes.
 *   npx tsx tests/unit/sepa-prenotification-resume.test.ts
 */
import assert from "node:assert/strict";
import { grouperParFamille, resumePrenotification } from "../../src/lib/sepa-prenotification-resume";

let passes = 0;
function test(nom: string, fn: () => void) {
  try { fn(); passes++; console.log(`  ✅ ${nom}`); }
  catch (e: any) { console.error(`  ❌ ${nom}\n     ${e.message}`); process.exitCode = 1; }
}

const commandes = [
  { id: "forfait", items: [{ activityTitle: "Forfait G3 mercredi" }, { activityTitle: "Licence FFE" }] },
  { id: "stage", items: [{ activityTitle: "Stage Toussaint" }] },
  { id: "concours", items: [{ activityTitle: "Engagement — Poussin" }] },
];
const echeances = [
  { commandeId: "forfait", dateEcheance: "2026-11-05", montant: 65, mandatId: "M1" },
  { commandeId: "forfait", dateEcheance: "2026-12-05", montant: 65, mandatId: "M1" },
  { commandeId: "stage", dateEcheance: "2026-11-05", montant: 175, mandatId: "M1" },
  { commandeId: "concours", dateEcheance: "2026-11-05", montant: 51.1, mandatId: "M2" },
  { commandeId: "concours", dateEcheance: "2026-10-05", montant: 20, mandatId: "M1", status: "remis" },
];

test("calendrier : un montant par date, toutes commandes confondues", () => {
  const r = resumePrenotification(commandes, echeances);
  assert.deepEqual(r.parDate, [{ date: "2026-11-05", montant: 291.1, nbCommandes: 3 }, { date: "2026-12-05", montant: 65, nbCommandes: 1 }]);
  assert.equal(r.total, 356.1);
  assert.equal(r.nbEcheances, 4, "une échéance déjà remise ne se pré-notifie plus");
});

test("détail par commande et mandats", () => {
  const r = resumePrenotification(commandes, echeances);
  assert.deepEqual(r.commandes, [
    { id: "forfait", prestations: "Forfait G3 mercredi, Licence FFE", montant: 130, nbEcheances: 2 },
    { id: "stage", prestations: "Stage Toussaint", montant: 175, nbEcheances: 1 },
    { id: "concours", prestations: "Engagement — Poussin", montant: 51.1, nbEcheances: 1 },
  ]);
  assert.deepEqual(r.mandats, ["M1", "M2"]);
});

test("une commande sans échéance à venir n'apparaît pas", () => {
  const r = resumePrenotification(commandes, echeances.filter((e) => e.commandeId !== "stage"));
  assert.equal(r.commandes.some((x) => x.id === "stage"), false);
});

test("regroupement par famille : les 8 commandes DUHEM → un seul email", () => {
  const p = Array.from({ length: 8 }, (_, k) => ({ id: `d${k}`, familyId: "duhem", familyName: "DUHEM" }));
  const g = grouperParFamille([...p, { id: "x", familyId: "autre", familyName: "AUTRE" }]);
  assert.equal(g.length, 2);
  assert.deepEqual(g[0], { familyId: "duhem", familyName: "DUHEM", ids: p.map((x) => x.id) });
});

console.log(`\n${process.exitCode ? "❌" : "✅"} ${passes} tests passés`);
