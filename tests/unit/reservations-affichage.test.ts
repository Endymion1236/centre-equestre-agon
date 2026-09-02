import assert from "node:assert/strict";
import { reconcilierReservationsAvecPaiements, resteDu } from "../../src/lib/reservations-affichage";

let passes = 0;
function test(nom: string, fn: () => void) {
  try {
    fn();
    passes++;
    console.log(`  ✅ ${nom}`);
  } catch (e: any) {
    console.error(`  ❌ ${nom}\n     ${e.message}`);
    process.exitCode = 1;
  }
}

console.log("\n📅 Réservations « à finaliser » face aux paiements de la famille\n");

const resa = (id: string, status: string, childId: string, creneauId: string) => ({ id, status, childId, creneauId });

test("resteDu : total moins payé, arrondi au centime", () => {
  assert.equal(resteDu({ totalTTC: 349, paidAmount: 99.8 }), 249.2);
  assert.equal(resteDu({ totalTTC: 26, paidAmount: 26 }), 0);
  assert.equal(resteDu({}), 0);
});

test("une réservation confirmée passe telle quelle", () => {
  const r = reconcilierReservationsAvecPaiements([resa("r1", "confirmed", "c1", "k1")], []);
  assert.equal(r.reservations.length, 1);
  assert.equal(r.aFinaliser.length, 0);
});

test("panier abandonné : pending_payment sans paiement est écartée", () => {
  const r = reconcilierReservationsAvecPaiements([resa("r1", "pending_payment", "c1", "k1")], []);
  assert.equal(r.reservations.length, 0);
  assert.deepEqual(r.abandonnees.map((x) => x.id), ["r1"]);
});

test("paiement dû : la réservation reste à finaliser", () => {
  const r = reconcilierReservationsAvecPaiements(
    [resa("r1", "pending_payment", "c1", "k1")],
    [{ status: "pending", totalTTC: 26, paidAmount: 0, items: [{ childId: "c1", creneauId: "k1" }] }],
  );
  assert.deepEqual(r.aFinaliser.map((x) => x.id), ["r1"]);
  assert.equal(r.reservations[0].status, "pending_payment");
});

test("paiement réglé mais confirmation manquée : affichée confirmée", () => {
  const r = reconcilierReservationsAvecPaiements(
    [resa("r1", "pending_payment", "c1", "k1")],
    [{ status: "paid", totalTTC: 26, paidAmount: 26, items: [{ childId: "c1", creneauId: "k1" }] }],
  );
  assert.equal(r.reservations[0].status, "confirmed");
  assert.deepEqual(r.regleesSansConfirmation.map((x) => x.id), ["r1"]);
  assert.equal(r.aFinaliser.length, 0);
});

test("un stage couvre chaque jour par creneauIds", () => {
  const r = reconcilierReservationsAvecPaiements(
    [resa("j1", "pending_payment", "c1", "k1"), resa("j2", "pending_payment", "c1", "k2"), resa("j3", "pending_payment", "c1", "k3")],
    [{ status: "partial", totalTTC: 349, paidAmount: 60, items: [{ childId: "c1", creneauIds: ["k1", "k2", "k3"] }] }],
  );
  assert.equal(r.aFinaliser.length, 3);
  assert.equal(r.abandonnees.length, 0);
});

test("un paiement annulé ne couvre rien", () => {
  const r = reconcilierReservationsAvecPaiements(
    [resa("r1", "pending_payment", "c1", "k1")],
    [{ status: "cancelled", totalTTC: 26, paidAmount: 0, items: [{ childId: "c1", creneauId: "k1" }] }],
  );
  assert.equal(r.abandonnees.length, 1);
});

test("l'autre enfant sur le même créneau n'est pas couvert par erreur", () => {
  const r = reconcilierReservationsAvecPaiements(
    [resa("r1", "pending_payment", "c1", "k1"), resa("r2", "pending_payment", "c2", "k1")],
    [{ status: "pending", totalTTC: 26, paidAmount: 0, items: [{ childId: "c1", creneauId: "k1" }] }],
  );
  assert.deepEqual(r.aFinaliser.map((x) => x.id), ["r1"]);
  assert.deepEqual(r.abandonnees.map((x) => x.id), ["r2"]);
});

test("une réservation sans identifiants n'est pas devinée : écartée", () => {
  const r = reconcilierReservationsAvecPaiements(
    [{ id: "r1", status: "pending_payment" }],
    [{ status: "pending", totalTTC: 26, paidAmount: 0, items: [{ childId: "c1", creneauId: "k1" }] }],
  );
  assert.equal(r.abandonnees.length, 1);
});

console.log(`\n${passes} vérification(s) passée(s)\n`);
