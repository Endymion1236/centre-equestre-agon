/**
 * tests/unit/carte-reglement.test.ts
 *
 * Une carte de séances est-elle payée ?
 *   npx tsx tests/unit/carte-reglement.test.ts
 *
 * L'écran Cartes propose « encaisser plus tard » : la carte donne droit à ses
 * dix séances immédiatement, la commande part aux impayés — et rien, sur la
 * carte, ne le montrait.
 */

import { reglementCarte } from "../../src/lib/carte-reglement";

let passed = 0, failed = 0;
const failures: string[] = [];
function assert(label: string, cond: boolean, details?: string) {
  if (cond) { passed++; console.log(`  ✅ ${label}`); }
  else { failed++; failures.push(label); console.log(`  ❌ ${label}${details ? " — " + details : ""}`); }
}

console.log("\n══════════════════════════════════════════════════════════════");
console.log("  Tests unitaires — règlement d'une carte de séances");
console.log("══════════════════════════════════════════════════════════════\n");

const commande = (over: Record<string, unknown>) => ({
  id: "cmd1", familyId: "duhem", cardId: "carte1", totalTTC: 247, paidAmount: 0,
  status: "pending", items: [{ cardId: "carte1", activityTitle: "Carte 10 séances — Toute la famille" }],
  ...over,
});

console.log("✓ Carte remise sans encaissement :");
{
  const r = reglementCarte([commande({})], "carte1");
  assert("état impayé", r.etat === "impaye", r.etat);
  assert("montant dû", r.total === 247 && r.reste === 247);
  assert("la commande est désignée, pour l'encaisser", r.paymentId === "cmd1");
}

console.log("\n✓ Carte réglée :");
{
  const r = reglementCarte([commande({ status: "paid", paidAmount: 247 })], "carte1");
  assert("état réglé", r.etat === "regle", r.etat);
}

console.log("\n✓ Carte réglée en partie :");
{
  const r = reglementCarte([commande({ status: "partial", paidAmount: 100 })], "carte1");
  assert("état partiel", r.etat === "partiel", r.etat);
  assert("reste 147 €", r.reste === 147, String(r.reste));
}

console.log("\n✓ Ce qui ne doit rien affirmer :");
{
  const aucune = reglementCarte([], "carte1");
  assert("carte sans commande retrouvée : on se tait", aucune.etat === "inconnu", aucune.etat);

  const autreCarte = reglementCarte([commande({ cardId: "carte2", items: [{ cardId: "carte2" }] })], "carte1");
  assert("la commande d'une autre carte n'est pas lue", autreCarte.etat === "inconnu", autreCarte.etat);

  const annulee = reglementCarte([commande({ status: "cancelled" })], "carte1");
  assert("une commande annulée ne compte pas", annulee.etat === "inconnu", annulee.etat);
}

console.log("\n✓ Rattachement par la ligne de commande :");
{
  // Les commandes anciennes ne portent le cardId que sur leur ligne.
  const parLigne = reglementCarte([{ ...commande({}), cardId: undefined }], "carte1");
  assert("retrouvée par sa ligne", parLigne.etat === "impaye", parLigne.etat);
}

console.log(`\n──────────────────────────────────────────────────────────────`);
console.log(`  ${passed} réussis, ${failed} échoués`);
if (failed > 0) {
  console.log(`  Échecs : ${failures.join(", ")}`);
  console.log("──────────────────────────────────────────────────────────────\n");
  process.exit(1);
}
console.log("──────────────────────────────────────────────────────────────\n");
