/**
 * Tests de src/lib/cawl-confirmation.ts
 *
 * Verrouille les trois divergences relevées à l'audit du 29/08/2026 entre le
 * retour navigateur et le webhook CAWL : référentiel du montant attendu,
 * cumul de `paidAmount`, et attribution du numéro de facture.
 */
import assert from "node:assert/strict";
import {
  deciderConfirmation,
  montantAttendu,
  type EntreeConfirmation,
} from "../../src/lib/cawl-confirmation";

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

const base: EntreeConfirmation = {
  montantEncaisseEuros: 0,
  montantSessionEuros: null,
  totalTTC: 175,
  dejaPaye: 0,
  estAcompte: false,
  acompteAttendu: null,
  depositPercent: 0,
  aDejaUneFacture: false,
};

console.log("\n── Montant attendu ──");

test("le montant demandé à la session prime sur le total dû", () => {
  assert.equal(montantAttendu({ ...base, montantSessionEuros: 30 }), 30);
});

test("sans session, un acompte retombe sur acompteAmount", () => {
  assert.equal(
    montantAttendu({ ...base, estAcompte: true, acompteAttendu: 30 }),
    30
  );
});

test("sans session ni acompteAmount, l'acompte se recalcule au pourcentage", () => {
  assert.equal(
    montantAttendu({ ...base, estAcompte: true, depositPercent: 20 }),
    35
  );
});

test("sans rien, le référentiel est le total dû", () => {
  assert.equal(montantAttendu(base), 175);
});

console.log("\n── Lien de paiement partiel (la divergence webhook/status) ──");

test("un acompte de 30€ sur 175€ est ACCEPTÉ quand la session le demandait", () => {
  // C'est le cas que le webhook rejetait : il comparait 30€ encaissés aux
  // 175€ de payments.totalTTC et marquait needsReview.
  const d = deciderConfirmation({
    ...base,
    montantEncaisseEuros: 30,
    montantSessionEuros: 30,
    estAcompte: true,
  });
  assert.equal(d.accepte, true);
  assert.equal(d.statut, "partial");
  assert.equal(d.nouveauCumul, 30);
  assert.equal(d.attribuerFacture, false);
});

test("le solde s'ADDITIONNE à l'acompte au lieu de l'écraser", () => {
  const d = deciderConfirmation({
    ...base,
    montantEncaisseEuros: 145,
    montantSessionEuros: 145,
    dejaPaye: 30,
  });
  assert.equal(d.nouveauCumul, 175);
  assert.equal(d.statut, "paid");
});

test("deux liens partiels successifs cumulent sans solder trop tôt", () => {
  const un = deciderConfirmation({
    ...base, montantEncaisseEuros: 50, montantSessionEuros: 50,
  });
  assert.equal(un.statut, "partial");
  assert.equal(un.nouveauCumul, 50);

  const deux = deciderConfirmation({
    ...base, montantEncaisseEuros: 50, montantSessionEuros: 50, dejaPaye: 50,
  });
  assert.equal(deux.statut, "partial");
  assert.equal(deux.nouveauCumul, 100);
});

console.log("\n── Sous-paiement ──");

test("payer 3€ une commande de 175€ est REFUSÉ", () => {
  const d = deciderConfirmation({
    ...base, montantEncaisseEuros: 3, montantSessionEuros: 175,
  });
  assert.equal(d.accepte, false);
  assert.equal(d.attribuerFacture, false);
  assert.equal(d.nouveauCumul, 0, "le cumul ne bouge pas sur un refus");
});

test("deux centimes de moins passent (tolérance d'arrondi)", () => {
  const d = deciderConfirmation({
    ...base, montantEncaisseEuros: 174.99, montantSessionEuros: 175,
  });
  assert.equal(d.accepte, true);
});

test("un montant absent n'est jamais lu comme un sous-paiement", () => {
  const d = deciderConfirmation({
    ...base, montantEncaisseEuros: 0, montantSessionEuros: 175,
  });
  assert.equal(d.accepte, true);
  assert.equal(d.montantCredite, 175);
});

console.log("\n── Numéro de facture ──");

test("une vente soldée déclenche l'attribution du numéro", () => {
  const d = deciderConfirmation({
    ...base, montantEncaisseEuros: 175, montantSessionEuros: 175,
  });
  assert.equal(d.statut, "paid");
  assert.equal(d.attribuerFacture, true);
});

test("un paiement partiel ne déclenche PAS de numéro", () => {
  const d = deciderConfirmation({
    ...base, montantEncaisseEuros: 30, montantSessionEuros: 30, estAcompte: true,
  });
  assert.equal(d.attribuerFacture, false);
});

test("un paiement déjà facturé ne se voit pas attribuer un second numéro", () => {
  const d = deciderConfirmation({
    ...base, montantEncaisseEuros: 175, montantSessionEuros: 175, aDejaUneFacture: true,
  });
  assert.equal(d.statut, "paid");
  assert.equal(d.attribuerFacture, false);
});

console.log(`\n✅ ${passes} tests passés\n`);
