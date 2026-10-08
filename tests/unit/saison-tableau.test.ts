/**
 * tests/unit/saison-tableau.test.ts
 *
 * Tableau de la journée : prépa (30 min) puis échauffement (30 min) avant
 * chaque passage, placeurs, juge, facteur, et personnes prises deux fois.
 *   npx tsx tests/unit/saison-tableau.test.ts
 */
import assert from "node:assert/strict";
import {
  lignesTableau, plageLisible, poserRole, poserPlaceur, verifierTableau, clePersonne, htmlTableau, candidatsRole,
} from "../../src/lib/concours/saison-tableau";
import { engagerEquipes, poserDuree, poserPoney } from "../../src/lib/concours/saison-organisation";
import { retirerCavalier, type SaisonPonyGames, type ResultatConcours } from "../../src/lib/concours/saisons";

let passes = 0;
function test(nom: string, fn: () => void) {
  try { fn(); passes++; console.log(`  ✅ ${nom}`); }
  catch (e: any) { console.error(`  ❌ ${nom}\n     ${e.message}`); process.exitCode = 1; }
}

function saison(): SaisonPonyGames {
  return {
    id: "s", nom: "2026/2027",
    cavaliers: [
      { id: "zoe", prenom: "Zoé", nom: "Martin" }, { id: "leo", prenom: "Léo" }, { id: "ines", prenom: "Inès" },
      { id: "tom", prenom: "Tom" }, { id: "lou", prenom: "Lou" }, { id: "max", prenom: "Max" },
      { id: "lea1", prenom: "Léa", nom: "A" }, { id: "lea2", prenom: "Léa", nom: "B" },
    ],
    equipes: [
      { id: "eq", nom: "Les Fusées", categorie: "Benjamin", indice: "", cavalierIds: ["zoe", "leo", "ines", "tom"] },
      { id: "p", nom: "Duo", categorie: "Paire minime", indice: "", cavalierIds: ["lou", "max"] },
    ],
    resultats: [{ id: "c", nom: "Pieux", date: "2026-11-15", lieu: "Pieux", heureDebut: "09:00", classements: [] }],
  };
}

/** Fusées 9h00–9h45, Duo 9h45–10h15. */
function concours(s: SaisonPonyGames): ResultatConcours {
  return poserPoney(engagerEquipes(s, s.resultats[0], ["eq", "p"]), "eq", "zoe", "Gala");
}

function complet(s: SaisonPonyGames): ResultatConcours {
  let r = concours(s);
  for (const [eq, prepa, ech, juge, fact] of [["eq", "Nicolas", "Emmeline", "Papa de Lou", "Léa B"], ["p", "Nicolas", "Emmeline", "Maman de Zoé", "Inès"]]) {
    r = poserRole(r, eq, "respPrepa", prepa);
    r = poserRole(r, eq, "respEchauffement", ech);
    r = poserRole(r, eq, "juge", juge);
    r = poserRole(r, eq, "facteur", fact);
  }
  r = poserPlaceur(r, "eq", 0, "lea1");
  r = poserPlaceur(r, "p", 0, "tom");
  return r;
}

console.log("\n── Horaires du tableau ──");

test("prépa puis échauffement de 30 min juste avant le passage", () => {
  const s = saison();
  const [a, b] = lignesTableau(s, concours(s));
  assert.equal(plageLisible(a.prepa), "08h00–08h30");
  assert.equal(plageLisible(a.echauffement), "08h30–09h00");
  assert.equal(plageLisible(a.passage), "09h00–09h45");
  assert.equal(plageLisible(b.prepa), "08h45–09h15");
  assert.equal(plageLisible(b.passage), "09h45–10h15");
  assert.deepEqual(a.cavaliers[0], { id: "zoe", nom: "Zoé Martin", poney: "Gala" });
  assert.equal(a.cavaliers[1].poney, undefined);
});

test("la durée modifiée du passage est reprise", () => {
  const s = saison();
  const r = poserDuree(s, concours(s), "eq", 60);
  assert.equal(plageLisible(lignesTableau(s, r)[0].passage), "09h00–10h00");
});

