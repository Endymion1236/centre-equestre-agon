import assert from "node:assert/strict";
import { test } from "node:test";
import { candidatsAutomatiques, concordanceFournisseur, planifierRapprochementAuto, type PieceMatching } from "../../src/lib/matching-automatique";
import type { DepenseCandidate, PieceExtraite } from "../../src/lib/justificatifs";

const piece = (extra: Partial<PieceExtraite> = {}): PieceExtraite => ({
  typeDocument: "achat", devise: "EUR", fournisseur: "U EXPRESS AGON", numero: "F-1", date: "2026-07-28",
  ht: 21.29, tva: 1.17, ttc: 22.46, salarie: null, moisPaie: null, netAPayer: null, debutPeriode: null, finPeriode: null, ...extra,
} as PieceExtraite);

const debit = (id: string, extra: Partial<DepenseCandidate> = {}): DepenseCandidate => ({
  id, mois: "2026-07", dateOperation: "2026-07-30", fournisseur: "CB U EXPRESS AGON 28/07", montant: 22.46,
  source: "releve-bancaire", poste: "Autres dépenses", ...extra,
} as DepenseCandidate);

test("le nom du fournisseur ne sert qu'à opposer un veto", () => {
  assert.equal(concordanceFournisseur("U EXPRESS AGON", "CB U EXPRESS AGON 28/07"), "identique");
  assert.equal(concordanceFournisseur("Uexpress", "CB UEXPRESS AGON"), "identique");
  assert.equal(concordanceFournisseur("Clinique Vétérinaire des Pommiers", "CLINIQUE VET DES POMMIERS"), "proche");
  assert.equal(concordanceFournisseur("e. p", "CB U EXPRESS"), "indetermine", "OCR illisible : on ne bloque pas");
  assert.equal(concordanceFournisseur("", "CB ORANGE"), "indetermine");
  assert.equal(concordanceFournisseur("CARREFOUR MARKET", "PRLV ORANGE SA"), "contradictoire");
});

test("un débit du même montant dans les sept jours est candidat ; au-delà, non", () => {
  const p = piece();
  assert.deepEqual(candidatsAutomatiques(p, [debit("a")]).map(c => c.id), ["a"]);
  assert.deepEqual(candidatsAutomatiques(p, [debit("a", { dateOperation: "2026-07-28" })]).map(c => c.id), ["a"], "le jour même compte");
  assert.deepEqual(candidatsAutomatiques(p, [debit("a", { dateOperation: "2026-08-04" })]).map(c => c.id), ["a"], "sept jours exactement");
  assert.deepEqual(candidatsAutomatiques(p, [debit("a", { dateOperation: "2026-08-05" })]), [], "huit jours : trop tard");
  assert.deepEqual(candidatsAutomatiques(p, [debit("a", { dateOperation: "2026-07-27" })]), [], "débit avant la facture");
  assert.deepEqual(candidatsAutomatiques(p, [debit("a", { montant: 22.45 })]), [], "un centime d'écart suffit à refuser");
  assert.deepEqual(candidatsAutomatiques(p, [debit("a", { fournisseur: "PRLV ORANGE SA" })]), [], "fournisseur contradictoire : veto");
  assert.deepEqual(candidatsAutomatiques(p, [debit("a", { fournisseur: "CB 4673 28/07" })]).map(c => c.id), ["a"], "libellé illisible : le montant et la date suffisent");
});

test("ni escompte, ni devise, ni paie, ni lecture douteuse", () => {
  assert.deepEqual(candidatsAutomatiques(piece({ ttc: 23 }), [debit("a")]), [], "écart de montant = escompte, jamais automatique");
  assert.deepEqual(candidatsAutomatiques(piece({ devise: "USD" }), [debit("a")]), []);
  assert.deepEqual(candidatsAutomatiques(piece({ typeDocument: "paie" }), [debit("a")]), []);
  assert.deepEqual(candidatsAutomatiques(piece({ ht: 10, tva: 1, ttc: 22.46 }), [debit("a")]), [], "HT + TVA ≠ TTC : alerte de lecture");
  assert.deepEqual(candidatsAutomatiques(piece({ date: undefined }), [debit("a")]), [], "sans date de facture, aucun délai vérifiable");
  for (const patch of [{ typeDocument: "vente" }, { typeDocument: "inconnu" }, { ttc: -22.46 }] as Partial<PieceExtraite>[])
    assert.deepEqual(candidatsAutomatiques(piece(patch), [debit("a")]), [], JSON.stringify(patch));
});

