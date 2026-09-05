import assert from "node:assert/strict";
import { sirenDepuisFiche } from "../../src/lib/facturx";

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

console.log("sirenDepuisFiche — SIREN de routage Factur-X depuis une fiche famille");

test("fiche modifiée : siren 9 chiffres", () => {
  assert.equal(sirenDepuisFiche({ siren: "507569184" }), "507569184");
});

test("siren saisi avec des espaces", () => {
  assert.equal(sirenDepuisFiche({ siren: "507 569 184" }), "507569184");
});

test("fiche créée via « Nouvelle famille » : seul le SIRET (14 chiffres) est présent", () => {
  assert.equal(sirenDepuisFiche({ siret: "507 569 184 00017" }), "507569184");
});

test("le siren prime sur le siret quand les deux existent", () => {
  assert.equal(sirenDepuisFiche({ siren: "111111111", siret: "50756918400017" }), "111111111");
});

test("SIRET incomplet → pas de routage plutôt qu'un identifiant faux", () => {
  assert.equal(sirenDepuisFiche({ siret: "5075691840" }), undefined);
});

test("particulier (aucun numéro) → undefined", () => {
  assert.equal(sirenDepuisFiche({}), undefined);
  assert.equal(sirenDepuisFiche(null), undefined);
  assert.equal(sirenDepuisFiche({ siren: null, siret: "" }), undefined);
});

console.log(`\n${passes} test(s) OK`);
