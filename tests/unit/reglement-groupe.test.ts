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

test("un écart au-delà de la tolérance est refusé, et le message dit de quel côté ; un centime reste à confirmer", () => {
  const manque = verifierReglementGroupe([piece("a", 120), piece("b", 122.50)], 245);
  assert.equal(manque.ok, false); assert.equal(manque.toleree, false);
  assert.equal(manque.ecart, -2.5);
  assert.match(manque.erreurs[0], /Il manque 2.50 €.*n'a pas encore été importée/);

  const trop = verifierReglementGroupe([piece("a", 120), piece("b", 127.50)], 245);
  assert.equal(trop.ok, false); assert.equal(trop.toleree, false);
  assert.match(trop.erreurs[0], /dépasse le débit de 2.50 €.*en trop/);

  // Un centime : jamais « ok » tout seul, mais rattachable après confirmation.
  const centime = verifierReglementGroupe([piece("a", 120), piece("b", 124.99)], 245);
  assert.equal(centime.ok, false); assert.equal(centime.toleree, true); assert.equal(centime.ecart, -0.01);
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

/**
 * La clinique vétérinaire accorde 2 % d'escompte pour prélèvement à
 * l'échéance et l'écrit sur chaque facture : « TTC 422,20 € — escompte déduit
 * 413,76 € ». Deux factures soldées ensemble étaient refusées : la somme des
 * TTC pleins ne tombait jamais sur le débit.
 */
test("escompte annoncé : le groupe accepte la somme des montants escompte déduit, et le dit", () => {
  const a = piece("a", 422.20, 70.37, { extraction: lecture(422.20, 70.37, { ttcEscompte: 413.76 }) });
  const b = piece("b", 100, 16.67, { extraction: lecture(100, 16.67, { ttcEscompte: 98 }) });
  const v = verifierReglementGroupe([a, b], 511.76);
  assert.deepEqual(v.erreurs, []);
  assert.equal(v.ok, true);
  assert.equal(v.total, 511.76); assert.equal(v.totalPlein, 522.20); assert.equal(v.escompte, 10.44);
  assert.match(resumeGroupe(v, 511.76), /escompte de 10.44 € déduit sur 522.20 € facturés/);
  assert.match(resumeGroupe(v, 511.76), /à ajuster de l'escompte/);

  // Le fournisseur n'a pas appliqué l'escompte : le TTC plein reste accepté.
  const plein = verifierReglementGroupe([a, b], 522.20);
  assert.equal(plein.ok, true); assert.equal(plein.escompte, 0); assert.equal(plein.total, 522.20);

  // Une facture sans escompte annoncé compte pour son TTC dans les deux sommes.
  const mixte = verifierReglementGroupe([a, piece("c", 50, 8.33)], 463.76);
  assert.equal(mixte.ok, true); assert.equal(mixte.escompte, 8.44);

  // Ni l'un ni l'autre : refus, avec les deux totaux.
  const ni = verifierReglementGroupe([a, b], 500);
  assert.equal(ni.ok, false);
  assert.match(ni.erreurs[0], /Escompte déduit, le total serait de 511.76 €/);
});

/**
 * Trois factures du maréchal-ferrant, 1 029,04 € facturés pour 1 028,90 €
 * prélevés : les bonnes factures, une erreur de report de 14 centimes chez
 * le fournisseur. Un petit écart se confirme au lieu de bloquer.
 */
test("un écart de quelques centimes est toléré sur confirmation, et dit lequel", () => {
  const v = verifierReglementGroupe([piece("a", 716.23, 119.37), piece("b", 312.81, 52.14)], 1028.90);
  assert.equal(v.ok, false); assert.equal(v.toleree, true);
  assert.deepEqual(v.erreurs, []);
  assert.equal(v.ecart, 0.14);
  assert.match(resumeGroupe(v, 1028.90), /écart de 0.14 €.*facturé en plus.*acceptable si vous le confirmez/);

  // Au-delà d'un euro, ou d'un demi-pour-cent du débit : refus, comme avant.
  const trop = verifierReglementGroupe([piece("a", 716.23), piece("b", 313.90)], 1028.90);
  assert.equal(trop.toleree, false); assert.equal(trop.ok, false); assert.match(trop.erreurs[0], /dépasse le débit de 1.23 €/);
  const petitDebit = verifierReglementGroupe([piece("a", 10.30), piece("b", 10.30)], 20);
  assert.equal(petitDebit.toleree, false, "0,60 € sur 20 € : 3 %, trop pour un arrondi");

  // Un total exact reste « ok », sans passer par la tolérance.
  const exact = verifierReglementGroupe([piece("a", 716.23), piece("b", 312.67)], 1028.90);
  assert.equal(exact.ok, true); assert.equal(exact.toleree, false);
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
