import assert from "node:assert/strict";
import {
  ENTETE_FEC,
  construireFecVentes,
} from "../../src/app/admin/comptabilite/fec-utils";

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

console.log("\n── FEC des ventes ──");

const paiements = [
  {
    familyName: "Famille Martin",
    totalTTC: 105.5,
    date: { seconds: Date.UTC(2026, 7, 15, 12) / 1000 },
    items: [
      { activityTitle: "Stage été", priceHT: 100, priceTTC: 105.5, tva: 5.5 },
    ],
  },
  {
    familyName: "Famille Durand",
    totalTTC: 50,
    date: null,
    items: [
      { activityTitle: "Cotisation", priceHT: 50, priceTTC: 50, tva: 0 },
    ],
  },
];

test("l'en-tête réglementaire reste la première ligne", () => {
  assert.equal(construireFecVentes([]), ENTETE_FEC + "\n");
});

test("une vente avec TVA produit produit, TVA et créance client", () => {
  const lignes = construireFecVentes([paiements[0]]).split("\n");
  assert.equal(lignes.length, 4);
  assert.match(lignes[1], /^VE\tVentes\t1\t20260815\t70611400/);
  assert.match(lignes[1], /Stage été\t\t100\.00/);
  assert.match(lignes[2], /^VE\tVentes\t2\t20260815\t44571/);
  assert.match(lignes[2], /TVA 5\.5%\t\t5\.50/);
  assert.match(lignes[3], /^VE\tVentes\t3\t20260815\t411000/);
  assert.match(lignes[3], /Famille Martin.*105\.50/);
});

test("une ligne sans TVA ne crée pas d'écriture 44571", () => {
  const contenu = construireFecVentes([paiements[1]], new Date(2026, 8, 1, 12));
  assert.doesNotMatch(contenu, /\t44571\t/);
  assert.match(contenu, /20260901/);
});

test("les numéros d'écriture restent continus entre les paiements", () => {
  const numeros = construireFecVentes(paiements, new Date(2026, 8, 1, 12))
    .split("\n")
    .slice(1)
    .map((ligne) => Number(ligne.split("\t")[2]));
  assert.deepEqual(numeros, [1, 2, 3, 4, 5]);
});

test("la référence de pièce est stable par paiement", () => {
  const lignes = construireFecVentes(paiements, new Date(2026, 8, 1, 12)).split("\n");
  assert.ok(lignes.slice(1, 4).every((ligne) => ligne.includes("F2026-001")));
  assert.ok(lignes.slice(4).every((ligne) => ligne.includes("F2026-002")));
});

console.log(`\n✅ ${passes} tests passés\n`);
