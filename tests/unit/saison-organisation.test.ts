/**
 * tests/unit/saison-organisation.test.ts
 *
 * Organisation d'un concours de la saison : ordre de passage, horaires
 * (paire 30 min, équipe 45 min), poneys et remplaçant, vérifications.
 *   npx tsx tests/unit/saison-organisation.test.ts
 */
import assert from "node:assert/strict";
import {
  estPaire, dureeEpreuve, besoinRemplacant, minutes, versHeure, heureLisible,
  engagerEquipes, desengager, deplacer, avecHoraires, poserHeure, poserPoney, poserRemplacant,
  verifierOrganisation, majConcours, dureePassage, poserDuree,
} from "../../src/lib/concours/saison-organisation";
import { retirerCavalier, retirerEquipe, type SaisonPonyGames, type ResultatConcours } from "../../src/lib/concours/saisons";

let passes = 0;
function test(nom: string, fn: () => void) {
  try { fn(); passes++; console.log(`  ✅ ${nom}`); }
  catch (e: any) { console.error(`  ❌ ${nom}\n     ${e.message}`); process.exitCode = 1; }
}

function saison(): SaisonPonyGames {
  return {
    id: "s", nom: "2026/2027",
    cavaliers: ["zoe", "leo", "ines", "tom", "lou", "max"].map((id) => ({ id, prenom: id[0].toUpperCase() + id.slice(1) })),
    equipes: [
      { id: "eq4", nom: "Les Fusées", categorie: "Benjamin", indice: "Club 2", cavalierIds: ["zoe", "leo", "ines", "tom"] },
      { id: "eq5", nom: "Les Cinq", categorie: "Minime", indice: "Club 1", cavalierIds: ["zoe", "leo", "ines", "tom", "lou"] },
      { id: "p", nom: "Duo", categorie: "Paire minime", indice: "Club 2", cavalierIds: ["lou", "max"] },
      { id: "p2", nom: "Sans catégorie", categorie: "", indice: "", cavalierIds: ["max", "tom"] },
    ],
    resultats: [{ id: "c", nom: "Pieux", date: "2026-11-15", classements: [] }],
  };
}
const concours = (s: SaisonPonyGames) => s.resultats[0];

console.log("\n── Épreuves ──");

test("paire 30 min, équipe 45 min", () => {
  const s = saison();
  assert.equal(estPaire(s.equipes[2]), true);
  assert.equal(dureeEpreuve(s.equipes[2]), 30);
  assert.equal(dureeEpreuve(s.equipes[0]), 45);
  assert.equal(estPaire(s.equipes[3]), true, "sans catégorie, 2 cavaliers = paire");
  assert.equal(estPaire({ ...s.equipes[0], categorie: "Compaire" }), false);
});

test("remplaçant pour les équipes de 4 et les paires, pas pour 5", () => {
  const s = saison();
  assert.equal(besoinRemplacant(s.equipes[0]), true);
  assert.equal(besoinRemplacant(s.equipes[1]), false);
  assert.equal(besoinRemplacant(s.equipes[2]), true);
});

test("lecture des heures", () => {
  assert.equal(minutes("09:00"), 540);
  assert.equal(minutes("9h30"), 570);
  assert.equal(minutes("14h"), 840);
  assert.equal(minutes("25:00"), undefined);
  assert.equal(minutes(""), undefined);
  assert.equal(versHeure(585), "09:45");
  assert.equal(heureLisible("9:05"), "09h05");
  assert.equal(heureLisible(undefined), "—");
});

console.log("\n── Ordre de passage et horaires ──");

test("les horaires s'enchaînent selon la durée de chaque épreuve", () => {
  const s = saison();
  let r: ResultatConcours = { ...concours(s), heureDebut: "09:00" };
  r = engagerEquipes(s, r, ["eq4", "p", "eq5"]);
  assert.deepEqual(r.engagements!.map((g) => g.heure), ["09:00", "09:45", "10:15"]);
});

test("une équipe ajoutée se place après la dernière, sans toucher aux heures posées à la main", () => {
  const s = saison();
  let r = engagerEquipes(s, { ...concours(s), heureDebut: "09:00" }, ["eq4"]);
  r = poserHeure(r, "eq4", "10:00");
  r = engagerEquipes(s, r, ["p", "eq5"]);
  assert.deepEqual(r.engagements!.map((g) => g.heure), ["10:00", "10:45", "11:15"]);
});

