/**
 * tests/unit/envoi-document.test.ts — la facture ou la proforma envoyée seule.
 *   npx tsx tests/unit/envoi-document.test.ts
 */
import assert from "node:assert/strict";
import { emailTemplates } from "../../src/lib/email-templates";

let passes = 0;
function test(nom: string, fn: () => void) {
  try { fn(); passes++; console.log(`  ✅ ${nom}`); }
  catch (e: any) { console.error(`  ❌ ${nom}\n     ${e.message}`); process.exitCode = 1; }
}

const base = { parentName: "Martin", numero: "", montant: 636, resteDu: 636, prestations: "Forfait Galop 3" };

test("une proforma dit qu'elle n'est pas une facture définitive", () => {
  const e = emailTemplates.envoiDocument({ ...base, nature: "proforma" });
  assert.match(e.subject, /proforma/i);
  assert.match(e.html, /n'est pas une facture définitive/);
  assert.doesNotMatch(e.html, /Régler en ligne/, "pas de lien de paiement");
});

test("une facture porte son numéro ; soldée, pas d'invitation à régler", () => {
  const e = emailTemplates.envoiDocument({ ...base, nature: "facture", numero: "F-2026-0142", resteDu: 0 });
  assert.match(e.subject, /F-2026-0142/);
  assert.doesNotMatch(e.html, /proforma/i);
  assert.doesNotMatch(e.html, /Vous pouvez régler/);
});

console.log(`\n${process.exitCode ? "❌" : "✅"} ${passes} tests passés`);
