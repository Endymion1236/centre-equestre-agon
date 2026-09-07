import assert from "node:assert/strict";
import { test } from "node:test";
import { completudeJustificatifs, bilanTvaMois, construireExportTva, construireExportJustificatifs, type LigneMois } from "../../src/lib/bilan-justificatifs";

const piece = (tva: number | null, extra: Partial<NonNullable<LigneMois["piece"]>["extraction"]> = {}) => ({ id: "p", nom: "Facture.pdf", extraction: { typeDocument: "achat", devise: "EUR", ht: 100, tva, ttc: 120, numero: "F1", date: "2026-08-02", ...extra } });
const lignes: LigneMois[] = [
  { id: "a", dateOperation: "2026-08-05", fournisseur: "VETO", poste: "Vétérinaire", montant: 120, suivie: true, piece: piece(20) },
  { id: "b", dateOperation: "2026-08-06", fournisseur: "ORANGE", poste: "Téléphone", montant: 66, suivie: true, statutTVA: "a-verifier" },
  { id: "c", dateOperation: "2026-08-07", fournisseur: "COM CARTE", poste: "Frais bancaires", montant: 12.5, suivie: true, statutTVA: "sans-tva", justificatifReleve: true, referenceJustificatifReleve: "Relevé août" },
  { id: "d", dateOperation: "2026-08-08", fournisseur: "VIR SALAIRES", poste: "Salaires", montant: 8000, suivie: false },
  { id: "e", dateOperation: "2026-08-09", fournisseur: "HELLOFRESH", poste: "Personnel — hors charges", montant: 80, suivie: true, depensePersonnelle: true },
  { id: "f", dateOperation: "2026-08-10", fournisseur: "TRACTEUR", poste: "Immobilisation — à amortir", montant: 12000, suivie: true, immobilisation: true, piece: piece(2000, { ht: 10000, ttc: 12000 }) },
  { id: "g", dateOperation: "2026-08-11", fournisseur: "MSA", poste: "Cotisations sociales", montant: 2762.59, suivie: true, justifieeVia: { type: "masse-salariale", detail: "Cotisations MSA juillet" } },
  { id: "h", dateOperation: "2026-08-12", fournisseur: "OPENAI", poste: "Logiciels", montant: 18.64, suivie: true, piece: { id: "q", nom: "openai.pdf", extraction: { typeDocument: "achat", devise: "USD", ht: 20, tva: 0, ttc: 20 } } },
  { id: "i", dateOperation: "2026-08-13", fournisseur: "EXCLUE", poste: "Autres", montant: 999, suivie: true, rapprochementExclu: true },
];

test("complétude : en nombre et en euros, hors mouvements, exclues et personnel ; relevé et Masse salariale comptent comme justifiés", () => {
  const c = completudeJustificatifs(lignes);
  assert.deepEqual(c, { total: 6, justifies: 5, sansPiece: 1, montantSansPiece: 66, pourcent: 83 });
});
test("TVA : seule la TVA lue sur une pièce d'achat en euros est déductible justifiée ; l'immobilisation compte pour la TVA", () => {
  const t = bilanTvaMois(lignes);
  assert.equal(t.deductibleJustifiee, 2020);
  assert.equal(t.nbJustifiees, 2);
  assert.deepEqual(t.aVerifier, { nb: 1, ttc: 66 });
  assert.deepEqual(t.sansTva, { nb: 2, ttc: 2775.09 }, "commission sans TVA + cotisations MSA justifiées ailleurs");
  assert.deepEqual(t.pieceSansTva, { nb: 1, ttc: 18.64 }, "pièce en dollars sans TVA lue");
});
test("un statut « sans TVA » posé par l'admin l'emporte sur une TVA lue", () => {
  const t = bilanTvaMois([{ ...lignes[0], statutTVA: "sans-tva" }]);
  assert.equal(t.deductibleJustifiee, 0); assert.equal(t.sansTva.nb, 1);
});
test("exports : point-virgule, virgule décimale absente, total TVA en dernière ligne, lignes exclues absentes", () => {
  const tva = construireExportTva(lignes).split("\n");
  assert.match(tva[0], /^Date;Fournisseur;/);
  assert.equal(tva.filter(l => l.startsWith("13/08/2026")).length, 0);
  assert.match(tva[tva.length - 2], /TOTAL;.*;2020\.00;1 ligne\(s\) à vérifier pour 66\.00 € TTC/);
  const just = construireExportJustificatifs(lignes);
  assert.match(just, /05\/08\/2026;VETO;Vétérinaire;charge;120\.00;Pièce associée;Facture\.pdf;F1;02\/08\/2026;100\.00;20\.00;120\.00;EUR/);
  assert.match(just, /MSA;Cotisations sociales;charge;2762\.59;Justifiée ailleurs : Cotisations MSA juillet/);
  assert.match(just, /TRACTEUR;Immobilisation — à amortir;immobilisation;/);
  assert.match(just, /COM CARTE;.*;Relevé bancaire \(Relevé août\)/);
});
