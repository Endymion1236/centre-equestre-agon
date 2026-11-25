/**
 * tests/unit/services-planning.test.ts — services d'un établissement proposés au planning (25/11/2026).
 *   npx tsx tests/unit/services-planning.test.ts
 */
import assert from "node:assert/strict";
import { cavalierDuService, cavalierPourService, servicesSansCavalier } from "../../src/lib/services-etablissement";

let passes = 0;
function test(nom: string, fn: () => void) {
  try { fn(); passes++; console.log(`  ✅ ${nom}`); }
  catch (e: any) { console.error(`  ❌ ${nom}\n     ${e.message}`); process.exitCode = 1; }
}
const fiche = {
  parentName: "Coutances mer et bocage",
  services: ["Centre de loisirs de Gavray", { nom: "École de Quettreville", email: "ecole@exemple.fr" }, "  "],
  children: [{ id: "c1", firstName: "Centre de loisirs de Gavray", lastName: "", serviceEtablissement: "Centre de loisirs de Gavray" }],
};

test("seuls les services sans cavalier sont proposés", () => {
  assert.deepEqual(servicesSansCavalier(fiche).map(s => s.nom), ["École de Quettreville"]);
  assert.deepEqual(servicesSansCavalier({ services: [] }), []);
  assert.deepEqual(servicesSansCavalier(undefined), []);
});
test("cavalier retrouvé par son service, ou par son nom (accents et casse ignorés)", () => {
  assert.equal(cavalierDuService(fiche.children, "centre de loisirs de GAVRAY")?.id, "c1");
  assert.equal(cavalierDuService([{ id: "x", firstName: "Ecole de", lastName: "Quettreville" }], "École de Quettreville")?.id, "x");
  assert.equal(cavalierDuService(fiche.children, ""), undefined);
});
test("cavalier créé pour un service : son nom, marqué service", () => {
  const c = cavalierPourService(" École de Quettreville ", "id1");
  assert.equal(c.firstName, "École de Quettreville"); assert.equal(c.serviceEtablissement, "École de Quettreville"); assert.equal(c.id, "id1");
  assert.deepEqual(servicesSansCavalier({ ...fiche, children: [...fiche.children, c] }), []);
});

console.log(`\n✅ ${passes} tests passés`);
