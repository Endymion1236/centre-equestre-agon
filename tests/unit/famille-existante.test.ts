/**
 * tests/unit/famille-existante.test.ts — pas de seconde fiche à une adresse connue.
 *   npx tsx tests/unit/famille-existante.test.ts
 */
import assert from "node:assert/strict";
import { emailNormalise, ficheCorrespondA, fichesVivantesParEmail, messageFicheExistante } from "../../src/lib/famille-existante";

let passes = 0;
function test(nom: string, fn: () => void) {
  try { fn(); passes++; console.log(`  ✅ ${nom}`); }
  catch (e: any) { console.error(`  ❌ ${nom}\n     ${e.message}`); process.exitCode = 1; }
}

const fiches = [
  { id: "compte", parentName: "COSTEGROSSE", parentEmail: "Famille.Costegrosse@Gmail.com ", children: [{}, {}] },
  { id: "absorbee", parentName: "Vieille", parentEmail: "famille.costegrosse@gmail.com", status: "merged", children: [] },
  { id: "autre", parentName: "DUPONT", parentEmail: "dupont@ex.fr", children: [{}] },
];

test("adresse comparée en minuscules et sans espaces ; une fiche absorbée ne compte pas", () => {
  assert.equal(emailNormalise(" A@B.fr "), "a@b.fr");
  assert.deepEqual(fichesVivantesParEmail(fiches, "famille.costegrosse@gmail.com").map(f => f.id), ["compte"]);
  assert.deepEqual(fichesVivantesParEmail(fiches, ""), []);
  assert.deepEqual(fichesVivantesParEmail(fiches, "inconnu@ex.fr"), []);
});

test("message : une fiche, ou plusieurs", () => {
  assert.match(messageFicheExistante([fiches[0]]), /« COSTEGROSSE », 2 cavaliers/);
  assert.match(messageFicheExistante([fiches[0], fiches[2]]), /2 fiches portent déjà cette adresse/);
  assert.equal(messageFicheExistante([]), "");
});


// ─── Recherche libre ───────────────────────────────────────────────────────

test("recherche libre : nom du parent, nom d'un cavalier, adresse, sans accents ni majuscules", () => {
  const compte = { id: "c", parentName: "Julie Costegrosse", parentEmail: "julie.c@gmail.com", children: [{ firstName: "Léa", lastName: "COSTEGROSSE" }] };
  const bureau = { id: "b", parentName: "COSTEGROSSE", parentEmail: "autre@orange.fr", children: [] };
  const autre = { id: "a", parentName: "DUPONT", parentEmail: "dupont@ex.fr", children: [{ firstName: "Tom", lastName: "Dupont" }] };
  assert.equal(ficheCorrespondA(compte, "costegrosse"), true);
  assert.equal(ficheCorrespondA(bureau, "Costégrosse"), true);
  assert.equal(ficheCorrespondA(autre, "costegrosse"), false);
  assert.equal(ficheCorrespondA(autre, "tom"), true, "par le cavalier");
  assert.equal(ficheCorrespondA(compte, "julie.c@gmail"), true, "par l'adresse");
  assert.equal(ficheCorrespondA(compte, ""), false);
});

if (process.exitCode) { console.error("❌ échec"); } else console.log(`✅ ${passes} tests passés`);