test("passage sans horaire : pas de plages", () => {
  const s = saison();
  const r = engagerEquipes(s, { ...s.resultats[0], heureDebut: undefined }, ["eq"]);
  const [l] = lignesTableau(s, r);
  assert.equal(l.passage, undefined);
  assert.equal(plageLisible(l.prepa), "—");
});

console.log("\n── Rôles ──");

test("rôles posés, vidés, et rien de vide n'est gardé", () => {
  const s = saison();
  let r = poserRole(concours(s), "eq", "juge", "  Papa de Lou ");
  assert.deepEqual(r.engagements![0].roles, { juge: "Papa de Lou" });
  r = poserRole(r, "eq", "juge", "");
  assert.equal("roles" in r.engagements![0], false);
});

test("placeurs : 2 au plus, sans doublon, retrait possible", () => {
  const s = saison();
  let r = poserPlaceur(concours(s), "p", 0, "zoe");
  r = poserPlaceur(r, "p", 1, "zoe");
  assert.deepEqual(r.engagements![1].roles!.placeurs, ["zoe"]);
  r = poserPlaceur(r, "p", 1, "leo");
  r = poserPlaceur(r, "p", 2, "tom");
  assert.deepEqual(r.engagements![1].roles!.placeurs, ["zoe", "leo"]);
  r = poserPlaceur(r, "p", 0, "");
  assert.deepEqual(r.engagements![1].roles!.placeurs, ["leo"]);
});

test("un cavalier retiré de la saison quitte aussi les placeurs", () => {
  let s = saison();
  s = { ...s, resultats: [poserPlaceur(concours(s), "p", 0, "zoe")] };
  s = retirerCavalier(s, "zoe");
  assert.equal(s.resultats[0].engagements![1].roles, undefined);
});

console.log("\n── Vérifications ──");

test("reconnaître une personne tapée à la main", () => {
  const s = saison();
  assert.equal(clePersonne(s, "zoe martin"), "cav:zoe");
  assert.equal(clePersonne(s, "Zoé"), "cav:zoe");
  assert.equal(clePersonne(s, "Léa"), "nom:lea", "deux Léa : on ne devine pas");
  assert.equal(clePersonne(s, "Léa B"), "cav:lea2");
  assert.equal(clePersonne(s, " Papa  de Lou"), "nom:papa de lou");
});

test("tableau complet et cohérent : rien à signaler", () => {
  const s = saison();
  // Nicolas fait les deux prépas qui se chevauchent : un responsable peut surveiller les deux.
  assert.deepEqual(verifierTableau(s, complet(s)), []);
});

test("rôle manquant signalé", () => {
  const s = saison();
  const r = poserRole(complet(s), "eq", "facteur", "");
  const msgs = verifierTableau(s, poserPlaceur(r, "eq", 0, "")).map((a) => a.message);
  assert.deepEqual(msgs, ["Les Fusées : placeur (1 minimum), facteur à désigner."]);
});

test("un cavalier placeur pendant son propre échauffement", () => {
  const s = saison();
  // Lou prépare puis échauffe pour le Duo de 8h45 à 9h45 : il ne peut pas placer pour les Fusées (9h00–9h45).
  const r = poserPlaceur(complet(s), "eq", 1, "lou");
  const msgs = verifierTableau(s, r).map((x) => x.message);
  assert.deepEqual(msgs, ["Lou : placeur pour Les Fusées (09h00–09h45) et en préparation avec Duo (08h45–09h15) en même temps."], "un seul message, pas un par temps");
  // Inès est facteur du Duo (9h45–10h15) juste après avoir couru avec les Fusées : pas de conflit.
  assert.deepEqual(verifierTableau(s, complet(s)), []);
});

test("un juge tapé par son prénom qui passe en même temps", () => {
  const s = saison();
  const r = poserRole(complet(s), "p", "juge", "zoé");
  const msgs = verifierTableau(s, poserDuree(s, r, "eq", 60)).map((x) => x.message);
  assert.ok(msgs.some((m) => m.startsWith("zoé : juge pour Duo") || m.startsWith("Zoé Martin : en jeu avec Les Fusées (09h00–10h00) et juge pour Duo")), msgs.join("\n"));
});

