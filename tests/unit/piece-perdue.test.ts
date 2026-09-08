import assert from "node:assert/strict";
import { test } from "node:test";
import { completudeJustificatifs, bilanTvaMois, construireExportJustificatifs, estDeclareePerdue, estJustifiee, etatJustificatif, type LigneMois } from "../../src/lib/bilan-justificatifs";
import { construireColisComptable, corpsEmailComptable } from "../../src/lib/envoi-comptable-utils";
import { construirePointsCloture } from "../../src/app/admin/comptabilite/cloture-mois/cloture-mois-utils";
import { preparerJournalAchats } from "../../src/lib/journal-achats-preparatoire";

// Une pièce perdue se déclare avec son motif : la ligne sort des « manquants »
// sans devenir « justifiée », la TVA n'est jamais déduite, la comptable lit le motif.
const perdue: LigneMois = { id: "perdue", mois: "2026-08", dateOperation: "2026-08-03", fournisseur: "CB BRICOMARCHE", poste: "Fournitures & petit équipement (dont sellerie)", montant: 42.9, suivie: true, source: "releve-bancaire", compte: "Crédit Agricole", statutTVA: "non-recuperee", piecePerdue: { motif: "Ticket de caisse perdu", declareeLe: "2026-09-08" } };
const lignes: LigneMois[] = [
  { id: "ok", mois: "2026-08", dateOperation: "2026-08-05", fournisseur: "VETO", poste: "Vétérinaire & santé des chevaux", montant: 120, suivie: true, source: "releve-bancaire", piece: { id: "p", nom: "veto.pdf", extraction: { typeDocument: "achat", devise: "EUR", ht: 100, tva: 20, ttc: 120 } } },
  { id: "manque", mois: "2026-08", dateOperation: "2026-08-06", fournisseur: "ORANGE", poste: "Autres dépenses", montant: 66, suivie: true, source: "releve-bancaire" },
  perdue,
  // Déclarée perdue puis duplicata importé : la pièce l'emporte, la déclaration s'efface.
  { ...perdue, id: "retrouvee", montant: 10, statutTVA: "a-verifier", piece: { id: "dup", nom: "duplicata.pdf", extraction: { typeDocument: "achat", devise: "EUR", ht: 8.33, tva: 1.67, ttc: 10 } } },
];

test("complétude : la pièce perdue est comptée à part, ni justifiée ni manquante", () => {
  assert.equal(estJustifiee(perdue), false);
  assert.equal(estDeclareePerdue(perdue), true);
  assert.equal(estDeclareePerdue(lignes[3]), false, "une pièce retrouvée n'est plus « perdue »");
  assert.deepEqual(completudeJustificatifs(lignes), { total: 4, justifies: 2, sansPiece: 1, montantSansPiece: 66, perdues: 1, montantPerdues: 42.9, pourcent: 50 });
});

test("état et export : le motif est lisible par la comptable, sans TVA déduite", () => {
  assert.equal(etatJustificatif(perdue), "Pièce perdue, relevé conservé : Ticket de caisse perdu");
  assert.equal(etatJustificatif(lignes[1]), "Manquant");
  assert.equal(etatJustificatif(lignes[3]), "Pièce associée");
  const csv = construireExportJustificatifs(lignes);
  assert.match(csv, /CB BRICOMARCHE;.*;Pièce perdue, relevé conservé : Ticket de caisse perdu;/);
  const tva = bilanTvaMois(lignes);
  assert.equal(tva.deductibleJustifiee, 21.67, "vétérinaire + duplicata retrouvé ; rien sur la pièce perdue");
  assert.equal(tva.nonRecuperee.nb, 1);
});

test("colis, email et clôture signalent les pièces perdues séparément des manquantes", () => {
  const colis = construireColisComptable({ mois: "2026-08", payments: [], encaissements: [], depenses: [], lignesJustificatifs: lignes });
  assert.equal(colis.resume.completude?.perdues, 1);
  const mail = corpsEmailComptable({ mois: "2026-08", resume: colis.resume, pieces: colis.pieces.map(p => p.filename), nomCentre: "CE" });
  assert.match(mail, /1 pièce\(s\) déclarée\(s\) perdue\(s\), relevé conservé \(42,90 €/);
  assert.match(mail, /66,00 € sans pièce sur 1 ligne\(s\)/);
  const base = { mois: "2026-08", releves: [], comptes: [], horsTotal: [], lignesMS: [], resultat: [] };
  const points = construirePointsCloture({ ...base, justificatifs: completudeJustificatifs(lignes) });
  const point = points[points.length - 1];
  assert.equal(point.etat, "info");
  assert.match(point.detail, /2\/4 dépenses justifiées/);
  assert.match(point.detail, /1 pièce\(s\) déclarée\(s\) perdue\(s\), relevé conservé/);
  const tout = construirePointsCloture({ ...base, justificatifs: completudeJustificatifs([lignes[0], perdue]) });
  assert.equal(tout[tout.length - 1].etat, "ok", "plus rien de manquant : le point passe au vert, la perte reste signalée");
  assert.match(tout[tout.length - 1].detail, /1\/2 dépenses justifiées.*1 pièce\(s\) déclarée\(s\) perdue\(s\)/);
});

test("journal d'achats préparatoire : la note reprend le motif au lieu de « Justificatif manquant »", () => {
  const r = preparerJournalAchats([perdue, lignes[1]], { debut: "2026-07-01", fin: "2027-06-30" });
  const notes = Object.fromEntries(r.controles.map(c => [c.id, c.notes.join(" | ")]));
  assert.match(notes.perdue, /Pièce déclarée perdue, relevé conservé : Ticket de caisse perdu/);
  assert.match(notes.manque, /Justificatif manquant\./);
});
