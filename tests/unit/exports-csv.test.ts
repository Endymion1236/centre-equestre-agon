import assert from "node:assert/strict";
import { construireExportComptable } from "../../src/app/admin/comptabilite/exports-csv-utils";

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

const date = { seconds: Date.UTC(2026, 7, 3, 12) / 1000 };
const paiements = [
  {
    familyName: "Famille Martin",
    totalTTC: 105.5,
    paidAmount: 60,
    paymentMode: "cb_terminal",
    paymentRef: "TPE-42",
    date,
    items: [
      { activityTitle: "Stage été", priceHT: 100, priceTTC: 105.5, tva: 5.5 },
    ],
  },
  {
    familyName: "Famille Martin",
    totalTTC: 50,
    paidAmount: 0,
    paymentMode: "cheque",
    date: null,
    items: [],
  },
];

console.log("\n── Exports CSV comptables ──");

test("le journal des ventes reprend le détail HT, TVA et TTC", () => {
  assert.equal(
    construireExportComptable("ventes", [paiements[0]], paiements),
    [
      "Date;Client;Article;HT;TVA%;TVA;TTC;Mode",
      "03/08/2026;Famille Martin;Stage été;100.00;5.5;5.50;105.50;cb_terminal",
      "",
    ].join("\n"),
  );
});

test("le journal des règlements conserve référence et date vide", () => {
  assert.equal(
    construireExportComptable("reglements", paiements, paiements),
    [
      "Date;Client;Montant;Mode;Référence",
      "03/08/2026;Famille Martin;105.50;cb_terminal;TPE-42",
      ";Famille Martin;50.00;cheque;",
      "",
    ].join("\n"),
  );
});

test("la balance clients agrège facturé, payé et solde", () => {
  assert.equal(
    construireExportComptable("clients", [paiements[0]], paiements),
    [
      "Client;Total facturé;Total payé;Solde dû",
      "Famille Martin;155.50;110.00;45.50",
      "",
    ].join("\n"),
  );
});

test("les exports de période n'utilisent pas les paiements hors sélection", () => {
  const csv = construireExportComptable("ventes", [paiements[0]], paiements);
  assert.doesNotMatch(csv, /50\.00;cheque/);
});

console.log(`\n✅ ${passes} tests passés\n`);
