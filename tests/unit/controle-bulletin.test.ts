/**
 * tests/unit/controle-bulletin.test.ts — le coût employeur lu sur un bulletin.
 *   npx tsx tests/unit/controle-bulletin.test.ts
 */
import assert from "node:assert/strict";
import { controlerCoutEmployeur } from "../../src/lib/controle-bulletin";

let passes = 0;
function test(nom: string, fn: () => void) {
  try { fn(); passes++; console.log(`  ✅ ${nom}`); }
  catch (e: any) { console.error(`  ❌ ${nom}\n     ${e.message}`); process.exitCode = 1; }
}

test("bulletin d'apprentie de septembre : 714,11 € imprimé, cohérent avec brut + charges", () => {
  assert.deepEqual(controlerCoutEmployeur({ brut: 697.16, coutImprime: 714.11, chargesPatronales: 16.95 }), { coutEmployeur: 714.11, alerte: null });
});

test("le brut compté deux fois (1 411,11 €) est écarté au profit de brut + charges", () => {
  const r = controlerCoutEmployeur({ brut: 697.16, coutImprime: 1411.11, chargesPatronales: 16.95 });
  assert.equal(r.coutEmployeur, 714.11);
  assert.match(r.alerte!, /pas cohérent/);
});

test("incohérent et sans charges lues : rien n'est proposé, on demande la saisie", () => {
  const r = controlerCoutEmployeur({ brut: 697.16, coutImprime: 1411.11 });
  assert.equal(r.coutEmployeur, null);
  assert.match(r.alerte!, /saisissez/);
});

test("un coût inférieur au brut est refusé", () => {
  assert.equal(controlerCoutEmployeur({ brut: 2000, coutImprime: 1500 }).coutEmployeur, null);
});

test("salarié classique : 2 000 € brut, 2 850 € de coût, rien à signaler", () => {
  assert.deepEqual(controlerCoutEmployeur({ brut: 2000, coutImprime: 2850 }), { coutEmployeur: 2850, alerte: null });
});

test("coût imprimé plausible mais différent de brut + charges : gardé, avec une alerte", () => {
  const r = controlerCoutEmployeur({ brut: 2000, coutImprime: 2850, chargesPatronales: 700 });
  assert.equal(r.coutEmployeur, 2850);
  assert.match(r.alerte!, /2700,00 €|2 700,00 €|2700/);
});

test("rien d'imprimé : brut + charges ; ni l'un ni l'autre : vide", () => {
  assert.deepEqual(controlerCoutEmployeur({ brut: 697.16, chargesPatronales: 16.95 }), { coutEmployeur: 714.11, alerte: null });
  assert.deepEqual(controlerCoutEmployeur({ brut: 697.16 }), { coutEmployeur: null, alerte: null });
});

console.log(`\n${process.exitCode ? "❌" : "✅"} ${passes} tests passés`);