test("un seul candidat, un seul prétendant : sinon la main reste à l'humain", () => {
  const pieces: PieceMatching[] = [{ id: "p1", nom: "ticket.pdf", extraction: piece() }];
  const ok = planifierRapprochementAuto(pieces, [debit("a"), debit("b", { montant: 99 })], new Set());
  assert.deepEqual(ok.associations.map(a => [a.pieceId, a.depenseId, a.concordance]), [["p1", "a", "identique"]]);
  assert.deepEqual(ok.ignorees, []);

  const deuxDebits = planifierRapprochementAuto(pieces, [debit("a"), debit("b")], new Set());
  assert.deepEqual(deuxDebits.associations, []);
  assert.match(deuxDebits.ignorees[0].motif, /2 débits possibles/);

  const deuxPieces = planifierRapprochementAuto([...pieces, { id: "p2", extraction: piece({ numero: "F-2" }) }], [debit("a")], new Set());
  assert.deepEqual(deuxPieces.associations, []);
  assert.equal(deuxPieces.ignorees.length, 2);
  assert.ok(deuxPieces.ignorees.every(i => /Une autre pièce pourrait justifier/.test(i.motif)));

  const dejaJustifie = planifierRapprochementAuto(pieces, [debit("a")], new Set(["a"]));
  assert.deepEqual(dejaJustifie.associations, []);
  assert.match(dejaJustifie.ignorees[0].motif, /porte déjà un justificatif/);
});

test("les pièces hors jeu sont écartées avec leur motif", () => {
  const debits = [debit("a")];
  const cas: [PieceMatching, RegExp | null][] = [
    [{ id: "liee", extraction: piece(), depenseId: "x" }, null],
    [{ id: "retiree", extraction: piece(), retire: true }, null],
    [{ id: "fractionnee", extraction: piece(), paiementsAssocies: [{ id: "e", montant: 10 }] }, null],
    [{ id: "humaine", extraction: piece(), decisionHumaine: true }, /déjà traitée à la main/],
    [{ id: "nonlue", extraction: null }, /pas encore lue/],
    [{ id: "paie", extraction: piece({ typeDocument: "paie", salarie: "X", moisPaie: "2026-07", netAPayer: 1000 }) }, /seules les factures d'achat/],
    [{ id: "devise", extraction: piece({ devise: "USD" }) }, /devise étrangère/],
    [{ id: "sansdebit", extraction: piece({ ttc: 999, ht: 999, tva: 0 }) }, /Aucun débit de 999.00 €/],
  ];
  for (const [p, motif] of cas) {
    const r = planifierRapprochementAuto([p], debits, new Set());
    assert.deepEqual(r.associations, [], `${p.id} ne doit rien associer`);
    if (motif) { assert.equal(r.ignorees.length, 1, p.id); assert.match(r.ignorees[0].motif, motif); }
    else assert.deepEqual(r.ignorees, [], `${p.id} est hors périmètre, pas « ignorée »`);
  }
});

test("deux exemplaires de la même facture : doublon à trancher", () => {
  const r = planifierRapprochementAuto(
    [{ id: "p1", extraction: piece() }, { id: "p2", extraction: piece() }],
    [debit("a")], new Set());
  assert.deepEqual(r.associations, []);
  assert.ok(r.ignorees.every(i => /doublon à trancher/.test(i.motif)));
});

test("un ancien débit sans date, de même montant, empêche l'automatique", () => {
  const r = planifierRapprochementAuto([{ id: "p1", extraction: piece() }],
    [debit("a"), debit("vieux", { dateOperation: "", mois: "2026-07" })], new Set());
  assert.deepEqual(r.associations, []);
  assert.match(r.ignorees[0].motif, /sans date pourrait être le même paiement/);
});

test("deux pièces différentes vers deux débits distincts : les deux passent", () => {
  const pieces: PieceMatching[] = [
    { id: "p1", extraction: piece() },
    { id: "p2", extraction: piece({ fournisseur: "ENGIE", numero: "F-9", date: "2026-07-10", ht: 200, tva: 10, ttc: 210 }) },
  ];
  const debits = [debit("a"), debit("b", { fournisseur: "PRLV ENGIE", montant: 210, dateOperation: "2026-07-12" })];
  const r = planifierRapprochementAuto(pieces, debits, new Set());
  assert.deepEqual(r.associations.map(a => [a.pieceId, a.depenseId]), [["p1", "a"], ["p2", "b"]]);
  assert.deepEqual(r.ignorees, []);
});
