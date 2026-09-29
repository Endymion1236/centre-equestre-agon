import assert from "node:assert/strict";
import { MODELE_LEGER, MODELE_PRINCIPAL, MODELE_REDACTION, texteReponse } from "../../src/lib/ia-modeles";

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

test("réponse qui commence par un bloc de réflexion vide : le texte est bien lu", () => {
  assert.equal(texteReponse({ content: [{ type: "thinking", text: undefined }, { type: "text", text: " Bonjour, " }] }), "Bonjour,");
});

test("plusieurs blocs de texte (autour d'un appel d'outil) : tous réunis", () => {
  assert.equal(texteReponse({ content: [{ type: "text", text: "Je regarde. " }, { type: "tool_use" }, { type: "text", text: "Voici." }] }), "Je regarde. Voici.");
});

test("aucun texte (refus, réponse vide) : chaîne vide, pas d'erreur", () => {
  assert.equal(texteReponse({ content: [] }), "");
});

test("modèles actuels, sans suffixe de date", () => {
  for (const m of [MODELE_PRINCIPAL, MODELE_REDACTION, MODELE_LEGER]) assert.ok(!/\d{8}$/.test(m), m);
  assert.equal(MODELE_PRINCIPAL, "claude-opus-5-5");
  assert.equal(MODELE_REDACTION, "claude-sonnet-5-5");
});

console.log(`\n✅ ${passes} tests passés\n`);
