/**
 * tests/unit/destinataires-email.test.ts — adresses nettoyées avant l'envoi.
 *   npx tsx tests/unit/destinataires-email.test.ts
 */
import assert from "node:assert/strict";
import { adressesRejetees, motifAdresseInvalide, nettoyerAdresse, nettoyerDestinataires } from "../../src/lib/destinataires-email";

let passes = 0;
function test(nom: string, fn: () => void) {
  try { fn(); passes++; console.log(`  ✅ ${nom}`); }
  catch (e: any) { console.error(`  ❌ ${nom}\n     ${e.message}`); process.exitCode = 1; }
}

const C = "Catherine.maulme@ac-normandie.fr";

test("caractères invisibles d'un copier-coller retirés", () => {
  assert.deepEqual(nettoyerDestinataires(` ${C} `), [C]);
  assert.deepEqual(nettoyerDestinataires(`​${C}​`), [C]);
  assert.deepEqual(nettoyerDestinataires(`${C}\n`), [C]);
  assert.deepEqual(nettoyerDestinataires(`﻿${C} `), [C]);
});

test("mailto, point final, guillemets, nom et chevrons", () => {
  assert.equal(nettoyerAdresse(`mailto:${C}`), C);
  assert.equal(nettoyerAdresse(`${C}.`), C);
  assert.equal(nettoyerAdresse(`"${C}"`), C);
  assert.deepEqual(nettoyerDestinataires(`Catherine Maulme <${C}>`), [C]);
});

test("plusieurs adresses dans le champ : séparées, doublons retirés", () => {
  assert.deepEqual(nettoyerDestinataires(`${C}; mairie@agon.fr`), [C, "mairie@agon.fr"]);
  assert.deepEqual(nettoyerDestinataires(`${C} mairie@agon.fr`), [C, "mairie@agon.fr"]);
  assert.deepEqual(nettoyerDestinataires([C, C.toLowerCase(), "mairie@agon.fr,"]), [C, "mairie@agon.fr"]);
});

test("ce qui n'est pas une adresse est écarté", () => {
  assert.deepEqual(nettoyerDestinataires(""), []);
  assert.deepEqual(nettoyerDestinataires(undefined), []);
  assert.deepEqual(nettoyerDestinataires("catherine@"), []);
  assert.deepEqual(nettoyerDestinataires("pas d'email"), []);
  assert.deepEqual(nettoyerDestinataires("a@b"), [], "domaine sans extension");
});

test("adresse sans « .fr » : écartée, et l'admin sait laquelle corriger", () => {
  const a = "ce.0501261z@ac-normandie";
  assert.deepEqual(nettoyerDestinataires(a), []);
  assert.deepEqual(adressesRejetees(a), [a]);
  assert.match(motifAdresseInvalide(a), /il manque la fin de l'adresse après « ac-normandie »/);
  assert.deepEqual(adressesRejetees(`${C}; ${a}`), [a], "seule la mauvaise est signalée");
  assert.match(motifAdresseInvalide("catherine"), /pas de @/);
});

console.log(`\n${process.exitCode ? "❌" : "✅"} ${passes} tests passés`);
