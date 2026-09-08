import assert from "node:assert/strict";
import { test } from "node:test";
import { candidatsAutomatiques, concordanceFournisseur, diagnostiquerDebit, indiceProximite, planifierRapprochementAuto, resumerRefus, type PieceMatching } from "../../src/lib/matching-automatique";
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
  // Un veto se fonde sur une contradiction, pas sur une absence de
  // ressemblance : la station-service du magasin U d'Agon et le libellé
  // bancaire du même magasin ne se recouvrent pas, mais partagent « agon ».
  assert.equal(concordanceFournisseur("STATION U AGON COUTAINVILLE", "Paiement par carte X4673 UEP*U EXPRESS AGON C 01/09"), "indetermine");
  // Deux commerçants sans le moindre mot commun restent un veto.
  assert.equal(concordanceFournisseur("Céléris (GD-OBS)", "Paiement par carte X4673 UEP*U EXPRESS AGON C 01/09"), "contradictoire");
  assert.equal(concordanceFournisseur("Agrial", "PRLV PADD"), "contradictoire");
  // Le jargon du relevé ne crée pas de ressemblance : « paiement », « carte »,
  // « prlv » et les références de carte ne désignent personne.
  assert.equal(concordanceFournisseur("Paiement Orange", "Paiement par carte X4673 CHEZ AGRIAL"), "contradictoire");
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
  // HT + TVA ≠ TTC ne bloque plus : la ventilation TVA est à reprendre, mais
  // le TTC payé — le seul montant qui figure au relevé — reste identifiable.
  assert.equal(candidatsAutomatiques(piece({ ht: 10, tva: 1, ttc: 22.46 }), [debit("a")]).length, 1, "un écart de TVA ne masque pas le paiement");
  assert.deepEqual(candidatsAutomatiques(piece({ fournisseur: "" }), [debit("a")]), [], "sans fournisseur, la pièce n'identifie personne");
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
    [{ id: "misedecote", extraction: piece(), decisionAssociation: true }, /mise de côté pour un traitement manuel/],
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
  assert.ok(r.ignorees.every(i => /archivez l'exemplaire en trop/.test(i.motif)));
});

