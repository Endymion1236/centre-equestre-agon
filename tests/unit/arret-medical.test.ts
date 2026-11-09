/**
 * tests/unit/arret-medical.test.ts — arrêt médical : séances manquées déduites des échéances à venir.
 *   npx tsx tests/unit/arret-medical.test.ts
 */
import assert from "node:assert/strict";
import { estSeanceDuForfait, joursArret, partCours, planArretMedical, prixSeanceForfait } from "../../src/lib/arret-medical";

let n = 0;
const test = (nom: string, fn: () => void) => { try { fn(); n++; } catch (e) { console.error(`❌ ${nom}`); throw e; } };

const somme = (xs: number[]) => Math.round(xs.reduce((s, x) => s + x * 100, 0)) / 100;

test("45 jours sans sport : au-delà des 3 semaines ; 14 jours : refusé", () => {
  assert.equal(joursArret("2026-11-01", "2026-12-15"), 45);
  const p = planArretMedical({ debut: "2026-11-01", fin: "2026-11-14", seancesManquees: 2, prixSeance: 17.88, commandes: [], prelevements: [] });
  assert.equal(p.possible, false);
  assert.match(p.raison!, /3 semaines/);
});

test("part cours : hors adhésion et licence, réduction famille comprise ; prix séance ; séance du forfait", () => {
  const items = [
    { childId: "c1", activityTitle: "Adhésion annuelle (enfant 2)", priceTTC: 40 },
    { childId: "c1", activityTitle: "Licence FFE -18ans", priceTTC: 29 },
    { childId: "c1", activityTitle: "Forfait Cours Galop 4 Loisir", priceTTC: 590 },
    { childId: "c1", activityTitle: "Réduction famille (2ème enfant, -6%)", priceTTC: -35.4 },
    { childId: "c2", activityTitle: "Forfait Cours Galop 2", priceTTC: 590 },
  ];
  assert.equal(partCours(items.filter((i) => i.childId === "c1")), 554.6);
  assert.equal(prixSeanceForfait([{ items: [{ childId: "c1", activityTitle: "Échéance 2/10", priceTTC: 69.9 }] }, { items }], "c1", 33), 16.81);
  assert.equal(prixSeanceForfait([], "c1", 33, 660), 20);
  const f = { activityTitle: "Cours Galop 4 Loisir", startTime: "17:00", childId: "c1" };
  assert.ok(estSeanceDuForfait({ activityTitle: "Cours Galop 4 Loisir", startTime: "17:00", enrolled: [{ childId: "c1" }] }, f));
  assert.ok(!estSeanceDuForfait({ activityTitle: "Cours Galop 4 Loisir", startTime: "10:00", enrolled: [{ childId: "c1" }] }, f));
  assert.ok(!estSeanceDuForfait({ activityTitle: "Cours Galop 4 Loisir", startTime: "17:00", enrolled: [{ childId: "c2" }] }, f));
});

test("commande annuelle en SEPA (planning) : seuls les prélèvements à venir hors remise baissent", () => {
  const commandes = [{ id: "P", orderId: "O1", totalTTC: 623.6, status: "sepa_scheduled", paymentMode: "prelevement_sepa", paidAmount: 124.72 }];
  const prelevements = [
    { id: "s1", orderId: "O1", paymentId: null, montant: 62.36, status: "preleve", remiseId: "R5", dateEcheance: "2026-09-05" },
    { id: "s2", orderId: "O1", paymentId: null, montant: 62.36, status: "preleve", remiseId: "R6", dateEcheance: "2026-10-05" },
    { id: "s3", orderId: "O1", paymentId: null, montant: 62.36, status: "pending", remiseId: "R7", dateEcheance: "2026-11-05" },
    ...[12, 1, 2, 3].map((m, k) => ({ id: `t${k}`, orderId: "O1", paymentId: null, montant: 62.36, status: "pending", remiseId: null, dateEcheance: `${m === 12 ? 2026 : 2027}-${String(m).padStart(2, "0")}-05` })),
    { id: "autre", orderId: "O2", paymentId: null, montant: 50, status: "pending", remiseId: null, dateEcheance: "2026-12-05" },
  ];
  const p = planArretMedical({ debut: "2026-11-01", fin: "2026-12-15", seancesManquees: 6, prixSeance: 16.81, commandes, prelevements });
  assert.equal(p.possible, true);
  assert.equal(p.reduction, 100.86);
  assert.deepEqual(p.prelevements.map((x) => x.id), ["t0", "t1", "t2", "t3"]);
  assert.equal(somme(p.prelevements.map((x) => x.part)), 100.86);
  assert.deepEqual(p.commandes, [{ paymentId: "P", echeance: undefined, reduction: 100.86, nouveauTotal: 522.74, enSepa: true }]);
  assert.equal(p.nonImpute, 0);
});

test("une commande par échéance : payées et facturées intactes, le reste baisse", () => {
  const commandes = [
    { id: "e1", echeance: 1, totalTTC: 69.9, status: "paid", invoiceNumber: "F-2026-0100", paidAmount: 69.9 },
    { id: "e2", echeance: 2, totalTTC: 69.9, status: "pending", invoiceNumber: "F-2026-0150" },
    { id: "e3", echeance: 3, totalTTC: 69.9, status: "pending" },
    { id: "e4", echeance: 4, totalTTC: 69.9, status: "partial", paidAmount: 10 },
    { id: "e5", echeance: 5, totalTTC: 69.9, status: "pending" },
  ];
  const p = planArretMedical({ debut: "2026-11-01", fin: "2026-12-15", seancesManquees: 3, prixSeance: 16.81, commandes, prelevements: [] });
  assert.deepEqual(p.commandes.map((c) => c.paymentId), ["e3", "e5"]);
  assert.equal(somme(p.commandes.map((c) => c.reduction)), 50.43);
  assert.ok(p.commandes.every((c) => !c.enSepa));
});

test("plus de réduction que d'échéances à venir : le surplus est signalé pour un avoir", () => {
  const p = planArretMedical({ debut: "2026-05-01", fin: "2026-06-30", seancesManquees: 8, prixSeance: 16.81,
    commandes: [{ id: "e10", echeance: 10, totalTTC: 62.36, status: "pending" }], prelevements: [] });
  assert.equal(p.commandes[0].nouveauTotal, 0);
  assert.equal(p.nonImpute, 72.12);
  const tout = planArretMedical({ debut: "2026-05-01", fin: "2026-06-30", seancesManquees: 8, prixSeance: 16.81,
    commandes: [{ id: "x", totalTTC: 660, status: "paid", invoiceNumber: "F-1" }], prelevements: [] });
  assert.equal(tout.nonImpute, 134.48);
});

console.log(`✅ ${n} tests passés`);
