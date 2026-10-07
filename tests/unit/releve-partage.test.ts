/**
 * tests/unit/releve-partage.test.ts — le CSV des dépenses passé au rapprochement des recettes.
 *   npx tsx tests/unit/releve-partage.test.ts
 */
import assert from "node:assert/strict";
import { deballerReleve, emballerReleve, resumeCreditsReleve } from "../../src/app/admin/comptabilite/releve-partage";

let passes = 0;
function test(nom: string, fn: () => void) {
  try { fn(); passes++; console.log(`  ✅ ${nom}`); }
  catch (e: any) { console.error(`  ❌ ${nom}\n     ${e.message}`); process.exitCode = 1; }
}

const csv = [
  "Liste des operations du compte entre le 28/09/2026 et le 06/10/2026",
  "Date;Libellé;Débit euros;Crédit euros",
  "30/09/2026;REMISE CARTE TPE AGON;;250,00",
  "01/10/2026;REMISE CARTE TPE AGON;;1 234,56",
  "02/10/2026;VIR SEPA FAMILLE DURAND;;57,00",
  "02/10/2026;PRLV ATOUT CRINS;89,90;",
  "03/10/2026;FRAIS BANCAIRES;12,50;",
].join("\n");

test("les crédits du fichier, et le mois qui en porte le plus", () => {
  assert.deepEqual(resumeCreditsReleve(csv), { credits: 3, totalCentimes: 154156, mois: "2026-10" });
});

test("un fichier sans crédit, ou illisible : rien à rapprocher", () => {
  assert.deepEqual(resumeCreditsReleve("Date;Libellé;Débit euros;Crédit euros\n02/10/2026;PRLV;10,00;"), { credits: 0, totalCentimes: 0, mois: null });
  assert.equal(resumeCreditsReleve("n'importe quoi").credits, 0);
});

test("le relevé déposé est repris s'il est récent et complet", () => {
  const t0 = 1_800_000_000_000;
  const brut = emballerReleve(csv, "releve.csv", "2026-10", t0);
  assert.deepEqual(deballerReleve(brut, t0 + 5 * 60_000), { texte: csv, nom: "releve.csv", mois: "2026-10", deposeLe: t0 });
  assert.equal(deballerReleve(brut, t0 + 2 * 3600_000), null, "oublié depuis deux heures : pas repris");
  assert.equal(deballerReleve(null), null);
  assert.equal(deballerReleve("{abîmé"), null);
  assert.equal(deballerReleve(emballerReleve("", "x", "2026-10", t0), t0), null);
  assert.equal(deballerReleve(emballerReleve(csv, "x", "octobre", t0), t0), null);
});

console.log(`\n${process.exitCode ? "❌" : "✅"} ${passes} tests passés`);
