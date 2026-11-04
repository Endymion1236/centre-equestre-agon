/**
 * Contrat du personnage 3D de la borne : animation par état, bouche.
 */
import assert from "node:assert/strict";
import { animationExpression, animationPourEtat, indiceBouche, nomNormalise, ouverture } from "../../src/lib/borne-3d";

let passes = 0;
function test(nom: string, fn: () => void) {
  try { fn(); passes++; console.log(`  ✅ ${nom}`); }
  catch (e) { console.error(`  ❌ ${nom}`); console.error(e); process.exitCode = 1; }
}

test("les noms d'un export Blender se reconnaissent", () => {
  assert.equal(nomNormalise("Armature|Parle.001"), "parle");
  assert.equal(nomNormalise(" REPOS "), "repos");
});

test("chaque état joue son animation, sinon le repos, sinon la première", () => {
  const anims = ["Armature|repos", "ecoute", "Parle.001"];
  assert.equal(animationPourEtat("speaking", anims), "Parle.001");
  assert.equal(animationPourEtat("listening", anims), "ecoute");
  assert.equal(animationPourEtat("thinking", anims), "Armature|repos", "pas de « reflexion » : repos");
  assert.equal(animationPourEtat("idle", ["Danse"]), "Danse");
  assert.equal(animationPourEtat("idle", []), null);
});

test("expressions : jouées si le fichier les a", () => {
  assert.equal(animationExpression("joie", ["repos", "Joie"]), "Joie");
  assert.equal(animationExpression("clin", ["repos"]), null);
});

test("la forme de bouche se retrouve, sous son nom ou un nom anglais courant", () => {
  assert.equal(indiceBouche({ Basis: 0, Bouche: 1 }), 1);
  assert.equal(indiceBouche({ jawOpen: 3 }), 3);
  assert.equal(indiceBouche({ sourire: 0 }), -1);
  assert.equal(indiceBouche(undefined), -1);
  assert.deepEqual([ouverture(1.7), ouverture(-1), ouverture(NaN), ouverture(0.4)], [1, 0, 0, 0.4]);
});

if (process.exitCode) { console.error("❌ échec"); } else console.log(`✅ ${passes} tests passés`);
