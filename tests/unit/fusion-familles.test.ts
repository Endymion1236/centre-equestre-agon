/**
 * tests/unit/fusion-familles.test.ts
 *
 * L'appariement des cavaliers lors d'une fusion de fiches : la partie pure
 * de lib/fusion-familles.
 *   npx tsx tests/unit/fusion-familles.test.ts
 */
import assert from "node:assert/strict";
import {
  apparierEnfants, choisirFicheARattacher, fusionnerChampsFiche,
  COLLECTIONS_SUIVANT_LA_FAMILLE, nomCavalier,
} from "../../src/lib/fusion-familles";

let passes = 0;
function test(nom: string, fn: () => void) {
  try { fn(); passes++; console.log(`  ✅ ${nom}`); }
  catch (e: any) { console.error(`  ❌ ${nom}\n     ${e.message}`); process.exitCode = 1; }
}

console.log("\n── Fusion de fiches : appariement des cavaliers ──");

test("une fiche copiée à l'identique (rattachement de compte) : rien à ajouter, rien à apparier", () => {
  const enfants = [{ id: "k1", firstName: "Alba", lastName: "AMIARD", birthDate: "2017-03-02" }];
  const r = apparierEnfants(enfants, enfants);
  assert.equal(r.aAjouter.length, 0);
  assert.equal(r.correspondances.size, 0);
});

test("même prénom et même date sous deux ids : un seul cavalier, repointé", () => {
  const r = apparierEnfants(
    [{ id: "k1", firstName: "Léa", lastName: "MARTIN", birthDate: "2015-05-01" }],
    [{ id: "z9", firstName: "lea", lastName: "DUPONT", birthDate: new Date("2015-05-01T00:00:00Z") }],
  );
  assert.equal(r.aAjouter.length, 0);
  assert.equal(r.correspondances.get("z9")?.id, "k1", "le nom peut différer, prénom + date font foi");
});

test("même prénom, dates différentes : deux enfants distincts", () => {
  const r = apparierEnfants(
    [{ id: "k1", firstName: "Tom", birthDate: "2012-01-01" }],
    [{ id: "z1", firstName: "Tom", birthDate: "2016-01-01" }],
  );
  assert.equal(r.aAjouter.length, 1);
  assert.equal(r.correspondances.size, 0);
});

test("une date manquante d'un côté : on apparie sur le prénom seul", () => {
  const r = apparierEnfants(
    [{ id: "k1", firstName: "Zoé", birthDate: "2014-06-06" }],
    [{ id: "z1", firstName: "Zoe" }],
  );
  assert.equal(r.correspondances.get("z1")?.id, "k1");
});

test("un prénom inconnu est ajouté à la fiche conservée", () => {
  const r = apparierEnfants([{ id: "k1", firstName: "Alba" }], [{ id: "z1", firstName: "Max" }]);
  assert.equal(r.aAjouter.length, 1);
  assert.equal(nomCavalier(r.aAjouter[0]), "Max");
});

test("les collections qui suivent la famille couvrent commandes, cartes et mandats — jamais le journal", () => {
  const c = COLLECTIONS_SUIVANT_LA_FAMILLE as readonly string[];
  for (const attendu of ["payments", "reservations", "cartes", "mandats-sepa", "forfaits", "avoirs"]) assert.ok(c.includes(attendu), attendu);
  assert.ok(!c.includes("encaissements"), "le journal est immuable (NF525)");
});

console.log("\n── Quelle fiche rattacher à un compte ──");

const UID = "uid-compte";

test("la fiche avec des cavaliers l'emporte sur la fiche vide", () => {
  const choix = choisirFicheARattacher([
    { id: "vide", children: [] },
    { id: "bureau", children: [{ id: "k1" }] },
  ], UID);
  assert.equal(choix?.id, "bureau");
});

test("sa propre fiche et les fiches absorbées ne comptent pas", () => {
  assert.equal(choisirFicheARattacher([{ id: UID, children: [{ id: "k1" }] }], UID), null);
  assert.equal(choisirFicheARattacher([{ id: "x", status: "merged", children: [{ id: "k1" }] }], UID), null);
});

test("deux fiches avec des cavaliers : on ne tranche pas", () => {
  const choix = choisirFicheARattacher([
    { id: "a", children: [{ id: "k1" }] },
    { id: "b", children: [{ id: "k2" }] },
  ], UID);
  assert.equal(choix, null, "donner les enfants d'une famille à une autre serait pire que de ne rien faire");
});

test("une seule fiche, même sans cavalier, est rattachée", () => {
  assert.equal(choisirFicheARattacher([{ id: "seule", children: [] }], UID)?.id, "seule");
});

console.log("\n── Contenu d'une fiche rattachée ──");

test("le bureau fait foi, le compte comble les vides", () => {
  const r = fusionnerChampsFiche(
    { parentName: "Parent Test", parentPhone: "0611111111", address: "", children: [] },
    { parentName: "DUPONT Marie", parentPhone: "", address: "3 rue du Moulin", children: [{ id: "k1" }] },
  );
  assert.equal(r.parentName, "DUPONT Marie", "champ rempli des deux côtés : le bureau gagne");
  assert.equal(r.parentPhone, "0611111111", "vide au bureau : la saisie de la famille reste");
  assert.equal(r.address, "3 rue du Moulin");
  assert.equal(r.children.length, 1);
});

test("un champ vide des deux côtés reste vide, et rien n'est inventé", () => {
  const r = fusionnerChampsFiche({ parentPhone: "" }, { parentPhone: "", city: "Agon" });
  assert.equal(r.parentPhone, "");
  assert.equal(r.city, "Agon");
  assert.equal(Object.keys(r).length, 2);
});

console.log(process.exitCode ? "\n❌ des tests ont échoué" : `\n✅ ${passes} tests passés`);
