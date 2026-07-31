/**
 * tests/unit/transcription-params.test.ts
 *
 *   npx tsx tests/unit/transcription-params.test.ts
 *
 * Le piege couvert ici : envoyer `language` (singulier) a un modele de
 * nouvelle generation peut faire echouer l'appel, et le repli silencieux
 * vers whisper-1 masquerait l'echec — on croirait tester gpt-transcribe en
 * utilisant l'ancien modele.
 */

import { estNouvelleGeneration, paramsTranscription } from "../../src/lib/transcription-params";

let passed = 0, failed = 0;
const failures: string[] = [];
function assert(label: string, cond: boolean, details?: string) {
  if (cond) { passed++; console.log(`  ✅ ${label}`); }
  else { failed++; failures.push(label); console.log(`  ❌ ${label}${details ? " — " + details : ""}`); }
}

console.log("\n══════════════════════════════════════════════════════════════");
console.log("  Tests unitaires parametres de transcription");
console.log("══════════════════════════════════════════════════════════════\n");

const CTX = { contexte: "Message au club.", motsCles: ["galop", "montoir"] };

console.log("✓ Detection de generation :");
{
  assert("gpt-transcribe -> nouvelle", estNouvelleGeneration("gpt-transcribe"));
  assert("gpt-live-transcribe -> nouvelle", estNouvelleGeneration("gpt-live-transcribe"));
  assert("whisper-1 -> ancienne", !estNouvelleGeneration("whisper-1"));
  assert("gpt-4o-transcribe -> ancienne", !estNouvelleGeneration("gpt-4o-transcribe"));
  assert("gpt-4o-mini-transcribe -> ancienne", !estNouvelleGeneration("gpt-4o-mini-transcribe"));
}

console.log("\n✓ Nouvelle generation (languages + keywords) :");
{
  const p = paramsTranscription("gpt-transcribe", CTX);
  assert("languages en liste", Array.isArray(p.languages) && (p.languages as string[])[0] === "fr");
  assert("PAS de champ language singulier", !("language" in p), "ferait echouer l'appel");
  assert("keywords separes", Array.isArray(p.keywords) && (p.keywords as string[]).includes("montoir"));
  assert("prompt = contexte seul, sans liste de mots", p.prompt === "Message au club.");
}

console.log("\n✓ Ancienne generation (language + prompt enrichi) :");
{
  const p = paramsTranscription("whisper-1", CTX);
  assert("language singulier", p.language === "fr");
  assert("PAS de champ languages", !("languages" in p));
  assert("PAS de champ keywords", !("keywords" in p), "inconnu de l'ancien contrat");
  assert("vocabulaire replie dans le prompt", String(p.prompt).includes("galop") && String(p.prompt).includes("Vocabulaire"));
}
{
  const p = paramsTranscription("gpt-4o-transcribe", { contexte: "Ctx.", motsCles: [] });
  assert("sans mots-cles : prompt = contexte nu", p.prompt === "Ctx.");
}

console.log("\n══════════════════════════════════════════════════════════════");
console.log(`  RESUME : ${passed} passes, ${failed} echoues`);
console.log("══════════════════════════════════════════════════════════════\n");
if (failed > 0) { console.log("\n❌ Echecs :"); failures.forEach(f => console.log("  • " + f)); process.exit(1); }
console.log("\n✅ Tous les tests sont passes !\n");
process.exit(0);
