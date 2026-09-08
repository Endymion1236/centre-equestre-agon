import assert from "node:assert/strict";
import { test } from "node:test";
import { GROUPES_COPIE, groupeDeCollection, lireGroupesGardes, planifierCopie, resumeParGroupe } from "../../src/lib/groupes-copie-test";

test("chaque collection connue appartient à un seul groupe ; l'inconnu tombe dans « autres »", () => {
  const vues = new Map<string, string>();
  for (const g of GROUPES_COPIE) for (const c of g.collections) {
    assert.ok(!vues.has(c), `« ${c} » est listée dans ${vues.get(c)} et ${g.id}`);
    vues.set(c, g.id);
  }
  assert.equal(groupeDeCollection("mouvements-rapprochement"), "compta-depenses");
  assert.equal(groupeDeCollection("justificatifs"), "compta-depenses");
  assert.equal(groupeDeCollection("encaissements"), "ventes-caisse");
  assert.equal(groupeDeCollection("creneaux"), "inscriptions");
  assert.equal(groupeDeCollection("families"), "familles");
  assert.equal(groupeDeCollection("collection-inventee-demain"), "autres");
  assert.equal(groupeDeCollection("settings"), "autres");
});

test("« garder » : identifiants connus, dédoublonnés ; un inconnu est refusé", () => {
  assert.deepEqual(lireGroupesGardes(" compta-depenses, ventes-caisse ,compta-depenses"), ["compta-depenses", "ventes-caisse"]);
  assert.deepEqual(lireGroupesGardes(""), []);
  assert.deepEqual(lireGroupesGardes(null), []);
  assert.throws(() => lireGroupesGardes("compta"), /Groupe inconnu/);
});

test("base propre en gardant la compta : la compta n'est ni vidée ni copiée, le reste est vidé puis recopié", () => {
  const plan = planifierCopie({
    collectionsSource: ["depenses", "families", "creneaux", "settings"],
    collectionsTest: ["depenses", "justificatifs", "families", "vieux-truc-test"],
    propre: true,
    garder: ["compta-depenses"],
  });
  const parNom = Object.fromEntries(plan.map((p) => [p.collection, p.action]));
  assert.equal(parNom.depenses, "garder");
  assert.equal(parNom.justificatifs, "garder", "présente seulement en test : gardée, donc pas vidée");
  assert.equal(parNom.families, "vider-puis-copier");
  assert.equal(parNom.creneaux, "vider-puis-copier");
  assert.equal(parNom.settings, "vider-puis-copier");
  assert.equal(parNom["vieux-truc-test"], "vider-puis-copier", "une collection orpheline en test disparaît avec la base propre");
  assert.deepEqual(plan.map((p) => p.collection), [...plan.map((p) => p.collection)].sort(), "plan trié, stable");
});

test("sans base propre : copie par-dessus, rien n'est vidé, l'orphelin de test reste", () => {
  const plan = planifierCopie({ collectionsSource: ["depenses", "families"], collectionsTest: ["depenses", "orphelin"], propre: false, garder: [] });
  const parNom = Object.fromEntries(plan.map((p) => [p.collection, p.action]));
  assert.equal(parNom.depenses, "copier");
  assert.equal(parNom.families, "copier");
  assert.equal(parNom.orphelin, "garder");
});

test("tout garder = rien ne se passe ; résumé par groupe lisible", () => {
  const tous = GROUPES_COPIE.map((g) => g.id);
  const plan = planifierCopie({ collectionsSource: ["depenses", "families", "x"], collectionsTest: ["y"], propre: true, garder: tous });
  assert.ok(plan.every((p) => p.action === "garder"));
  assert.deepEqual(resumeParGroupe(["familles"]), { "compta-depenses": "prod", "ventes-caisse": "prod", inscriptions: "prod", familles: "garder", autres: "prod" });
});
