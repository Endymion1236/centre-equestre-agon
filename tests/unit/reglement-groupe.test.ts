/**
 * Un fournisseur régulier solde souvent plusieurs bons de livraison en un
 * prélèvement mensuel unique. Le tableau ne savait traiter que le cas
 * inverse — une facture réglée en plusieurs fois — et obligeait à fusionner
 * les factures dans un seul PDF, perdant leur lecture, leur numéro et leur
 * TVA.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { resumeGroupe, verifierReglementGroupe, type PieceDuGroupe } from "../../src/lib/reglement-groupe";
import type { PieceExtraite } from "../../src/lib/justificatifs";

const lecture = (ttc: number, tva: number | null = 0, extra: Partial<PieceExtraite> = {}): PieceExtraite => ({
  typeDocument: "achat", devise: "EUR", fournisseur: "AGRIAL", numero: `F-${ttc}`, date: "2026-07-10",
  ht: tva === null ? null : ttc - tva, tva, ttc,
  salarie: null, moisPaie: null, netAPayer: null, debutPeriode: null, finPeriode: null, ...extra,
} as PieceExtraite);

const piece = (id: string, ttc: number, tva: number | null = 0, extra: Partial<PieceDuGroupe> = {}): PieceDuGroupe =>
  ({ id, nom: `${id}.pdf`, extraction: lecture(ttc, tva), ...extra });

test("trois factures qui totalisent le prélèvement au centime : le groupe est valide", () => {
  const v = verifierReglementGroupe([piece("a", 120.50, 20.08), piece("b", 79.30, 13.22), piece("c", 45.20, 7.53)], 245);
  assert.deepEqual(v.erreurs, []);
  assert.equal(v.ok, true);
  assert.equal(v.total, 245);
  assert.equal(v.ecart, 0);
  // Chaque facture n'est payée qu'une fois : la TVA se totalise sans risque.
  assert.equal(v.tva, 40.83);
  assert.match(resumeGroupe(v, 245), /le total correspond exactement au débit.*40.83 € de TVA/);
});

test("un écart d'un centime suffit à refuser, et le message dit de quel côté", () => {
  const manque = verifierReglementGroupe([piece("a", 120), piece("b", 124.99)], 245);
  assert.equal(manque.ok, false);
  assert.equal(manque.ecart, -0.01);
  assert.match(manque.erreurs[0], /Il manque 0.01 €.*n'a pas encore été importée/);

  const trop = verifierReglementGroupe([piece("a", 120), piece("b", 125.01)], 245);
  assert.equal(trop.ok, false);
  assert.equal(trop.ecart, 0.01);
  assert.match(trop.erreurs[0], /dépasse le débit de 0.01 €.*facture est en trop/);
});

test("une seule facture, ou deux fois la même, n'est pas un règlement groupé", () => {
  assert.match(verifierReglementGroupe([piece("a", 245)], 245).erreurs[0], /au moins deux factures/);
  assert.match(verifierReglementGroupe([], 245).erreurs[0], /au moins deux factures/);
  assert.match(verifierReglementGroupe([piece("a", 122.50), piece("a", 122.50)], 245).erreurs[0], /présente deux fois/);
});

test("chaque pièce doit être rattachable, et le motif nomme laquelle", () => {
  const cas: [PieceDuGroupe, RegExp][] = [
    [{ id: "x", nom: "archivee.pdf", extraction: lecture(122.50), retire: true }, /archivee.pdf : pièce archivée/],
    [{ id: "x", nom: "prise.pdf", extraction: lecture(122.50), depenseId: "autre" }, /prise.pdf : déjà rattachée/],
    [{ id: "x", nom: "fractionnee.pdf", extraction: lecture(122.50), paiementsAssocies: [{ id: "e", montant: 10 }] }, /fractionnee.pdf : déjà répartie/],
    [{ id: "x", nom: "nonlue.pdf", extraction: null }, /nonlue.pdf : pas encore lue/],
    [{ id: "x", nom: "vente.pdf", extraction: lecture(122.50, 0, { typeDocument: "vente" }) }, /vente.pdf : lue comme « vente »/],
    [{ id: "x", nom: "usd.pdf", extraction: lecture(122.50, 0, { devise: "USD" }) }, /usd.pdf : facture en devise étrangère/],
    [{ id: "x", nom: "sansdate.pdf", extraction: lecture(122.50, 0, { date: "" }) }, /sansdate.pdf :/],
  ];
  for (const [p, motif] of cas) {
    const v = verifierReglementGroupe([piece("a", 122.50), p], 245);
    assert.equal(v.ok, false, p.nom);
    assert.ok(v.erreurs.some(e => motif.test(e)), `${p.nom} : ${v.erreurs.join(" | ")}`);
  }
});

test("recomposer un groupe existant reste possible", () => {
  // Les pièces déjà rattachées à CE débit ne sont pas un obstacle.
  const v = verifierReglementGroupe(
    [piece("a", 122.50, 0, { depenseId: "d1" }), piece("b", 122.50, 0, { depenseId: "d1" })], 245, "d1");
  assert.deepEqual(v.erreurs, []);
  assert.equal(v.ok, true);
});

test("une TVA manquante annule le total de TVA, sans bloquer le groupe", () => {
  const v = verifierReglementGroupe([piece("a", 122.50, 20.42), piece("b", 122.50, null)], 245);
  assert.equal(v.ok, true);
  assert.equal(v.tva, null);
  assert.match(resumeGroupe(v, 245), /TVA à compléter/);
});

test("un débit nul ou négatif n'est pas justifiable par un groupe", () => {
  for (const montant of [0, -245, NaN]) {
    const v = verifierReglementGroupe([piece("a", 122.50), piece("b", 122.50)], montant);
    assert.equal(v.ok, false, String(montant));
    assert.match(v.erreurs[0], /montant positif/);
  }
});

/**
 * La TVA d'un règlement groupé s'additionne, alors que celle d'un paiement
 * fractionné reste « à vérifier » : dans le premier cas chaque facture n'est
 * payée qu'une fois, dans le second la même facture reviendrait à chaque
 * échéance.
 */
test("la TVA du mois additionne les factures du groupe", async () => {
  const { tvaJustifiee } = await import("../../src/lib/bilan-justificatifs");
  const ligne = {
    id: "d1", mois: "2026-07", dateOperation: "2026-07-15", fournisseur: "PRLV AGRIAL",
    poste: "Aliments, litières, paille", montant: 245, suivie: true, source: "releve-bancaire",
    piece: { id: "a", nom: "a.pdf", extraction: lecture(120.50, 20.08) },
    piecesGroupe: [{ extraction: lecture(120.50, 20.08) }, { extraction: lecture(124.50, 20.75) }],
  };
  assert.equal(tvaJustifiee(ligne as never), 40.83);

  // Une TVA manquante sur une seule facture : aucun total n'est annoncé.
  const incomplet = { ...ligne, piecesGroupe: [{ extraction: lecture(120.50, 20.08) }, { extraction: lecture(124.50, null) }] };
  assert.equal(tvaJustifiee(incomplet as never), null);

  // Une facture de vente glissée dans le groupe invalide le total.
  const vente = { ...ligne, piecesGroupe: [{ extraction: lecture(120.50, 20.08) }, { extraction: lecture(124.50, 20.75, { typeDocument: "vente" }) }] };
  assert.equal(tvaJustifiee(vente as never), null);
});
