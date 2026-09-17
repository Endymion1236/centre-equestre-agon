/**
 * Les sites facturables d'un établissement (src/lib/services-etablissement.ts) :
 * chacun ses coordonnées, avec repli sur la structure, et les anciens
 * services enregistrés en simple texte qui continuent de fonctionner.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { coordonneesFacturation, nomsServices, normaliserServices, serviceParNom } from "../../src/lib/services-etablissement";

const collectivite = {
  parentName: "COMMUNAUTÉ DE COMMUNES CÔTE OUEST",
  parentEmail: "accueil@ccco.fr",
  parentPhone: "02 33 00 00 00",
  address: "1 place de la Mairie", zipCode: "50230", city: "AGON-COUTAINVILLE",
};

const services = [
  "Centre de loisirs de Saint-Sauveur",
  { nom: "Centre de loisirs de Blainville", contact: "Mme Leroy", email: "blainville@ccco.fr", telephone: "02 33 11 11 11",
    adresse: "3 rue de l'École", codePostal: "50560", ville: "BLAINVILLE-SUR-MER", codeService: "ALSH-BLA", numeroEngagement: "ENG-2026-114" },
];

test("les anciens services en texte sont relus comme des fiches, sans rien perdre", () => {
  const liste = normaliserServices(services);
  assert.equal(liste.length, 2);
  assert.deepEqual(liste[0], { nom: "Centre de loisirs de Saint-Sauveur" });
  assert.deepEqual(nomsServices(services), ["Centre de loisirs de Saint-Sauveur", "Centre de loisirs de Blainville"]);
  assert.deepEqual(normaliserServices(["  ", "", null, undefined, { nom: " " }]), []);
  assert.equal(normaliserServices(["Alpha", "alpha"]).length, 1, "un même nom n'apparaît qu'une fois");
});

test("un service renseigné donne ses propres coordonnées", () => {
  const c = coordonneesFacturation(collectivite, serviceParNom(services, "centre de loisirs de blainville"));
  assert.equal(c.destinataire, "Mme Leroy");
  assert.equal(c.email, "blainville@ccco.fr");
  assert.equal(c.adresse, "3 rue de l'École, 50560 BLAINVILLE-SUR-MER");
  assert.equal(c.codeService, "ALSH-BLA");
  assert.equal(c.numeroEngagement, "ENG-2026-114");
  assert.equal(c.duService, true);
});

test("un service sans coordonnées retombe sur la structure, champ par champ", () => {
  const c = coordonneesFacturation(collectivite, serviceParNom(services, "Centre de loisirs de Saint-Sauveur"));
  assert.equal(c.destinataire, "COMMUNAUTÉ DE COMMUNES CÔTE OUEST");
  assert.equal(c.email, "accueil@ccco.fr");
  assert.equal(c.adresse, "1 place de la Mairie, 50230 AGON-COUTAINVILLE");
  assert.equal(c.duService, false);
});

test("sans service choisi : la structure, comme avant", () => {
  const c = coordonneesFacturation(collectivite, null);
  assert.equal(c.email, "accueil@ccco.fr");
  assert.equal(c.duService, false);
  assert.equal(serviceParNom(services, "inconnu"), null);
  assert.equal(serviceParNom(services, ""), null);
});

test("un service peut ne renseigner que son email : le reste vient de la structure", () => {
  const c = coordonneesFacturation(collectivite, { nom: "Antenne", email: "antenne@ccco.fr" });
  assert.equal(c.email, "antenne@ccco.fr");
  assert.equal(c.telephone, "02 33 00 00 00");
  assert.equal(c.adresse, "1 place de la Mairie, 50230 AGON-COUTAINVILLE");
  assert.equal(c.duService, true);
});
