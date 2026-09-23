/**
 * À qui s'adresse un courrier quand la fiche famille n'a pas de nom
 * (src/lib/nom-destinataire.ts).
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { nomDestinataire, nomDestinataireOuDefaut, nomFamilleDepuisEnfant } from "../../src/lib/nom-destinataire";

test("le nom de la fiche passe avant tout", () => {
  assert.equal(nomDestinataire({ familyName: "CAVEY Hubert", items: [{ childName: "Gabin CAVEY" }] }), "CAVEY Hubert");
  assert.equal(nomDestinataire({ familyName: "  ", parentName: "LEMESLE Sophie" }), "LEMESLE Sophie");
});

test("fiche sans nom : on prend celui de l'enfant inscrit", () => {
  assert.equal(nomDestinataire({ familyName: "", items: [{ childName: "Gabin LEMESLE" }] }), "LEMESLE");
  assert.equal(nomDestinataire({ familyName: null, items: [{ childName: "Jean-Baptiste Roy" }] }), "Roy");
  assert.equal(nomDestinataire({ items: [{ childName: "Gabin" }, { childName: "Eva PICOT CHANDELIER" }] }), "PICOT CHANDELIER");
});

test("rien de connu : chaîne vide, et « à vous » pour les gabarits", () => {
  assert.equal(nomDestinataire({ items: [{ childName: "Gabin" }] }), "");
  assert.equal(nomDestinataire({}), "");
  assert.equal(nomDestinataireOuDefaut({}), "à vous");
  assert.equal(nomDestinataireOuDefaut({ familyName: "CAVEY Hubert" }), "CAVEY Hubert");
});

test("un prénom seul n'est jamais pris pour un nom de famille", () => {
  assert.equal(nomFamilleDepuisEnfant("Gabin"), "");
  assert.equal(nomFamilleDepuisEnfant(""), "");
  assert.equal(nomFamilleDepuisEnfant(null), "");
});
