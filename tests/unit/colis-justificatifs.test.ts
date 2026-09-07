import assert from "node:assert/strict";
import { test } from "node:test";
import { construireColisComptable, corpsEmailComptable } from "../../src/lib/envoi-comptable-utils";
import { construirePointsCloture, resumerCloture } from "../../src/app/admin/comptabilite/cloture-mois/cloture-mois-utils";
import { justifiableParReleve, CATEGORIE_EMPRUNTS } from "../../src/lib/tableau-depenses";
import { posteCommissionCarte } from "../../src/lib/postes-depenses";
import type { LigneMois } from "../../src/lib/bilan-justificatifs";

const lignes: LigneMois[] = [
  { id: "a", mois: "2026-08", dateOperation: "2026-08-05", fournisseur: "VETO", poste: "Vétérinaire", montant: 120, suivie: true, piece: { id: "p", nom: "veto.pdf", extraction: { typeDocument: "achat", devise: "EUR", ht: 100, tva: 20, ttc: 120 } } },
  { id: "b", mois: "2026-08", dateOperation: "2026-08-06", fournisseur: "ORANGE", poste: "Téléphone", montant: 66, suivie: true },
];
test("le colis gagne deux CSV et un résumé de complétude/TVA quand les lignes sont fournies ; rien ne change sinon", () => {
  const sans = construireColisComptable({ mois: "2026-08", payments: [], encaissements: [], depenses: [] });
  assert.equal(sans.pieces.length, 5); assert.equal(sans.resume.completude, undefined);
  const avec = construireColisComptable({ mois: "2026-08", payments: [], encaissements: [], depenses: [], lignesJustificatifs: lignes });
  assert.deepEqual(avec.pieces.slice(5).map(p => p.filename), ["justificatifs_2026-08.csv", "tva_2026-08.csv"]);
  assert.ok(avec.pieces[5].contenu.startsWith("\uFEFF"));
  assert.deepEqual(avec.resume.completude, { total: 2, justifies: 1, sansPiece: 1, montantSansPiece: 66, pourcent: 50 });
  assert.equal(avec.resume.tvaDeductibleJustifiee, 20);
  const html = corpsEmailComptable({ mois: "2026-08", resume: avec.resume, pieces: ["x"], nomCentre: "CE", archive: { nb: 1, nonJointes: 2 } });
  assert.match(html, /1\/2<\/b> dépenses justifiées/); assert.match(html, /66,00 € sans pièce/); assert.match(html, /2 pièce\(s\) n'ont pas pu être jointes/);
});
test("point Justificatifs : prévient sans bloquer, absent si non fourni", () => {
  const base = { mois: "2026-08", releves: [], comptes: [], horsTotal: [], lignesMS: [], resultat: [] };
  const sans = construirePointsCloture(base);
  const avec = construirePointsCloture({ ...base, justificatifs: { total: 10, justifies: 7, sansPiece: 3, montantSansPiece: 1234.5 } });
  assert.equal(avec.length, sans.length + 1);
  const point = avec[avec.length - 1];
  assert.equal(point.etat, "info"); assert.match(point.detail, /7\/10/); assert.match(point.detail, /1.?235 €/, "arrondi à l’euro comme les autres points");
  assert.equal(resumerCloture(avec).bloquants, resumerCloture(sans).bloquants, "n'ajoute pas de bloquant");
  assert.equal(construirePointsCloture({ ...base, justificatifs: { total: 4, justifies: 4, sansPiece: 0, montantSansPiece: 0 } }).at(-1)!.etat, "ok");
});
test("relevé comme justificatif : commissions bancaires et échéances d'emprunt, pas un fournisseur", () => {
  assert.equal(justifiableParReleve("Frais bancaires", "Com Carte", posteCommissionCarte), true);
  assert.equal(justifiableParReleve(CATEGORIE_EMPRUNTS, "Caae Prêt PROFESSION", posteCommissionCarte), true);
  assert.equal(justifiableParReleve("Vétérinaire", "Caae Prêt PROFESSION", posteCommissionCarte), false);
});
