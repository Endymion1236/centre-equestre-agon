import assert from "node:assert/strict";
import { test } from "node:test";
import { verifierEcheance, verifierAssociationTableau, decisionCategorie, CATEGORIE_PERSONNELLE, CATEGORIE_IMMOBILISATION, CATEGORIE_COMPTE_FFE } from "../../src/lib/tableau-depenses";
import { estVersementCompteFfe } from "../../src/lib/postes-depenses";
const debit = { id: "d", fournisseur: "Virement", source: "releve-bancaire", montant: 240 };
const facture = { typeDocument: "achat", devise: "EUR", fournisseur: "Les Pieux", numero: "2026000729", date: "2026-06-22", ht: 227.51, tva: 12.49, ttc: 240 };
test("association manuelle depuis une ligne : fournisseur bancaire différent permis, montant exact", () => {
  assert.equal(verifierAssociationTableau(facture, debit).nature, "facture");
  assert.throws(() => verifierAssociationTableau(facture, { ...debit, montant: 30 }));
});
test("bulletin : utiliser le net payé, pas le brut ni le net imposable", () => {
  const bulletin = { typeDocument: "paie", devise: "EUR", salarie: "Test", moisPaie: "2026-07", brut: 2500, netAPayer: 1875 };
  assert.equal(verifierAssociationTableau(bulletin, { ...debit, montant: 1875 }).nature, "paie");
  assert.throws(() => verifierAssociationTableau(bulletin, { ...debit, montant: 2500 }));
  assert.throws(() => verifierAssociationTableau({ ...bulletin, moisPaie: "" }, { ...debit, montant: 1875 }));
});
test("devise : conserver dollars et euros sans transformer les montants", () => {
  const p = { ...facture, devise: "USD", ttc: 20, ht: 20, tva: null }, d = { ...debit, montant: 18.47 };
  const avant = JSON.stringify([p, d]);
  assert.deepEqual(verifierAssociationTableau(p, d), { nature: "devise", montantPiece: 20, devisePiece: "USD", montantEUR: 18.47 });
  assert.equal(JSON.stringify([p, d]), avant);
});
test("refuser les ventes, les documents étrangers au parcours et les saisies sans débit", () => {
  for (const typeDocument of ["vente", "autre"]) assert.throws(() => verifierAssociationTableau({ ...facture, typeDocument }, debit));
  assert.throws(() => verifierAssociationTableau(facture, { ...debit, source: "saisie" }));
  assert.throws(() => verifierAssociationTableau(facture, { ...debit, montant: -240 }));
});

test("échéances : quatrième paiement, dépassement, devise et total inconnu", () => {
  const p = { ...facture, ttc: 360, date: "2026-05-01" };
  assert.doesNotThrow(() => verifierEcheance(p, 90, 270));
  assert.doesNotThrow(() => verifierEcheance(p, 90, 0));
  assert.throws(() => verifierEcheance(p, 90, 360));
  assert.throws(() => verifierEcheance({ ...p, devise: "USD" }, 90, 0));
  assert.throws(() => verifierEcheance({ ...p, typeDocument: "paie" }, 90, 0));
  assert.throws(() => verifierEcheance({ ...p, ttc: null }, 90, 0));
  assert.throws(() => verifierEcheance(p, -90, 0));
});

test("les blocages donnent une action précise au lieu d’un conflit opaque", () => {
  assert.throws(() => verifierAssociationTableau({ ...facture, devise: "" }, debit), /Devise.*non renseignée/);
  assert.throws(() => verifierAssociationTableau(facture, { ...debit, montant: 90 }), /Échéance d’une facture/);
  assert.throws(() => verifierAssociationTableau({ ...facture, ttc: null }, debit), /TTC absent/);
});

const categories = ["Vétérinaire", "Frais bancaires", CATEGORIE_IMMOBILISATION, CATEGORIE_COMPTE_FFE, "Salaires", "Virements internes", CATEGORIE_PERSONNELLE, "hors-depenses"];
const postesCharges = ["Vétérinaire", "Frais bancaires"];
const mouvement = { id: "m1", fournisseur: "CLINIQUE VET DES POMMIERS", montant: 420.66, source: "releve-bancaire", mois: "2026-08", dateOperation: "2026-08-05" };
const decider = (patch: Partial<Parameters<typeof decisionCategorie>[0]> = {}) => decisionCategorie({ estDepense: false, poste: "Vétérinaire", categories, postesCharges, ligne: mouvement, depensesDuMois: [], ...patch });
test("un débit hors dépenses classé en charge devient une dépense, sans exiger de justificatif", () => {
  assert.deepEqual(decider(), { decision: "promouvoir" });
});
test("classé hors charges (salaires, virement interne, personnel), le débit reste un simple mouvement", () => {
  for (const poste of ["Salaires", "Virements internes", CATEGORIE_PERSONNELLE, "hors-depenses"]) assert.deepEqual(decider({ poste }), { decision: "mettre-a-jour" });
});
test("le même débit déjà présent dans les dépenses n'est pas compté deux fois", () => {
  const r = decider({ depensesDuMois: [{ id: "d9", fournisseur: "Clinique Vet des Pommiers", montant: 420.66, source: "releve-bancaire", mois: "2026-08", dateOperation: "2026-08-05" }] });
  assert.equal(r.decision, "refuser");
  assert.match((r as { motif: string }).motif, /déjà/);
  // Autre date, autre opération : pas un doublon.
  assert.deepEqual(decider({ depensesDuMois: [{ id: "d9", fournisseur: "Clinique Vet des Pommiers", montant: 420.66, source: "releve-bancaire", mois: "2026-08", dateOperation: "2026-08-19" }] }), { decision: "promouvoir" });
});
test("une dépense déjà en charges ne sort du périmètre que vers Personnel", () => {
  assert.equal(decider({ estDepense: true, poste: "Virements internes" }).decision, "refuser");
  assert.deepEqual(decider({ estDepense: true, poste: CATEGORIE_PERSONNELLE }), { decision: "mettre-a-jour" });
  assert.deepEqual(decider({ estDepense: true, poste: "Frais bancaires" }), { decision: "mettre-a-jour" });
  assert.equal(decider({ poste: "Inconnue" }).decision, "refuser");
});

test("une immobilisation est une dépense à exporter, hors charges : promue depuis un mouvement, acceptée depuis une charge", () => {
  assert.deepEqual(decider({ poste: CATEGORIE_IMMOBILISATION }), { decision: "promouvoir" });
  assert.deepEqual(decider({ estDepense: true, poste: CATEGORIE_IMMOBILISATION }), { decision: "mettre-a-jour" });
  assert.deepEqual(decider({ estDepense: true, poste: "Vétérinaire" }), { decision: "mettre-a-jour" }, "retour d'une immobilisation vers une charge");
});

test("compte FFE : une avance, pas une charge — reconnue au libellé, requalifiable depuis une charge, jamais promue en charge", () => {
  for (const l of ["Carte Ffe Lamotte-beuvro", "FFE", "PRLV Federation Francaise d'Equitation"]) assert.equal(estVersementCompteFfe(l), true, l);
  for (const l of ["COIFFEUR", "BUFFET TRAITEUR", "Orange"]) assert.equal(estVersementCompteFfe(l), false, l);
  assert.deepEqual(decider({ estDepense: true, poste: CATEGORIE_COMPTE_FFE }), { decision: "mettre-a-jour" });
  assert.deepEqual(decider({ poste: CATEGORIE_COMPTE_FFE }), { decision: "mettre-a-jour" }, "reste un mouvement hors charges");
});
