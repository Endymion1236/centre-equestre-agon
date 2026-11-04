import assert from "node:assert/strict";
import { test } from "node:test";
import { detailRemiseSepa, remisePourCredit } from "../../src/lib/remise-sepa-controle";

const ech = (id: string, montant: number, familyName = id.toUpperCase()) => ({ id, montant, familyName });
const enc = (id: string, sepaEcheanceId: string, montant: number, dateIso = "2026-10-27", extra = {}) => ({ id, sepaEcheanceId, montant, dateIso, ...extra });

test("octobre 2026 : la remise dit quelles échéances manquent au FEC", () => {
  const d = detailRemiseSepa({
    mois: "2026-10",
    echeances: [ech("a", 100), ech("b", 55, "SAMSON"), ech("c", 200), ech("d", 65.6), ech("e", 50), ech("f", 30)],
    encaissements: [
      enc("ea", "a", 100),
      // SAMSON : rejeté, l'annulation passe au compte de liaison — présent dans la remise.
      enc("eb", "b", 55), { id: "cb", montant: -55, dateIso: "2026-11-02", correctionDe: "eb", raison: "Rejet bancaire — provision insuffisante" },
      // Encaissée fin septembre : au FEC de septembre.
      enc("ec", "c", 200, "2026-09-30"),
      // Aucun encaissement.
      // Annulée par erreur, jamais ressaisie.
      enc("ee", "e", 50), { id: "ce", montant: -50, dateIso: "2026-10-29", correctionDe: "ee", raison: "erreur" },
      // Un autre jour du mois.
      enc("ef", "f", 30, "2026-10-26"),
    ],
  });
  assert.equal(d.jourRemise, "2026-10-27");
  assert.equal(d.total, 500.6);
  assert.equal(d.manque, 315.6);
  assert.equal(d.ok, 2);
  const etat = Object.fromEntries(d.lignes.map((l) => [l.echeanceId, l.etat]));
  assert.deepEqual(etat, { c: "autre-mois", d: "sans-encaissement", e: "annule", f: "autre-jour" });
  assert.ok(d.lignes.find((l) => l.echeanceId === "c")!.detail.includes("30/09/2026"));
  assert.equal(d.lignes.find((l) => l.echeanceId === "f")!.manque, 0);
});

test("montant encaissé différent de l'échéance", () => {
  const d = detailRemiseSepa({ mois: "2026-10", echeances: [ech("a", 120)], encaissements: [enc("ea", "a", 100)] });
  assert.equal(d.lignes[0].etat, "montant");
  assert.equal(d.manque, 20);
});

test("la remise d'un crédit : même montant, prélèvement à 7 jours", () => {
  const remises = [
    { id: "r1", montantTotal: 3806.15, datePrelevement: "2026-09-28" },
    { id: "r2", montantTotal: 3806.15, datePrelevement: "2026-10-28" },
    { id: "r3", montantTotal: 100, datePrelevement: "2026-10-28" },
  ];
  assert.equal(remisePourCredit(remises, { montant: 3806.15, date: "2026-10-28" })?.id, "r2");
  assert.equal(remisePourCredit(remises, { montant: 3806.16, date: "2026-10-28" }), null);
});
