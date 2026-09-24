/**
 * tests/unit/refaire-echeancier.test.ts — un forfait en 3 fois par carte,
 * redécoupé en 10 virements sans toucher à l'inscription.
 *   npx tsx tests/unit/refaire-echeancier.test.ts
 */
import assert from "node:assert/strict";
import { lignesDuResteDu, refaireEcheancier } from "../../src/app/admin/paiements/refaire-echeancier-utils";

let passes = 0;
function test(nom: string, fn: () => void) {
  try { fn(); passes++; console.log(`  ✅ ${nom}`); }
  catch (e: any) { console.error(`  ❌ ${nom}\n     ${e.message}`); process.exitCode = 1; }
}

// Tel que l'inscription depuis le planning l'écrit : les vraies lignes sur l'échéance 1.
const lignesForfait = [
  { activityTitle: "Forfait Galop 3 — mercredi 14:00", childId: "c1", childName: "Lou", priceHT: 568.72, tva: 5.5, priceTTC: 600 },
  { activityTitle: "Licence FFE", childId: "c1", childName: "Lou", priceHT: 36, tva: 0, priceTTC: 36 },
];
const base = { familyId: "f1", familyName: "Martin", forfaitRef: "Galop 3 — mercredi 14:00", paymentMode: "cb_terminal", status: "pending", paidAmount: 0, echeancesTotal: 3 };
const troisCb = [
  { ...base, id: "p1", orderId: "O1", echeance: 1, echeanceDate: "2026-09-24", totalTTC: 212, items: lignesForfait },
  { ...base, id: "p2", orderId: "O2", echeance: 2, echeanceDate: "2026-10-24", totalTTC: 212, items: [{ activityTitle: "Échéance 2/3 — Lou", childId: "c1", tva: 5.5, priceTTC: 212 }] },
  { ...base, id: "p3", orderId: "O3", echeance: 3, echeanceDate: "2026-11-24", totalTTC: 212, items: [{ activityTitle: "Échéance 3/3 — Lou", childId: "c1", tva: 5.5, priceTTC: 212 }] },
];
const dix = { nombre: 10, mode: "virement", dateDepart: "2026-10-05" };
const somme = (xs: number[]) => Math.round(xs.reduce((s, x) => s + x * 100, 0)) / 100;

