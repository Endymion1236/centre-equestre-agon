/**
 * tests/unit/manuel.test.ts — le manuel reste cohérent : identifiants uniques,
 * liens vers des écrans qui existent, questions comptables trouvées par la recherche.
 *   npx tsx tests/unit/manuel.test.ts
 */
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { MANUAL } from "../../src/lib/manual-content";

let passes = 0;
function test(nom: string, fn: () => void) {
  try { fn(); passes++; console.log(`  ✅ ${nom}`); } catch (e) { console.error(`  ❌ ${nom}\n`, e); process.exitCode = 1; }
}
// Même filtre que la recherche de l'écran admin/manuel.
const chercher = (q: string) => MANUAL.flatMap((c) => c.sections.filter((s) => s.title.toLowerCase().includes(q) || s.text.toLowerCase().includes(q)).map((s) => s.id));

test("identifiants de chapitres et de sections uniques", () => {
  const chapitres = MANUAL.map((c) => c.id);
  assert.equal(new Set(chapitres).size, chapitres.length);
  for (const c of MANUAL) {
    const ids = c.sections.map((s) => s.id);
    assert.equal(new Set(ids).size, ids.length, c.id);
  }
});

test("chaque lien du chapitre « Questions comptables » mène à un écran existant", () => {
  const ch = MANUAL.find((c) => c.id === "questions-comptables")!;
  assert.ok(ch && ch.sections.length >= 20);
  for (const s of ch.sections) {
    if (!s.href) continue;
    const chemin = s.href.split("?")[0];
    assert.ok(existsSync(`src/app${chemin}/page.tsx`), `${s.id} → ${chemin}`);
  }
});

test("la recherche retrouve les cas courants", () => {
  for (const [mot, id] of [["rejet", "prelevement-rejete"], ["avoir fournisseur", "avoir-fournisseur"], ["471", "a-classer-471"], ["céleris", "mois-celeris"], ["rembourser", "rembourser-famille"], ["amortit", "immobilisation"]]) {
    assert.ok(chercher(mot).includes(id), `${mot} → ${id}`);
  }
});

if (process.exitCode) console.error("❌ échec"); else console.log(`✅ ${passes} tests passés`);
