import assert from "node:assert/strict";
import { test } from "node:test";
import { compteBanque, compteFournisseur, ventilerDepense } from "../../src/lib/plan-comptable-achats";

test("les subdivisions précises priment sur les mots génériques", () => {
  const cas = [
    ["Locations & loyers", "Loyer ARVAL Skoda", "61320000"],
    ["Locations & loyers", "Loyer imprimante Rex Rotary", "61322000"],
    ["Locations & loyers", "Loyer centre équestre", "61310000"],
    ["Immobilisation — à amortir", "Cheval de sport", "24313000"],
    ["Immobilisation — à amortir", "Poney de manège", "24314000"],
    ["Autres dépenses", "Edenred tickets restaurants", "64700000"],
    ["Autres dépenses", "Ticket resto", "64700000"],
    ["Autres dépenses", "Ticket restaurant", "64700000"],
    ["Autres dépenses", "Restaurant la Cale", "62570000"],
    ["Autres dépenses", "Orange mobile", "62630000"],
    ["Autres dépenses", "Orange fibre", "62640000"],
    ["Frais bancaires & commissions (CB, Stripe)", "Commission vente à distance", "62710000"],
    ["Frais bancaires & commissions (CB, Stripe)", "Commission vente distance", "62710000"],
  ];
  for (const [poste, fournisseur, compte] of cas) assert.equal(ventilerDepense({ poste, fournisseur }).compte, compte, fournisseur);
});

test("la nature choisie prime sur les mots-clés et la catégorie précédente", () => {
  assert.equal(ventilerDepense({ poste: "Autres dépenses", fournisseur: "Restaurant", depensePersonnelle: true }).compte, "45511000");
  assert.equal(ventilerDepense({ poste: "Autres dépenses", fournisseur: "Abonnement", avanceFfe: true }).compte, "51730000");
  assert.equal(ventilerDepense({ poste: "Autres dépenses", fournisseur: "Ordinateur", immobilisation: true }).compte, "21830000");
  assert.equal(ventilerDepense({ poste: "Personnel — hors charges", fournisseur: "Restaurant" }).source, "nature");
  assert.equal(ventilerDepense({ poste: "Compte FFE (avance licences & engagements)" }).compte, "51730000");
});

test("les situations non déterminées restent à ventiler", () => {
  for (const poste of ["Emprunts", "Retraite / PER — à vérifier", "hors-depenses", "Inconnue", "Immobilisation — à amortir", ""]) {
    const p = ventilerDepense({ poste, fournisseur: "Non identifié" });
    assert.equal(p.source, "a-ventiler", poste);
    assert.equal(p.compte, "", poste);
  }
  assert.equal(ventilerDepense({ poste: "Eau & électricité", fournisseur: "EDF" }).compte, "60630000");
  assert.equal(ventilerDepense({ poste: "Engagements de concours" }).compte, "46730000");
});

test("les banques FFE sont distinctes et une banque inconnue reste vide", () => {
  for (const nom of ["FFE compét", "FFE compétition", "Compétition FFE"]) assert.equal(compteBanque(nom).compte, "51740000");
  assert.equal(compteBanque("FFE club").compte, "51730000");
  assert.equal(compteBanque("Excédent Pro").compte, "51220000");
  assert.equal(compteBanque("Crédit Agricole courant").compte, "51200000");
  assert.equal(compteBanque("CA courant").compte, "51200000");
  for (const nom of [undefined, "", "Autre banque"]) assert.equal(compteBanque(nom).compte, "");
});

test("les comptes fournisseurs sont reconnus sans inventer un compte divers", () => {
  assert.equal(compteFournisseur("PRLV ARVAL").compte, "401ARVAL");
  assert.equal(compteFournisseur("Agrial").compte, "401AGRIAL");
  assert.equal(compteFournisseur("Inconnu").compte, "");
});
