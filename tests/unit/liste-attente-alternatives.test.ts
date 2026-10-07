/**
 * tests/unit/liste-attente-alternatives.test.ts — proposer un autre horaire aux familles en attente.
 *   npx tsx tests/unit/liste-attente-alternatives.test.ts
 */
import assert from "node:assert/strict";
import {
  alternativesMemeSemaine, envoisAlternative, libelleDuree, libelleHoraire, libelleJours,
} from "../../src/lib/liste-attente-alternatives";

let passes = 0;
function test(nom: string, fn: () => void) {
  try { fn(); passes++; console.log(`  ✅ ${nom}`); }
  catch (e: any) { console.error(`  ❌ ${nom}\n     ${e.message}`); process.exitCode = 1; }
}

const jour = (id: string, date: string, startTime: string, endTime: string, inscrits = 0, max = 6, titre = "Stage Premier sabot") =>
  ({ id, date, startTime, endTime, activityTitle: titre, maxPlaces: max, enrolled: Array(inscrits).fill({}) });

// Stage de 10 h complet (lundi→mercredi), second stage à 16 h 30 ouvert la même semaine.
const matin = ["19", "20", "21"].map((j) => jour(`m${j}`, `2026-10-${j}`, "10:00", "12:00", 6));
const soir = ["19", "20", "21"].map((j) => jour(`s${j}`, `2026-10-${j}`, "16:30", "18:00", j === "20" ? 2 : 1));
const tous = [...matin, ...soir,
  jour("autre", "2026-10-19", "14:00", "15:00", 0, 6, "Baby poney"),
  jour("sem-suiv", "2026-10-26", "16:30", "18:00"),
];

test("le stage de 16 h 30 de la même semaine est proposé, en une seule proposition", () => {
  const alt = alternativesMemeSemaine(matin[0], tous, "2026-10-07");
  assert.equal(alt.length, 1);
  assert.equal(alt[0].creneaux.length, 3);
  assert.equal(alt[0].placesLibres, 4, "le jour le plus rempli fait foi");
  assert.equal(alt[0].dureeMinutes, 90);
  assert.equal(alt[0].cle, "2026-10-19_16:30-18:00");
});

test("ni les autres jours du même horaire, ni un autre titre, ni la semaine suivante", () => {
  const alt = alternativesMemeSemaine(matin[1], tous, "2026-10-07");
  assert.deepEqual(alt.flatMap((a) => a.creneaux.map((c) => c.id)), ["s19", "s20", "s21"]);
});

test("titre comparé sans majuscules ni accents ; complet, fermé ou passé : pas proposé", () => {
  const variante = [jour("x", "2026-10-20", "16:30", "18:00", 0, 6, "stage premier  SABOT")];
  assert.equal(alternativesMemeSemaine(matin[0], variante, "2026-10-07").length, 1);
  assert.equal(alternativesMemeSemaine(matin[0], [jour("x", "2026-10-20", "16:30", "18:00", 6)], "2026-10-07").length, 0);
  assert.equal(alternativesMemeSemaine(matin[0], [{ ...jour("x", "2026-10-20", "16:30", "18:00"), status: "closed" }], "2026-10-07").length, 0);
  assert.equal(alternativesMemeSemaine(matin[0], [jour("x", "2026-10-20", "16:30", "18:00")], "2026-10-21").length, 0);
});

test("un email par famille, sans renvoyer ni écrire sans adresse", () => {
  const attente = [
    { id: "w1", familyId: "fA", familyName: "TOHIER", familyEmail: "a@x.fr", childName: "Charlie" },
    { id: "w2", familyId: "fA", familyName: "TOHIER", familyEmail: "a@x.fr", childName: "Léo" },
    { id: "w3", familyId: "fB", familyName: "GLINEC", childName: "Suzanne" },
    { id: "w4", familyId: "fC", familyName: "MURIS", childName: "Judith", alternativesProposees: ["2026-10-19_16:30-18:00"] },
    { id: "w5", familyId: "fD", familyName: "SANS", childName: "Paul" },
  ];
  const r = envoisAlternative(attente, "2026-10-19_16:30-18:00", (fid) => (fid === "fB" ? "b@x.fr" : ""));
  assert.deepEqual(r.envois.map((e) => [e.familyId, e.email, e.enfants, e.entreeIds]), [
    ["fA", "a@x.fr", ["Charlie", "Léo"], ["w1", "w2"]],
    ["fB", "b@x.fr", ["Suzanne"], ["w3"]],
  ]);
  assert.equal(r.dejaPrevenues, 1);
  assert.deepEqual(r.sansEmail, ["SANS"]);
});

test("libellés : jours, horaire et différence de durée", () => {
  const alt = alternativesMemeSemaine(matin[0], tous, "2026-10-07")[0];
  assert.equal(libelleJours(alt), "du lundi 19/10 au mercredi 21/10 (3 jours)");
  assert.equal(libelleHoraire(alt, 120), "16 h 30–18 h (1 h 30, au lieu de 2 h)");
  assert.equal(libelleHoraire(alt, 90), "16 h 30–18 h (1 h 30)");
  assert.equal(libelleDuree(45), "45 min");
});

console.log(`\n${process.exitCode ? "❌" : "✅"} ${passes} tests passés`);
