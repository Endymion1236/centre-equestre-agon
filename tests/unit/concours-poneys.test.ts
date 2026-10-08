/**
 * tests/unit/concours-poneys.test.ts
 *
 * Organisation de concours : un poney s'affiche sous son surnom.
 *   npx tsx tests/unit/concours-poneys.test.ts
 */
import assert from "node:assert/strict";
import { poneyDepuisFiche, trouverPoney, chevauxAvecSurnoms } from "../../src/lib/concours/poneys";

let passes = 0;
function test(nom: string, fn: () => void) {
  try { fn(); passes++; console.log(`  ✅ ${nom}`); }
  catch (e: any) { console.error(`  ❌ ${nom}\n     ${e.message}`); process.exitCode = 1; }
}

const base = [
  poneyDepuisFiche("e1", { name: "Galaxie du Mesnil", surnom: "Gala" }),
  poneyDepuisFiche("e2", { name: "Milton", surnom: "  " }),
];

test("le surnom passe avant le nom officiel", () => {
  assert.deepEqual(base[0], { equideId: "e1", nom: "Gala", nomOfficiel: "Galaxie du Mesnil" });
  assert.equal(base[1].nom, "Milton");
  assert.equal(poneyDepuisFiche("e3", {}).nom, "?");
});

test("un poney se retrouve par son surnom ou par son nom officiel", () => {
  assert.equal(trouverPoney(base, "gala")?.equideId, "e1");
  assert.equal(trouverPoney(base, " Galaxie du MESNIL ")?.equideId, "e1");
  assert.equal(trouverPoney(base, "Java"), undefined);
  assert.equal(trouverPoney(base, ""), undefined);
});

test("un ancien concours reprend le surnom actuel", () => {
  const chevaux = [
    { id: "eq-e1", nom: "Galaxie du Mesnil", equideId: "e1" },
    { id: "x", nom: "Poney prêté" },
  ];
  const maj = chevauxAvecSurnoms(chevaux, base);
  assert.deepEqual(maj.map((c) => c.nom), ["Gala", "Poney prêté"]);
  assert.equal(chevauxAvecSurnoms(maj, base), maj, "rien à changer : même tableau");
});

console.log(process.exitCode ? "\n❌ des tests ont échoué" : `\n✅ ${passes} tests passés`);
