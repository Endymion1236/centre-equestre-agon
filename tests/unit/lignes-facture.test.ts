import assert from "node:assert/strict";
import { ecartLignes, lignesAuTotal, lignesPourPdf } from "../../src/lib/lignes-facture";
import { aplatirLignesFactures, facturesEnEcart, resumerExportCa } from "../../src/app/admin/comptabilite/export-ca/export-ca-utils";
import { ventiler, NON_VENTILE } from "../../src/lib/ventilation-comptable";

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

const somme = (ls: any[]) => Math.round(ls.reduce((s, l) => s + (Number(l.priceTTC) || 0), 0) * 100) / 100;

// Le cas de septembre 2026 : forfait 699 € en 10× depuis le planning.
const premiere = {
  id: "e1", familyName: "LECONTE", totalTTC: 69.9, echeance: 1, echeancesTotal: 10,
  items: [
    { activityTitle: "Forfait annuel", priceTTC: 615, priceHT: 582.94, tva: 5.5 },
    { activityTitle: "Licence FFE", priceTTC: 25, priceHT: 25, tva: 0 },
    { activityTitle: "Adhésion", priceTTC: 59, priceHT: 59, tva: 0 },
  ],
};
const suivante = { id: "e2", familyName: "LECONTE", totalTTC: 69.9, echeance: 2, echeancesTotal: 10, items: [{ activityTitle: "Échéance 2/10", priceTTC: 69.9, priceHT: 66.26, tva: 5.5 }] };

test("1re échéance d'un 10× : les lignes du forfait ramenées à 69,90 €, dans les mêmes proportions", () => {
  const l = lignesAuTotal(premiere);
  assert.equal(somme(l), 69.9);
  assert.equal(l[0].priceTTC, 61.5);          // 615/699 × 69,90
  assert.equal(l[1].priceTTC, 2.5);
  assert.equal(l[2].priceTTC, 5.9);
  assert.equal(l[0].priceHT, 58.29);          // recalculé depuis le taux
  assert.equal(l[1].priceHT, 2.5);            // taux 0 : HT = TTC
  assert.equal(ecartLignes(premiere), -629.1);
});

test("facture déjà juste, ou sans ligne chiffrée : lignes inchangées", () => {
  assert.deepEqual(lignesAuTotal(suivante).map(l => l.priceTTC), [69.9]);
  const vide = { totalTTC: 50, items: [{ label: "Forfait", amount: 50 }] };
  assert.equal(somme(lignesAuTotal(vide)), 0, "un `amount` sans taux n'est pas lu");
});

test("remise sur la facture entière : répartie au centime près, la somme tombe juste", () => {
  const f = { totalTTC: 100, items: [{ priceTTC: 33.33, tva: 5.5 }, { priceTTC: 33.33, tva: 5.5 }, { priceTTC: 33.34, tva: 20 }].map(x => ({ ...x, priceTTC: x.priceTTC * 1.1 })) };
  assert.equal(somme(lignesAuTotal(f)), 100);
});

test("export du CA : ventilation = total des factures, écart nul ; la facture est listée", () => {
  const factures = [premiere, suivante];
  const ventilation = ventiler(aplatirLignesFactures(factures) as any);
  const r = resumerExportCa(factures, ventilation, NON_VENTILE);
  assert.equal(r.totalFactures, 139.8);
  assert.equal(r.totalTTC, 139.8);
  assert.equal(r.ecart, 0);
  const liste = facturesEnEcart(factures);
  assert.equal(liste.length, 1);
  assert.ok(liste[0].cause.includes("1re échéance"), liste[0].cause);
  assert.equal(liste[0].lignesTTC, 699);
});

test("PDF de la 1re échéance d'un forfait en 3× : lignes au prorata, TVA positive, libellés gardés", () => {
  // Cas de Rachel TREBERT (F-2026-0222) : 60 + 40 + 610 = 710 € de lignes pour 236,67 €.
  const facture = {
    totalTTC: 236.67, totalHT: 675.07, totalTVA: -438.4,
    items: [
      { label: "Adhésion annuelle (enfant 1)", priceHT: 56.87, tva: 5.5, priceTTC: 60 },
      { label: "Licence FFE +18ans", priceHT: 40, tva: 0, priceTTC: 40 },
      { label: "Forfait Adultes G1 à G4", priceHT: 578.2, tva: 5.5, priceTTC: 610 },
    ],
  };
  const r = lignesPourPdf(facture);
  assert.equal(Math.round(r.items.reduce((s, l) => s + l.priceTTC, 0) * 100) / 100, 236.67);
  assert.deepEqual(r.items.map((l) => l.priceTTC), [20, 13.33, 203.34]);
  assert.equal(r.items[0].activityTitle, "Adhésion annuelle (enfant 1)");
  assert.equal(r.items[1].priceHT, 13.33, "la licence reste à 0 %");
  assert.ok(r.totalTVA > 0 && r.totalTVA < 12, `TVA ${r.totalTVA}`);
  assert.equal(Math.round((r.totalHT + r.totalTVA) * 100) / 100, 236.67);
  assert.equal(r.totalLignesOrigine, 710);
});

test("PDF d'une facture ordinaire : totaux transmis gardés, pas de mention de prorata", () => {
  const r = lignesPourPdf({ totalTTC: 60, totalHT: 56.87, totalTVA: 3.13, items: [{ activityTitle: "Adhésion", priceHT: 56.87, tva: 5.5, priceTTC: 60 }] });
  assert.equal(r.totalHT, 56.87);
  assert.equal(r.totalTVA, 3.13);
  assert.equal(r.totalLignesOrigine, null);
});

console.log(`\n✅ ${passes} tests passés\n`);
