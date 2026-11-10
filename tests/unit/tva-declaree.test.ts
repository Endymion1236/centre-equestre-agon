/**
 * tests/unit/tva-declaree.test.ts — CA3 du cabinet face au calcul de l'application.
 *   npx tsx tests/unit/tva-declaree.test.ts
 */
import assert from "node:assert/strict";
import { cleTrimestre, comparerDeclaration, declarationsEnEcart, lireSaisie, montantsApplication, syntheseComparaison } from "../../src/lib/tva-declaree";

let n = 0;
const test = (nom: string, fn: () => void) => { try { fn(); n++; } catch (e) { console.error(`❌ ${nom}`); throw e; } };

// 3e trimestre 2026 tel que déposé par le cabinet.
const cabinet = lireSaisie({ base20: "9 298", base55: "60474", collectee: "5186", autresBiensServices: "475", creditAnterieur: "473", totalDeductible: "948", netteDue: "4238", base10: "" });

test("clé du trimestre et saisie", () => {
  assert.equal(cleTrimestre("2026-09"), "2026-T3");
  assert.equal(cleTrimestre("2026-01"), "2026-T1");
  assert.equal(cabinet.base20, 9298);
  assert.equal(cabinet.base10, undefined);
  assert.equal(lireSaisie({ collectee: "12,5" }).collectee, 12.5);
});

test("déductible de l'application à 470 € (943 avec le crédit) : concordance", () => {
  const app = montantsApplication({
    parTaux: [{ taux: 20, base: 9301.2 }, { taux: 5.5, base: 60470.4 }],
    collectee: 5185.6,
    deductible: { immobilisations: 0, autresBiensServices: 470.1, creditAnterieur: 473, total: 943.1 },
    netteDue: 4242.5, credit: 0,
  });
  const l = comparerDeclaration(cabinet, app);
  assert.deepEqual(l.map((x) => x.code), ["08", "09", "16", "20", "22", "23", "TD"]);
  assert.equal(l.find((x) => x.code === "23")!.ecart, -4.9);
  assert.ok(l.every((x) => !x.important));
  assert.match(syntheseComparaison(l), /concordent/);
});

test("déductible de 943 € sans le crédit : écart important signalé, puis expliqué", () => {
  const app = { base20: 9298, base55: 60474, collectee: 5186, immobilisations: 0, autresBiensServices: 943, creditAnterieur: 473, totalDeductible: 1416, netteDue: 3770, credit: 0 };
  const l = comparerDeclaration(cabinet, app);
  assert.deepEqual(l.filter((x) => x.important).map((x) => x.code), ["20", "23", "TD"]);
  assert.match(syntheseComparaison(l), /^3 lignes en écart important : 20 \(\+468 €\)/);
  const doc = { id: "2026-T3", libelle: "3e trimestre 2026", cabinet, application: app, ecartsImportants: 3 };
  assert.equal(declarationsEnEcart([doc]).length, 1);
  assert.equal(declarationsEnEcart([{ ...doc, ecartExplique: "factures d'août transmises après le dépôt" }]).length, 0);
});

console.log(`✅ ${n} tests passés`);
