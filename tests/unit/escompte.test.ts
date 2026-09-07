import assert from "node:assert/strict";
import { test } from "node:test";
import { nettoyerPiece, proposerAssociations } from "../../src/lib/justificatifs";
import { candidatsAutomatiques } from "../../src/lib/matching-automatique";
import { verifierAssociationTableau } from "../../src/lib/tableau-depenses";
import { driveFolderId } from "../../src/lib/gmail";

const facture = nettoyerPiece({ typeDocument: "achat", devise: "EUR", fournisseur: "Clinique Vétérinaire des Pommiers", numero: "CTC-16172", date: "2026-08-05", ht: 390.23, tva: 39.02, ttc: 429.25 });
const debit = { id: "d", fournisseur: "CLINIQUE VET DES POMMIERS", montant: 420.66, source: "releve-bancaire", dateOperation: "2026-08-19" };

test("escompte de 2 % chez le même fournisseur : proposé, avec le taux et les deux montants", () => {
  const [p] = proposerAssociations(facture, [debit]);
  assert.ok(p); assert.equal(p.ecart?.type, "escompte"); assert.equal(p.ecart?.taux, 2); assert.equal(p.ecart?.montant, 8.59);
  assert.match(p.raisons[0], /Escompte 2,00 %/); assert.equal(p.score, 80); assert.ok(p.raisons.includes("Fournisseur proche"), "libellé bancaire abrégé reconnu");
});
test("pas d'escompte sans fournisseur concordant, ni hors de 0,5–3 %, ni si le débit dépasse la facture", () => {
  assert.equal(proposerAssociations(facture, [{ ...debit, fournisseur: "AUTRE" }]).length, 0);
  assert.equal(proposerAssociations(facture, [{ ...debit, montant: 400 }]).length, 0, "6,8 % : trop");
  assert.equal(proposerAssociations(facture, [{ ...debit, montant: 428.5 }]).length, 0, "0,17 % : trop peu");
  assert.equal(proposerAssociations(facture, [{ ...debit, montant: 430 }]).length, 0);
});
test("un escompte se confirme à la main : jamais retenu par le rapprochement automatique ; l'exact reste prioritaire", () => {
  assert.equal(candidatsAutomatiques(facture, [{ ...debit, dateOperation: "2026-08-06" }]).length, 0);
  const [premier] = proposerAssociations(facture, [debit, { ...debit, id: "e", montant: 429.25 }]);
  assert.equal(premier.id, "e");
});
test("l'association depuis le tableau enregistre l'écart", () => {
  const r = verifierAssociationTableau(facture as unknown as Record<string, unknown>, debit);
  assert.equal(r.nature, "escompte"); assert.deepEqual((r as { ecart?: unknown }).ecart, { type: "escompte", taux: 2, montant: 8.59 });
});
test("identifiant de dossier Drive depuis un lien ou un identifiant nu", () => {
  assert.equal(driveFolderId("https://drive.google.com/drive/folders/1erxWZR1yauFHi_WMB4UomFC8DAg-Ilfl?usp=sharing"), "1erxWZR1yauFHi_WMB4UomFC8DAg-Ilfl");
  assert.equal(driveFolderId(" 1erxWZR1yauFHi_WMB4UomFC8DAg-Ilfl "), "1erxWZR1yauFHi_WMB4UomFC8DAg-Ilfl");
  assert.equal(driveFolderId("pas un lien"), "");
});