test("deux rôles sur le même passage : choix d'organisation, pas signalé", () => {
  const s = saison();
  const r = poserRole(complet(s), "eq", "facteur", "papa de lou");
  assert.deepEqual(verifierTableau(s, r), []);
});

test("une personne responsable de l'échauffement et juge en même temps", () => {
  const s = saison();
  // Emmeline échauffe le Duo de 9h15 à 9h45 et serait juge des Fusées (9h00–9h45).
  const r = poserRole(complet(s), "eq", "juge", "Emmeline");
  const msgs = verifierTableau(s, r).map((x) => x.message);
  assert.deepEqual(msgs, ["Emmeline : juge pour Les Fusées (09h00–09h45) et responsable échauffement de Duo (09h15–09h45) en même temps."]);
});

console.log("\n── Qui est disponible ──");

const libres = (c: ReturnType<typeof candidatsRole>) => c.filter((x) => !x.occupe).map((x) => x.nom);

test("placeur des Fusées (9h00–9h45) : ni ceux qui courent, ni ceux du Duo qui se préparent", () => {
  const s = saison();
  const c = candidatsRole(s, complet(s), "eq", "placeur");
  assert.deepEqual(libres(c).filter((n) => s.cavaliers.some((x) => n.startsWith(x.prenom))), ["Léa A", "Léa B"]);
  assert.equal(c.find((x) => x.cavalierId === "zoe")!.occupe, "en jeu avec Les Fusées (09h00–09h45)");
  assert.equal(c.find((x) => x.cavalierId === "lou")!.occupe, "en préparation avec Duo (08h45–09h15)");
  assert.ok(c.findIndex((x) => x.occupe) > c.findIndex((x) => !x.occupe), "les libres d'abord");
});

test("responsable prépa des Fusées (8h00–8h30) : tout le monde est libre, sauf les Fusées qui préparent", () => {
  const s = saison();
  const c = candidatsRole(s, complet(s), "eq", "respPrepa");
  assert.equal(c.find((x) => x.cavalierId === "lou")!.occupe, undefined);
  assert.equal(c.find((x) => x.cavalierId === "zoe")!.occupe, "en préparation avec Les Fusées (08h00–08h30)");
  // Nicolas est déjà responsable de cette prépa : même rôle, il reste proposé.
  assert.equal(c.find((x) => x.nom === "Nicolas")!.occupe, undefined);
});

test("les adultes déjà désignés sont proposés, avec leur occupation", () => {
  const s = saison();
  // Emmeline échauffe le Duo de 9h15 à 9h45 : pas libre pour juger les Fusées.
  const c = candidatsRole(s, complet(s), "eq", "juge");
  assert.equal(c.find((x) => x.nom === "Emmeline")!.occupe, "responsable échauffement de Duo (09h15–09h45)");
  assert.equal(c.find((x) => x.nom === "Papa de Lou")!.occupe, undefined, "déjà juge de ce passage");
  assert.equal(c.find((x) => x.nom === "Maman de Zoé")!.occupe, undefined, "juge du Duo, plus tard");
});

test("passage sans horaire : personne n'est écarté", () => {
  const s = saison();
  const r = engagerEquipes(s, { ...s.resultats[0], heureDebut: undefined }, ["eq"]);
  assert.ok(candidatsRole(s, r, "eq", "juge").every((x) => !x.occupe));
});

console.log("\n── Impression ──");

test("la page imprimable reprend tout, échappe le texte", () => {
  const s = saison();
  const html = htmlTableau(s, poserRole(complet(s), "eq", "juge", "<Papa & co>"));
  assert.match(html, /Pieux — 15\/11\/2026 — Pieux/);
  assert.match(html, /08h00–08h30/);
  assert.match(html, /Zoé Martin — <i>Gala<\/i>/);
  assert.match(html, /&lt;Papa &amp; co&gt;/);
  assert.ok(!html.includes("<Papa"));
});

console.log(process.exitCode ? "\n❌ des tests ont échoué" : `\n✅ ${passes} tests passés`);
