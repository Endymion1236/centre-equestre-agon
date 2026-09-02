import assert from "node:assert/strict";
import {
  calculerStatsChequesDifferes,
  filtrerChequesDifferes,
  grouperChequesEnAttenteParMois,
  libelleMoisFr,
} from "../../src/app/admin/paiements/cheques-differes-utils";
import type { ChequeDiffere } from "../../src/app/admin/paiements/types";

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

const cheques: ChequeDiffere[] = [
  {
    id: "c1",
    paymentId: "p1",
    familyId: "f1",
    familyName: "Famille Martin",
    numero: "12345",
    banque: "Crédit Mutuel",
    montant: 50,
    dateEncaissementPrevue: "2026-08-20",
    status: "pending",
  },
  {
    id: "c2",
    paymentId: "p2",
    familyId: "f2",
    familyName: "Famille Durand",
    numero: "67890",
    banque: "CIC",
    montant: 75.5,
    dateEncaissementPrevue: "2026-09-15",
    status: "pending",
  },
  {
    id: "c3",
    paymentId: "p3",
    familyId: "f3",
    familyName: "Famille Robert",
    numero: "54321",
    banque: "BNP",
    montant: 100,
    dateEncaissementPrevue: "2026-07-01",
    status: "deposited",
    dateEncaissementEffective: "2026-07-01",
  },
  {
    id: "c4",
    paymentId: "p4",
    familyId: "f4",
    familyName: "Famille Annulée",
    numero: "00000",
    banque: "Banque Test",
    montant: 20,
    dateEncaissementPrevue: "2026-10-01",
    status: "cancelled",
  },
];

const today = "2026-09-01";

console.log("\n── Filtres chèques différés ──");

test("le filtre pending ne conserve que les chèques en attente", () => {
  assert.deepEqual(
    filtrerChequesDifferes(cheques, "pending", "", today).map((c) => c.id),
    ["c1", "c2"],
  );
});

test("le filtre overdue ne conserve que les chèques en attente dépassés", () => {
  assert.deepEqual(
    filtrerChequesDifferes(cheques, "overdue", "", today).map((c) => c.id),
    ["c1"],
  );
});

test("la recherche est insensible à la casse sur famille, numéro et banque", () => {
  assert.deepEqual(filtrerChequesDifferes(cheques, "all", "durand", today).map((c) => c.id), ["c2"]);
  assert.deepEqual(filtrerChequesDifferes(cheques, "all", "12345", today).map((c) => c.id), ["c1"]);
  assert.deepEqual(filtrerChequesDifferes(cheques, "all", "crédit", today).map((c) => c.id), ["c1"]);
});

test("les résultats sont triés par date prévue croissante", () => {
  assert.deepEqual(
    filtrerChequesDifferes(cheques, "all", "", today).map((c) => c.id),
    ["c3", "c1", "c2", "c4"],
  );
});

console.log("\n── Statistiques ──");

test("les totaux pending, overdue et deposited sont calculés séparément", () => {
  const stats = calculerStatsChequesDifferes(cheques, today);
  assert.equal(stats.pendingCheques.length, 2);
  assert.equal(stats.overdueCheques.length, 1);
  assert.equal(stats.totalPending, 125.5);
  assert.equal(stats.totalOverdue, 50);
  assert.equal(stats.totalDeposited, 100);
});

console.log("\n── Groupement mensuel ──");

test("le groupement mensuel ignore les chèques déposés et annulés", () => {
  const groupes = grouperChequesEnAttenteParMois(cheques);
  assert.deepEqual(Object.keys(groupes).sort(), ["2026-08", "2026-09"]);
  assert.deepEqual(groupes["2026-08"].map((c) => c.id), ["c1"]);
  assert.deepEqual(groupes["2026-09"].map((c) => c.id), ["c2"]);
});

test("le libellé de mois reste en français", () => {
  const label = libelleMoisFr("2026-09").toLowerCase();
  assert.ok(label.includes("septembre"));
  assert.ok(label.includes("2026"));
});

console.log(`\n✅ ${passes} tests passés\n`);
