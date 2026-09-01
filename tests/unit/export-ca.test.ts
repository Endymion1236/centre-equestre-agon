import assert from "node:assert/strict";
import {
  aplatirLignesFactures,
  dateFacture,
  filtrerFacturesExport,
  libellePeriodeExport,
  resumerExportCa,
  suffixeFichierExport,
} from "../../src/app/admin/comptabilite/export-ca/export-ca-utils";

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

console.log("\n── Dates et filtres ──");

test("les dates Firestore et ISO sont reconnues", () => {
  assert.equal(dateFacture({ date: { seconds: 1785542400 } })?.getUTCFullYear(), 2026);
  assert.equal(dateFacture({ date: "2026-08-15T12:00:00Z" })?.getUTCMonth(), 7);
  assert.equal(dateFacture({ date: "invalide" }), null);
});

const payments = [
  { id: "ok", date: "2026-08-10T10:00:00Z", totalTTC: 100, paidAmount: 100, items: [{ priceTTC: 100 }] },
  { id: "unpaid", date: "2026-08-11T10:00:00Z", totalTTC: 50, paidAmount: 0, items: [{ priceTTC: 50 }] },
  { id: "cancel", date: "2026-08-12T10:00:00Z", status: "cancelled", totalTTC: 20, paidAmount: 20 },
  { id: "otherMonth", date: "2026-09-01T10:00:00Z", totalTTC: 30, paidAmount: 30 },
  { id: "otherYear", date: "2025-08-01T10:00:00Z", totalTTC: 40, paidAmount: 40 },
];

test("les factures annulées et hors période sont exclues", () => {
  assert.deepEqual(
    filtrerFacturesExport(payments, 2026, 7, true).map((p) => p.id),
    ["ok", "unpaid"],
  );
});

test("les non réglées peuvent être exclues", () => {
  assert.deepEqual(
    filtrerFacturesExport(payments, 2026, 7, false).map((p) => p.id),
    ["ok"],
  );
});

test("l'année entière conserve tous les mois de l'année", () => {
  assert.deepEqual(
    filtrerFacturesExport(payments, 2026, "all", true).map((p) => p.id),
    ["ok", "unpaid", "otherMonth"],
  );
});

console.log("\n── Lignes et synthèse ──");

test("les lignes sont aplaties avec leur facture d'origine", () => {
  const lignes = aplatirLignesFactures([
    { id: "f1", items: [{ label: "a" }, { label: "b" }] },
    { id: "f2", items: [{ label: "c" }] },
  ]);
  assert.equal(lignes.length, 3);
  assert.equal(lignes[1].facture.id, "f1");
  assert.equal(lignes[2].facture.id, "f2");
});

test("la synthèse calcule HT, TTC, non ventilé et écart de facture", () => {
  const resume = resumerExportCa(
    [{ totalTTC: 120 }, { totalTTC: 80 }],
    [
      { compte: "706", ht: 90.91, ttc: 100 },
      { compte: "NON", ht: 72.73, ttc: 80 },
    ],
    "NON",
  );
  assert.equal(resume.totalTTC, 180);
  assert.equal(resume.totalHT, 163.64);
  assert.equal(resume.totalNonVentile, 80);
  assert.equal(resume.totalFactures, 200);
  assert.equal(resume.ecart, 20);
});

console.log("\n── Libellés ──");

test("les libellés et suffixes de période restent stables", () => {
  assert.equal(libellePeriodeExport(2026, "all"), "2026");
  assert.equal(libellePeriodeExport(2026, 7), "août 2026");
  assert.equal(suffixeFichierExport(2026, "all"), "2026");
  assert.equal(suffixeFichierExport(2026, 7), "2026-08");
});

console.log(`\n✅ ${passes} tests passés\n`);
