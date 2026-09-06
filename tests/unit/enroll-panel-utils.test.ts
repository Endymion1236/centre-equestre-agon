import assert from "node:assert/strict";
import {
  cavaliersDisponibles,
  filtrerFamilles,
  finSaisonEffective,
  frequenceDejaInscrite,
  holdActifDuCreneau,
  prixAffiche,
  rangEnfantFamille,
  seasonOf,
  nomActuelInscrit,
} from "../../src/app/admin/planning/enroll-panel-utils";

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

console.log("── Saison ──");
test("seasonOf : septembre ouvre la saison, juin la ferme", () => {
  assert.equal(seasonOf("2026-09-15"), 2026);
  assert.equal(seasonOf("2027-06-10"), 2026);
  assert.equal(seasonOf("2027-08-31"), 2026);
  assert.equal(seasonOf({ seconds: Math.floor(new Date("2026-10-01T12:00:00Z").getTime() / 1000) }), 2026);
  assert.equal(seasonOf("n'importe quoi"), 0);
});
test("finSaisonEffective : la référence tant que le créneau est dans la saison, sinon le 30 juin suivant", () => {
  assert.equal(finSaisonEffective("2026-06-30", "2026-03-04").toISOString().slice(0, 10), "2026-06-30");
  const suivante = finSaisonEffective("2026-06-30", "2026-09-09");
  assert.equal(suivante.getFullYear(), 2027);
  assert.equal(suivante.getMonth(), 5);
  assert.equal(suivante.getDate(), 30);
});

console.log("\n── Familles et cavaliers ──");
const familles = [
  { firestoreId: "f1", parentName: "DUPONT Marie", parentEmail: "marie@ex.fr", children: [{ id: "c1", firstName: "Léa", lastName: "Dupont" }] },
  { firestoreId: "f2", parentName: "MARTIN Paul", parentEmail: "paul@ex.fr", children: [{ id: "c2", firstName: "Tom", lastName: "Martin" }] },
];
test("filtrerFamilles : tous les mots doivent se retrouver, parent, email ou cavalier", () => {
  assert.equal(filtrerFamilles(familles, "").length, 2);
  assert.deepEqual(filtrerFamilles(familles, "léa").map((f) => f.firestoreId), ["f1"]);
  assert.deepEqual(filtrerFamilles(familles, "martin tom").map((f) => f.firestoreId), ["f2"]);
  assert.deepEqual(filtrerFamilles(familles, "paul@ex").map((f) => f.firestoreId), ["f2"]);
  assert.equal(filtrerFamilles(familles, "zoé").length, 0);
});
test("nomActuelInscrit : le nom de la fiche prime sur la copie du créneau", () => {
  assert.equal(nomActuelInscrit(familles, { familyId: "f1", childId: "c1", childName: "Léa" }), "Léa Dupont");
  assert.equal(nomActuelInscrit(familles, { familyId: "f9", childId: "c2", childName: "Tom" }), "Tom Martin");
  assert.equal(nomActuelInscrit(familles, { familyId: "f9", childId: "c9", childName: "Inconnu" }), "Inconnu");
});
const creneau: any = { id: "k1", date: "2026-10-07", startTime: "14:00", endTime: "15:00", activityType: "cours", activityTitle: "Galop 2", maxPlaces: 8, enrolled: [], priceHT: 20, tvaTaux: 5.5 };
test("cavaliersDisponibles : ni déjà inscrit, ni sur un créneau qui chevauche", () => {
  const enfants = [{ id: "c1" }, { id: "c2" }, { id: "c3" }];
  const autres: any[] = [
    { id: "k2", date: "2026-10-07", startTime: "14:30", endTime: "15:30", enrolled: [{ childId: "c2" }] }, // chevauche
    { id: "k3", date: "2026-10-07", startTime: "15:00", endTime: "16:00", enrolled: [{ childId: "c3" }] }, // juste après
    { id: "k4", date: "2026-10-08", startTime: "14:00", endTime: "15:00", enrolled: [{ childId: "c3" }] }, // autre jour
  ];
  assert.deepEqual(cavaliersDisponibles(enfants, ["c1"], autres, creneau).map((c) => c.id), ["c3"]);
});

console.log("\n── Place tenue et prix ──");
test("holdActifDuCreneau : valable si non expirée et enfant pas encore inscrit", () => {
  const dans1h = new Date(Date.now() + 3600_000).toISOString();
  const ilYA1h = new Date(Date.now() - 3600_000).toISOString();
  assert.equal(holdActifDuCreneau({ ...creneau, waitlistHold: { until: dans1h, childId: "c5" } }, [])?.childId, "c5");
  assert.equal(holdActifDuCreneau({ ...creneau, waitlistHold: { until: ilYA1h, childId: "c5" } }, []), null);
  assert.equal(holdActifDuCreneau({ ...creneau, waitlistHold: { until: dans1h, childId: "c5" } }, [{ childId: "c5" }]), null);
  assert.equal(holdActifDuCreneau(creneau, []), null);
});
test("prixAffiche : le tarif du nombre de jours pour un stage, sinon le prix TTC", () => {
  assert.equal(prixAffiche(creneau, false, 21.1, 0), 21.1);
  assert.equal(prixAffiche({ ...creneau, price3days: 120 }, true, 180, 3), 120);
  assert.equal(prixAffiche({ ...creneau, price3days: 120 }, true, 180, 5), 180);
});

console.log("\n── Forfaits de la famille ──");
const fam = { firestoreId: "f1" };
const forfaits = [
  { familyId: "f1", childId: "c1", status: "actif", seasonStartYear: 2026, frequence: 1 },
  { familyId: "f1", childId: "c7", status: "actif", seasonStartYear: 2026, frequence: 1 },
  { familyId: "f1", childId: "c8", status: "actif", seasonStartYear: 2025, frequence: 1 }, // saison passée
  { familyId: "f1", childId: "c9", status: "termine", seasonStartYear: 2026, frequence: 1 },
];
test("rangEnfantFamille : enfants déjà en forfait cette saison + 1, hors l'enfant sélectionné", () => {
  assert.equal(rangEnfantFamille(fam, forfaits, "c1", "2026-10-07"), 2);
  assert.equal(rangEnfantFamille(fam, forfaits, "c2", "2026-10-07"), 3);
  assert.equal(rangEnfantFamille(null, forfaits, "c2", "2026-10-07"), 1);
});
test("frequenceDejaInscrite : la fréquence de cet enfant cette saison, une quinzaine comptant pour moitié", () => {
  assert.equal(frequenceDejaInscrite(fam, forfaits, "c1", "2026-10-07"), 1);
  assert.equal(frequenceDejaInscrite(fam, [...forfaits, { familyId: "f1", childId: "c1", status: "actif", seasonStartYear: 2026, frequence: 1, rythme: "quinzaine" }], "c1", "2026-10-07"), 1.5);
  assert.equal(frequenceDejaInscrite(fam, forfaits, "c8", "2026-10-07"), 0);
});

console.log(`\n✅ ${passes} tests passés\n`);
