/**
 * tests/unit/trop-paye-fournisseur.test.ts — virement trop élevé par erreur à un fournisseur
 * (333,60 € pour une facture de 33,60 €, 20/11/2026).
 *   npx tsx tests/unit/trop-paye-fournisseur.test.ts
 */
import assert from "node:assert/strict";
import { tropPayePossible, verifierAssociationTableau } from "../../src/lib/tableau-depenses";
import { casParticuliersAchats } from "../../src/lib/cas-particuliers-achats";
import { construireAchatsBanque } from "../../src/lib/fec-achats-banque";

let passes = 0;
function test(nom: string, fn: () => void) {
  try { fn(); passes++; console.log(`  ✅ ${nom}`); }
  catch (e: any) { console.error(`  ❌ ${nom}\n     ${e.message}`); process.exitCode = 1; }
}
const facture = { typeDocument: "achat", devise: "EUR", fournisseur: "Sellerie X", numero: "F-12", date: "2026-11-15", ht: 28, tva: 5.6, ttc: 33.6 };
const virement = { id: "d1", fournisseur: "VIR SELLERIE X", montant: 333.6, dateOperation: "2026-11-18", source: "releve-bancaire" };

test("trop-payé : 300 € de surplus ; rien si le débit n'est pas supérieur, ni pour une paie ou une devise", () => {
  assert.equal(tropPayePossible(facture, virement), 300);
  assert.equal(tropPayePossible(facture, { ...virement, montant: 33.6 }), null);
  assert.equal(tropPayePossible(facture, { ...virement, montant: 20 }), null);
  assert.equal(tropPayePossible({ ...facture, devise: "USD" }, virement), null);
  assert.equal(tropPayePossible({ typeDocument: "paie", devise: "EUR", netAPayer: 10 }, virement), null);
});

test("association : refusée sans la case, acceptée avec, montant du trop-payé rendu", () => {
  assert.throws(() => verifierAssociationTableau(facture, virement));
  const a = verifierAssociationTableau(facture, virement, true) as any;
  assert.equal(a.nature, "trop-paye"); assert.equal(a.tropPaye, 300); assert.equal(a.montantPiece, 33.6);
  assert.throws(() => verifierAssociationTableau(facture, { ...virement, montant: 20 }, true));
});

test("colis : le cas dit « erreur de montant, remboursement demandé », pas « facture antérieure »", () => {
  const [c] = casParticuliersAchats([{ ...virement, piece: { id: "p", extraction: facture, associationTropPaye: { montant: 300 } } }] as any);
  assert.equal(c.type, "superieur"); assert.equal(c.tvaProposee, 5.6);
  assert.match(c.detail, /erreur de montant/); assert.match(c.aTrancher, /Trop-payé/);
});

test("FEC : achat de 33,60 €, règlement de 333,60 €, 300 € au débit du fournisseur, message de trop-payé", () => {
  const r = construireAchatsBanque({ mois: "2026-11", numeroDepart: 1, credits: [],
    debits: [{ ...virement, mois: "2026-11", compte: "51200000", suivie: true, poste: "Fournitures & petit équipement (dont sellerie)",
      piece: { id: "p", extraction: facture, associationTropPaye: { montant: 300 } } }] as any });
  const l = r.lignes.map(x => x.split("\t"));
  const ha = l.filter(c => c[0] === "HA"), bq = l.filter(c => c[0] === "BQ");
  assert.equal(ha.find(c => c[12])?.[12], "33,60");
  assert.equal(bq.find(c => c[11])?.[11], "333,60");
  assert.ok(r.anomalies.some(a => /virés par erreur.*300,00 € versés en trop/.test(a)));
  assert.ok(!r.anomalies.some(a => /réclamez-la/.test(a)));
});

console.log(`\n✅ ${passes} tests passés`);
