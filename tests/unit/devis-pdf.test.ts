/**
 * tests/unit/devis-pdf.test.ts — le PDF joint à l'email d'un devis.
 *   npx tsx tests/unit/devis-pdf.test.ts
 */
import assert from "node:assert/strict";
import { dateDevisFr, paramsPdfDevis, ttcLigneDevis } from "../../src/app/admin/devis/devis-pdf";

let passes = 0;
function test(nom: string, fn: () => void) {
  try { fn(); passes++; console.log(`  ✅ ${nom}`); }
  catch (e: any) { console.error(`  ❌ ${nom}\n     ${e.message}`); process.exitCode = 1; }
}

const devis = {
  numero: "DEV-2026-0042", familyName: "Mairie de Blainville", familyEmail: "accueil@exemple.fr", serviceFacture: "ALSH",
  totalTTC: 0, validUntil: "2026-11-05",
  items: [
    { label: "Stage journée", description: "Lundi 26 octobre", qty: 3, priceTTC: 45, tva: 5.5 },
    { label: "Licence FFE -18 ans", qty: 1, priceTTC: 25, tva: 0 },
    { label: "Forfait annuel", qty: 1, priceTTC: 650, tva: 5.5, remisePct: 10 },
    { label: "  ", qty: 1, priceTTC: 0, tva: 5.5 },
  ],
};

test("c'est un devis, avec sa validité, sans rien à régler", () => {
  const p = paramsPdfDevis(devis, "1 rue de la Mer, 50230 Agon", "06/10/2026");
  assert.equal(p.documentType, "devis");
  assert.equal(p.invoiceNumber, "DEV-2026-0042");
  assert.equal(p.validUntil, "05/11/2026");
  assert.equal(p.paidAmount, 0);
  assert.equal(p.paymentId, undefined, "pas de lien vers un paiement : ni QR, ni IBAN");
  assert.equal(p.serviceFacture, "ALSH");
  assert.equal(p.familyAddress, "1 rue de la Mer, 50230 Agon");
});

test("lignes : total TTC remise comprise, la ligne vide est écartée", () => {
  const p = paramsPdfDevis(devis, "", "06/10/2026");
  assert.equal(p.items.length, 3);
  assert.deepEqual(p.items.map((i: any) => i.priceTTC), [135, 25, 585]);
  assert.equal(p.totalTTC, 745);
  assert.equal(p.items[0].sousTitre, "Lundi 26 octobre");
  assert.equal(p.items[0].quantity, 3);
  assert.equal(p.items[0].puHT, 42.65);
  assert.equal(p.items[0].remise, 0, "pas de remise fantôme due aux arrondis");
  assert.equal(p.items[2].remise, 61.61);
});

test("TVA à 0 % gardée (licence), HT et TVA cohérents avec le TTC", () => {
  const p = paramsPdfDevis(devis, "", "06/10/2026");
  assert.equal(p.items[1].tva, 0);
  assert.equal(p.items[1].priceHT, 25);
  assert.equal(Math.round((p.totalHT + p.totalTVA) * 100) / 100, p.totalTTC);
});

test("calculs de base", () => {
  assert.equal(ttcLigneDevis({ label: "x", qty: 2, priceTTC: 10.005, remisePct: 0 }), 20.01);
  assert.equal(dateDevisFr(undefined), "");
  assert.equal(dateDevisFr("2027-01-01"), "01/01/2027");
});

console.log(`\n${process.exitCode ? "❌" : "✅"} ${passes} tests passés`);
