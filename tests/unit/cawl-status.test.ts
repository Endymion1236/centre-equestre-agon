/**
 * tests/unit/cawl-status.test.ts
 *
 *   npx tsx tests/unit/cawl-status.test.ts
 *
 * Regression du 30/07/2026 : un paiement REFUSE par la banque etait
 * enregistre comme regle — facture payee, email « paiement confirme »,
 * place reservee, argent jamais encaisse.
 *
 * Cause : le succes se deduisait aussi du statut du hosted checkout
 * (`PAYMENT_CREATED`), qui signale seulement qu'une tentative a ete creee.
 * Un refus en cree une aussi.
 *
 * Ces tests verrouillent la regle : SEUL le statut du paiement decide, et
 * tout statut inconnu est traite comme non abouti.
 */

import {
  deciderPaiement, montantCoherent, paiementAbouti,
  STATUTS_ECHEC, STATUTS_PAYES,
} from "../../src/lib/cawl-status";

let passed = 0, failed = 0;
const failures: string[] = [];
function assert(label: string, cond: boolean, details?: string) {
  if (cond) { passed++; console.log(`  ✅ ${label}`); }
  else { failed++; failures.push(label); console.log(`  ❌ ${label}${details ? " — " + details : ""}`); }
}

console.log("\n══════════════════════════════════════════════════════════════");
console.log("  Tests unitaires statut paiement CAWL");
console.log("══════════════════════════════════════════════════════════════\n");

// ─── LA regression ───────────────────────────────────────────────
console.log("✓ Regression du 30/07 — refus bancaire :");
{
  assert("REJECTED n'est PAS un succes", !paiementAbouti("REJECTED"),
    "c'est le cas exact de l'incident");
  assert("REJECTED est un echec franc", deciderPaiement("REJECTED") === "echec");
  assert("REJECTED_CAPTURE n'est pas un succes", !paiementAbouti("REJECTED_CAPTURE"));
  // Le statut du hosted checkout n'entre plus en ligne de compte : la
  // fonction ne le recoit meme pas.
  assert("PAYMENT_CREATED n'est pas un statut de paiement valide",
    !paiementAbouti("PAYMENT_CREATED"),
    "c'etait la porte d'entree du bug");
}

// ─── Succes reels ────────────────────────────────────────────────
console.log("\n✓ Paiements aboutis :");
{
  assert("CAPTURED", paiementAbouti("CAPTURED"));
  assert("PAID", paiementAbouti("PAID"));
  assert("CAPTURE_REQUESTED", paiementAbouti("CAPTURE_REQUESTED"));
  assert("PENDING_CAPTURE (autorise)", paiementAbouti("PENDING_CAPTURE"),
    "l'argent est reserve : la reservation peut etre confirmee");
  assert("casse ignoree", paiementAbouti("captured"));
  assert("espaces ignores", paiementAbouti("  CAPTURED  "));
}

// ─── Echecs ──────────────────────────────────────────────────────
console.log("\n✓ Paiements en echec :");
{
  for (const statut of STATUTS_ECHEC) {
    assert(`${statut} refuse`, deciderPaiement(statut) === "echec");
  }
}

// ─── Indetermine : ne jamais valider ─────────────────────────────
console.log("\n✓ Statuts indetermines (on ne valide pas) :");
{
  assert("statut absent", deciderPaiement(undefined) === "en_attente");
  assert("statut null", deciderPaiement(null) === "en_attente");
  assert("chaine vide", deciderPaiement("") === "en_attente");
  assert("espaces seuls", deciderPaiement("   ") === "en_attente");
  assert("PENDING_APPROVAL", deciderPaiement("PENDING_APPROVAL") === "en_attente");
  assert("PENDING_FRAUD_APPROVAL", deciderPaiement("PENDING_FRAUD_APPROVAL") === "en_attente");
  assert("REDIRECTED", deciderPaiement("REDIRECTED") === "en_attente");
  assert("statut inconnu", deciderPaiement("TOTALEMENT_INCONNU") === "en_attente");
  assert("nombre", deciderPaiement(2) === "en_attente");
  assert("aucun indetermine ne passe pour un succes",
    !paiementAbouti("PENDING_APPROVAL") && !paiementAbouti("REDIRECTED") && !paiementAbouti(undefined));
}

// ─── Coherence des montants ──────────────────────────────────────
console.log("\n✓ Controle du montant :");
{
  assert("montant identique", montantCoherent(40, 40));
  assert("arrondi d'un centime tolere", montantCoherent(40, 40.01));
  assert("ecart de 5€ refuse", !montantCoherent(40, 45));
  assert("montant moindre refuse", !montantCoherent(40, 30));
  assert("attendu inconnu : on laisse passer", montantCoherent(null, 40));
  assert("attendu nul : on laisse passer", montantCoherent(0, 40));
}

// ─── Coherence interne des listes ────────────────────────────────
console.log("\n✓ Coherence des listes :");
{
  const chevauchement = STATUTS_PAYES.filter(s => (STATUTS_ECHEC as readonly string[]).includes(s));
  assert("aucun statut a la fois paye et en echec", chevauchement.length === 0, chevauchement.join(","));
  assert("tous les statuts payes sont des succes", STATUTS_PAYES.every(s => paiementAbouti(s)));
}

console.log("\n══════════════════════════════════════════════════════════════");
console.log(`  RESUME : ${passed} passes, ${failed} echoues`);
console.log("══════════════════════════════════════════════════════════════\n");
if (failed > 0) { console.log("\n❌ Echecs :"); failures.forEach(f => console.log("  • " + f)); process.exit(1); }
console.log("\n✅ Tous les tests sont passes !\n");
process.exit(0);
