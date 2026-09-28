import assert from "node:assert/strict";
import { recalerCommandeSurJournal } from "../../src/lib/recalage-commande";

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

test("forfait SEPA : 1er prélèvement au journal, 9 à venir → 113,90 réglés, reste planifié", () => {
  const r = recalerCommandeSurJournal(
    { totalTTC: 1139, status: "sepa_scheduled" },
    [{ montant: 113.9 }],
    [{ montant: 113.9, status: "preleve" }, ...Array.from({ length: 9 }, () => ({ montant: 113.9, status: "pending" }))],
  );
  assert.equal(r.paidAmount, 113.9);
  assert.equal(r.status, "sepa_scheduled");
  assert.equal(r.sepaRestant, 1025.1);
});

test("dernier prélèvement passé : réglée", () => {
  const r = recalerCommandeSurJournal({ totalTTC: 227.8 }, [{ montant: 113.9 }, { montant: 113.9 }], [{ montant: 113.9, status: "preleve" }, { montant: 113.9, status: "preleve" }]);
  assert.equal(r.status, "paid");
  assert.equal(r.sepaRestant, 0);
});

test("commande hors SEPA : partielle ou en attente selon le journal, sans sepaRestant", () => {
  const partielle = recalerCommandeSurJournal({ totalTTC: 200 }, [{ montant: 69.9 }], []);
  assert.equal(partielle.status, "partial");
  assert.equal(partielle.paidAmount, 69.9);
  assert.equal("sepaRestant" in partielle, false);
  const contrePassee = recalerCommandeSurJournal({ totalTTC: 200 }, [{ montant: 69.9 }, { montant: -69.9 }], []);
  assert.equal(contrePassee.status, "pending");
  assert.equal(contrePassee.paidAmount, 0);
});

console.log(`\n✅ ${passes} tests passés\n`);
