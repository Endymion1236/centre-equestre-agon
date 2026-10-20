/**
 * tests/unit/email-dicte-ia.test.ts — email de la fiche client dicté puis mis en forme.
 *   npx tsx tests/unit/email-dicte-ia.test.ts
 */
import assert from "node:assert/strict";
import { ajouterDictee, consigneMiseEnFormeEmail, lireMiseEnForme } from "../../src/lib/email-dicte-ia";

let n = 0;
const test = (nom: string, fn: () => void) => { try { fn(); n++; } catch (e) { console.error(`❌ ${nom}`); throw e; } };

test("la consigne porte la dictée, l'objet et la situation de la fiche, et interdit d'inventer", () => {
  const c = consigneMiseEnFormeEmail("euh bonjour le stage de manon est payé c'est bon", "", { nomFamille: "AYRAULT", resteDu: 0 });
  assert.match(c, /le stage de manon est payé/);
  assert.match(c, /Aucun impayé sur la fiche/);
  assert.match(c, /n'invente aucun montant/);
  assert.match(c, /Objet saisi : \(aucun\)/);
  assert.match(consigneMiseEnFormeEmail("x", "Stage", { nomFamille: "A", resteDu: 10 }), /Reste dû sur la fiche : 10,00 €/);
});
test("réponse JSON lue, même entourée de texte", () => {
  const r = lireMiseEnForme('Voici :\n{"objet":"Stage de Manon","message":"Bonjour,\\n\\nC\'est réglé.","remarques":["Vérifier le prénom"," "]}');
  assert.deepEqual(r, { objet: "Stage de Manon", message: "Bonjour,\n\nC'est réglé.", remarques: ["Vérifier le prénom"] });
});
test("réponse inexploitable : null, le brouillon n'est pas écrasé", () => {
  assert.equal(lireMiseEnForme("désolé"), null);
  assert.equal(lireMiseEnForme('{"objet":"x","message":""}'), null);
  assert.equal(lireMiseEnForme("{pas du json}"), null);
});
test("la dictée s'ajoute à la suite du texte déjà saisi", () => {
  assert.equal(ajouterDictee("", " bonjour "), "bonjour");
  assert.equal(ajouterDictee("Bonjour,\n", "suite"), "Bonjour,\nsuite");
  assert.equal(ajouterDictee("abc", "  "), "abc");
});
console.log(`✅ ${n} tests passés`);
