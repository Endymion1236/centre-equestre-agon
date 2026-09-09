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
/**
 * La facture de la clinique dit elle-même : « Total TTC 422,20 € — Total TTC
 * (escompte déduit) 413,76 € », prélevés à l'échéance. La banque débite
 * 413,76 € sous le nom de la société (« SELAS FAMILYVETS »), sans rapport
 * avec « Clinique Vétérinaire des Pommiers » : ni le TTC, ni le fournisseur
 * ne collaient, la pièce restait introuvable par son montant.
 */
const pommiers = nettoyerPiece({ typeDocument: "achat", devise: "EUR", fournisseur: "Clinique Vétérinaire des Pommiers", numero: "CTC-202607-14194", date: "2026-07-08", ht: 351.83, tva: 70.37, ttc: 422.2, ttcEscompte: 413.76 });
const prelevement = { id: "f", fournisseur: "PRLV SEPA SELAS FAMILYVETS", montant: 413.76, source: "releve-bancaire", dateOperation: "2026-07-25" };

test("le TTC escompte déduit annoncé par la facture vaut un montant exact, même sous un autre nom bancaire", () => {
  assert.equal(pommiers.ttcEscompte, 413.76);
  const [p] = proposerAssociations(pommiers, [prelevement]);
  assert.ok(p, "proposé malgré un libellé bancaire sans rapport");
  assert.equal(p.ecart?.type, "escompte"); assert.equal(p.ecart?.annonce, true); assert.equal(p.ecart?.montant, 8.44); assert.equal(p.ecart?.taux, 2);
  assert.match(p.raisons[0], /escompte déduit identique/);
  assert.equal(p.score, 60, "comme un TTC identique dans les délais, sans bonus fournisseur");
  // Le rapprochement automatique peut le retenir : rien n'est deviné, la facture le dit.
  assert.equal(candidatsAutomatiques(pommiers, [{ ...prelevement, dateOperation: "2026-07-10" }], undefined, true).length, 1);
  const r = verifierAssociationTableau(pommiers as unknown as Record<string, unknown>, prelevement);
  assert.equal(r.nature, "escompte");
});
test("un TTC escompte déduit incohérent est ignoré ; un autre montant ne profite pas de l'annonce", () => {
  assert.equal(nettoyerPiece({ typeDocument: "achat", devise: "EUR", ttc: 100, ttcEscompte: 120 }).ttcEscompte, null);
  assert.equal(nettoyerPiece({ typeDocument: "achat", devise: "EUR", ttc: 100, ttcEscompte: 0 }).ttcEscompte, null);
  assert.equal(nettoyerPiece({ typeDocument: "paie", devise: "EUR", ttc: 100, ttcEscompte: 90 }).ttcEscompte, null);
  assert.equal(proposerAssociations(pommiers, [{ ...prelevement, montant: 400 }]).length, 0);
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
