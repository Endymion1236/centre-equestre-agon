import assert from "node:assert/strict";
import {
  calculerSyntheseFactures,
  calculerTotauxJournaliers,
  filtrerFacturesPeriode,
} from "../../src/app/admin/comptabilite/synthese-compta-utils";

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

const date = (annee: number, mois: number, jour: number) => ({
  seconds: Date.UTC(annee, mois - 1, jour, 12) / 1000,
});

const factures = [
  {
    id: "payee",
    status: "paid",
    totalTTC: 157.75,
    paymentMode: "cb_terminal",
    date: date(2026, 8, 3),
    items: [
      { priceHT: 100, priceTTC: 105.5, tva: 5.5 },
      { priceHT: 50, priceTTC: 52.25, tva: 5.5 },
    ],
  },
  {
    id: "virement",
    status: "paid",
    totalTTC: 120,
    paymentMode: "virement",
    date: date(2026, 8, 4),
    items: [{ priceHT: 100, priceTTC: 120, tva: 20 }],
  },
  {
    id: "proforma",
    status: "pending",
    totalTTC: 999,
    paymentMode: "cheque",
    date: date(2026, 8, 5),
    items: [],
  },
  {
    id: "autre-mois",
    status: "paid",
    totalTTC: 40,
    paymentMode: "especes",
    date: date(2026, 7, 31),
    items: [],
  },
];

console.log("\n── Factures du journal ──");

test("le journal garde les factures du mois et exclut les proformas", () => {
  assert.deepEqual(
    filtrerFacturesPeriode(factures, "2026-08").map((facture) => facture.id),
    ["payee", "virement"],
  );
});

test("les factures sans date et les brouillons sont exclus", () => {
  assert.deepEqual(
    filtrerFacturesPeriode([
      { status: "draft", paymentMode: "cb_terminal", date: date(2026, 8, 1) },
      { status: "paid", paymentMode: "cb_terminal", date: null },
    ], "2026-08"),
    [],
  );
});

console.log("\n── Totaux et TVA ──");

test("les totaux HT, TVA et TTC additionnent toutes les lignes", () => {
  const selection = filtrerFacturesPeriode(factures, "2026-08");
  const resultat = calculerSyntheseFactures(selection);
  assert.equal(resultat.totalHT, 250);
  assert.equal(resultat.totalTVA, 27.75);
  assert.equal(resultat.totalTTC, 277.75);
});

test("la TVA est regroupée par taux croissant", () => {
  const resultat = calculerSyntheseFactures(filtrerFacturesPeriode(factures, "2026-08"));
  assert.deepEqual(resultat.tvaByRate, [
    ["5.5", { ht: 150, tva: 7.75, ttc: 157.75 }],
    ["20", { ht: 100, tva: 20, ttc: 120 }],
  ]);
});

test("les modes sont classés du montant le plus élevé au plus faible", () => {
  const resultat = calculerSyntheseFactures(filtrerFacturesPeriode(factures, "2026-08"));
  assert.deepEqual(resultat.byMode, [["cb_terminal", 157.75], ["virement", 120]]);
});

console.log("\n── Encaissements journaliers ──");

test("les vrais encaissements sont regroupés par jour et mode", () => {
  const totaux = calculerTotauxJournaliers([
    { montant: 57, mode: "cb_terminal", date: date(2026, 8, 3) },
    { montant: 43, mode: "cb_terminal", date: date(2026, 8, 3) },
    { montant: 20, mode: "especes", date: date(2026, 8, 3) },
    { montant: 30, date: date(2026, 8, 4) },
    { montant: 999, mode: "cheque", date: date(2026, 7, 31) },
  ], "2026-08");

  assert.deepEqual(totaux["03/08/2026"], { cb_terminal: 100, especes: 20 });
  assert.deepEqual(totaux["04/08/2026"], { autre: 30 });
  assert.equal(Object.keys(totaux).length, 2);
});

console.log(`\n✅ ${passes} tests passés\n`);
