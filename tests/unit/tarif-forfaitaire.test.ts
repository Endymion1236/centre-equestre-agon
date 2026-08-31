/**
 * tests/unit/tarif-forfaitaire.test.ts
 *
 * Créneaux vendus à la sortie plutôt qu'au cavalier.
 *   npx tsx tests/unit/tarif-forfaitaire.test.ts
 *
 * Cas d'origine (31/08/2026) : une balade privatisée à 250 € avec 2 places
 * facturait 500 € si deux personnes s'inscrivaient. Mettre 125 € par place
 * n'était pas une solution : un cavalier seul aurait payé la moitié d'une
 * sortie qui mobilise autant de monde et de chevaux.
 */

import {
  prixCreneauTTC, prixInscriptionCavalier, inscritsMemeFamille, libellePrixCreneau,
} from "../../src/lib/tarif-forfaitaire";

let passed = 0, failed = 0;
const failures: string[] = [];
function assert(label: string, cond: boolean, details?: string) {
  if (cond) { passed++; console.log(`  ✅ ${label}`); }
  else { failed++; failures.push(label); console.log(`  ❌ ${label}${details ? " — " + details : ""}`); }
}

console.log("\n══════════════════════════════════════════════════════════════");
console.log("  Tests unitaires — tarif forfaitaire (balades privatisées)");
console.log("══════════════════════════════════════════════════════════════\n");

const PRIVATISEE = { priceTTC: 250, tvaTaux: 5.5, tarifForfaitaire: true };
const COLLECTIVE = { priceTTC: 45, tvaTaux: 5.5 };

console.log("✓ La sortie coûte 250 €, à un comme à deux :");
{
  assert("premier cavalier : 250 €", prixInscriptionCavalier(PRIVATISEE, 0) === 250);
  assert("deuxième cavalier de la famille : 0 €", prixInscriptionCavalier(PRIVATISEE, 1) === 0);
  assert("troisième aussi", prixInscriptionCavalier(PRIVATISEE, 2) === 0);
  const total = prixInscriptionCavalier(PRIVATISEE, 0) + prixInscriptionCavalier(PRIVATISEE, 1);
  assert("total de la sortie à deux : 250 €", total === 250, String(total));
}

console.log("\n✓ Une balade collective reste facturée par cavalier :");
{
  assert("premier : 45 €", prixInscriptionCavalier(COLLECTIVE, 0) === 45);
  assert("deuxième : 45 € aussi", prixInscriptionCavalier(COLLECTIVE, 1) === 45);
}

console.log("\n✓ Le forfait vaut par famille, pas par créneau :");
{
  const enrolled = [
    { childId: "a", familyId: "dupont" },
    { childId: "b", familyId: "dupont" },
    { childId: "c", familyId: "martin" },
  ];
  // `enrolled` est relu après l'inscription : le cavalier ajouté y figure déjà.
  assert("2e cavalier Dupont : un frère est déjà là",
    inscritsMemeFamille(enrolled, "dupont", "b") === 1);
  assert("1er cavalier Martin : personne de sa famille",
    inscritsMemeFamille(enrolled, "martin", "c") === 0);
  assert("donc Martin paie le forfait",
    prixInscriptionCavalier(PRIVATISEE, inscritsMemeFamille(enrolled, "martin", "c")) === 250);
  assert("et le second Dupont ne paie rien",
    prixInscriptionCavalier(PRIVATISEE, inscritsMemeFamille(enrolled, "dupont", "b")) === 0);
}

console.log("\n✓ Prix repris du créneau, quelle que soit sa forme :");
{
  assert("priceTTC direct", prixCreneauTTC({ priceTTC: 250 }) === 250);
  assert("calculé depuis le HT", prixCreneauTTC({ priceHT: 100, tvaTaux: 5.5 }) === 105.5);
  assert("créneau sans prix", prixCreneauTTC({}) === 0);
}

console.log("\n✓ Le libellé dit que le prix est celui de la sortie :");
{
  assert("forfait", libellePrixCreneau(PRIVATISEE) === "250€ la sortie", libellePrixCreneau(PRIVATISEE));
  assert("par cavalier", libellePrixCreneau(COLLECTIVE) === "45€", libellePrixCreneau(COLLECTIVE));
  assert("sans prix, rien", libellePrixCreneau({}) === "");
}

console.log(`\n──────────────────────────────────────────────────────────────`);
console.log(`  ${passed} réussis, ${failed} échoués`);
if (failed > 0) {
  console.log(`  Échecs : ${failures.join(", ")}`);
  console.log("──────────────────────────────────────────────────────────────\n");
  process.exit(1);
}
console.log("──────────────────────────────────────────────────────────────\n");
