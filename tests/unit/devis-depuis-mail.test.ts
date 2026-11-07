/**
 * tests/unit/devis-depuis-mail.test.ts — devis proposé depuis un mail, ouvert pré-rempli.
 *   npx tsx tests/unit/devis-depuis-mail.test.ts
 */
import assert from "node:assert/strict";
import { lienDevis, lirePrefillDevis, nettoyerDevisPropose, noteDevisDepuisMail } from "../../src/lib/devis-depuis-mail";

let n = 0;
const test = (nom: string, fn: () => void) => { try { fn(); n++; } catch (e) { console.error(`❌ ${nom}`); throw e; } };

test("prix connu gardé ; prix absent ou nul : 0 et « à compléter », jamais inventé", () => {
  const d = nettoyerDevisPropose({ objet: "Anniversaire de Léa, 10 enfants", lignes: [
    { label: "Anniversaire poney (forfait)", qty: 1, priceTTC: 180 },
    { label: "Goûter", qty: 10, priceTTC: null },
    { label: "", qty: 2, priceTTC: 5 },
    { label: "Photo souvenir", qty: -3, priceTTC: "abc" },
  ] });
  assert.equal(d?.objet, "Anniversaire de Léa, 10 enfants");
  assert.deepEqual(d?.lignes, [
    { label: "Anniversaire poney (forfait)", qty: 1, priceTTC: 180, aCompleter: false },
    { label: "Goûter", qty: 10, priceTTC: 0, aCompleter: true },
    { label: "Photo souvenir", qty: 1, priceTTC: 0, aCompleter: true },
  ]);
});
test("rien d'exploitable : pas de devis", () => {
  assert.equal(nettoyerDevisPropose(null), null);
  assert.equal(nettoyerDevisPropose({ objet: "x", lignes: [] }), null);
});
test("aller-retour par l'URL du module devis", () => {
  const p = { familyId: "fam1", objet: "Sortie école", lignes: [{ label: "Baptême poney", qty: 25, priceTTC: 12, aCompleter: false }, { label: "Transport", qty: 1, priceTTC: 0, aCompleter: true }], source: "Devis pour une classe" };
  const url = lienDevis(p);
  assert.ok(url.startsWith("/admin/devis?prefill="));
  assert.deepEqual(lirePrefillDevis(new URLSearchParams(url.split("?")[1]).get("prefill")), p);
  assert.equal(lirePrefillDevis("pas du json"), null);
  assert.equal(lirePrefillDevis(JSON.stringify({ objet: "sans famille" })), null);
  assert.equal(noteDevisDepuisMail(p), "Sortie école\nDemande reçue par email : « Devis pour une classe »");
});
console.log(`✅ ${n} tests passés`);
