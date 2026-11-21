/**
 * tests/unit/saison-taches-concours.test.ts — colonnes de tâches ajoutées au tableau de la journée
 * (concours organisé au club : parking, buvette…), 21/11/2026.
 *   npx tsx tests/unit/saison-taches-concours.test.ts
 */
import assert from "node:assert/strict";
import {
  ajouterTache, renommerTache, supprimerTache, poserTache, poserRole, verifierTableau, candidatsRole, compterTaches, colonnesImpression, htmlTableau, clePersonne, TACHES_MAX,
} from "../../src/lib/concours/saison-tableau";
import { engagerEquipes } from "../../src/lib/concours/saison-organisation";
import type { SaisonPonyGames } from "../../src/lib/concours/saisons";

let passes = 0;
function test(nom: string, fn: () => void) {
  try { fn(); passes++; console.log(`  ✅ ${nom}`); }
  catch (e: any) { console.error(`  ❌ ${nom}\n     ${e.message}`); process.exitCode = 1; }
}
const s: SaisonPonyGames = {
  id: "s", nom: "2026/2027",
  cavaliers: [{ id: "zoe", prenom: "Zoé" }, { id: "leo", prenom: "Léo" }, { id: "lou", prenom: "Lou" }, { id: "max", prenom: "Max" }, { id: "ana", prenom: "Ana" }],
  equipes: [
    { id: "a", nom: "Duo A", categorie: "Paire", indice: "", cavalierIds: ["zoe", "leo"] },
    { id: "b", nom: "Duo B", categorie: "Paire", indice: "", cavalierIds: ["lou", "max"] },
  ],
  resultats: [{ id: "c", nom: "Agon", date: "2026-11-22", heureDebut: "10:30", classements: [] }],
};
const base = () => engagerEquipes(s, s.resultats[0], ["a", "b"]);

test("ajouter, refuser vide et doublon, renommer, limite", () => {
  let r = ajouterTache(base(), "  Parking ", "t1");
  r = ajouterTache(r, "parking", "t2");
  r = ajouterTache(r, "", "t3");
  assert.deepEqual(r.taches, [{ id: "t1", nom: "Parking" }]);
  r = renommerTache(r, "t1", "Parking voitures");
  assert.equal(r.taches![0].nom, "Parking voitures");
  for (let i = 0; i < 20; i++) r = ajouterTache(r, `T${i}`, `x${i}`);
  assert.equal(r.taches!.length, TACHES_MAX);
});

test("une personne par passage ; supprimer la colonne efface les noms", () => {
  let r = ajouterTache(base(), "Buvette", "t1");
  r = poserTache(r, "a", "t1", "Maman de Zoé");
  assert.equal(r.engagements![0].roles?.taches?.t1, "Maman de Zoé");
  r = poserTache(r, "a", "t1", "");
  assert.equal(r.engagements![0].roles, undefined, "rien de vide n'est gardé");
  r = poserTache(r, "b", "t1", "Ana");
  r = supprimerTache(r, "t1");
  assert.equal(r.taches, undefined);
  assert.equal(r.engagements![1].roles, undefined);
});

test("manque signalé, double emploi signalé, compté dans les tâches", () => {
  let r = ajouterTache(base(), "Parking", "t1");
  assert.ok(verifierTableau(s, r).some((a) => /Duo A : .*parking à désigner/.test(a.message)));
  r = poserTache(r, "a", "t1", "Ana");
  r = poserRole(r, "a", "juge", "Ana");
  assert.ok(verifierTableau(s, r).some((a) => a.gravite === "erreur" && /Ana : .*juge pour Duo A.*parking pour Duo A/.test(a.message)));
  assert.equal(compterTaches(s, r).get(clePersonne(s, "Ana")), 2);
  // Menu de la tâche : Ana est occupée (juge) au moment de Duo A, Zoé joue, Lou s’échauffe avec Duo B.
  const c = candidatsRole(s, poserTache(r, "a", "t1", ""), "a", "tache", "t1");
  assert.ok(c.find((x) => x.nom === "Ana")?.occupe);
  assert.ok(c.find((x) => x.nom === "Zoé")?.occupe);
});

test("impression : colonne de la tâche quand quelqu'un y est inscrit", () => {
  let r = ajouterTache(base(), "Buvette <bar>", "t1");
  assert.ok(!colonnesImpression(s, r).some((c) => c.cle === "tache:t1"));
  r = poserTache(r, "b", "t1", "Ana");
  assert.ok(colonnesImpression(s, r).some((c) => c.cle === "tache:t1" && c.entete === "Buvette &lt;bar&gt;"));
  assert.ok(htmlTableau(s, r).includes("<b>") || htmlTableau(s, r).includes("Ana"));
  assert.ok(htmlTableau(s, r).includes(">Ana<"));
});

console.log(`\n✅ ${passes} tests passés`);
