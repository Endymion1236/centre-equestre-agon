import assert from "node:assert/strict";
import { ecartLignes, lignesAuTotal } from "../../src/lib/lignes-facture";
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

console.log(`\n✅ ${passes} tests passés\n`);
