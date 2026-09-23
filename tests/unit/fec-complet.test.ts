/**
 * tests/unit/fec-complet.test.ts — le FEC mensuel du cabinet : ventes et règlements.
 *   npx tsx tests/unit/fec-complet.test.ts
 */
import assert from "node:assert/strict";
import { construireFecComplet, nomFichierFec } from "../../src/lib/fec-complet";
import { ENTETE_FEC } from "../../src/app/admin/comptabilite/fec-utils";

let passes = 0;
function test(nom: string, fn: () => void) {
  try { fn(); passes++; console.log(`  ✅ ${nom}`); }
  catch (e: any) { console.error(`  ❌ ${nom}\n     ${e.message}`); process.exitCode = 1; }
}

const sec = (iso: string) => ({ seconds: Math.floor(new Date(iso).getTime() / 1000) });
const factures = [
  { familyName: "Enaux", invoiceNumber: "F-2026-0101", totalTTC: 316.5, date: sec("2026-09-01T10:00:00Z"),
    items: [
      { activityTitle: "Pension Dalhia", priceHT: 300, priceTTC: 316.5, tva: 5.5 },
    ] },
  { familyName: "Martin", invoiceNumber: "F-2026-0102", totalTTC: 107, date: sec("2026-09-03T10:00:00Z"),
    items: [
      { activityTitle: "Forfait annuel", priceHT: 54.03, priceTTC: 57, tva: 5.5 },
      { activityTitle: "Licence FFE", priceHT: 50, priceTTC: 50, tva: 0 },
    ] },
  { familyName: "Durand", invoiceNumber: "F-2026-0103", totalTTC: 20, date: sec("2026-09-04T10:00:00Z"),
    items: [{ activityTitle: "Truc mystère", priceHT: 16.67, priceTTC: 20, tva: 20 }] },
];
const encaissements = [
  { id: "e1", paymentId: "p1", familyName: "Enaux", montant: 316.5, mode: "virement", modeLabel: "Virement", date: sec("2026-09-01T10:00:00Z") },
  { id: "e2", paymentId: "p2", familyName: "Martin", montant: 107, mode: "cheque", modeLabel: "Chèque", date: sec("2026-09-03T10:00:00Z") },
  { id: "e3", paymentId: "p2", familyName: "Martin", montant: -7, mode: "cheque", modeLabel: "Chèque", correctionDe: "e2", date: sec("2026-09-05T10:00:00Z") },
  { id: "e4", familyName: "—", montant: -150, mode: "especes", isVersementBanque: true, date: sec("2026-09-06T10:00:00Z") },
  { id: "e5", paymentId: "p3", familyName: "Durand", montant: 20, mode: "troc", date: sec("2026-09-07T10:00:00Z") },
];
const numeros: Record<string, string> = { p1: "F-2026-0101", p2: "F-2026-0102" };
const fec = construireFecComplet({ factures, encaissements, numeroFactureDe: (id) => numeros[id], maintenant: new Date("2026-10-01") });
// Pas de trim() : il couperait les colonnes vides en fin de dernière ligne.
const lignes = fec.contenu.split("\n").filter(Boolean);
const cols = (l: string) => l.split("\t");

console.log("\n── Format ──");
test("en-tête réglementaire, 18 colonnes partout", () => {
  assert.equal(lignes[0], ENTETE_FEC);
  for (const l of lignes) assert.equal(cols(l).length, 18, l);
});

test("chaque écriture est équilibrée, numéros continus sur tout le fichier", () => {
  const parNum = new Map<string, number>();
  for (const l of lignes.slice(1)) {
    const c = cols(l);
    parNum.set(c[2], (parNum.get(c[2]) || 0) + Math.round(Number(c[11] || 0) * 100) - Math.round(Number(c[12] || 0) * 100));
  }
  for (const [n, solde] of parNum) assert.equal(solde, 0, `écriture ${n}`);
  assert.deepEqual([...parNum.keys()].map(Number), [1, 2, 3, 4, 5, 6, 7, 8]);
});

console.log("\n── Ventes ──");
test("chaque ligne sur son compte de produit, la TVA par taux, la créance client", () => {
  const ve = lignes.filter((l) => cols(l)[0] === "VE");
  const comptes = ve.map((l) => cols(l)[4]);
  assert.ok(comptes.includes("70630110"), "pension");
  assert.ok(comptes.includes("70611000"), "forfait");
  assert.ok(comptes.includes("70100000"), "licence");
  assert.ok(comptes.includes("44571200"), "TVA 5,5 %");
  assert.ok(comptes.includes("41100000"), "client");
  assert.equal(ve.find((l) => cols(l)[4] === "70630110")!.split("\t")[8], "F-2026-0101", "pièce = numéro de facture");
});

test("une prestation non reconnue part au compte d'attente, et c'est signalé", () => {
  assert.ok(lignes.some((l) => cols(l)[0] === "VE" && cols(l)[4] === "47100000"));
  assert.ok(fec.anomalies.some((a) => /Truc mystère/.test(a)));
});

console.log("\n── Règlements ──");
test("virement : banque au débit, client au crédit, pièce = facture", () => {
  const rg = lignes.filter((l) => cols(l)[0] === "RG" && cols(l)[8] === "F-2026-0101");
  assert.deepEqual(rg.map((l) => [cols(l)[4], cols(l)[11], cols(l)[12]]), [["51200000", "316.50", ""], ["41100000", "", "316.50"]]);
  assert.equal(cols(rg[1])[6], "Enaux", "compte auxiliaire du client");
});

test("chèque au 51120000 ; une contre-passation inverse les sens", () => {
  const rg = lignes.filter((l) => cols(l)[0] === "RG" && cols(l)[8] === "F-2026-0102");
  assert.deepEqual(rg.map((l) => [cols(l)[4], cols(l)[11], cols(l)[12]]), [
    ["51120000", "107.00", ""], ["41100000", "", "107.00"],
    ["41100000", "7.00", ""], ["51120000", "", "7.00"],
  ]);
  assert.match(cols(rg[2])[10], /^Contre-passation/);
});

test("versement d'espèces en banque : banque au débit, caisse au crédit, sans client", () => {
  const v = lignes.filter((l) => /Versement d'espèces/.test(cols(l)[10]));
  assert.deepEqual(v.map((l) => [cols(l)[4], cols(l)[11], cols(l)[12], cols(l)[6]]), [["51200000", "150.00", "", ""], ["53000000", "", "150.00", ""]]);
});

test("mode inconnu : compte d'attente, signalé ; comptes à confirmer listés", () => {
  assert.ok(fec.anomalies.some((a) => /troc/.test(a)));
  const aConfirmer = fec.resume.comptesAConfirmer.map((c) => c.compte).sort();
  assert.deepEqual(aConfirmer, ["51120000", "53000000"]);
});

test("résumé : écritures et totaux", () => {
  assert.equal(fec.resume.ventes.ecritures, 3);
  assert.equal(fec.resume.reglements.ecritures, 5);
  assert.equal(fec.resume.reglements.total, 436.5);
});

console.log("\n── Nom du fichier ──");
test("SIREN + FEC + fin de mois ; sans SIREN, un nom par mois", () => {
  assert.equal(nomFichierFec("50756918400017", "2026-09"), "507569184FEC20260930.txt");
  assert.equal(nomFichierFec("50756918400017", "2027-02"), "507569184FEC20270228.txt");
  assert.equal(nomFichierFec("", "2026-09"), "FEC_202609.txt");
});

console.log(`\n✅ ${passes} tests passés\n`);
