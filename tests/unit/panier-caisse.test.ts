/**
 * Panier de l'onglet Encaisser : quantité, prix modifiable, regroupement.
 */
import assert from "node:assert/strict";
import { ajouterAuPanier, changerPrixUnitaire, changerQuantite, ligneAjustable, prixUnitaire } from "../../src/lib/panier-caisse";

let passes = 0;
function test(nom: string, fn: () => void) {
  try { fn(); passes++; console.log(`  ✅ ${nom}`); }
  catch (e) { console.error(`  ❌ ${nom}`); console.error(e); process.exitCode = 1; }
}

const promenade = (id: string, extra: any = {}) => ({ id, activityTitle: "Promenade en main", activityId: "pm", childId: "lea", priceTTC: 15, priceHT: 14.22, tva: 5.5, ...extra });

test("deux promenades en main : une ligne, quantité 2, 30 €", () => {
  const p = ajouterAuPanier(ajouterAuPanier([], promenade("a")), promenade("b"));
  assert.equal(p.length, 1);
  assert.equal(p[0].quantity, 2);
  assert.equal(p[0].priceTTC, 30);
  assert.equal(p[0].puTTC, 15);
  assert.equal(p[0].priceHT, 28.44);
});

test("autre cavalier, autre prix ou ligne liée à un créneau : lignes séparées", () => {
  assert.equal(ajouterAuPanier([promenade("a")], promenade("b", { childId: "tom" })).length, 2);
  assert.equal(ajouterAuPanier([promenade("a")], promenade("b", { priceTTC: 20 })).length, 2);
  assert.equal(ajouterAuPanier([promenade("a", { creneauId: "c1" })], promenade("b", { creneauId: "c1" })).length, 2);
});

test("changer la quantité garde le prix unitaire ; changer le prix garde la quantité", () => {
  const l3 = changerQuantite(promenade("a"), 3);
  assert.deepEqual([l3.quantity, l3.priceTTC], [3, 45]);
  const l = changerPrixUnitaire(l3, 12.5);
  assert.deepEqual([l.quantity, l.puTTC, l.priceTTC], [3, 12.5, 37.5]);
  assert.equal(changerQuantite(l, 0).quantity, 1, "jamais moins de 1");
  assert.equal(changerPrixUnitaire(l, -4), l, "prix négatif refusé");
});

test("TVA à 0 % : HT = TTC (jamais de repli à 5,5 %)", () => {
  const licence = { id: "x", activityTitle: "Licence FFE", priceTTC: 25, priceHT: 25, tva: 0 };
  const l = changerQuantite(licence, 2);
  assert.deepEqual([l.priceTTC, l.priceHT, l.puHT], [50, 50, 25]);
});

test("pension 420 € corrigée à 300 € dans le panier", () => {
  const pension = { id: "p", activityTitle: "Pension octobre", priceTTC: 420, priceHT: 350, tva: 20 };
  const l = changerPrixUnitaire(pension, 300);
  assert.deepEqual([l.priceTTC, l.priceHT, prixUnitaire(l)], [300, 250, 300]);
});

test("bon cadeau et ligne de créneau : ni quantité ni prix modifiables", () => {
  const bon = { id: "b", activityTitle: "Bon cadeau", priceTTC: 50, priceHT: 50, tva: 0, isBonCadeau: true };
  assert.equal(ligneAjustable(bon), false);
  assert.equal(changerQuantite(bon, 2), bon);
  assert.equal(ligneAjustable(promenade("a", { creneauId: "c" })), false);
});

if (process.exitCode) { console.error("❌ échec"); } else console.log(`✅ ${passes} tests passés`);
