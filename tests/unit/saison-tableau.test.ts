/**
 * tests/unit/saison-tableau.test.ts
 *
 * Tableau de la journée : prépa (30 min) puis échauffement (30 min) avant
 * chaque passage, placeurs, juge, facteur, et personnes prises deux fois.
 *   npx tsx tests/unit/saison-tableau.test.ts
 */
import assert from "node:assert/strict";
import {
  lignesTableau, plageLisible, poserRole, poserPlaceur, verifierTableau, clePersonne, htmlTableau, candidatsRole, estPersonne,
} from "../../src/lib/concours/saison-tableau";
import { engagerEquipes, poserDuree, poserPoney, poserRemplacant } from "../../src/lib/concours/saison-organisation";
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
    r = poserRole(r, eq, "coach", "Coach Paul");
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

console.log("\n── Cas du 11h : l'équipe suivante n'est pas libre ──");

function cas11h(): { s: SaisonPonyGames; r: ResultatConcours } {
  const s: SaisonPonyGames = {
    id: "s", nom: "2026/2027",
    cavaliers: [
      { id: "a", prenom: "Astérix" }, { id: "o", prenom: "Obélix" }, { id: "i", prenom: "Idéfix" }, { id: "p", prenom: "Panoramix" },
      { id: "x", prenom: "Zoé" }, { id: "y", prenom: "Léo" }, { id: "libre", prenom: "Ana" },
    ],
    equipes: [
      { id: "h11", nom: "Les Fusées", categorie: "Benjamin", indice: "", cavalierIds: ["x", "y"] },
      { id: "gaulois", nom: "Les Irréductibles Gaulois", categorie: "Minime", indice: "", cavalierIds: ["a", "o", "i", "p"] },
    ],
    resultats: [{ id: "c", nom: "Pieux", date: "2026-11-15", heureDebut: "11:00", classements: [] }],
  };
  return { s, r: engagerEquipes(s, s.resultats[0], ["h11", "gaulois"]) };
}
const occupesDe = (c: ReturnType<typeof candidatsRole>) => Object.fromEntries(c.map((x) => [x.nom, x.occupe ?? "libre"]));

test("Gaulois à 11h45 : pas libres pour placer ni échauffer à 11h", () => {
  const { s, r } = cas11h();
  assert.equal(r.engagements![1].heure, "11:45");
  const placeur = occupesDe(candidatsRole(s, r, "h11", "placeur"));
  assert.equal(placeur["Astérix"], "en préparation avec Les Irréductibles Gaulois (10h45–11h15)");
  assert.equal(placeur["Ana"], "libre");
  const ech = occupesDe(candidatsRole(s, r, "h11", "respEchauffement")); // 10h30–11h00
  assert.equal(ech["Obélix"], "en préparation avec Les Irréductibles Gaulois (10h45–11h15)");
  // La prépa du 11h (10h00–10h30) finit avant la leur (10h45) : là, ils sont vraiment libres.
  assert.equal(occupesDe(candidatsRole(s, r, "h11", "respPrepa"))["Obélix"], "libre");
});

test("équipe suivante sans horaire : ses cavaliers ne sont pas proposés", () => {
  const { s, r } = cas11h();
  const r2 = { ...r, engagements: r.engagements!.map((g) => (g.equipeId === "gaulois" ? { ...g, heure: undefined } : g)) };
  const placeur = occupesDe(candidatsRole(s, r2, "h11", "placeur"));
  assert.equal(placeur["Astérix"], "joue avec Les Irréductibles Gaulois — horaire à saisir");
  assert.equal(placeur["Ana"], "libre");
});

test("cavalier saisi deux fois : une seule personne, occupée", () => {
  const { s, r } = cas11h();
  const s2 = { ...s, cavaliers: [...s.cavaliers, { id: "a-bis", prenom: "astérix " }] };
  const c = candidatsRole(s2, r, "h11", "placeur").filter((x) => x.nom.toLowerCase().trim() === "astérix");
  assert.equal(c.length, 1, "proposé une seule fois");
  assert.ok(c[0].occupe);
  // Choisi sous sa 2e fiche, il est quand même repéré en conflit.
  const r2 = poserPlaceur(r, "h11", 0, "a-bis");
  assert.ok(verifierTableau(s2, r2).some((x) => x.gravite === "erreur" && x.message.includes("placeur pour Les Fusées")));
  assert.equal(clePersonne(s2, "Astérix"), "cav:a");
});

console.log("\n── Coach et cavalier du poney remplaçant ──");

test("coach : à désigner s'il manque, en conflit s'il est juge au même moment", () => {
  const s = saison();
  let r = poserRole(complet(s), "eq", "coach", "");
  assert.deepEqual(verifierTableau(s, r).map((a) => a.message), ["Les Fusées : coach à désigner."]);
  // Coach Paul coache les deux passages, l'un après l'autre : rien à dire.
  assert.deepEqual(verifierTableau(s, complet(s)), []);
  r = poserRole(complet(s), "eq", "juge", "Coach Paul");
  assert.ok(verifierTableau(s, r).some((a) => a.message === "Coach Paul : coach de Les Fusées (09h00–09h45) et juge pour Les Fusées (09h00–09h45) en même temps."));
  assert.equal(occupesDe(candidatsRole(s, complet(s), "eq", "juge"))["Coach Paul"], "coach de Les Fusées (09h00–09h45)");
});

