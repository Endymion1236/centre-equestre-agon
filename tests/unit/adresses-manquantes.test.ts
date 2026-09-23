/**
 * tests/unit/adresses-manquantes.test.ts
 *
 * Retrouver l'adresse d'une fiche qui n'en a pas.
 *   npx tsx tests/unit/adresses-manquantes.test.ts
 *
 * Deux exigences : ne jamais proposer une adresse qui enverrait les codes
 * d'accès chez le voisin, et classer les pistes par ce qu'elles valent.
 */
import assert from "node:assert/strict";
import {
  LIBELLE_ORIGINE, nomsSeCorrespondent, proposerAdresses,
} from "../../src/lib/adresses-manquantes";

let passes = 0;
function test(nom: string, fn: () => void) {
  try { fn(); passes++; console.log(`  ✅ ${nom}`); }
  catch (e: any) { console.error(`  ❌ ${nom}\n     ${e.message}`); process.exitCode = 1; }
}

console.log("\n── Rapprochement par le nom ──");

test("les faux positifs du 21/09/2026 ne passent plus", () => {
  // « Virginie Chapdelaine » contenait « laine », donc la fiche LAINÉ.
  assert.equal(nomsSeCorrespondent("Virginie Chapdelaine", "LAINÉ Matthieu"), false);
  // « Françoise Langenais » contenait « francois », donc la fiche FRANCOIS.
  assert.equal(nomsSeCorrespondent("Françoise LANGENAIS", "FRANCOIS"), false);
});

test("un vrai rapprochement fonctionne, accents et casse ignorés", () => {
  assert.equal(nomsSeCorrespondent("Françoise LANGENAIS", "LANGENAIS"), true);
  assert.equal(nomsSeCorrespondent("Emilia Thevenot", "THEVENOT"), true);
  assert.equal(nomsSeCorrespondent("Guenon dalila", "GUENON jade"), true);
  assert.equal(nomsSeCorrespondent("Nora Werner", "WERNER Nora"), true);
  assert.equal(nomsSeCorrespondent("Amandine Marc", "MARC Hélène"), true);
});

test("les noms composés et les particules sont découpés", () => {
  assert.equal(nomsSeCorrespondent("Marie Saint-Denis", "SAINT DENIS"), true);
  assert.equal(nomsSeCorrespondent("Jean d'Aubigné", "AUBIGNE"), true);
});

test("un mot trop court ne rapproche rien", () => {
  assert.equal(nomsSeCorrespondent("Paul Le Roy", "LE"), false);
  assert.equal(nomsSeCorrespondent("Jo Ax", "AX"), false);
});

test("un nom absent ne rapproche rien", () => {
  assert.equal(nomsSeCorrespondent("", "DUPONT"), false);
  assert.equal(nomsSeCorrespondent("DUPONT", ""), false);
});

console.log("\n── Classement des pistes ──");

const src = (email: string, origine: any, date?: string, detail?: string) => ({ email, origine, date, detail });

test("la commande passe avant le journal, qui passe avant le compte", () => {
  const p = proposerAdresses([
    src("compte@ex.fr", "compte"),
    src("journal@ex.fr", "journal"),
    src("commande@ex.fr", "commande"),
  ]);
  assert.deepEqual(p.map((x) => x.email), ["commande@ex.fr", "journal@ex.fr", "compte@ex.fr"]);
  assert.equal(p[2].detail, LIBELLE_ORIGINE.compte);
});

test("une même adresse vue plusieurs fois est comptée une fois, avec sa meilleure origine", () => {
  const p = proposerAdresses([
    src("a@ex.fr", "compte"),
    src("a@ex.fr", "commande", "2026-09-10", "facture du 10/09"),
    src("a@ex.fr", "journal"),
  ]);
  assert.equal(p.length, 1);
  assert.equal(p[0].occurrences, 3);
  assert.equal(p[0].origine, "commande");
  assert.equal(p[0].detail, "facture du 10/09");
  assert.equal(p[0].derniereDate, "2026-09-10");
});

test("à origine égale, la plus fréquente puis la plus récente", () => {
  const p = proposerAdresses([
    src("rare@ex.fr", "commande", "2026-09-20"),
    src("souvent@ex.fr", "commande", "2026-09-01"),
    src("souvent@ex.fr", "commande", "2026-09-02"),
  ]);
  assert.deepEqual(p.map((x) => x.email), ["souvent@ex.fr", "rare@ex.fr"]);
});

test("une adresse tenue par un compte sans cavalier : on rattache, et ça passe devant", () => {
  // Le cas THEVENOT : la fiche du bureau porte le cavalier, la fiche du
  // compte porte l'adresse. Recopier l'adresse ferait deux fiches jumelles.
  const p = proposerAdresses(
    [src("libre@ex.fr", "commande"), src("compte@ex.fr", "compte")],
    new Map([["compte@ex.fr", { id: "uidCompte", parentName: "Emilia Thevenot", nbEnfants: 0 }]]),
  );
  assert.equal(p[0].email, "compte@ex.fr", "rattacher règle tout d'un coup, même depuis une piste moins sûre");
  assert.equal(p[0].action, "rattacher-au-compte");
  assert.equal(p[0].proprietaire?.id, "uidCompte");
  assert.equal(p[1].action, "ecrire");
  assert.equal(p[1].proprietaire, null);
});

test("une adresse tenue par une fiche AVEC cavaliers reste à arbitrer, et passe en dernier", () => {
  const p = proposerAdresses(
    [src("libre@ex.fr", "compte"), src("occupee@ex.fr", "commande")],
    new Map([["occupee@ex.fr", { id: "autre", parentName: "MARTIN", nbEnfants: 2 }]]),
  );
  assert.equal(p[0].email, "libre@ex.fr");
  assert.equal(p[1].action, "fusion-a-arbitrer");
  assert.equal(p[1].proprietaire?.nbEnfants, 2);
});

test("la comparaison des adresses ignore la casse et les espaces", () => {
  const p = proposerAdresses(
    [src("  Prise@Ex.FR ", "commande")],
    new Map([["prise@ex.fr", { id: "uidCompte", parentName: "X", nbEnfants: 0 }]]),
  );
  assert.equal(p[0].action, "rattacher-au-compte");
});

test("les adresses invalides ou vides sont écartées", () => {
  const p = proposerAdresses([
    src("", "commande"), src("   ", "commande"), src("pas-une-adresse", "commande"),
    src("Bonne@Ex.FR", "commande"),
  ]);
  assert.deepEqual(p.map((x) => x.email), ["bonne@ex.fr"], "et normalisées en minuscules");
});

test("la liste reste courte et ne casse pas sur une entrée vide", () => {
  const p = proposerAdresses([
    src("a@ex.fr", "commande"), src("b@ex.fr", "commande"), src("c@ex.fr", "commande"),
    src("d@ex.fr", "commande"), src("e@ex.fr", "commande"),
  ]);
  assert.equal(p.length, 4);
  assert.deepEqual(proposerAdresses([]), []);
  assert.deepEqual(proposerAdresses(null as any), []);
});

console.log(process.exitCode ? "\n❌ des tests ont échoué" : `\n✅ ${passes} tests passés`);