test("pas d'heure de début : rien n'est calculé", () => {
  const s = saison();
  const r = engagerEquipes(s, concours(s), ["eq4", "p"]);
  assert.deepEqual(r.engagements!.map((g) => g.heure), [undefined, undefined]);
});

test("engager deux fois la même équipe ne la double pas", () => {
  const s = saison();
  let r = engagerEquipes(s, concours(s), ["eq4"]);
  r = engagerEquipes(s, r, ["eq4", "inconnue", "p"]);
  assert.deepEqual(r.engagements!.map((g) => g.equipeId), ["eq4", "p"]);
});

test("changer l'ordre recalcule les horaires", () => {
  const s = saison();
  let r = engagerEquipes(s, { ...concours(s), heureDebut: "09:00" }, ["eq4", "p"]);
  r = deplacer(s, r, "p", -1);
  assert.deepEqual(r.engagements!.map((g) => [g.equipeId, g.heure]), [["p", "09:00"], ["eq4", "09:30"]]);
  assert.equal(deplacer(s, r, "p", -1), r, "déjà premier : rien ne bouge");
});

test("une heure posée à la main range les équipes par horaire", () => {
  const s = saison();
  let r = engagerEquipes(s, concours(s), ["eq4", "p", "eq5"]);
  r = poserHeure(r, "eq5", "8h30");
  r = poserHeure(r, "eq4", "10:00");
  assert.deepEqual(r.engagements!.map((g) => [g.equipeId, g.heure]), [["eq5", "08:30"], ["eq4", "10:00"], ["p", undefined]]);
});

test("désengager retire l'équipe ; recalculer resserre les horaires", () => {
  const s = saison();
  let r = engagerEquipes(s, { ...concours(s), heureDebut: "09:00" }, ["eq4", "p", "eq5"]);
  r = desengager(r, "eq4");
  assert.deepEqual(r.engagements!.map((g) => [g.equipeId, g.heure]), [["p", "09:45"], ["eq5", "10:15"]], "les autres gardent leur heure");
  r = avecHoraires(s, r);
  assert.deepEqual(r.engagements!.map((g) => [g.equipeId, g.heure]), [["p", "09:00"], ["eq5", "09:30"]], "« Recalculer » resserre");
});

test("avecHoraires sans heure de début valide rend le concours intact", () => {
  const s = saison();
  const r = { ...concours(s), heureDebut: "n'importe" };
  assert.equal(avecHoraires(s, r), r);
});

console.log("\n── Durée modifiée à la main ──");

test("une durée saisie remplace la durée habituelle pour ce passage seulement", () => {
  const s = saison();
  let r = engagerEquipes(s, { ...concours(s), heureDebut: "09:00" }, ["eq4", "p"]);
  r = poserDuree(s, r, "eq4", 60);
  assert.equal(dureePassage(s, r.engagements![0]), 60);
  assert.equal(dureePassage(s, r.engagements![1]), 30, "la paire garde 30 min");
  assert.deepEqual(r.engagements!.map((g) => g.heure), ["09:00", "09:45"], "les autres horaires ne bougent pas seuls");
  r = avecHoraires(s, r);
  assert.deepEqual(r.engagements!.map((g) => g.heure), ["09:00", "10:00"], "« Recalculer » tient compte de la durée");
  r = engagerEquipes(s, r, ["eq5"]);
  assert.equal(r.engagements![2].heure, "10:30", "une équipe ajoutée se place après la vraie fin");
});

test("vide, zéro ou durée habituelle : retour à la valeur par défaut", () => {
  const s = saison();
  let r = poserDuree(s, engagerEquipes(s, concours(s), ["p"]), "p", 40);
  assert.equal(r.engagements![0].duree, 40);
  for (const v of [undefined, 0, 30]) {
    const r2 = poserDuree(s, r, "p", v);
    assert.equal("duree" in r2.engagements![0], false, String(v));
    assert.equal(dureePassage(s, r2.engagements![0]), 30);
  }
  r = poserDuree(s, r, "p", 37.6);
  assert.equal(r.engagements![0].duree, 38, "arrondi à la minute");
});

test("une durée allongée crée le chevauchement qu'elle provoque", () => {
  const s = saison();
  const r = poserDuree(s, complet(s), "eq4", 60); // les Fusées finissent à 10h00, le Duo part à 9h45
  const msgs = verifierOrganisation(s, r).map((a) => a.message);
  assert.ok(msgs.includes("Gala est dans Les Fusées (09h00–10h00) et Duo (09h45–10h15) en même temps."), msgs.join("\n"));
});

