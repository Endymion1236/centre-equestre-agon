/**
 * tests/unit/recurrences.test.ts
 *
 * L'historique de facturation d'une récurrence face à la réalité de la base.
 *   npx tsx tests/unit/recurrences.test.ts
 *
 * Cas réel : la pension annonçait « 1 facture générée » alors qu'aucune
 * facture n'existait, la base financière ayant été réinitialisée entre-temps.
 * Le mois passait pour facturé et ne pouvait plus être rattrapé.
 */

import { historiqueRecurrence, moisDejaFacture, historiqueNettoye } from "../../src/lib/recurrences";

let passed = 0, failed = 0;
const failures: string[] = [];
function assert(label: string, cond: boolean, details?: string) {
  if (cond) { passed++; console.log(`  ✅ ${label}`); }
  else { failed++; failures.push(label); console.log(`  ❌ ${label}${details ? " — " + details : ""}`); }
}

console.log("\n══════════════════════════════════════════════════════════════");
console.log("  Tests unitaires — historique des récurrences");
console.log("══════════════════════════════════════════════════════════════\n");

const TRACES = [
  { mois: "2026-08", paymentId: "pay-aout" },
  { mois: "2026-09", paymentId: "pay-septembre" },
];

console.log("✓ Base intacte : toutes les factures comptent :");
{
  const existants = new Set(["pay-aout", "pay-septembre"]);
  const h = historiqueRecurrence(TRACES, existants);
  assert("deux factures vivantes", h.vivantes.length === 2, String(h.vivantes.length));
  assert("aucune orpheline", h.orphelines.length === 0, String(h.orphelines.length));
  assert("septembre est facturé", moisDejaFacture(TRACES, "2026-09", existants));
  assert("rien à nettoyer", historiqueNettoye(TRACES, existants) === null);
}

console.log("\n✓ Après réinitialisation des données financières :");
{
  const existants = new Set<string>();
  const h = historiqueRecurrence(TRACES, existants);
  assert("aucune facture n'est annoncée", h.vivantes.length === 0, String(h.vivantes.length));
  assert("les deux traces sont orphelines", h.orphelines.length === 2, String(h.orphelines.length));
  assert("septembre redevient facturable", !moisDejaFacture(TRACES, "2026-09", existants));
  assert("août aussi", !moisDejaFacture(TRACES, "2026-08", existants));
  assert("l'historique nettoyé est vide", (historiqueNettoye(TRACES, existants) || []).length === 0);
}

console.log("\n✓ Un seul paiement effacé :");
{
  const existants = new Set(["pay-septembre"]);
  const h = historiqueRecurrence(TRACES, existants);
  assert("une seule facture annoncée", h.vivantes.length === 1, String(h.vivantes.length));
  assert("c'est bien septembre", h.vivantes[0].mois === "2026-09", h.vivantes[0].mois);
  assert("août est à refaire", !moisDejaFacture(TRACES, "2026-08", existants));
  assert("septembre reste protégé du doublon", moisDejaFacture(TRACES, "2026-09", existants));
  const nettoye = historiqueNettoye(TRACES, existants)!;
  assert("le nettoyage garde septembre", nettoye.length === 1 && nettoye[0].mois === "2026-09");
}

console.log("\n✓ Cas dégradés :");
{
  const existants = new Set(["pay-septembre"]);
  assert("historique absent", historiqueRecurrence(undefined, existants).vivantes.length === 0);
  assert("mois jamais facturé", !moisDejaFacture(TRACES, "2026-10", existants));
  const bancal = [{ mois: "2026-09", paymentId: "" }, { mois: "", paymentId: "pay-septembre" }] as any;
  const h = historiqueRecurrence(bancal, existants);
  assert("une trace sans paiement est orpheline", h.orphelines.length === 1, String(h.orphelines.length));
  assert("une trace sans mois est ignorée", h.vivantes.length === 0, String(h.vivantes.length));
  assert("elle ne bloque pas le mois", !moisDejaFacture(bancal, "2026-09", existants));
}

console.log("\n══════════════════════════════════════════════════════════════");
console.log(`  RESUME : ${passed} passes, ${failed} echoues`);
console.log("══════════════════════════════════════════════════════════════\n");
if (failed > 0) { console.log("Echecs :"); failures.forEach(f => console.log(`  - ${f}`)); process.exit(1); }
console.log("✅ Tous les tests sont passes !\n");
