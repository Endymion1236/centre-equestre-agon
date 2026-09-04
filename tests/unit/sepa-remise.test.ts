/**
 * tests/unit/sepa-remise.test.ts
 *
 * Ce qu'une remise SEPA déposée fait à la commande, et la répartition d'un
 * échéancier entre deux mandats (père / mère).
 *   npx tsx tests/unit/sepa-remise.test.ts
 *
 * Régression figée : un forfait de 650 € réglé 325 € par chèque du père et
 * 10 × 32,50 € sur le compte de la mère perdait sa moitié chèque à chaque
 * remise, puis finissait « payé » avec 325 € réglés.
 */
import assert from "node:assert/strict";
import { etatCommandeApresRemise, montantsEcheances, repartirEntreDeuxMandats } from "../../src/lib/sepa-remise";

let passes = 0;
function test(nom: string, fn: () => void) {
  try { fn(); passes++; console.log(`  ✅ ${nom}`); }
  catch (e: any) { console.error(`  ❌ ${nom}\n     ${e.message}`); process.exitCode = 1; }
}

console.log("\n── Commande après remise ──");

test("chèque du père + première échéance de la mère : partiel, planifié en SEPA, rien de perdu", () => {
  const e = etatCommandeApresRemise({ totalTTC: 650, totalEncaisse: 325 + 32.5, echeancesRestantes: 9 });
  assert.equal(e.status, "sepa_scheduled");
  assert.equal(e.paidAmount, 357.5);
});

test("dernière échéance prélevée : payée, au montant total", () => {
  const e = etatCommandeApresRemise({ totalTTC: 650, totalEncaisse: 650, echeancesRestantes: 0 });
  assert.deepEqual(e, { status: "paid", paidAmount: 650 });
});

test("un rejet contre-passé fait redescendre le montant, la commande reste planifiée s'il reste des échéances", () => {
  const e = etatCommandeApresRemise({ totalTTC: 650, totalEncaisse: 325 + 32.5 - 32.5, echeancesRestantes: 10 });
  assert.equal(e.status, "sepa_scheduled");
  assert.equal(e.paidAmount, 325);
});

test("plus rien de prévu et pas tout réglé : partiel ; rien reçu : en attente", () => {
  assert.equal(etatCommandeApresRemise({ totalTTC: 650, totalEncaisse: 325, echeancesRestantes: 0 }).status, "partial");
  assert.equal(etatCommandeApresRemise({ totalTTC: 650, totalEncaisse: 0, echeancesRestantes: 0 }).status, "pending");
});

test("tolérance du centime", () => {
  assert.equal(etatCommandeApresRemise({ totalTTC: 650, totalEncaisse: 649.995, echeancesRestantes: 0 }).status, "paid");
});

console.log("\n── Échéances ──");

test("le reste d'arrondi va sur la dernière échéance, la somme est exacte", () => {
  const m = montantsEcheances(325, 10);
  assert.equal(m.length, 10);
  assert.equal(m[0], 32.5);
  assert.equal(Math.round(m.reduce((s, x) => s + x, 0) * 100) / 100, 325);
  const m3 = montantsEcheances(100, 3);
  assert.deepEqual(m3, [33.33, 33.33, 33.34]);
});

console.log("\n── Répartition entre deux mandats ──");

test("le second mandat porte le montant saisi, le premier le reste", () => {
  assert.deepEqual(repartirEntreDeuxMandats({ montantTotal: 650, montantMandat2: 325 }), { ok: true, montant1: 325, montant2: 325 });
  assert.deepEqual(repartirEntreDeuxMandats({ montantTotal: 650, montantMandat2: 200 }), { ok: true, montant1: 450, montant2: 200 });
});

test("second montant absent ou égal au total : refus expliqué", () => {
  assert.equal(repartirEntreDeuxMandats({ montantTotal: 650, montantMandat2: 0 }).ok, false);
  assert.equal(repartirEntreDeuxMandats({ montantTotal: 650, montantMandat2: 650 }).ok, false);
  assert.equal(repartirEntreDeuxMandats({ montantTotal: 650, montantMandat2: 700 }).ok, false);
});

console.log(`\n✅ ${passes} tests passés\n`);