console.log("\n── Poneys ──");

test("poser, changer et retirer un poney", () => {
  const s = saison();
  let r = engagerEquipes(s, concours(s), ["p"]);
  r = poserPoney(r, "p", "lou", " Gala ");
  r = poserRemplacant(r, "p", "Java");
  assert.deepEqual(r.engagements![0], { equipeId: "p", poneys: { lou: "Gala" }, remplacant: "Java" });
  r = poserPoney(r, "p", "lou", "");
  r = poserRemplacant(r, "p", " ");
  assert.deepEqual(r.engagements![0], { equipeId: "p", poneys: {}, remplacant: undefined });
});

test("retirer un cavalier ou une équipe nettoie l'organisation", () => {
  let s = saison();
  s = majConcours(s, "c", (r) => poserPoney(engagerEquipes(s, r, ["eq4", "p"]), "eq4", "zoe", "Gala"));
  s = retirerCavalier(s, "zoe");
  assert.deepEqual(concours(s).engagements![0].poneys, {});
  s = retirerEquipe(s, "eq4");
  assert.deepEqual(concours(s).engagements!.map((g) => g.equipeId), ["p"]);
});

console.log("\n── Vérifications ──");

function complet(s: SaisonPonyGames): ResultatConcours {
  let r = engagerEquipes(s, { ...concours(s), heureDebut: "09:00" }, ["eq4", "p"]);
  r = poserPoney(r, "eq4", "zoe", "Gala");
  r = poserPoney(r, "eq4", "leo", "Milton");
  r = poserPoney(r, "eq4", "ines", "Java");
  r = poserPoney(r, "eq4", "tom", "Galaxy");
  r = poserRemplacant(r, "eq4", "Caramel");
  r = poserPoney(r, "p", "lou", "Gala");
  r = poserPoney(r, "p", "max", "Milton");
  r = poserRemplacant(r, "p", "Java");
  return r;
}

test("organisation complète et sans chevauchement : rien à signaler", () => {
  const s = saison();
  // Gala, Milton et Java servent dans les deux épreuves, mais l'une après l'autre.
  assert.deepEqual(verifierOrganisation(s, complet(s)), []);
});

test("ce qui manque est signalé", () => {
  const s = saison();
  const r = engagerEquipes(s, concours(s), ["p"]);
  const msgs = verifierOrganisation(s, poserPoney(r, "p", "lou", "Gala")).map((a) => a.message);
  assert.deepEqual(msgs, ["Duo : pas d'horaire.", "Duo : pas de poney pour Max.", "Duo : poney remplaçant à choisir."]);
});

test("un poney deux fois dans la même équipe", () => {
  const s = saison();
  const r = poserRemplacant(complet(s), "eq4", "gala");
  const a = verifierOrganisation(s, r);
  assert.equal(a.length, 1);
  assert.equal(a[0].gravite, "erreur");
  assert.equal(a[0].message, "Les Fusées : gala est prévu deux fois (Zoe et remplaçant).");
});

test("même poney et même cavalier sur deux épreuves qui se chevauchent", () => {
  const s = saison();
  const r = poserHeure(complet(s), "p", "09:30"); // la paire démarre pendant l'équipe (9h–9h45)
  const msgs = verifierOrganisation(s, r).map((a) => a.message);
  assert.ok(msgs.includes("Gala est dans Les Fusées (09h00–09h45) et Duo (09h30–10h00) en même temps."), msgs.join("\n"));
  assert.ok(msgs.includes("Milton est dans Les Fusées (09h00–09h45) et Duo (09h30–10h00) en même temps."));
  // Équipes de 4 et de 5 qui partagent des cavaliers, à la même heure
  let r2 = engagerEquipes(s, concours(s), ["eq4", "eq5"]);
  r2 = poserHeure(poserHeure(r2, "eq4", "10:00"), "eq5", "10:15");
  assert.ok(verifierOrganisation(s, r2).some((a) => a.message === "Zoe passe avec Les Fusées (10h00–10h45) et Les Cinq (10h15–11h00) en même temps."));
  assert.equal(verifierOrganisation(s, r2)[0].gravite, "erreur", "les erreurs d'abord");
});

console.log(process.exitCode ? "\n❌ des tests ont échoué" : `\n✅ ${passes} tests passés`);
