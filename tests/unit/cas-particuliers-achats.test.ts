/**
 * tests/unit/cas-particuliers-achats.test.ts — cas particuliers des achats expliqués au cabinet.
 *   npx tsx tests/unit/cas-particuliers-achats.test.ts
 */
import assert from "node:assert/strict";
import { casParticuliersAchats, construireExportCasParticuliers, phraseCas } from "../../src/lib/cas-particuliers-achats";

let n = 0;
const test = (nom: string, fn: () => void) => { try { fn(); n++; } catch (e) { console.error(`❌ ${nom}`); throw e; } };
const achat = (o: any) => ({ typeDocument: "achat", devise: "EUR", ...o });

test("paiement en plusieurs fois : TVA proposée au prorata du paiement", () => {
  const [c] = casParticuliersAchats([{ id: "d1", dateOperation: "2026-09-01", fournisseur: "SAS Alain Pignolet", montant: 321.84, poste: "Honoraires & gestion (compta, juridique, GHN)",
    piece: { id: "p1", modeRattachement: "echeance", paiementsAssocies: [{ id: "d0", montant: 26.25 }, { id: "d1", montant: 321.84 }], extraction: achat({ numero: "002700002", ttc: 348.10, tva: 58.02, date: "2026-08-20" }) } }] as any);
  assert.equal(c.type, "fractionne");
  assert.equal(c.tvaProposee, 53.64);
  assert.match(c.detail, /réglée en 2 fois : 321,84 € ce jour, 348,09 € réglés au total, reste dû 0,01 €/);
});

test("devise étrangère : taux appliqué, pas de TVA française", () => {
  const [c] = casParticuliersAchats([{ id: "d", dateOperation: "2026-09-18", fournisseur: "Tripo AI", montant: 136.24,
    piece: { id: "p", associationDevise: { deviseFacture: "USD", montantFacture: 160, montantDebiteEUR: 136.24 }, extraction: achat({ devise: "USD", ttc: 160, tva: 0 }) } }] as any);
  assert.equal(c.type, "devise");
  assert.match(c.detail, /Facturé 160,00 USD, débité 136,24 € \(1 USD = 0,8515 €/);
  assert.equal(c.tvaProposee, null);
});

test("même facture sur deux débits (GHN, juillet) et escompte", () => {
  const ghn = (id: string) => ({ id, fournisseur: "GHN", montant: 216, piece: { id: "p" + id, extraction: achat({ numero: "20260003048", ttc: 216, tva: 36 }) } });
  const memePiece = [{ ...ghn("a"), piece: { ...ghn("a").piece, id: "pg" } }, { ...ghn("b"), piece: { ...ghn("b").piece, id: "pg" } }];
  const cas = casParticuliersAchats(memePiece as any);
  assert.deepEqual(cas.map((x) => x.type), ["meme-facture", "meme-facture"]);
  const [e] = casParticuliersAchats([{ id: "v", fournisseur: "FamilyVets", montant: 413.76, piece: { id: "pv", associationEcart: { type: "Escompte", taux: 2, montant: 8.44 }, extraction: achat({ ttc: 422.20, tva: 70.37 }) } }] as any);
  assert.equal(e.type, "escompte");
  assert.equal(e.tvaProposee, 68.96);
});

test("paiement ordinaire : aucun cas ; repas seul : pas de TVA proposée", () => {
  assert.equal(casParticuliersAchats([{ id: "o", fournisseur: "Orange", montant: 66, piece: { id: "po", extraction: achat({ ttc: 66, tva: 11 }) } }] as any).length, 0);
  const [p] = casParticuliersAchats([{ id: "r", fournisseur: "Au gré du vent", montant: 20, statutTVA: "non-recuperee", piece: { id: "pr", extraction: achat({ ttc: 43.5, tva: 4.32 }) } }] as any);
  assert.equal(p.type, "partiel");
  assert.equal(p.tvaProposee, null);
});

test("CSV et phrase", () => {
  const cas = casParticuliersAchats([{ id: "x", dateOperation: "2026-08-03", fournisseur: "NNA", montant: 900, piece: { id: "px", extraction: achat({ numero: "Q1", ttc: 845.79, tva: 44.09 }) } }] as any);
  assert.equal(cas[0].type, "superieur");
  const csv = construireExportCasParticuliers(cas);
  assert.match(csv.split("\n")[1], /^03\/08\/2026;NNA;Paiement supérieur à la facture;Q1;;845.79;44.09;900.00;/);
  assert.match(phraseCas(cas[0]), /^03\/08\/2026 — NNA \(facture Q1\) : paiement supérieur à la facture\. .*TVA proposée : 44,09 €\.$/);
});
console.log(`✅ ${n} tests passés`);
