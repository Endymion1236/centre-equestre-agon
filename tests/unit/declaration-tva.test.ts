/**
 * tests/unit/declaration-tva.test.ts — la CA3 préparée case par case.
 *   npx tsx tests/unit/declaration-tva.test.ts
 */
import assert from "node:assert/strict";
import { deductibleParNature, type LigneMois } from "../../src/lib/bilan-justificatifs";
import { euroDeclaration, preparerDeclarationTva, tauxDePiece, type PaiementTva } from "../../src/lib/declaration-tva";

let passes = 0;
function test(nom: string, fn: () => void) {
  try { fn(); passes++; console.log(`  ✅ ${nom}`); }
  catch (e: any) { console.error(`  ❌ ${nom}\n     ${e.message}`); process.exitCode = 1; }
}

const sec = (iso: string) => ({ seconds: Math.floor(new Date(iso).getTime() / 1000) });
const caseDe = (r: ReturnType<typeof preparerDeclarationTva>, code: string) => r.cases.find((c) => c.code === code);

// Un forfait de 1 055 € TTC facturé en septembre, réglé en trois fois.
const forfait: PaiementTva = { id: "p1", status: "paid", totalTTC: 1055, date: sec("2026-09-02T10:00:00Z"),
  items: [{ activityTitle: "Forfait annuel", priceHT: 1000, priceTTC: 1055, tva: 5.5 }] };
// Pension 20 % + licence à 0 % sur la même facture.
const pension: PaiementTva = { id: "p2", status: "paid", totalTTC: 290, date: sec("2026-09-05T10:00:00Z"),
  items: [{ activityTitle: "Pension", priceHT: 200, priceTTC: 240, tva: 20 }, { activityTitle: "Licence FFE", priceHT: 50, priceTTC: 50, tva: 0 }] };
const vide = { immobilisations: 0, autresBiensServices: 0 };
const base = { mois: ["2026-09"], payments: [forfait, pension], celeris: {}, moisCeleris: [], deductible: { "2026-09": vide } };

test("à l'encaissement, seul l'acompte reçu porte sa TVA", () => {
  const r = preparerDeclarationTva({ ...base, base: "encaissements",
    encaissements: [{ paymentId: "p1", montant: 351.67, mode: "sepa", date: sec("2026-09-10T10:00:00Z") }] });
  assert.equal(caseDe(r, "09")?.tva, 18.33);
  assert.equal(caseDe(r, "09")?.base, 333.34);
  assert.equal(r.collectee, 18.33);
  assert.equal(caseDe(r, "28")?.tva, 18.33);
});

test("sur factures, toute la facture de septembre compte, quel que soit le paiement", () => {
  const r = preparerDeclarationTva({ ...base, base: "factures", encaissements: [] });
  assert.equal(caseDe(r, "09")?.tva, 55);
  assert.equal(caseDe(r, "08")?.tva, 40);
  assert.equal(caseDe(r, "E2")?.base, 50);
  assert.equal(caseDe(r, "A1")?.base, 1200, "A1 ne reprend que l'imposable");
  assert.equal(r.collectee, 95);
});

test("un encaissement se répartit entre les taux de sa facture, au prorata du TTC", () => {
  const r = preparerDeclarationTva({ ...base, base: "encaissements",
    encaissements: [{ paymentId: "p2", montant: 145, mode: "cheque", date: sec("2026-09-12T10:00:00Z") }] });
  assert.equal(caseDe(r, "08")?.tva, 20);
  assert.equal(caseDe(r, "08")?.base, 100);
  assert.equal(caseDe(r, "E2")?.base, 25);
});

test("un remboursement réduit la TVA ; un avoir utilisé et un versement en banque ne comptent pas", () => {
  const r = preparerDeclarationTva({ ...base, base: "encaissements", encaissements: [
    { paymentId: "p1", montant: 1055, mode: "cb", date: sec("2026-09-03T10:00:00Z") },
    { paymentId: "p1", montant: -211, mode: "cb", date: sec("2026-09-20T10:00:00Z") },
    { paymentId: "p2", montant: 290, mode: "avoir", date: sec("2026-09-21T10:00:00Z") },
    { montant: -500, mode: "especes", isVersementBanque: true, date: sec("2026-09-22T10:00:00Z") },
  ] });
  assert.equal(caseDe(r, "09")?.tva, 44);
  assert.equal(caseDe(r, "08"), undefined);
  assert.deepEqual(r.ecartes.map((e) => [e.nb, e.montant]), [[1, 290]]);
});

test("un encaissement sans facture est écarté et signalé, pas deviné", () => {
  const r = preparerDeclarationTva({ ...base, base: "encaissements",
    encaissements: [{ montant: 30, mode: "especes", date: sec("2026-09-12T10:00:00Z") }] });
  assert.equal(r.collectee, 0);
  assert.equal(r.ecartes[0].montant, 30);
  assert.match(r.ecartes[0].raison, /Sans facture/);
});

test("un encaissement de septembre pour une facture de Céleris n'est pas recompté", () => {
  const juillet: PaiementTva = { ...forfait, id: "p7", date: sec("2026-07-15T10:00:00Z") };
  const r = preparerDeclarationTva({ ...base, payments: [juillet], moisCeleris: ["2026-07", "2026-08"], base: "encaissements",
    encaissements: [{ paymentId: "p7", montant: 1055, mode: "cheque", date: sec("2026-09-04T10:00:00Z") }] });
  assert.equal(r.collectee, 0);
  assert.match(r.ecartes[0].raison, /Céleris/);
});

