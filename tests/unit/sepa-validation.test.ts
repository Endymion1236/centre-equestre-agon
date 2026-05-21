/**
 * tests/unit/sepa-validation.test.ts
 *
 * Tests unitaires pour la lib sepa-validation. Lance sans framework via :
 *   npx tsx tests/unit/sepa-validation.test.ts
 *
 * Si tous les tests passent, le script exit 0. Sinon exit 1 avec details.
 *
 * Ces tests sont CRITIQUES car la lib est en production pour valider
 * les mandats SEPA. Une regression ici causerait des rejets bancaires
 * et des chargeback chez les familles.
 */

import { validateIban, validateBic, formatIban, maskIban } from "../../src/lib/sepa-validation";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(label: string, condition: boolean, details?: string) {
  if (condition) {
    passed++;
    console.log(`  ✅ ${label}`);
  } else {
    failed++;
    failures.push(`${label}${details ? " — " + details : ""}`);
    console.log(`  ❌ ${label}${details ? " — " + details : ""}`);
  }
}

console.log("\n══════════════════════════════════════════════════════════════");
console.log("  Tests unitaires SEPA validation");
console.log("══════════════════════════════════════════════════════════════\n");

// ─── IBAN valides ─────────────────────────────────────────────────
console.log("✓ IBAN valides :");
{
  const tests = [
    "FR1420041010050500013M02606", // IBAN test officiel BNP
    "FR7616606100640013539343253", // exemple Credit Agricole Nicolas
    "DE89370400440532013000",       // Allemagne
    "BE68539007547034",             // Belgique
    "GB82WEST12345698765432",       // UK
    "fr14 2004 1010 0505 0001 3m02 606", // minuscules + espaces -> doit etre OK
  ];
  for (const iban of tests) {
    const r = validateIban(iban);
    assert(`'${iban.substring(0, 14)}...' valide`, r.valid, r.error ?? "");
  }
}

// ─── IBAN invalides ───────────────────────────────────────────────
console.log("\n✗ IBAN invalides :");
{
  const tests: [string, string][] = [
    ["", "vide"],
    ["FR1420041010050500013M02000", "checksum modifie"],     // dernier 606 -> 000
    ["FR14200410100505000", "trop court"],
    ["FR142004101005050001310M02606", "trop long"],
    ["XX1420041010050500013M02606", "pays inconnu mais format ok"], // FR=27, XX=27 ok mais format
    ["FR1A20041010050500013M02606", "lettre dans la cle"],
    ["1234567890123456789012345678", "que des chiffres"],
  ];
  for (const [iban, label] of tests) {
    const r = validateIban(iban);
    assert(`'${iban.substring(0, 14)}...' rejete (${label})`, !r.valid, r.error ?? "");
  }
}

// ─── BIC valides ──────────────────────────────────────────────────
console.log("\n✓ BIC valides :");
{
  const tests: [string, string?, string?][] = [
    ["AGRIFRPP866", "FR"],
    ["AGRIFRPP", "FR"],                 // 8 chars sans agence
    ["DEUTDEFF500", "DE"],
    ["agrifrpp866", "FR"],              // minuscules
    ["AGRI FRPP 866", "FR"],            // espaces
    ["BNPAFRPPXXX"],                    // sans coherence pays (juste structure)
  ];
  for (const [bic, country] of tests) {
    const r = validateBic(bic, country);
    assert(`'${bic}'${country ? " (pays IBAN=" + country + ")" : ""} valide`, r.valid, r.error ?? "");
  }
}

// ─── BIC invalides ────────────────────────────────────────────────
console.log("\n✗ BIC invalides :");
{
  const tests: [string, string | undefined, string][] = [
    ["", undefined, "vide"],
    ["AGRIFRP", undefined, "7 chars"],
    ["AGRIFRPP866AA", undefined, "13 chars"],
    ["AGRIFRPP12", undefined, "10 chars"],
    ["AGRI-FRPP866", undefined, "caractere special"],
    ["AGRIFRPP866", "DE", "pays IBAN DE incompatible avec BIC FR"],
    ["DEUTDEFF500", "FR", "pays IBAN FR incompatible avec BIC DE"],
    ["1234FRPP866", undefined, "code banque numerique"],
    ["AGRI11PP866", undefined, "code pays numerique"],
  ];
  for (const [bic, country, label] of tests) {
    const r = validateBic(bic, country);
    assert(`'${bic}' rejete (${label})`, !r.valid, r.error ?? "");
  }
}

// ─── Formatage ────────────────────────────────────────────────────
console.log("\n✓ Formatage IBAN :");
{
  assert("formatIban espace tous les 4 chars",
    formatIban("FR7616606100640013539343253") === "FR76 1660 6100 6400 1353 9343 253"
  );
  assert("formatIban nettoie les espaces existants",
    formatIban("FR76 1660 6100 6400") === "FR76 1660 6100 6400"
  );
}

// ─── Masquage ─────────────────────────────────────────────────────
console.log("\n✓ Masquage IBAN :");
{
  const masked = maskIban("FR7616606100640013539343253");
  assert("maskIban garde 4 premiers + 4 derniers",
    masked.startsWith("FR76") && masked.endsWith("3253"),
    `Got: ${masked}`
  );
  assert("maskIban contient des •••• pour le milieu",
    masked.includes("••••"),
    `Got: ${masked}`
  );
}

// ─── Resume ──────────────────────────────────────────────────────
console.log("\n══════════════════════════════════════════════════════════════");
console.log(`  RESUME : ${passed} passes, ${failed} echoues`);
console.log("══════════════════════════════════════════════════════════════\n");

if (failed > 0) {
  console.log("\n❌ Echecs :");
  for (const f of failures) {
    console.log("  • " + f);
  }
  process.exit(1);
} else {
  console.log("\n✅ Tous les tests sont passes !\n");
  process.exit(0);
}
