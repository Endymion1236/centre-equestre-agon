/**
 * Catégorie proposée à l'import d'un débit : règles sur le libellé, mémoire
 * des choix déjà faits, et compte du cabinet au bout de la chaîne.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { memoirePostes, proposerPosteBancaire, type ExistanteImport } from "../../src/lib/import-bancaire";
import { POSTES_DEPENSES, POSTE_HORS_DEPENSES } from "../../src/lib/postes-depenses";
import { CATEGORIE_PERSONNELLE } from "../../src/lib/tableau-depenses";
import { ventilerDepense } from "../../src/lib/plan-comptable-achats";

const debit = (fournisseur: string, poste: string, extra: Partial<ExistanteImport> = {}): ExistanteImport => ({
  id: `${fournisseur}-${poste}-${extra.dateOperation || ""}`, collection: "depenses", dateOperation: "2026-07-10", mois: "2026-07",
  fournisseur, montant: 42, poste, source: "releve-bancaire", ...extra,
});

test("les deux nouvelles catégories existent et portent un compte du cabinet", () => {
  for (const nom of ["Prestataires & sous-traitance (moniteurs, travaux)", "Informatique, logiciels & abonnements"]) {
    assert.ok(POSTES_DEPENSES.some(p => p.nom === nom), `${nom} absente des postes`);
    assert.ok(ventilerDepense({ poste: nom, fournisseur: "" }).compte, `${nom} sans compte par défaut`);
  }
});

test("le libellé bancaire propose la catégorie, du plus spécifique au plus général", () => {
  const cas: [string, string][] = [
    ["CB STATION U AGON COUTAINVILLE", "Carburants"],
    ["CB U EXPRESS AGON 28/07", "Autres dépenses"],
    ["CB RESEND SAN FRANCISCO", "Informatique, logiciels & abonnements"],
    ["PRLV ORANGE SA", "Informatique, logiciels & abonnements"],
    ["VIR MONITEUR INDEPENDANT DUPONT", "Prestataires & sous-traitance (moniteurs, travaux)"],
    ["CHQ MACON TRAVAUX BOX", "Prestataires & sous-traitance (moniteurs, travaux)"],
    ["CB HELLOFRESH FRANCE NE", CATEGORIE_PERSONNELLE],
    ["CB MGP*VINTED VILNIUS", CATEGORIE_PERSONNELLE],
    ["CB KIN SAYA SAINT LO", "Autres dépenses"],
    ["CB POINT P COUTANCES", "Fournitures & petit équipement (dont sellerie)"],
    ["VIR LACOLLEY JIMMY FOIN", "Aliments, litières, paille"],
    ["PRLV GROUPAMA", "Assurances"],
    ["CB QUELQUE CHOSE D INCONNU", POSTE_HORS_DEPENSES],
  ];
  for (const [libelle, attendu] of cas) assert.equal(proposerPosteBancaire(libelle), attendu, libelle);
});

test("les commissions bancaires et le compte FFE gardent la priorité sur les règles de libellé", () => {
  assert.equal(proposerPosteBancaire("Com Carte"), "Frais bancaires & commissions (CB, Stripe)");
  assert.equal(proposerPosteBancaire("Commission vente a distance"), "Frais bancaires & commissions (CB, Stripe)");
  assert.equal(proposerPosteBancaire("Carte FFE Lamotte"), "Compte FFE (avance licences & engagements)");
});

test("mémoire : la catégorie déjà choisie pour ce fournisseur revient toute seule", () => {
  const memoire = memoirePostes([
    debit("CHEVAL ENERGIE", "Aliments, litières, paille"),
    debit("CHEVAL ENERGIE", "Aliments, litières, paille", { dateOperation: "2026-06-10" }),
    debit("CHEVAL ENERGIE", "Autres dépenses", { dateOperation: "2026-05-10" }),
    debit("PRLV CHEVAL ENERGIE 12/08", "Aliments, litières, paille", { dateOperation: "2026-08-12" }),
  ]);
  assert.equal(memoire.get("cheval energie"), "Aliments, litières, paille", "la plus fréquente l'emporte, préfixes bancaires ignorés");
});

test("mémoire : à égalité, la décision la plus récente ; « à classer » n'en est pas une", () => {
  const memoire = memoirePostes([
    debit("SARL DUPONT", "Entretien (bâtiments, matériel, véhicules)", { dateOperation: "2026-05-01" }),
    debit("SARL DUPONT", "Prestataires & sous-traitance (moniteurs, travaux)", { dateOperation: "2026-08-01" }),
    debit("EN ATTENTE", POSTE_HORS_DEPENSES),
    debit("ARCHIVEE", "Assurances", { archive: true }),
    debit("EXCLUE", "Assurances", { rapprochementExclu: true }),
    debit("XY", "Assurances"),
  ]);
  assert.equal(memoire.get("sarl dupont"), "Prestataires & sous-traitance (moniteurs, travaux)");
  assert.equal(memoire.get("en attente"), undefined);
  assert.equal(memoire.get("archivee"), undefined);
  assert.equal(memoire.get("exclue"), undefined);
  assert.equal(memoire.get("xy"), undefined, "un libellé de moins de quatre caractères n'apprend rien");
});

test("la chaîne complète mène au compte du cabinet", () => {
  const cas: [string, string][] = [
    ["CB RESEND SAN FRANCISCO", "61562000"],
    ["PRLV ORANGE SA", "62640000"],
    ["VIR MONITEUR INDEPENDANT DUPONT", "60560000"],
    ["CHQ MACON TRAVAUX BOX", "61530000"],
    ["VIR PRESTATION EXTERIEURE", "60580000"],
    ["CB HELLOFRESH FRANCE NE", "45511000"],
    ["CB STATION U AGON", "60640000"],
  ];
  for (const [libelle, compte] of cas) {
    const poste = proposerPosteBancaire(libelle);
    assert.equal(ventilerDepense({ poste, fournisseur: libelle }).compte, compte, `${libelle} → ${poste}`);
  }
});
