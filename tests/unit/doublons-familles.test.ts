/**
 * tests/unit/doublons-familles.test.ts
 *
 * Reconnaître deux fiches qui sont la même famille.
 *   npx tsx tests/unit/doublons-familles.test.ts
 *
 * Ces règles décidaient seules, sans test, de ce que l'écran des doublons
 * montre. Il leur manquait le signal le plus fort — l'adresse email — et
 * l'écran restait vide précisément dans le cas le plus courant.
 */
import assert from "node:assert/strict";
import {
  clePaire, clesFiche, cleNom, cleTelephone, cleDateNaissance, comparerFiches,
} from "../../src/lib/doublons-familles";

let passes = 0;
function test(nom: string, fn: () => void) {
  try { fn(); passes++; console.log(`  ✅ ${nom}`); }
  catch (e: any) { console.error(`  ❌ ${nom}\n     ${e.message}`); process.exitCode = 1; }
}

const cmp = (a: any, b: any) => comparerFiches(clesFiche(a), clesFiche(b));

console.log("\n── Le signal qui manquait ──");

test("la fiche du bureau et l'espace créé par la famille se reconnaissent par l'email", () => {
  // Le cas THEVENOT : l'espace créé par la famille n'a ni téléphone, ni
  // cavalier, et porte le nom du compte. Seule l'adresse les relie.
  const bureau = { id: "bureau", parentName: "THEVENOT", parentPhone: "0662361492", children: [{ firstName: "Emma", lastName: "THEVENOT", birthDate: "2014-03-02" }] };
  const compte = { id: "uid", parentName: "Emilia Thevenot", parentEmail: "thevenotemilia@gmail.com", children: [] };
  assert.equal(cmp(bureau, compte).score, 0, "sans adresse des deux côtés, rien ne les relie");

  const bureauAvecEmail = { ...bureau, parentEmail: "ThevenotEmilia@Gmail.com " };
  const r = cmp(bureauAvecEmail, compte);
  assert.deepEqual(r.motifs, ["email"]);
  assert.equal(r.score, 4, "l'email pèse plus qu'un téléphone : il désigne une personne, pas un foyer");
});

test("une adresse vide ne rapproche jamais deux fiches", () => {
  assert.equal(cmp({ id: "a", parentEmail: "" }, { id: "b", parentEmail: "" }).score, 0);
  assert.equal(cmp({ id: "a" }, { id: "b" }).score, 0);
});

console.log("\n── Les autres signaux ──");

test("téléphone, cavalier commun et nom comptent toujours", () => {
  const a = { id: "a", parentName: "Marie DUPONT", parentPhone: "+33 6 10 54 27 29", children: [{ firstName: "Léa", lastName: "Dupont", birthDate: "2015-05-01" }] };
  const b = { id: "b", parentName: "dupont marie", parentPhone: "0610542729", children: [{ firstName: "LÉA", lastName: "DUPONT", birthDate: "2015-05-01" }] };
  const r = cmp(a, b);
  assert.deepEqual([...r.motifs].sort(), ["enfant", "nom", "phone"]);
  assert.equal(r.score, 8);
});

test("les clés absorbent les écarts de forme", () => {
  assert.equal(cleNom("Marie DUPONT"), cleNom("dupont  marie"));
  assert.equal(cleTelephone("+33 6 10 54 27 29"), "610542729");
  assert.equal(cleTelephone("06 10"), "", "un fragment de numéro ne vaut rien");
  assert.equal(cleDateNaissance(new Date("2015-05-01T00:00:00Z")), "2015-05-01");
  assert.equal(cleDateNaissance({ seconds: Math.floor(Date.UTC(2015, 4, 1) / 1000) }), "2015-05-01");
  assert.equal(cleDateNaissance(null), "");
});

test("un cavalier sans identité ne rapproche rien", () => {
  const vide = { id: "a", children: [{ firstName: "", lastName: "", birthDate: null }] };
  const autre = { id: "b", children: [{ firstName: "", lastName: "", birthDate: null }] };
  assert.equal(cmp(vide, autre).score, 0);
});

test("deux familles sans rien en commun ne sont pas des doublons", () => {
  const a = { id: "a", parentName: "DUPONT", parentEmail: "a@ex.fr", parentPhone: "0610000000", children: [{ firstName: "Léa", birthDate: "2015-05-01" }] };
  const b = { id: "b", parentName: "MARTIN", parentEmail: "b@ex.fr", parentPhone: "0620000000", children: [{ firstName: "Tom", birthDate: "2016-06-02" }] };
  assert.equal(cmp(a, b).score, 0);
});

test("la clé d'une paire ne dépend pas de l'ordre", () => {
  assert.equal(clePaire("b", "a"), clePaire("a", "b"));
});

console.log(process.exitCode ? "\n❌ des tests ont échoué" : `\n✅ ${passes} tests passés`);
