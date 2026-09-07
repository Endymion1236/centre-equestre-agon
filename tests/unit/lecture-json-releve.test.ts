import assert from "node:assert/strict";
import { test } from "node:test";
import { lireJsonPageReleve } from "../../src/lib/lecture-json-releve";
const data = { operations: [{ date: "2026-07-01", libelle: "Orange", montant: 66, poste: "Téléphone" }], creditsClients: 100 };
const json = JSON.stringify(data);
test("JSON complet brut et balises Markdown : mêmes opérations", () => {
  for (const texte of [json, `\n\`\`\`json\n${json}\n\`\`\`\n`, `\`\`\`\n${json}\n\`\`\``]) assert.deepEqual(lireJsonPageReleve(texte, "end_turn"), data);
});
test("fragments et réponses interrompues refusés", () => {
  assert.throws(() => lireJsonPageReleve(json.slice(0, -5), "end_turn"), /invalide ou incomplète/);
  assert.throws(() => lireJsonPageReleve(json, "max_tokens"), /trop longue/);
  assert.throws(() => lireJsonPageReleve(json, "refusal"), /interrompue/);
  assert.throws(() => lireJsonPageReleve(json + ' un autre objet {}', "end_turn"), /invalide/);
});
test("page sans débit acceptée ; tableau absent et refus explicite distingués", () => {
  assert.deepEqual(lireJsonPageReleve('{"operations":[],"creditsClients":0}', "end_turn"), { operations: [], creditsClients: 0 });
  assert.throws(() => lireJsonPageReleve('{}', "end_turn"), /Liste des opérations absente/);
  assert.throws(() => lireJsonPageReleve('{"erreur":"Document illisible"}', "end_turn"), /Document illisible/);
});