test("cavalier du poney remplaçant : pris de l'échauffement à la fin du passage", () => {
  const s = saison();
  let r = poserRemplacant(complet(s), "eq", "Pompon");
  // Candidats : ni les Fusées (elles jouent), ni le Duo (prépa 8h45) ; Léa A est placeur, donc prise aussi.
  const c = occupesDe(candidatsRole(s, r, "eq", "cavalierRemplacant"));
  assert.equal(c["Zoé Martin"], "en échauffement avec Les Fusées (08h30–09h00)");
  assert.equal(c["Lou"], "en préparation avec Duo (08h45–09h15)");
  assert.equal(c["Léa B"], "facteur pour Les Fusées (09h00–09h45)");
  r = poserRole(r, "eq", "cavalierRemplacant", "lou");
  assert.ok(verifierTableau(s, r).some((a) => a.message.startsWith("Lou : en préparation avec Duo") || a.message.startsWith("Lou : au poney remplaçant")));
  // Pas de poney remplaçant : le cavalier choisi n'occupe personne.
  r = poserRemplacant(r, "eq", "");
  assert.deepEqual(verifierTableau(s, r), []);
});

test("un cavalier retiré de la saison quitte le poney remplaçant", () => {
  let s = saison();
  s = { ...s, resultats: [poserRole(poserRemplacant(complet(s), "eq", "Pompon"), "eq", "cavalierRemplacant", "ana")] };
  s = { ...s, cavaliers: [...s.cavaliers, { id: "ana", prenom: "Ana" }] };
  s = retirerCavalier(s, "ana");
  assert.equal(s.resultats[0].engagements![0].roles!.cavalierRemplacant, undefined);
  assert.equal(s.resultats[0].engagements![0].roles!.coach, "Coach Paul", "les autres rôles restent");
});

console.log("\n── « X » : personne sur le rôle ──");

test("X veut dire personne, sous plusieurs écritures", () => {
  for (const v of ["X", "x", " x ", "personne", "Aucun", "-"]) assert.equal(estPersonne(v), true, v);
  for (const v of ["", undefined, "Xavier", "Max"]) assert.equal(estPersonne(v), false, String(v));
});

test("X sur plusieurs rôles en même temps : jamais occupé, jamais en conflit, rôle tranché", () => {
  const s = saison();
  let r = complet(s);
  for (const eq of ["eq", "p"]) {
    r = poserRole(r, eq, "juge", "X");
    r = poserRole(r, eq, "facteur", "x");
    r = poserRole(r, eq, "respEchauffement", "X");
  }
  r = poserPlaceur(r, "eq", 0, "X");
  r = poserRole(poserRemplacant(r, "eq", "Pompon"), "eq", "cavalierRemplacant", "X");
  assert.deepEqual(verifierTableau(s, r), [], "ni conflit ni « à désigner »");
  assert.ok(!candidatsRole(s, r, "eq", "coach").some((c) => c.nom.toLowerCase() === "x"), "pas listé comme une personne");
  assert.match(htmlTableau(s, r), /<td>X<\/td>/);
});

test("X à volonté : deux placeurs X possibles", () => {
  const s = saison();
  let r = poserPlaceur(complet(s), "eq", 0, "X");
  r = poserPlaceur(r, "eq", 1, "X");
  assert.deepEqual(r.engagements![0].roles!.placeurs, ["X", "X"]);
  assert.deepEqual(verifierTableau(s, r), []);
});

console.log("\n── Deux coachs, deux responsables d'échauffement ──");

test("2e coach et 2e responsable : même créneau, pas de conflit entre eux, imprimés", () => {
  const s = saison();
  let r = poserRole(complet(s), "eq", "coach2", "Coach Julie");
  r = poserRole(r, "eq", "respEchauffement2", "Léa A"); // 8h30–9h00 : Léa A n'est placeur qu'à 9h00
  assert.deepEqual(verifierTableau(s, r), []);
  // Le 2e coach est pris pendant le passage, comme le 1er.
  assert.equal(occupesDe(candidatsRole(s, r, "eq", "juge"))["Coach Julie"], "coach de Les Fusées (09h00–09h45)");
  // Les deux coachs restent proposés l'un à côté de l'autre (même rôle).
  assert.equal(occupesDe(candidatsRole(s, r, "eq", "coach2"))["Coach Paul"], "libre");
  const html = htmlTableau(s, r);
  assert.match(html, /Coach Paul<br>Coach Julie/);
  assert.match(html, /Emmeline et Léa A/);
});

test("le 2e suffit : rôle tranché même si le 1er est vide", () => {
  const s = saison();
  let r = poserRole(complet(s), "eq", "coach", "");
  r = poserRole(r, "eq", "coach2", "Coach Julie");
  r = poserRole(poserRole(r, "eq", "respEchauffement", ""), "eq", "respEchauffement2", "Emmeline");
  assert.deepEqual(verifierTableau(s, r), []);
});

test("2e responsable d'échauffement en même temps qu'un autre rôle : conflit", () => {
  const s = saison();
  // Le Duo s’échauffe de 9h15 à 9h45 ; Inès joue avec les Fusées jusqu’à 9h45.
  const r = poserRole(complet(s), "p", "respEchauffement2", "Inès");
  assert.ok(verifierTableau(s, r).some((a) => a.gravite === "erreur" && a.message.startsWith("Inès : en jeu avec Les Fusées")));
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
