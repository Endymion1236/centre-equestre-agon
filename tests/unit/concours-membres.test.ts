/**
 * tests/unit/concours-membres.test.ts
 *
 * Organisation de concours : le cavalier d'un membre d'équipe se choisit
 * parmi les personnes du concours ou parmi les cavaliers du club.
 *   npx tsx tests/unit/concours-membres.test.ts
 */
import assert from "node:assert/strict";
import { ajouterCavalierClub, choisirCavalierMembre, PREFIXE_BASE } from "../../src/lib/concours/membres";
import type { Concours } from "../../src/lib/concours/types";

let passes = 0;
function test(nom: string, fn: () => void) {
  try { fn(); passes++; console.log(`  ✅ ${nom}`); }
  catch (e: any) { console.error(`  ❌ ${nom}\n     ${e.message}`); process.exitCode = 1; }
}

const club = [
  { childId: "c1", prenom: "Zoé", famille: "Martin", familyId: "f1", naissance: "2014-03-02" },
  { childId: "c2", prenom: "Léo", famille: "Durand", familyId: "f2" },
];

function concours(): Concours {
  return {
    id: "k", titre: "PG", date: "2026-10-12", terrains: [], chevaux: [], passages: [],
    personnes: [{ id: "p-nico", prenom: "Nicolas", poneyAttribueId: "ch1" }],
    equipes: [{ id: "eq", nom: "Les Fusées", membres: [{ personneId: "" }, { personneId: "", chevalId: "ch9" }] }],
  };
}

test("un cavalier du club entre dans le concours et dans l'équipe d'un coup", () => {
  const c = choisirCavalierMembre(concours(), club, "eq", 0, `${PREFIXE_BASE}c1`);
  const p = c.personnes.find((x) => x.cavalierId === "c1")!;
  assert.deepEqual(p, { id: "cav-c1", prenom: "Zoé", cavalierId: "c1", familyId: "f1", naissance: "2014-03-02" });
  assert.equal(c.equipes![0].membres[0].personneId, "cav-c1");
  assert.equal(c.personnes.length, 2);
});

test("choisi deux fois, il n'est ajouté qu'une fois au concours", () => {
  let c = choisirCavalierMembre(concours(), club, "eq", 0, `${PREFIXE_BASE}c2`);
  c = choisirCavalierMembre(c, club, "eq", 1, `${PREFIXE_BASE}c2`);
  assert.equal(c.personnes.filter((x) => x.cavalierId === "c2").length, 1);
  assert.equal(c.equipes![0].membres[1].personneId, "cav-c2");
  assert.equal(ajouterCavalierClub(c, club[1]).concours, c);
});

test("une personne du concours apporte son poney attribué si la case est vide", () => {
  let c = choisirCavalierMembre(concours(), club, "eq", 0, "p-nico");
  assert.deepEqual(c.equipes![0].membres[0], { personneId: "p-nico", chevalId: "ch1" });
  c = choisirCavalierMembre(c, club, "eq", 1, "p-nico");
  assert.equal(c.equipes![0].membres[1].chevalId, "ch9", "le poney déjà choisi reste");
});

test("cavalier inconnu : rien ne change", () => {
  const avant = concours();
  assert.equal(choisirCavalierMembre(avant, club, "eq", 0, `${PREFIXE_BASE}zzz`), avant);
});

console.log(process.exitCode ? "\n❌ des tests ont échoué" : `\n✅ ${passes} tests passés`);
