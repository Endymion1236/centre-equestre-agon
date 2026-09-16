/**
 * Par où une famille se connecte (src/lib/fournisseur-connexion.ts).
 * Avant, tout ce qui n'était pas Google était compté comme Facebook.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { fournisseurDepuisComptes, fournisseurDepuisJeton, libelleFournisseur, libelleFournisseurCourt } from "../../src/lib/fournisseur-connexion";

test("chaque fournisseur est reconnu pour lui-même", () => {
  assert.equal(fournisseurDepuisJeton("google.com"), "google");
  assert.equal(fournisseurDepuisJeton("facebook.com"), "facebook");
  assert.equal(fournisseurDepuisJeton("apple.com"), "apple");
  assert.equal(fournisseurDepuisJeton("password"), "email");
  assert.equal(fournisseurDepuisJeton("custom"), "lien");
});

test("une adresse et un mot de passe ne sont plus comptés comme Facebook", () => {
  assert.notEqual(fournisseurDepuisJeton("password"), "facebook");
  assert.equal(fournisseurDepuisJeton(""), "autre");
  assert.equal(fournisseurDepuisJeton(undefined), "autre");
  assert.equal(fournisseurDepuisJeton("microsoft.com"), "autre");
});

test("un compte rattaché à plusieurs fournisseurs annonce le principal", () => {
  assert.equal(fournisseurDepuisComptes(["password", "google.com"]), "google");
  assert.equal(fournisseurDepuisComptes(["facebook.com", "password"]), "facebook");
  assert.equal(fournisseurDepuisComptes(["password"]), "email");
  assert.equal(fournisseurDepuisComptes([]), "lien", "aucun compte rattaché : connexion par lien");
});

test("les libellés sont lisibles par le club", () => {
  assert.equal(libelleFournisseur("email"), "E-mail et mot de passe");
  assert.equal(libelleFournisseur("admin"), "Créé par le club");
  assert.equal(libelleFournisseur("n'importe quoi"), "Mode inconnu");
  assert.equal(libelleFournisseurCourt("email"), "E-mail");
  assert.equal(libelleFournisseurCourt("google"), "Google");
});
