import assert from "node:assert/strict";
import { tauxTva, ttcDepuisHt } from "../../src/lib/tva-taux";

let passes = 0;
function test(nom: string, fn: () => void) {
  try { fn(); passes++; console.log(`  ✅ ${nom}`); }
  catch (e: any) { console.error(`  ❌ ${nom}\n     ${e.message}`); process.exitCode = 1; }
}

console.log("\n── Taux de TVA ──");

test("un taux à 0 % est respecté, pas remplacé par 5,5 %", () => {
  assert.equal(tauxTva(0), 0);
});

test("un taux absent retombe sur 5,5 %", () => {
  assert.equal(tauxTva(undefined), 5.5);
  assert.equal(tauxTva(null), 5.5);
  assert.equal(tauxTva(""), 5.5);
  assert.equal(tauxTva(), 5.5);
});

test("un NaN ne devient pas un taux", () => {
  assert.equal(tauxTva(Number("abc")), 5.5);
  assert.equal(tauxTva(NaN, 20), 20);
});

test("la valeur brute est passée telle quelle, pas convertie avant", () => {
  // Number("") vaut 0 : convertir avant l'appel transformerait une saisie
  // vide en exonération. Le helper doit recevoir la chaîne.
  assert.equal(tauxTva(""), 5.5);
  assert.equal(tauxTva(Number("")), 0, "conversion prématurée = taux faussé");
});

test("les candidats sont essayés dans l'ordre", () => {
  assert.equal(tauxTva(undefined, 20), 20);
  assert.equal(tauxTva(null, 0, 20), 0, "le premier candidat valide gagne, 0 compris");
  assert.equal(tauxTva(10, 20), 10);
});

test("une chaîne numérique est acceptée", () => {
  assert.equal(tauxTva("20"), 20);
  assert.equal(tauxTva("0"), 0);
});

test("un taux négatif est ignoré", () => {
  assert.equal(tauxTva(-5, 20), 20);
});

test("le TTC suit le taux, y compris à 0 %", () => {
  assert.equal(ttcDepuisHt(100, 5.5), 105.5);
  assert.equal(ttcDepuisHt(100, 0), 100);
  assert.equal(ttcDepuisHt(100, 20), 120);
});

console.log(`\n✅ ${passes} tests passés\n`);