test("un ancien débit sans date, de même montant, empêche l'automatique", () => {
  const r = planifierRapprochementAuto([{ id: "p1", extraction: piece() }],
    [debit("a"), debit("vieux", { dateOperation: "", mois: "2026-07" })], new Set());
  assert.deepEqual(r.associations, []);
  // Depuis qu'un débit sans date est un candidat à part entière, le refus
  // vient de l'ambiguïté plutôt que d'une règle dédiée — et le motif nomme
  // les deux débits au lieu d'évoquer un risque.
  assert.match(r.ignorees[0].motif, /2 débits possibles/);
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

/**
 * Quinze tickets lus, corrigés à la main, et zéro rapprochement : deux règles
 * trop larges les écartaient toutes. Corriger la lecture d'une pièce, c'est
 * préparer son rapprochement, pas y renoncer ; et un ticket de caisse à
 * plusieurs taux de TVA se lit souvent avec un HT partiel, sans que le TTC
 * payé — le seul montant qui figure au relevé — en souffre.
 */
test("une lecture corrigée à la main reste rapprochable", () => {
  const r = planifierRapprochementAuto([{ id: "p1", extraction: piece(), decisionAssociation: false }], [debit("a")], new Set());
  assert.equal(r.associations.length, 1);
  assert.equal(r.associations[0].depenseId, "a");
});

test("un écart HT + TVA n'empêche pas d'identifier le paiement", () => {
  // Ticket de caisse : 47,32 € payés, mais seul le HT à 5,5 % a été lu.
  const ticket = piece({ ht: 12, tva: 0.66, ttc: 47.32 });
  const r = planifierRapprochementAuto([{ id: "t", extraction: ticket }], [debit("a", { montant: 47.32 })], new Set());
  assert.equal(r.associations.length, 1, JSON.stringify(r.ignorees));
  // Une date ou un TTC manquants, eux, restent bloquants : sans eux on ne
  // sait pas quel paiement la pièce justifie.
  const sansDate = planifierRapprochementAuto([{ id: "s", extraction: piece({ date: "" }) }], [debit("a")], new Set());
  assert.deepEqual(sansDate.associations, []);
  assert.match(sansDate.ignorees[0].motif, /Lecture à compléter/);
});

/**
 * « Aucun débit de 47,32 € » ne dit pas quoi faire. Le rapport nomme
 * désormais le débit le plus proche et l'écart exact : c'est la différence
 * entre un constat et une consigne.
 */
test("le rapport montre le débit le plus proche et ce qui cloche", () => {
  const p = (extra: Partial<PieceExtraite> = {}) => piece({ ttc: 47.32, ht: 47.32, tva: 0, ...extra });

  // Un chiffre mal lu par l'OCR.
  assert.match(indiceProximite(p(), [debit("a", { montant: 47.23, dateOperation: "2026-07-29" })]).texte,
    /Le débit le plus proche est 47.23 € le 2026-07-29.*0.09 € d'écart/);
  assert.equal(indiceProximite(p(), [debit("a", { montant: 47.23, dateOperation: "2026-07-29" })]).famille, "montant-proche");

  // Bon montant, mais trop tard.
  assert.match(indiceProximite(p(), [debit("a", { montant: 47.32, dateOperation: "2026-08-20" })]).texte,
    /mais 23 jours après/);

  // Bon montant, date antérieure à celle lue sur la pièce.
  assert.match(indiceProximite(p(), [debit("a", { montant: 47.32, dateOperation: "2026-07-20" })]).texte,
    /AVANT la date lue sur la pièce/);

  // Montant et date bons : c'est le nom qui a fait veto.
  assert.match(indiceProximite(p({ fournisseur: "GERBER" }), [debit("a", { montant: 47.32, dateOperation: "2026-07-30", fournisseur: "CB CARREFOUR CONTACT" })]).texte,
    /bon montant et la bonne date.*ne ressemble pas à « GERBER »/);
  assert.equal(indiceProximite(p({ fournisseur: "GERBER" }), [debit("a", { montant: 47.32, dateOperation: "2026-07-30", fournisseur: "CB CARREFOUR CONTACT" })]).famille, "veto-nom");

  // Rien de comparable : aucun indice inventé.
  assert.equal(indiceProximite(p(), [debit("a", { montant: 900 })]).texte, "");

  // Et l'indice remonte bien dans le motif de la pièce écartée.
  const r = planifierRapprochementAuto([{ id: "t", extraction: p() }], [debit("a", { montant: 47.23, dateOperation: "2026-07-29" })], new Set());
  assert.match(r.ignorees[0].motif, /Le débit le plus proche est 47.23 €/);
});

/**
 * Cent trois pièces « restant à associer » pour un mois qui n'en comptait
 * qu'une poignée : le rapport examinait toutes les pièces de la base, y
 * compris celles d'août et de février, et reprochait à une facture d'août de
 * n'avoir aucun débit en juillet.
 */
test("le rapport se borne au mois traité et classe ses refus", () => {
  const pieces: PieceMatching[] = [
    { id: "juillet", nom: "ticket.pdf", extraction: piece() },
    { id: "aout", nom: "aout.pdf", extraction: piece({ date: "2026-08-26", numero: "F-9" }) },
    { id: "fevrier", nom: "fevrier.pdf", extraction: piece({ date: "2026-02-25", numero: "F-8" }) },
    { id: "bulletin", nom: "paie.pdf", extraction: piece({ typeDocument: "paie", salarie: "X", moisPaie: "2026-07", netAPayer: 1000, numero: "" }) },
  ];
  const r = planifierRapprochementAuto(pieces, [debit("a")], new Set(), "2026-07");
  assert.deepEqual(r.associations.map(a => a.pieceId), ["juillet"]);

  const familles = Object.fromEntries(r.ignorees.map(i => [i.pieceId, i.famille]));
  assert.equal(familles.aout, "hors-periode");
  assert.equal(familles.fevrier, "hors-periode");
  assert.equal(familles.bulletin, "pas-un-achat");
  assert.match(r.ignorees.find(i => i.pieceId === "aout")!.motif, /relancez sur 2026-08/);

  // Un achat du 28 juin débité début juillet reste examiné en juillet.
  const finJuin = planifierRapprochementAuto(
    [{ id: "juin", extraction: piece({ date: "2026-06-28" }) }],
    [debit("a", { dateOperation: "2026-07-02" })], new Set(), "2026-07");
  assert.deepEqual(finJuin.associations.map(a => a.pieceId), ["juin"]);

  // Sans mois, aucun bornage : le comportement d'origine est conservé.
  assert.equal(planifierRapprochementAuto(pieces, [debit("a")], new Set()).ignorees.some(i => i.famille === "hors-periode"), false);

  const resume = resumerRefus(r.ignorees);
  assert.deepEqual(resume.map(f => [f.famille, f.nb]), [["pas-un-achat", 1], ["hors-periode", 2]]);
});

/**
 * « Le justificatif est là, pourquoi ne s'est-il pas rattaché ? » Le rapport
 * global part des pièces et ne répond pas à cette question, posée devant une
 * ligne précise du tableau. Le diagnostic prend le problème par l'autre bout.
 */
test("le diagnostic d'un débit dit ce qui a écarté chaque pièce", () => {
  const d = debit("d1", { montant: 107.98, dateOperation: "2026-09-02", fournisseur: "Paiement par carte X4673 UEP*U EXPRESS AGON C 01/09", mois: "2026-09" });

  // La pièce exacte : tout concorde, donc c'est le mois du lancement qui a manqué.
  const exacte = { id: "ok", nom: "U Express.pdf", extraction: piece({ ttc: 107.98, ht: 107.98, tva: 0, date: "2026-09-01" }) };
  const r = diagnostiquerDebit(d, [exacte], false);
  assert.match(r.verdictGeneral, /Lancez le rapprochement automatique sur 2026-09/);
  assert.match(r.candidats[0].verdict, /aurait dû être rattachée/);
  assert.equal(r.candidats[0].ecartMontant, 0);
  assert.equal(r.candidats[0].jours, 1);

  // Chaque obstacle a sa phrase, et elle dit quoi faire.
  const cas: [PieceMatching, RegExp][] = [
    [{ id: "nonlue", extraction: null }, /pas encore lue/],
    [{ id: "vente", extraction: piece({ typeDocument: "vente", ttc: 107.98, ht: 107.98, tva: 0, date: "2026-09-01" }) }, /corrigez la lecture en « achat »/],
    [{ id: "prise", extraction: piece({ ttc: 107.98, ht: 107.98, tva: 0, date: "2026-09-01" }), depenseId: "autre" }, /Déjà rattachée/],
    [{ id: "montant", extraction: piece({ ttc: 99, ht: 99, tva: 0, date: "2026-09-01" }) }, /Montant différent : 99.00 € sur la pièce contre 107.98 €/],
    [{ id: "tard", extraction: piece({ ttc: 107.98, ht: 107.98, tva: 0, date: "2026-08-01" }) }, /32 jours après la pièce/],
    [{ id: "apres", extraction: piece({ ttc: 107.98, ht: 107.98, tva: 0, date: "2026-09-10" }) }, /8 jour\(s\) APRÈS le débit/],
    [{ id: "cote", extraction: piece({ ttc: 107.98, ht: 107.98, tva: 0, date: "2026-09-01" }), decisionAssociation: true }, /Mise de côté/],
  ];
  for (const [p, motif] of cas) {
    const res = diagnostiquerDebit(d, [p], false);
    assert.equal(res.candidats.length, 1, p.id);
    assert.match(res.candidats[0].verdict, motif, p.id);
  }

  // Un débit déjà justifié, exclu ou saisi à la main : rien à diagnostiquer.
  assert.match(diagnostiquerDebit(d, [exacte], true).verdictGeneral, /porte déjà un justificatif/);
  assert.match(diagnostiquerDebit({ ...d, rapprochementExclu: true }, [exacte], false).verdictGeneral, /exclu du rapprochement/);
  assert.match(diagnostiquerDebit({ ...d, source: "saisie" }, [exacte], false).verdictGeneral, /débits issus d'un relevé/);

  // Les pièces archivées ne sont pas proposées ; les plus proches viennent en tête.
  const tri = diagnostiquerDebit(d, [
    { id: "loin", extraction: piece({ ttc: 12, ht: 12, tva: 0, date: "2026-09-01" }) },
    { id: "archivee", extraction: piece({ ttc: 107.98, ht: 107.98, tva: 0 }), retire: true },
    exacte,
  ], false);
  assert.deepEqual(tri.candidats.map(c => c.pieceId), ["ok", "loin"]);
});

/**
 * Le cas qui a motivé l'assouplissement du veto : un plein d'essence à la
 * station du magasin U d'Agon, débité au centime près le lendemain, refusé
 * parce que le libellé bancaire du groupe U ne ressemble pas au nom de la
 * station.
 */
test("la station-service du magasin U se rattache à son débit", () => {
  const ticket = piece({ fournisseur: "STATION U AGON COUTAINVILLE", ttc: 107.98, ht: 107.98, tva: 0, date: "2026-09-01", numero: "" });
  const d = debit("d1", { montant: 107.98, dateOperation: "2026-09-02", mois: "2026-09", fournisseur: "Paiement par carte X4673 UEP*U EXPRESS AGON C 01/09" });

  const r = planifierRapprochementAuto([{ id: "sp95", nom: "Station U.pdf", extraction: ticket }], [d], new Set(), "2026-09");
  assert.deepEqual(r.associations.map(a => [a.pieceId, a.depenseId]), [["sp95", "d1"]], JSON.stringify(r.ignorees));

  // La pièce d'un tout autre fournisseur, au même montant et au même jour,
  // reste écartée : le veto n'a pas disparu, il s'est resserré.
  const celeris = piece({ fournisseur: "Céléris (GD-OBS)", ttc: 107.98, ht: 107.98, tva: 0, date: "2026-09-01", numero: "" });
  const r2 = planifierRapprochementAuto([{ id: "cel", nom: "Céléris.pdf", extraction: celeris }], [d], new Set(), "2026-09");
  assert.deepEqual(r2.associations, []);
  assert.match(r2.ignorees[0].motif, /bon montant et la bonne date.*ne ressemble pas/);
});

/**
 * Un relevé importé sans dates d'opération bloquait vingt-trois pièces d'un
 * même mois : leur débit existait, au centime près, mais aucun délai ne
 * pouvait être vérifié. Le mois du débit tient alors lieu de fenêtre.
 */
test("un débit sans date se rattache par son mois, sans perdre les garanties", () => {
  const facture = piece({ fournisseur: "SAUR", ttc: 894.71, ht: 894.71, tva: 0, date: "2026-07-16", numero: "F-S1" });
  const sansDate = (id: string, extra: Partial<DepenseCandidate> = {}) =>
    debit(id, { montant: 894.71, fournisseur: "SAUR50", dateOperation: "", mois: "2026-07", ...extra });

  const r = planifierRapprochementAuto([{ id: "saur", extraction: facture }], [sansDate("d1")], new Set(), "2026-07");
  assert.deepEqual(r.associations.map(a => [a.pieceId, a.depenseId, a.viaMois]), [["saur", "d1", true]], JSON.stringify(r.ignorees));

  // Un achat de fin de mois débité le mois suivant reste rattachable.
  const finJuillet = piece({ fournisseur: "POINT.P", ttc: 54.54, ht: 54.54, tva: 0, date: "2026-07-31", numero: "F-P1" });
  const aout = planifierRapprochementAuto([{ id: "pp", extraction: finJuillet }],
    [debit("d2", { montant: 54.54, fournisseur: "POINT P", dateOperation: "", mois: "2026-08" })], new Set(), "2026-08");
  assert.equal(aout.associations.length, 1, JSON.stringify(aout.ignorees));

  // Deux débits sans date, même montant, même mois : l'ambiguïté l'emporte.
  const deux = planifierRapprochementAuto([{ id: "saur", extraction: facture }], [sansDate("d1"), sansDate("d2")], new Set(), "2026-07");
  assert.deepEqual(deux.associations, []);

  // Un débit sans date d'un mois trop éloigné n'est pas un candidat.
  const loin = planifierRapprochementAuto([{ id: "saur", extraction: facture }], [sansDate("d1", { mois: "2026-11" })], new Set(), "2026-07");
  assert.deepEqual(loin.associations, []);
  assert.match(loin.ignorees[0].motif, /sans date d'opération et sur un autre mois \(2026-11\)/);

  // Le veto du nom s'applique comme avant.
  const autre = planifierRapprochementAuto([{ id: "saur", extraction: facture }],
    [sansDate("d1", { fournisseur: "PRLV ORANGE SA" })], new Set(), "2026-07");
  assert.deepEqual(autre.associations, []);
});
