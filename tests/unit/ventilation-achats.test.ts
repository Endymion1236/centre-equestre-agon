import assert from "node:assert/strict";
import { test } from "node:test";
import { bilanVentilationAchats, comptesProposes, construireExportVentilationAchats } from "../../src/lib/ventilation-achats";
import { construireExportJustificatifs, type LigneMois } from "../../src/lib/bilan-justificatifs";
import { construireColisComptable, corpsEmailComptable } from "../../src/lib/envoi-comptable-utils";

// Mois complet fictif : achats, hors charges, échéances et ligne exclue.
const ligne = (id: string, poste: string, fournisseur: string, montant: number, extra: Partial<LigneMois> = {}): LigneMois => ({
  id, mois: "2026-08", dateOperation: "2026-08-15", compte: "CA courant", suivie: true, source: "releve-bancaire", poste, fournisseur, montant, ...extra,
});
const facture = { id: "f360", modeRattachement: "echeance", paiementsAssocies: [{ id: "e1", montant: 90 }, { id: "e2", montant: 90 }], extraction: { typeDocument: "achat", devise: "EUR", ht: 300, tva: 60, ttc: 360, numero: "F360" } };
const lignes: LigneMois[] = [
  ligne("arval", "Locations & loyers", "Loyer Arval", 400),
  ligne("foin", "Aliments, litières, paille", "Foin Agrial", 180),
  ligne("salaire", "Salaires", "Virement salarié", 1700, { suivie: false }),
  ligne("ffe", "Compte FFE (avance licences & engagements)", "FFE", 300, { suivie: false, avanceFfe: true }),
  ligne("perso", "Personnel — hors charges", "Restaurant", 50, { depensePersonnelle: true }),
  ligne("pret", "Emprunts", "Échéance de prêt", 700, { suivie: false }),
  ligne("inconnu", "Catégorie inconnue", "Inconnu", 60),
  ligne("e1", "Autres dépenses", "Fournisseur", 90, { piece: facture }),
  ligne("e2", "Autres dépenses", "Fournisseur", 90, { piece: facture }),
  ligne("exclue", "Autres dépenses", "Exclue", 999, { rapprochementExclu: true }),
];

test("le CSV distingue l'imputation, le fournisseur et la banque sans changer les données", () => {
  const avant = JSON.stringify(lignes);
  const p = comptesProposes(lignes[0]);
  assert.equal(p.imputation.compte, "61320000");
  assert.equal(p.fournisseur.compte, "401ARVAL");
  assert.equal(p.banque.compte, "51200000");
  assert.equal(p.aVentiler, false);
  const csv = construireExportVentilationAchats(lignes);
  assert.match(csv, /"61320000";"Location véhicule Skoda";"mot-cle";"401ARVAL";"CA courant";"51200000"/);
  assert.match(csv, /"salaire"/);
  assert.match(csv, /"51730000"/);
  assert.match(csv, /"45511000"/);
  assert.doesNotMatch(csv, /"exclue"/);
  assert.equal(csv.trimEnd().split("\r\n").length, 10);
  assert.equal(JSON.stringify(lignes), avant);
});

test("les points à ventiler comprennent emprunt, catégorie, banque et fournisseur inconnus", () => {
  assert.equal(comptesProposes(lignes[5]).imputation.compte, "");
  assert.match(comptesProposes(lignes[5]).controles.join(" "), /capital.*intérêts/);
  assert.equal(comptesProposes(lignes[6]).aVentiler, true);
  assert.equal(comptesProposes({ ...lignes[0], compte: "Inconnue" }).banque.compte, "");
  // Un fournisseur non répertorié part au compte collectif : c'est une
  // proposition utilisable, pas un point de contrôle.
  assert.equal(comptesProposes({ ...lignes[0], fournisseur: "Inconnu" }).fournisseur.compte, "40100000");
  assert.equal(comptesProposes({ ...lignes[0], fournisseur: "Inconnu" }).aVentiler, false);
  assert.equal(comptesProposes({ ...lignes[0], doublonProbable: true }).aVentiler, true);
  // Deux lignes de moins qu'avant : elles n'étaient « à ventiler » que parce
  // que leur fournisseur n'était pas répertorié, ce qui n'empêche rien.
  assert.deepEqual(bilanVentilationAchats(lignes), { total: 9, aVentiler: 2, montantAVentiler: 760 });
});

test("le colis du mois contient exactement le CSV proposé à l'écran et le bilan TVA prudent", () => {
  const horsMois = ligne("septembre", "Autres dépenses", "Hors mois", 5000, { mois: "2026-09", dateOperation: "2026-09-01" });
  const colis = construireColisComptable({ mois: "2026-08", payments: [], encaissements: [], depenses: lignes, lignesJustificatifs: [...lignes, horsMois] });
  const piece = colis.pieces.find(p => p.filename === "ventilation_achats_2026-08.csv")!;
  assert.equal(piece.contenu, "\uFEFF" + construireExportVentilationAchats(lignes));
  assert.doesNotMatch(piece.contenu, /septembre|5000/);
  assert.deepEqual(colis.resume.ventilationAchats, bilanVentilationAchats(lignes));
  assert.equal(colis.resume.tvaDeductibleJustifiee, 0);
  assert.ok(colis.resume.tvaAVerifier!.nb >= 2);
  const mail = corpsEmailComptable({ mois: colis.mois, resume: colis.resume, pieces: colis.pieces.map(p => p.filename), nomCentre: "Club test" });
  assert.match(mail, /2 à ventiler/);
  assert.match(mail, /hors total TVA automatique/);
  const justificatifs = construireExportJustificatifs(lignes);
  assert.match(justificatifs, /Compte d’imputation proposé/);
  assert.match(justificatifs, /61320000;401ARVAL;51200000/);
});

test("les débits et documents exclus ne reparaissent pas dans la ventilation", () => {
  const lot = [lignes[0], { ...lignes[0], id: "nul", montant: 0 }, { ...lignes[0], id: "credit", montant: -10 }, { ...lignes[0], id: "invalide", montant: NaN }, lignes.at(-1)!];
  assert.equal(bilanVentilationAchats(lot).total, 1);
  assert.equal(construireExportVentilationAchats(lot).trimEnd().split("\r\n").length, 2);
});

test("les libellés importés sont échappés et ne deviennent pas des formules Excel", () => {
  const csv = construireExportVentilationAchats([ligne("csv", "Autres dépenses", '=HYPERLINK("https://example.invalid";"x")', 10)]);
  assert.match(csv, /"'=HYPERLINK\(""https:\/\/example.invalid"";""x""\)"/);
});
