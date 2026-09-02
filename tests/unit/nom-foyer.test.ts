/**
 * tests/unit/nom-foyer.test.ts
 *
 * Déduire le nom du foyer à partir du nom du parent saisi.
 *   npx tsx tests/unit/nom-foyer.test.ts
 *
 * Ce nom sert de nom par défaut aux cavaliers de la famille : une erreur ici
 * se retrouve sur leurs fiches, leurs factures et leurs courriels. La saisie
 * n'est pas normalisée — deux conventions se rencontrent en vrai, et il faut
 * reconnaître les deux.
 */

import { nomDeduitDuParent } from "../../src/lib/nom-foyer";

let passed = 0, failed = 0;
const failures: string[] = [];
function egal(label: string, obtenu: string, attendu: string) {
  if (obtenu === attendu) { passed++; console.log(`  ✅ ${label}`); }
  else { failed++; failures.push(label); console.log(`  ❌ ${label} — obtenu « ${obtenu} », attendu « ${attendu} »`); }
}

console.log("\n══════════════════════════════════════════════════════════════");
console.log("  Tests unitaires — nom du foyer");
console.log("══════════════════════════════════════════════════════════════\n");

console.log("✓ Nom en majuscules, prénom ensuite :");
{
  egal("DUPONT Marie", nomDeduitDuParent("DUPONT Marie"), "DUPONT");
  // Le cas qui avait motivé la règle : un nom composé ne se coupe pas au
  // premier mot, sans quoi la famille LE MOAL s'appelait « LE ».
  egal("LE MOAL Sophie", nomDeduitDuParent("LE MOAL Sophie"), "LE MOAL");
  egal("DE LA TOUR Jean", nomDeduitDuParent("DE LA TOUR Jean"), "DE LA TOUR");
  egal("accents conservés", nomDeduitDuParent("ANDRÉ Paul"), "ANDRÉ");
}

console.log("\n✓ Saisie ordinaire, prénom puis nom :");
{
  egal("Marie Dupont", nomDeduitDuParent("Marie Dupont"), "DUPONT");
  egal("Jean-Pierre Martin", nomDeduitDuParent("Jean-Pierre Martin"), "MARTIN");
  egal("un seul mot", nomDeduitDuParent("Dupont"), "DUPONT");
}

console.log("\n✓ Saisies abîmées :");
{
  egal("vide", nomDeduitDuParent(""), "");
  egal("espaces seuls", nomDeduitDuParent("   "), "");
  egal("espaces en trop", nomDeduitDuParent("  DUPONT   Marie  "), "DUPONT");
  egal("valeur absente", nomDeduitDuParent(undefined as any), "");
}

console.log("\n✓ Une initiale n'est pas un nom :");
{
  // « M. Dupont » : une seule lettre en majuscule ne doit pas être prise
  // pour le nom du foyer.
  egal("M Dupont", nomDeduitDuParent("M Dupont"), "DUPONT");
}

console.log("\n══════════════════════════════════════════════════════════════");
console.log(`  RESUME : ${passed} passes, ${failed} echoues`);
console.log("══════════════════════════════════════════════════════════════\n");
if (failed > 0) { console.log("Echecs :"); failures.forEach(f => console.log(`  - ${f}`)); process.exit(1); }
console.log("✅ Tous les tests sont passes !\n");