test("3 fois CB → 10 virements : 3 commandes réutilisées, 7 créées, total conservé", () => {
  const plan = refaireEcheancier(troisCb, dix);
  assert.equal(plan.possible, true, plan.raison);
  assert.deepEqual(plan.miseAJour.map((e) => e.id), ["p1", "p2", "p3"]);
  assert.equal(plan.creations.length, 7);
  assert.equal(plan.annulations.length, 0);
  const toutes = [...plan.miseAJour, ...plan.creations];
  assert.equal(somme(toutes.map((e) => e.data.totalTTC)), 636);
  assert.ok(toutes.every((e) => e.data.paymentMode === "virement" && e.data.echeancesTotal === 10 && e.data.status === "pending"));
  assert.deepEqual(toutes.map((e) => e.data.echeance), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.equal(plan.apercu[0].date, "2026-10-05");
  assert.equal(plan.apercu[9].date, "2027-07-05");
});

test("chaque échéance porte sa part de la licence à 0 % : la TVA reste juste", () => {
  const plan = refaireEcheancier(troisCb, dix);
  const toutes = [...plan.miseAJour, ...plan.creations];
  const licence = somme(toutes.flatMap((e) => e.data.items.filter((i: any) => /Licence/.test(i.activityTitle)).map((i: any) => i.priceTTC)));
  assert.equal(licence, 36);
  assert.ok(toutes.every((e) => e.data.items.every((i: any) => i.childId === "c1")));
});

test("les échéances créées restent dans le même échéancier (famille, forfait) avec un identifiant stable", () => {
  const c = refaireEcheancier(troisCb, dix).creations[0];
  assert.equal(c.id, "p1-echeance-04");
  assert.equal(c.data.familyId, "f1");
  assert.equal(c.data.forfaitRef, "Galop 3 — mercredi 14:00");
  assert.equal(c.data.orderId, "O1-E04");
});

test("moins d'échéances qu'avant : celles en trop sont annulées avec un motif, jamais effacées", () => {
  const plan = refaireEcheancier(troisCb, { ...dix, nombre: 2 });
  assert.equal(plan.miseAJour.length, 2);
  assert.deepEqual(plan.annulations.map((a) => a.id), ["p3"]);
  assert.equal(plan.annulations[0].data.status, "cancelled");
  assert.match(plan.annulations[0].data.annulationMotif, /2 fois \(virement\)/);
});

test("une échéance déjà payée est conservée ; seul le reste dû est redécoupé", () => {
  const echs = [{ ...troisCb[0], status: "paid", paidAmount: 212 }, troisCb[1], troisCb[2]];
  const plan = refaireEcheancier(echs, dix);
  assert.equal(plan.conservees, 1);
  assert.equal(plan.resteDu, 424);
  assert.deepEqual(plan.miseAJour.map((e) => e.id), ["p2", "p3"]);
  assert.equal(plan.miseAJour[0].data.echeance, 2);
  assert.equal(plan.miseAJour[0].data.echeancesTotal, 11);
  assert.ok(plan.miseAJour[0].data.items.every((i: any) => /^Solde du forfait — Lou/.test(i.activityTitle)));
});

test("refus : échéance facturée, entamée, SEPA, mode inconnu, tout payé", () => {
  assert.match(refaireEcheancier([{ ...troisCb[0], invoiceNumber: "F-2026-0100" }, troisCb[1]], dix).raison!, /facture F-2026-0100/);
  assert.match(refaireEcheancier([{ ...troisCb[0], paidAmount: 50 }, troisCb[1]], dix).raison!, /en partie/);
  assert.match(refaireEcheancier(troisCb.map((e) => ({ ...e, paymentMode: "prelevement_sepa" })), dix).raison!, /SEPA/);
  assert.match(refaireEcheancier(troisCb, { ...dix, mode: "prelevement_sepa" }).raison!, /SEPA/);
  assert.match(refaireEcheancier(troisCb.map((e) => ({ ...e, status: "paid" })), dix).raison!, /déjà payées/);
  assert.match(refaireEcheancier(troisCb, { ...dix, nombre: 13 }).raison!, /entre 1 et 12/);
});

test("passer en virement coupe le rappel de lien CB ; rester en carte le garde", () => {
  const avecRappel = troisCb.map((e) => ({ ...e, reglementParLienCb: true }));
  assert.equal(refaireEcheancier(avecRappel, dix).miseAJour[0].data.reglementParLienCb, false);
  assert.equal(refaireEcheancier(avecRappel, { ...dix, mode: "cb_terminal" }).miseAJour[0].data.reglementParLienCb, true);
});

test("un lien CB déjà ouvert est signalé", () => {
  assert.equal(refaireEcheancier([{ ...troisCb[0], cawlHostedCheckoutId: "h1" }, troisCb[1]], dix).lienCbDejaOuvert, true);
  assert.equal(refaireEcheancier(troisCb, dix).lienCbDejaOuvert, false);
});

test("lignesDuResteDu additionne les parts quand aucune échéance ne porte tout", () => {
  const echs = [1, 2].map((n) => ({ items: [{ activityTitle: `Forfait — échéance ${n}/2`, tva: 5.5, priceTTC: 100 }] }));
  const l = lignesDuResteDu(echs, 20000);
  assert.equal(l.length, 1);
  assert.equal(l[0].activityTitle, "Forfait");
  assert.equal(l[0].priceTTC, 200);
});

console.log(`\n${process.exitCode ? "❌" : "✅"} ${passes} tests passés`);
