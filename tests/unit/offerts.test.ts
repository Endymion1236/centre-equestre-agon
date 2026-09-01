import assert from "node:assert/strict";
import {
  resumerOfferts,
  trierOffertsRecents,
  valeurOfferte,
  type OffertPaymentLike,
} from "../../src/app/admin/paiements/offerts-utils";

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

const payments: OffertPaymentLike[] = [
  {
    id: "essai",
    isFree: true,
    freeReason: "Essai",
    date: { seconds: 10 },
    items: [{ originalPriceTTC: 25 }, { originalPriceTTC: 15 }],
  },
  {
    id: "rattrapage",
    isFree: true,
    freeReason: "Rattrapage",
    date: { seconds: 30 },
    items: [{ originalPriceTTC: 35 }],
  },
  {
    id: "geste",
    isFree: true,
    freeReason: "Geste commercial",
    date: { seconds: 20 },
    items: [{ originalPriceTTC: 50 }],
  },
  {
    id: "paye",
    isFree: false,
    date: { seconds: 40 },
    items: [{ originalPriceTTC: 999 }],
  },
];

console.log("\n── Valeur des séances offertes ──");

test("la valeur additionne les prix d'origine des lignes", () => {
  assert.equal(valeurOfferte(payments[0]), 40);
});

test("une ligne sans prix d'origine vaut zéro", () => {
  assert.equal(valeurOfferte({ items: [{ activityTitle: "Sans prix" }] }), 0);
});

console.log("\n── Résumé ──");

test("seuls les paiements réellement gratuits entrent dans l'onglet", () => {
  const resume = resumerOfferts(payments);
  assert.deepEqual(resume.gratuits.map((p) => p.id), ["essai", "rattrapage", "geste"]);
});

test("le manque à gagner exclut les rattrapages", () => {
  const resume = resumerOfferts(payments);
  assert.deepEqual(resume.valorises.map((p) => p.id), ["essai", "geste"]);
  assert.deepEqual(resume.nonValorises.map((p) => p.id), ["rattrapage"]);
  assert.equal(resume.totalValeur, 90);
});

console.log("\n── Tri ──");

test("le tri met les séances les plus récentes en premier sans muter l'entrée", () => {
  const source = [...payments];
  const sorted = trierOffertsRecents(source);
  assert.deepEqual(sorted.map((p) => p.id), ["paye", "rattrapage", "geste", "essai"]);
  assert.deepEqual(source.map((p) => p.id), ["essai", "rattrapage", "geste", "paye"]);
});

console.log(`\n✅ ${passes} tests passés\n`);
