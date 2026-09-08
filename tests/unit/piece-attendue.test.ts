/**
 * Le tableau signalait « Justificatif manquant » sur des lignes qui
 * n'attendent aucune facture — commissions bancaires, échéances de prêt,
 * salaires — et noyait ainsi les vraies pièces à réclamer.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { etatPiece, justifiableSansFacture, resteAFaire, sansTvaParNature, LIBELLE_ETAT_PIECE } from "../../src/lib/piece-attendue";
import type { LigneMois } from "../../src/lib/bilan-justificatifs";

const ligne = (extra: Partial<LigneMois> = {}): LigneMois => ({
  id: "l", mois: "2026-08", dateOperation: "2026-08-10", fournisseur: "FOURNISSEUR", poste: "Autres dépenses",
  montant: 50, suivie: true, source: "releve-bancaire", ...extra,
});

test("une charge sans pièce réclame une facture", () => {
  assert.equal(etatPiece(ligne()), "facture-a-obtenir");
  assert.equal(etatPiece(ligne({ poste: "Aliments, litières, paille", fournisseur: "VIR LACOLLEY" })), "facture-a-obtenir");
  // Une immobilisation sort des charges mais garde besoin de sa facture.
  assert.equal(etatPiece(ligne({ poste: "Immobilisation — à amortir", suivie: false, immobilisation: true })), "facture-a-obtenir");
});

test("le relevé suffit pour ce que la banque ne facture pas", () => {
  assert.equal(etatPiece(ligne({ fournisseur: "Com Carte" })), "releve-suffit");
  assert.equal(etatPiece(ligne({ fournisseur: "Commission vente a distance" })), "releve-suffit");
  assert.equal(etatPiece(ligne({ poste: "Emprunts", fournisseur: "Caae Pret Profession", suivie: false })), "releve-suffit");
  assert.equal(etatPiece(ligne({ poste: "Compte FFE (avance licences & engagements)", suivie: false, avanceFfe: true })), "releve-suffit");
  assert.ok(justifiableSansFacture(ligne({ fournisseur: "Com Carte" })));
  assert.ok(!justifiableSansFacture(ligne()));
});

test("rien à réclamer quand la pièce est là, ailleurs, ou sans objet", () => {
  assert.equal(etatPiece(ligne({ piece: { id: "p", nom: "f.pdf" } })), "rien-a-fournir");
  assert.equal(etatPiece(ligne({ justificatifReleve: true })), "rien-a-fournir");
  assert.equal(etatPiece(ligne({ justifieeVia: { type: "masse-salariale", detail: "Bulletin août" } })), "rien-a-fournir");
  assert.equal(etatPiece(ligne({ piecePerdue: { motif: "Ticket perdu" } })), "rien-a-fournir");
  assert.equal(etatPiece(ligne({ depensePersonnelle: true, suivie: false })), "rien-a-fournir");
  assert.equal(etatPiece(ligne({ poste: "Personnel — hors charges" })), "rien-a-fournir");
  assert.equal(etatPiece(ligne({ rapprochementExclu: true })), "rien-a-fournir");
  // Salaire net ou virement interne : hors charges, aucune facture à attendre.
  assert.equal(etatPiece(ligne({ poste: "Salaires", suivie: false })), "rien-a-fournir");
  assert.equal(etatPiece(ligne({ poste: "Virements internes", suivie: false })), "rien-a-fournir");
  assert.equal(etatPiece(ligne({ poste: "hors-depenses", suivie: false })), "rien-a-fournir");
});

test("le reste à faire sépare les factures à réclamer des lignes réglables d'un clic", () => {
  const lignes = [
    ligne({ id: "a", montant: 120 }),
    ligne({ id: "b", montant: 66 }),
    ligne({ id: "c", montant: 2.31, fournisseur: "Com Carte" }),
    ligne({ id: "d", montant: 61.66, poste: "Emprunts", fournisseur: "Caae Pret", suivie: false }),
    ligne({ id: "e", montant: 999, piece: { id: "p", nom: "f.pdf" } }),
    ligne({ id: "f", montant: 8000, poste: "Salaires", suivie: false }),
  ];
  assert.deepEqual(resteAFaire(lignes), { factures: 2, montantFactures: 186, releves: 2, montantReleves: 63.97 });
  assert.deepEqual(resteAFaire([]), { factures: 0, montantFactures: 0, releves: 0, montantReleves: 0 });
});

test("chaque état a un libellé court et distinct", () => {
  const libelles = Object.values(LIBELLE_ETAT_PIECE);
  assert.equal(new Set(libelles).size, 3);
  assert.ok(libelles.every(l => l.length <= 22));
});

/**
 * « TVA à vérifier » s'affichait sur chaque échéance de prêt et chaque
 * commission bancaire : un geste réclamé là où il n'y a rien à faire.
 */
test("ce qui n'a jamais de TVA n'en réclame pas la vérification", () => {
  assert.ok(sansTvaParNature(ligne({ poste: "Emprunts", fournisseur: "Remboursement de prêt 10003551300 01/09/26 INTERETS", suivie: false })));
  assert.ok(sansTvaParNature(ligne({ fournisseur: "Com Carte" })));
  assert.ok(sansTvaParNature(ligne({ poste: "Salaires", suivie: false })));
  assert.ok(sansTvaParNature(ligne({ poste: "Cotisations sociales" })));
  assert.ok(sansTvaParNature(ligne({ poste: "Virements internes", suivie: false })));
  assert.ok(sansTvaParNature(ligne({ depensePersonnelle: true })));
  // Un achat ordinaire, lui, garde sa vérification de TVA.
  assert.ok(!sansTvaParNature(ligne()));
  assert.ok(!sansTvaParNature(ligne({ poste: "Aliments, litières, paille", fournisseur: "AGRIAL" })));
});
