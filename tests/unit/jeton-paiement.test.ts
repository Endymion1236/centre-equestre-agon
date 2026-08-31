/**
 * tests/unit/jeton-paiement.test.ts
 *
 * Jeton des liens de paiement envoyés par email.
 *   npx tsx tests/unit/jeton-paiement.test.ts
 *
 * Enjeu : ce jeton est la seule chose qui empêche de déclencher un paiement
 * en devinant un identifiant. Deux erreurs opposées le rendraient inutile —
 * accepter une signature fabriquée, ou refuser un lien légitime — et la
 * seconde est silencieuse : la famille voit « lien invalide » et appelle le
 * club, qui n'a aucun moyen de savoir que le jeton était bon.
 *
 * On vérifie aussi que l'expiration se distingue de la falsification : la
 * première mérite un message clair et un nouveau lien, la seconde non.
 */

import { jetonPaiement, verifierJetonPaiement, JOURS_VALIDITE } from "../../src/lib/jeton-paiement";

let passed = 0, failed = 0;
const failures: string[] = [];
function assert(label: string, cond: boolean, details?: string) {
  if (cond) { passed++; console.log(`  ✅ ${label}`); }
  else { failed++; failures.push(label); console.log(`  ❌ ${label}${details ? " — " + details : ""}`); }
}

console.log("\n══════════════════════════════════════════════════════════════");
console.log("  Tests unitaires jeton de lien de paiement");
console.log("══════════════════════════════════════════════════════════════\n");

const ID = "pay_abc123";

console.log("Un jeton légitime est accepté");
{
  assert("jeton frais", verifierJetonPaiement(ID, jetonPaiement(ID)) === "ok");
  assert("validité par défaut d'un mois", JOURS_VALIDITE >= 28 && JOURS_VALIDITE <= 60,
    `JOURS_VALIDITE = ${JOURS_VALIDITE}`);
  // Deux jetons du même paiement diffèrent par leur échéance, mais les deux
  // valent : on ne révoque pas l'ancien lien en en envoyant un nouveau.
  const a = jetonPaiement(ID, 10), b = jetonPaiement(ID, 20);
  assert("deux liens coexistent", verifierJetonPaiement(ID, a) === "ok" && verifierJetonPaiement(ID, b) === "ok");
}

console.log("\nUn jeton falsifié est refusé");
{
  const bon = jetonPaiement(ID);
  assert("jeton vide", verifierJetonPaiement(ID, "") === "invalide");
  assert("identifiant vide", verifierJetonPaiement("", bon) === "invalide");
  assert("signature inventée", verifierJetonPaiement(ID, "9999999999.0123456789abcdef0123456789abcdef") === "invalide");
  assert("sans échéance", verifierJetonPaiement(ID, "0123456789abcdef0123456789abcdef") === "invalide");
  assert("échéance non numérique", verifierJetonPaiement(ID, "demain.0123456789abcdef0123456789abcdef") === "invalide");
  // Le cœur du sujet : le jeton d'un paiement ne doit pas en ouvrir un autre.
  assert("jeton d'un AUTRE paiement", verifierJetonPaiement("pay_xyz789", bon) === "invalide");
  // Repousser l'échéance invalide la signature, qui la couvre.
  const [, sig] = bon.split(".");
  assert("échéance repoussée à la main", verifierJetonPaiement(ID, `9999999999.${sig}`) === "invalide");
  // Une signature tronquée ne doit pas passer par une comparaison partielle.
  assert("signature tronquée", verifierJetonPaiement(ID, `9999999999.${sig.slice(0, 8)}`) === "invalide");
}

console.log("\nUn jeton périmé se distingue d'un jeton falsifié");
{
  assert("échéance dépassée", verifierJetonPaiement(ID, jetonPaiement(ID, -1)) === "expire");
  assert("échéance très ancienne", verifierJetonPaiement(ID, jetonPaiement(ID, -400)) === "expire");
  // C'est ce qui permet à la page d'expliquer « ce lien a expiré, en voici un
  // nouveau » au lieu de « lien invalide », qui laisse la famille démunie.
  assert("un jeton périmé n'est pas dit invalide", verifierJetonPaiement(ID, jetonPaiement(ID, -1)) !== "invalide");
}

console.log("\n══════════════════════════════════════════════════════════════");
console.log(`  ${passed} réussis · ${failed} échoués`);
if (failed > 0) {
  console.log("\n  Échecs :");
  failures.forEach(f => console.log(`   • ${f}`));
}
console.log("══════════════════════════════════════════════════════════════\n");
process.exit(failed > 0 ? 1 : 0);
