/**
 * tests/unit/recherche-equide.test.ts
 *
 * Cavalerie : un poney se retrouve par son surnom.
 *   npx tsx tests/unit/recherche-equide.test.ts
 */
import assert from "node:assert/strict";
import { equideCorrespond } from "../../src/lib/recherche-equide";

let passes = 0;
function test(nom: string, fn: () => void) {
  try { fn(); passes++; console.log(`  ✅ ${nom}`); }
  catch (e: any) { console.error(`  ❌ ${nom}\n     ${e.message}`); process.exitCode = 1; }
}

const gala = { name: "Galaxie du Mesnil", surnom: "Gala", sire: "25012345X", puce: "250259600123456", race: "Connemara" };

test("par le surnom, quelle que soit la casse", () => {
  assert.equal(equideCorrespond(gala, "gala"), true);
  assert.equal(equideCorrespond({ name: "Ultra de la Lande", surnom: "Titi" }, "TIT"), true);
});

test("sans tenir compte des accents", () => {
  assert.equal(equideCorrespond({ name: "Quick Star", surnom: "Éclair" }, "eclair"), true);
  assert.equal(equideCorrespond({ name: "Hélios" }, "helios"), true);
});

test("toujours par nom officiel, SIRE, puce et race", () => {
  assert.equal(equideCorrespond(gala, "mesnil"), true);
  assert.equal(equideCorrespond(gala, "25012345"), true);
  assert.equal(equideCorrespond(gala, "9600123"), true);
  assert.equal(equideCorrespond(gala, "connem"), true);
});

test("pas de faux résultat, recherche vide = tout", () => {
  assert.equal(equideCorrespond(gala, "milton"), false);
  assert.equal(equideCorrespond({ name: "Milton" }, "gala"), false, "fiche sans surnom");
  assert.equal(equideCorrespond(gala, "  "), true);
});

console.log(process.exitCode ? "\n❌ des tests ont échoué" : `\n✅ ${passes} tests passés`);