test("un encaissement du 1er octobre à 0 h 30 (heure de Paris) n'est pas dans septembre", () => {
  const r = preparerDeclarationTva({ ...base, base: "encaissements",
    encaissements: [{ paymentId: "p1", montant: 1055, mode: "cb", date: sec("2026-09-30T22:30:00Z") }] });
  assert.equal(r.collectee, 0);
});

test("mois Céleris : le taux de chaque pièce est retrouvé par TVA / HT", () => {
  const celeris = { "2026-07": [
    { journal: "VTE", compte: "706", piece: "12", date: "2026-07-01", debit: 0, credit: 100000 },
    { journal: "VTE", compte: "4457", piece: "12", date: "2026-07-01", debit: 0, credit: 5500 },
    { journal: "VTE", compte: "411", piece: "12", date: "2026-07-01", debit: 105500, credit: 0 },
    { journal: "VTE", compte: "7061", piece: "13", date: "2026-07-02", debit: 0, credit: 20000 },
    { journal: "VTE", compte: "4457", piece: "13", date: "2026-07-02", debit: 0, credit: 4000 },
    // Pièce mêlant 5,5 % et 20 % : le rapport ne correspond à aucun taux.
    { journal: "VTE", compte: "706", piece: "14", date: "2026-07-03", debit: 0, credit: 20000 },
    { journal: "VTE", compte: "4457", piece: "14", date: "2026-07-03", debit: 0, credit: 2550 },
    { journal: "BQ", compte: "512", piece: "B1", date: "2026-07-03", debit: 99999, credit: 0 },
  ] };
  const r = preparerDeclarationTva({ mois: ["2026-07"], base: "encaissements", payments: [], encaissements: [], celeris, moisCeleris: ["2026-07"], deductible: { "2026-07": vide } });
  assert.equal(r.sources[0].source, "celeris");
  assert.equal(caseDe(r, "09")?.tva, 55);
  assert.equal(caseDe(r, "08")?.tva, 40);
  assert.equal(r.tauxMixte.pieces, 1);
  assert.equal(r.collectee, 120.5, "la TVA des pièces mêlées reste dans le total");
  assert.equal(caseDe(r, "A1")?.base, 1400);
});

test("tauxDePiece tolère les centimes d'arrondi", () => {
  assert.equal(tauxDePiece(379, 21), 5.5);
  assert.equal(tauxDePiece(10000, 2000), 20);
  assert.equal(tauxDePiece(10000, 1000), 10);
  assert.equal(tauxDePiece(5000, 0), 0);
  assert.equal(tauxDePiece(20000, 2550), null);
});

test("déductible : immobilisations en 19, le reste en 20, crédit antérieur en 22, crédit en 25", () => {
  const r = preparerDeclarationTva({ ...base, base: "encaissements",
    encaissements: [{ paymentId: "p2", montant: 290, mode: "cb", date: sec("2026-09-12T10:00:00Z") }],
    deductible: { "2026-09": { immobilisations: 100, autresBiensServices: 30.5 } }, creditAnterieur: 12 });
  assert.equal(caseDe(r, "19")?.tva, 100);
  assert.equal(caseDe(r, "20")?.tva, 30.5);
  assert.equal(caseDe(r, "22")?.tva, 12);
  assert.equal(caseDe(r, "23")?.tva, 142.5);
  assert.equal(caseDe(r, "25")?.tva, 102.5);
  assert.equal(r.netteDue, 0);
  assert.equal(caseDe(r, "28"), undefined);
});

test("trimestre : les mois s'additionnent, un mois d'achats illisible est signalé", () => {
  const r = preparerDeclarationTva({ ...base, mois: ["2026-09", "2026-10"], base: "factures", encaissements: [],
    deductible: { "2026-09": { immobilisations: 0, autresBiensServices: 10 }, "2026-10": null } });
  assert.deepEqual(r.moisSansAchats, ["2026-10"]);
  assert.ok(r.anomalies.some((a) => /partielle/.test(a)));
  assert.equal(caseDe(r, "28")?.tva, 85);
});

test("un taux 0 n'est jamais transformé en 5,5 %", () => {
  const licence: PaiementTva = { id: "l", status: "paid", totalTTC: 50, date: sec("2026-09-05T10:00:00Z"), items: [{ priceHT: 50, priceTTC: 50, tva: 0 }] };
  const r = preparerDeclarationTva({ ...base, payments: [licence], base: "encaissements",
    encaissements: [{ paymentId: "l", montant: 50, mode: "cb", date: sec("2026-09-06T10:00:00Z") }] });
  assert.equal(r.collectee, 0);
  assert.equal(caseDe(r, "E2")?.base, 50);
});

test("montants de la CA3 en euros entiers", () => {
  assert.equal(euroDeclaration(18.33), 18);
  assert.equal(euroDeclaration(18.5), 19);
  assert.equal(euroDeclaration(undefined), 0);
});

test("deductibleParNature : une immobilisation justifiée va en ligne 19", () => {
  const facture = { id: "f", extraction: { typeDocument: "achat", devise: "EUR", ht: 300, tva: 60, ttc: 360, numero: "F360" } };
  const tracteur: LigneMois = { id: "t", mois: "2026-09", dateOperation: "2026-09-01", montant: 360, suivie: true, immobilisation: true, piece: facture } as any;
  const foin: LigneMois = { id: "h", mois: "2026-09", dateOperation: "2026-09-02", montant: 120, suivie: true, fournisseur: "Foin", piece: { ...facture, id: "g", extraction: { ...facture.extraction, ht: 100, tva: 20, ttc: 120, numero: "F120" } } } as any;
  assert.deepEqual(deductibleParNature([tracteur, foin]), { immobilisations: 60, autresBiensServices: 20 });
});

console.log(`\n${process.exitCode ? "❌" : "✅"} ${passes} tests passés`);
