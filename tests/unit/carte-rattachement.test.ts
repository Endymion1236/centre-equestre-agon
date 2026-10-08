/**
 * tests/unit/carte-rattachement.test.ts — séances déjà prises reprises par une carte vendue après coup.
 *   npx tsx tests/unit/carte-rattachement.test.ts
 */
import assert from "node:assert/strict";
import { ligneHistoriqueRattachement, planRattachement, seancesCandidates } from "../../src/lib/carte-rattachement";

let passes = 0;
function test(nom: string, fn: () => void) {
  try { fn(); passes++; console.log(`  ✅ ${nom}`); }
  catch (e: any) { console.error(`  ❌ ${nom}\n     ${e.message}`); process.exitCode = 1; }
}

const carteFred = { id: "carte1", familyId: "fam", childId: "fred", activityType: "particulier", remainingSessions: 5, history: [] as any[] };
const ligne = (creneauId: string, extra: any = {}) => ({ activityTitle: "Cours particulier", childId: "fred", childName: "Fred", creneauId, priceTTC: 45, tva: 5.5, ...extra });
const commandes = [
  { id: "p1", familyId: "fam", status: "pending", paidAmount: 0, items: [ligne("cp1"), { activityTitle: "Licence FFE +18ans", childId: "fred", priceTTC: 36, tva: 0 }] },
  { id: "p2", familyId: "fam", status: "paid", paidAmount: 45, items: [ligne("cp2")] },
  { id: "p3", familyId: "fam", status: "pending", paidAmount: 0, items: [ligne("cc1", { activityTitle: "Cours collectif", activityType: "cours" })] },
  { id: "p4", familyId: "fam", status: "pending", paidAmount: 0, items: [ligne("cp3")] },
];
const creneaux = {
  cp1: { activityType: "cours_particulier", date: "2026-10-03", startTime: "10:00" },
  cp2: { activityType: "cours_particulier", date: "2026-09-26", startTime: "10:00" },
  cc1: { activityType: "cours", date: "2026-10-04", startTime: "14:00" },
  cp3: { activityType: "cours", formuleChoisie: "cours-particulier", date: "2026-10-10", startTime: "11:00" },
};

test("cours particuliers de Fred : vierges rattachables, réglée signalée, collectif écarté", () => {
  const c = seancesCandidates(carteFred, commandes, creneaux);
  assert.deepEqual(c.map((x) => [x.creneauId, x.rattachable]), [["cp2", false], ["cp1", true], ["cp3", true]]);
  assert.match(c[0].motif!, /il faut un avoir/);
});

test("rattacher : la ligne quitte sa commande, une commande vidée est annulée", () => {
  const c = seancesCandidates(carteFred, commandes, creneaux);
  const plan = planRattachement(carteFred, commandes, c, ["p1:0", "p4:0", "p2:0"]);
  assert.equal(plan.seances.length, 2, "la séance réglée n'est jamais reprise");
  assert.deepEqual(plan.ajustements, [
    { paymentId: "p1", annuler: false, items: [commandes[0].items[1]], totalTTC: 36 },
    { paymentId: "p4", annuler: true, items: [], totalTTC: 0 },
  ]);
});

test("jamais plus que les séances restantes, ni deux fois la même", () => {
  const c = seancesCandidates({ ...carteFred, remainingSessions: 1 }, commandes, creneaux);
  assert.match(planRattachement({ ...carteFred, remainingSessions: 1 }, commandes, c, ["p1:0", "p4:0"]).erreur!, /plus que 1 séance/);
  const dejaDebitee = { ...carteFred, history: [{ creneauId: "cp1", childName: "Fred" }] };
  assert.equal(seancesCandidates(dejaDebitee, commandes, creneaux).some((x) => x.creneauId === "cp1"), false);
  const annulee = { ...carteFred, history: [{ creneauId: "cp1", childName: "Fred", annule: true }] };
  assert.equal(seancesCandidates(annulee, commandes, creneaux).some((x) => x.creneauId === "cp1"), true, "un débit annulé libère la séance");
});

test("fin de validité et autre cavalier", () => {
  const c = seancesCandidates({ ...carteFred, dateFin: "2026-10-05" }, commandes, creneaux);
  assert.equal(c.find((x) => x.creneauId === "cp3")!.motif, "après la fin de validité de la carte");
  assert.equal(seancesCandidates({ ...carteFred, childId: "autre" }, commandes, creneaux).length, 0);
});

test("historique : la séance est tracée comme reprise après coup", () => {
  const c = seancesCandidates(carteFred, commandes, creneaux);
  const h = ligneHistoriqueRattachement(c[1], "2026-10-08T10:00:00.000Z");
  assert.deepEqual(h, { date: "2026-10-08T10:00:00.000Z", activityTitle: "Cours particulier", creneauId: "cp1", creneauDate: "2026-10-03", startTime: "10:00", childName: "Fred", rattachement: true });
});

console.log(`\n${process.exitCode ? "❌" : "✅"} ${passes} tests passés`);
