/**
 * tests/unit/changer-groupe-utils.test.ts — destinations d'un changement de groupe, toutes semaines.
 *   npx tsx tests/unit/changer-groupe-utils.test.ts
 */
import assert from "node:assert/strict";
import { ecartSemaines, libelleSemaine, ordonnerDestinations } from "../../src/app/admin/planning/changer-groupe-utils";

let passes = 0;
function test(nom: string, fn: () => void) {
  try { fn(); passes++; console.log(`  ✅ ${nom}`); }
  catch (e: any) { console.error(`  ❌ ${nom}\n     ${e.message}`); process.exitCode = 1; }
}

test("écart de semaines : même semaine, précédente (Pauline : 26 oct. → 19 oct.), suivante, deux avant", () => {
  assert.equal(ecartSemaines("2026-10-28", "2026-10-26"), 0);
  assert.equal(ecartSemaines("2026-10-28", "2026-10-21"), -1);
  assert.equal(ecartSemaines("2026-10-26", "2026-11-02"), 1);
  assert.equal(ecartSemaines("2026-10-26", "2026-10-16"), -2);
});

test("libellés", () => {
  assert.equal(libelleSemaine(0), "même semaine");
  assert.equal(libelleSemaine(-1), "semaine précédente");
  assert.equal(libelleSemaine(1), "semaine suivante");
  assert.equal(libelleSemaine(-3), "3 semaines avant");
  assert.equal(libelleSemaine(2), "2 semaines après");
});

test("ordre : même semaine, puis précédente, puis suivante, puis plus loin", () => {
  const lots = [
    { nom: "suivante", ecart: 1, date: "2026-11-02" },
    { nom: "deux avant", ecart: -2, date: "2026-10-12" },
    { nom: "même B", ecart: 0, date: "2026-10-27" },
    { nom: "précédente", ecart: -1, date: "2026-10-19" },
    { nom: "même A", ecart: 0, date: "2026-10-26" },
  ];
  assert.deepEqual(ordonnerDestinations(lots).map(l => l.nom), ["même A", "même B", "précédente", "suivante", "deux avant"]);
});

if (process.exitCode) { console.error("❌ échec"); } else console.log(`✅ ${passes} tests passés`);
