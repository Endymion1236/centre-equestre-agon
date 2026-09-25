/**
 * tests/unit/transcription-erreurs.test.ts — dictée : format audio et erreurs dites en clair.
 *   npx tsx tests/unit/transcription-erreurs.test.ts
 */
import assert from "node:assert/strict";
import { extensionAudio, messageErreurTranscription } from "../../src/lib/transcription-params";

let passes = 0;
function test(nom: string, fn: () => void) {
  try { fn(); passes++; console.log(`  ✅ ${nom}`); }
  catch (e: any) { console.error(`  ❌ ${nom}\n     ${e.message}`); process.exitCode = 1; }
}

test("le nom du fichier suit le format réel du téléphone", () => {
  assert.equal(extensionAudio("audio/webm;codecs=opus"), "webm");
  assert.equal(extensionAudio("audio/mp4"), "m4a");
  assert.equal(extensionAudio("audio/ogg;codecs=opus"), "ogg");
  assert.equal(extensionAudio("audio/wav"), "wav");
  assert.equal(extensionAudio(""), "webm");
});

test("crédit OpenAI épuisé : on dit quoi faire", () => {
  assert.match(messageErreurTranscription({ status: 429, code: "insufficient_quota", message: "You exceeded your current quota" }), /Crédit OpenAI épuisé/);
});

test("clé refusée, trop de demandes, trop court, format", () => {
  assert.match(messageErreurTranscription({ status: 401, message: "Incorrect API key provided" }), /OPENAI_API_KEY/);
  assert.match(messageErreurTranscription({ status: 429, message: "Rate limit reached" }), /une minute/);
  assert.match(messageErreurTranscription({ status: 400, message: "Audio file is too short. Minimum audio length is 0.1 seconds." }), /trop court/);
  assert.match(messageErreurTranscription({ status: 400, message: "Invalid file format. Supported formats: ['flac', 'm4a', 'mp3']" }), /Format audio/);
});

test("erreur inconnue : le message d'origine reste visible", () => {
  assert.equal(messageErreurTranscription({ message: "boom" }), "Transcription impossible : boom");
  assert.match(messageErreurTranscription(null), /inconnue/);
});

console.log(`\n${process.exitCode ? "❌" : "✅"} ${passes} tests passés`);
