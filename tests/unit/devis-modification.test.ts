/**
 * tests/unit/devis-modification.test.ts — modifier un devis sans tromper la famille.
 *   npx tsx tests/unit/devis-modification.test.ts
 */
import assert from "node:assert/strict";
import { avertissementModification, etatApresModification, peutModifierDevis } from "../../src/app/admin/devis/devis-modification";

let passes = 0;
function test(nom: string, fn: () => void) {
  try { fn(); passes++; console.log(`  ✅ ${nom}`); }
  catch (e: any) { console.error(`  ❌ ${nom}\n     ${e.message}`); process.exitCode = 1; }
}

test("tout devis se modifie, sauf un devis converti en commande", () => {
  for (const s of ["draft", "sent", "accepted", "refused"]) assert.equal(peutModifierDevis(s), true, s);
  assert.equal(peutModifierDevis("converted"), false);
});

test("un brouillon modifié reste un brouillon, même lien", () => {
  const p = etatApresModification({ status: "draft", totalTTC: 100 }, () => "NOUVEAU", "2026-10-03T10:00:00Z");
  assert.deepEqual(p, { modifieLe: "2026-10-03T10:00:00Z" });
  assert.equal(avertissementModification("draft"), null);
});

test("un devis envoyé ou accepté repasse en brouillon avec un nouveau lien : l'ancien ne peut plus être accepté", () => {
  for (const s of ["sent", "accepted", "refused"]) {
    const p = etatApresModification({ status: s, totalTTC: 699 }, () => "NOUVEAU", "2026-10-03T10:00:00Z");
    assert.equal(p.status, "draft");
    assert.equal(p.token, "NOUVEAU");
    assert.equal(p.modifieApresEnvoi, true);
    assert.deepEqual(p.derniereModification, { le: "2026-10-03T10:00:00Z", statutAvant: s, totalAvant: 699 });
    assert.ok(avertissementModification(s));
  }
  assert.match(avertissementModification("accepted")!, /annule cette acceptation/);
});

console.log(`\n${process.exitCode ? "❌" : "✅"} ${passes} tests passés`);
