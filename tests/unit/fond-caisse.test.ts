import assert from "node:assert/strict";
import {
  BILLETS,
  PIECES,
  calculerComptage,
  calculerSoldeTheorique,
  initialiserComptage,
  motifEcartRequis,
  totalDenominations,
} from "../../src/app/admin/comptabilite/fond-caisse/fond-caisse-utils";

let passes = 0;
function test(nom: string, fn: () => void) {
  try {
    fn();
    passes++;
    console.log(`  ✅ ${nom}`);
  } catch (e: any) {
    console.error(`  ❌ ${nom}\n     ${e.message}`);
    process.exitCode = 1;
  }
}

console.log("\n── Dénominations ──");

test("le comptage initial contient toutes les dénominations à zéro", () => {
  const billets = initialiserComptage(BILLETS);
  const pieces = initialiserComptage(PIECES);
  assert.equal(Object.keys(billets).length, BILLETS.length);
  assert.equal(Object.keys(pieces).length, PIECES.length);
  assert.equal(billets[50], 0);
  assert.equal(pieces[0.01], 0);
});

test("le total des dénominations combine billets ou pièces avec arrondi centime", () => {
  assert.equal(totalDenominations(BILLETS, { 50: 2, 20: 1 }), 120);
  assert.equal(totalDenominations(PIECES, { 2: 3, 0.2: 2, 0.01: 3 }), 6.43);
});

console.log("\n── Solde théorique ──");

test("le solde théorique additionne entrées et sorties espèces", () => {
  assert.equal(calculerSoldeTheorique([
    { montant: 100 },
    { montant: -40 },
    { montant: 0.1 },
    { montant: 0.2 },
  ]), 60.3);
});

console.log("\n── Comptage physique ──");

test("le résumé calcule billets, pièces, total et écart", () => {
  const result = calculerComptage(
    { 50: 2, 10: 1 },
    { 2: 3, 0.5: 1 },
    116,
  );
  assert.equal(result.totalBillets, 110);
  assert.equal(result.totalPieces, 6.5);
  assert.equal(result.totalCompte, 116.5);
  assert.equal(result.ecart, 0.5);
  assert.equal(result.hasEcart, true);
});

test("un écart inférieur au centime est considéré nul après arrondi", () => {
  const result = calculerComptage({}, { 0.01: 1 }, 0.014);
  assert.equal(result.ecart, 0);
  assert.equal(result.hasEcart, false);
});

test("sans solde théorique chargé, aucun faux écart n'est affiché", () => {
  const result = calculerComptage({ 20: 1 }, {}, null);
  assert.equal(result.totalCompte, 20);
  assert.equal(result.ecart, 0);
  assert.equal(result.hasEcart, false);
});

console.log("\n── Justification d'écart ──");

test("un écart réel impose un motif non vide", () => {
  assert.equal(motifEcartRequis(0.01, ""), true);
  assert.equal(motifEcartRequis(-2, "   "), true);
  assert.equal(motifEcartRequis(2, "Erreur de rendu"), false);
  assert.equal(motifEcartRequis(0, ""), false);
});

console.log(`\n✅ ${passes} tests passés\n`);
