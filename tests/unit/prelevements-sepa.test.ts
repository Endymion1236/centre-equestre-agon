import assert from "node:assert/strict";
import { grouperPrelevementsSepa } from "../../src/app/admin/paiements/prelevements-sepa-utils";

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

const today = "2026-09-28";
const e = (id: string, extra: Record<string, any>) => ({ id, familyId: "f1", familyName: "DUHEM Julie", status: "pending", montant: 100, ...extra });

test("forfait en 2× sur deux mandats : une famille, 4 lignes triées, 2 mandats", () => {
  const { familles, stats } = grouperPrelevementsSepa([
    e("a2", { dateEcheance: "2026-11-05", mandatId: "M1" }),
    e("a1", { dateEcheance: "2026-10-05", mandatId: "M1" }),
    e("b1", { dateEcheance: "2026-10-05", mandatId: "M2" }),
    e("b2", { dateEcheance: "2026-11-05", mandatId: "M2" }),
  ], { today });
  assert.equal(familles.length, 1);
  assert.equal(familles[0].lignes.length, 4);
  assert.equal(familles[0].prochaineDate, "2026-10-05");
  assert.equal(familles[0].total, 400);
  assert.equal(familles[0].mandats.length, 2);
  assert.equal(stats.total, 400);
  assert.equal(stats.countCeMois, 0);
});

test("date passée sans remise : signalée ; en remise : non", () => {
  const { familles, stats } = grouperPrelevementsSepa([
    e("x", { dateEcheance: "2026-09-05" }),
    e("y", { dateEcheance: "2026-09-10", status: "remis" }),
  ], { today });
  assert.equal(familles[0].nbNonRemis, 1);
  assert.equal(stats.countNonRemis, 1);
  assert.equal(stats.totalNonRemis, 100);
  assert.equal(stats.countCeMois, 2);
});

test("prélevés et rejetés : absents ; recherche par nom ; oubliés de remise en tête", () => {
  const { familles, stats } = grouperPrelevementsSepa([
    e("p", { status: "preleve", dateEcheance: "2026-09-05" }),
    e("r", { status: "rejete", dateEcheance: "2026-09-05" }),
    e("a", { familyId: "f2", familyName: "CONIGLIO Marion", dateEcheance: "2026-10-01" }),
    e("b", { familyId: "f3", familyName: "MARTIN Paul", dateEcheance: "2026-09-01" }),
  ], { today });
  assert.equal(stats.nbFamilles, 2);
  assert.deepEqual(familles.map(f => f.familyName), ["MARTIN Paul", "CONIGLIO Marion"]);
  assert.deepEqual(
    grouperPrelevementsSepa([e("a", { familyName: "CONIGLIO Marion", dateEcheance: "2026-10-01" })], { today, search: "conig" }).familles.length, 1);
  assert.equal(
    grouperPrelevementsSepa([e("a", { familyName: "CONIGLIO Marion", dateEcheance: "2026-10-01" })], { today, search: "duhem" }).familles.length, 0);
});

console.log(`\n✅ ${passes} tests passés\n`);
