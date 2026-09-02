import assert from "node:assert/strict";
import { verrouCommande } from "../../src/app/admin/paiements/commande-verrou";

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

console.log("\n🔒 Verrou de modification d'une commande\n");

test("commande impayée, sans facture : modifiable", () => {
  const v = verrouCommande({ paidAmount: 0, invoiceNumber: null });
  assert.equal(v.verrouillee, false);
  assert.equal(v.motif, null);
});

test("commande inexistante : rien à verrouiller", () => {
  assert.equal(verrouCommande(null).verrouillee, false);
  assert.equal(verrouCommande(undefined).verrouillee, false);
});

test("facture définitive émise : verrouillée, motif facture", () => {
  const v = verrouCommande({ invoiceNumber: "F-2026-0042", paidAmount: 349 });
  assert.equal(v.verrouillee, true);
  assert.equal(v.motif, "facture");
  assert.match(v.titre, /F-2026-0042/);
  assert.match(v.explication, /avoir/);
});

test("acompte encaissé, pas encore de facture : verrouillée, motif encaissement", () => {
  const v = verrouCommande({ invoiceNumber: null, paidAmount: 99.8 });
  assert.equal(v.verrouillee, true);
  assert.equal(v.motif, "encaissement");
  assert.match(v.titre, /99\.80 €/);
  assert.match(v.explication, /avoir/);
});

test("la facture prime sur l'encaissement dans le motif", () => {
  const v = verrouCommande({ invoiceNumber: "F-2026-0001", paidAmount: 10 });
  assert.equal(v.motif, "facture");
});

test("un montant payé nul ou négatif ne verrouille pas", () => {
  assert.equal(verrouCommande({ paidAmount: 0 }).verrouillee, false);
  assert.equal(verrouCommande({ paidAmount: -5 }).verrouillee, false);
  assert.equal(verrouCommande({ paidAmount: 0.004 }).verrouillee, false);
});

test("un montant payé en texte est lu comme un nombre", () => {
  const v = verrouCommande({ paidAmount: "30" as any });
  assert.equal(v.verrouillee, true);
  assert.match(v.titre, /30\.00 €/);
});

console.log(`\n${passes} vérification(s) passée(s)\n`);
