/**
 * tests/unit/produits-annexes.test.ts — licence et adhésion ajoutées d'un clic, avec le bon compte.
 *   npx tsx tests/unit/produits-annexes.test.ts
 */
import assert from "node:assert/strict";
import { erreurProduit, ligneProduitAnnexe, nettoyerCatalogue, produitsAnnexes, produitsDuCatalogue } from "../../src/lib/produits-annexes";
import { compteDeLigne } from "../../src/lib/ventilation-comptable";
import { compteDeCategorie } from "../../src/lib/categories-comptables";

let passes = 0;
function test(nom: string, fn: () => void) {
  try { fn(); passes++; console.log(`  ✅ ${nom}`); }
  catch (e: any) { console.error(`  ❌ ${nom}\n     ${e.message}`); process.exitCode = 1; }
}

test("prix des réglages de l'inscription, défauts sinon ; un prix à 0 n'est pas proposé", () => {
  const p = produitsAnnexes({ licenceMoins18: 26, licencePlus18: null, adhesion1: 65, adhesion3: 0 });
  assert.deepEqual(p.map((x) => [x.label, x.priceTTC]), [
    ["Licence FFE -18ans", 26], ["Licence FFE +18ans", 36], ["Adhésion annuelle (enfant 1)", 65], ["Adhésion annuelle (enfant 2)", 40],
  ]);
  assert.equal(produitsAnnexes(null).length, 5);
});

test("licence : TVA 0 %, compte Refacturation FFE ; adhésion : 5,5 %, Cotisations / Adhésions", () => {
  const [lic, , adh] = produitsAnnexes({});
  const l = ligneProduitAnnexe(lic, { id: "c1", prenom: "Rachel" });
  assert.deepEqual(l, { activityTitle: "Licence FFE -18ans", childId: "c1", childName: "Rachel", priceTTC: 25, priceHT: 25, tva: 0, category: "licence", compteComptable: "70100000" });
  assert.equal(compteDeLigne(l).code, "70100000");
  const a = ligneProduitAnnexe(adh);
  assert.equal(a.priceHT, 56.87);
  assert.equal(a.childId, "", "sans cavalier : ligne de la famille");
  assert.equal(compteDeLigne(a).code, "70611110");
});

test("licence tapée en saisie libre : même compte, y compris les anciennes lignes en 706400", () => {
  assert.equal(compteDeCategorie("licence"), "70100000");
  assert.deepEqual(compteDeLigne({ activityTitle: "Licence", category: "licence", compteComptable: "706400" }), { code: "70100000", source: "compte de la ligne (ancien code converti)" });
});

test("produits créés par le club : compte du plan obligatoire, prix et TVA contrôlés", () => {
  const brut = [
    { id: "tapis", label: "Tapis de selle club", priceTTC: "35,50", tva: 20, compteComptable: "70605000" },
    { id: "vieux", label: "Ancien produit", priceTTC: 10, tva: 20, compteComptable: "70605000", actif: false },
    { id: "faux", label: "Compte inventé", priceTTC: 10, tva: 20, compteComptable: "708000" },
    { id: "gratuit", label: "Prix nul", priceTTC: 0, tva: 20, compteComptable: "70605000" },
    { id: "tva", label: "TVA bizarre", priceTTC: 5, tva: 7, compteComptable: "70605000" },
  ];
  assert.deepEqual(nettoyerCatalogue(brut).map((p) => p.id), ["tapis", "vieux"]);
  const boutons = produitsDuCatalogue(brut);
  assert.deepEqual(boutons, [{ id: "cat-tapis", label: "Tapis de selle club", priceTTC: 35.5, tva: 20, category: "produit", compteComptable: "70605000" }]);
  const l = ligneProduitAnnexe(boutons[0]);
  assert.equal(l.priceHT, 29.58);
  assert.equal(compteDeLigne(l).code, "70605000");
  assert.equal(erreurProduit({ label: "x", priceTTC: 5, tva: 20, compteComptable: "706400" }), "Choisissez le compte dans le plan comptable.");
  assert.equal(erreurProduit({ label: "Assurance", priceTTC: 10, tva: 0, compteComptable: "70605000" }), null, "TVA 0 % acceptée");
});

console.log(`\n${process.exitCode ? "❌" : "✅"} ${passes} tests passés`);
