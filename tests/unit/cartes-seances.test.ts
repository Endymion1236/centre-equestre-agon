import assert from "node:assert/strict";
import {
  carteCouvreCreneau,
  choisirCarte,
  compterReservationsParCarte,
  libelleCarte,
  seancesDisponibles,
  typeCarteDuCreneau,
  type CarteLike,
} from "../../src/lib/cartes-seances";

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

const carteLea: CarteLike = { id: "c-lea", familyId: "fam", childId: "lea", familiale: false, activityType: "cours", remainingSessions: 5, status: "active", totalSessions: 5 };
const carteFamille: CarteLike = { id: "c-fam", familyId: "fam", childId: null, familiale: true, activityType: "cours", remainingSessions: 10, status: "active", dateFin: "2027-06-30", totalSessions: 10 };
const carteBalade: CarteLike = { id: "c-bal", familyId: "fam", childId: "lea", familiale: false, activityType: "balade", remainingSessions: 3, status: "active" };
const carteVide: CarteLike = { ...carteLea, id: "c-vide", remainingSessions: 0, status: "used" };
const cartePerimee: CarteLike = { ...carteLea, id: "c-old", dateFin: "2026-06-30" };

console.log("── Type de carte d'un créneau ──");
test("cours et balades ont chacun leur famille de carte ; le reste n'en a pas", () => {
  assert.equal(typeCarteDuCreneau("cours"), "cours");
  assert.equal(typeCarteDuCreneau("cours_collectif"), "cours");
  assert.equal(typeCarteDuCreneau("balade"), "balade");
  assert.equal(typeCarteDuCreneau("ponyride"), "balade");
  assert.equal(typeCarteDuCreneau("stage"), null);
  assert.equal(typeCarteDuCreneau(undefined), null);
});

console.log("\n── Une carte couvre-t-elle un créneau ? ──");
const coursLea = { childId: "lea", activityType: "cours", date: "2026-10-07" };
test("carte nominative du bon type, active, avec des séances : oui", () => {
  assert.equal(carteCouvreCreneau(carteLea, coursLea), true);
});
test("un autre enfant : non, sauf carte familiale", () => {
  assert.equal(carteCouvreCreneau(carteLea, { ...coursLea, childId: "tom" }), false);
  assert.equal(carteCouvreCreneau(carteFamille, { ...coursLea, childId: "tom" }), true);
});
test("mauvais type d'activité : non", () => {
  assert.equal(carteCouvreCreneau(carteLea, { ...coursLea, activityType: "balade" }), false);
  assert.equal(carteCouvreCreneau(carteBalade, { ...coursLea, activityType: "balade" }), true);
  assert.equal(carteCouvreCreneau(carteLea, { ...coursLea, activityType: "stage" }), false);
});
test("épuisée ou périmée à la date du créneau : non", () => {
  assert.equal(carteCouvreCreneau(carteVide, coursLea), false);
  assert.equal(carteCouvreCreneau(cartePerimee, coursLea), false);
  assert.equal(carteCouvreCreneau(carteFamille, { ...coursLea, date: "2027-07-01" }), false);
});

console.log("\n── Séances déjà réservées ──");
const creneaux = [
  { date: "2026-10-07", enrolled: [{ childId: "lea", cardId: "c-lea" }, { childId: "tom" }] },
  { date: "2026-10-14", enrolled: [{ childId: "lea", cardId: "c-lea" }] },
  { date: "2026-10-21", enrolled: [{ childId: "lea", cardId: "c-lea", cardDeducted: true }] },
  { date: "2026-09-01", enrolled: [{ childId: "lea", cardId: "c-lea" }] }, // passé
];
test("compte les inscrits à venir portant la carte, hors séances déjà décomptées et hors passé", () => {
  const r = compterReservationsParCarte(creneaux, "2026-09-06");
  assert.deepEqual(r, { "c-lea": 2 });
  assert.equal(seancesDisponibles(carteLea, r), 3);
  assert.equal(seancesDisponibles(carteFamille, r), 10);
});

console.log("\n── Choix de la carte ──");
test("la carte nominative passe avant la familiale", () => {
  assert.equal(choisirCarte([carteFamille, carteLea], coursLea)?.id, "c-lea");
});
test("nominative saturée par les réservations → la familiale prend le relais", () => {
  assert.equal(choisirCarte([carteFamille, carteLea], coursLea, { "c-lea": 5 })?.id, "c-fam");
});
test("rien d'utilisable → null", () => {
  assert.equal(choisirCarte([carteVide, cartePerimee], coursLea), null);
  assert.equal(choisirCarte([], coursLea), null);
  assert.equal(choisirCarte([carteLea], { ...coursLea, activityType: "stage" }), null);
});
test("à égalité, la carte qui expire le plus tôt d'abord", () => {
  const a: CarteLike = { ...carteLea, id: "a", dateFin: "2027-03-01" };
  const b: CarteLike = { ...carteLea, id: "b", dateFin: "2026-12-01" };
  assert.equal(choisirCarte([a, b], coursLea)?.id, "b");
});

console.log("\n── Libellé ──");
test("libellé court avec le nombre de séances et la mention famille", () => {
  assert.equal(libelleCarte(carteLea), "Carte 5 séances");
  assert.equal(libelleCarte(carteFamille), "Carte 10 séances (famille)");
  assert.equal(libelleCarte(carteBalade), "Carte de séances");
});

console.log(`\n✅ ${passes} tests passés\n`);
