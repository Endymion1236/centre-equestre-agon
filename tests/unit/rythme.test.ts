/**
 * tests/unit/rythme.test.ts
 *
 * Tests du rythme « une semaine sur deux » (gardes alternées).
 *   npx tsx tests/unit/rythme.test.ts
 *
 * Enjeu : cette règle décide qui est posé sur quelle séance. Une erreur de
 * parité et un cavalier vient les semaines où il est chez son autre parent —
 * ou pire, disparaît du planning sans que personne ne comprenne pourquoi.
 * D'où deux garde-fous testés explicitement : le doute profite toujours à la
 * présence, et le calcul ne se laisse pas décaler par le changement d'heure.
 */

import {
  numeroSemaineISO, estQuinzaine, estSemaineAttendue,
  libelleRythme, expliqueRythme, seancesAttendues,
} from "../../src/lib/rythme";

let passed = 0, failed = 0;
const failures: string[] = [];
function assert(label: string, cond: boolean, details?: string) {
  if (cond) { passed++; console.log(`  ✅ ${label}`); }
  else { failed++; failures.push(label); console.log(`  ❌ ${label}${details ? " — " + details : ""}`); }
}

console.log("\n══════════════════════════════════════════════════════════════");
console.log("  Tests unitaires rythme quinzaine");
console.log("══════════════════════════════════════════════════════════════\n");

const PAIRES = { rythme: "quinzaine", semainePaire: true };
const IMPAIRES = { rythme: "quinzaine", semainePaire: false };
const HEBDO = { rythme: "hebdo" };

// ─── Numéro de semaine ISO ────────────────────────────────────────
console.log("✓ Numéro de semaine ISO 8601 :");
{
  // Cas de référence : le 4 janvier est toujours en semaine 1.
  assert("2026-01-04 → S1", numeroSemaineISO("2026-01-04") === 1);
  assert("2026-01-05 → S2 (lundi)", numeroSemaineISO("2026-01-05") === 2);
  // 2026 commence un jeudi : le 1er janvier appartient donc à la semaine 1.
  assert("2026-01-01 → S1", numeroSemaineISO("2026-01-01") === 1);
  // Fin d'année rattachée à la semaine 1 de l'année suivante.
  assert("2025-12-29 → S1 (déborde sur 2026)", numeroSemaineISO("2025-12-29") === 1);
  assert("2025-09-01 → S36 (rentrée)", numeroSemaineISO("2025-09-01") === 36);
  assert("accepte un objet Date", numeroSemaineISO(new Date("2026-01-04T12:00:00")) === 1);
  // Les 7 jours d'une même semaine portent le même numéro : sans ça, un
  // cavalier du samedi et un du lundi ne seraient pas sur le même cycle.
  const semaine = ["2026-03-16", "2026-03-17", "2026-03-18", "2026-03-19", "2026-03-20", "2026-03-21", "2026-03-22"];
  assert("les 7 jours d'une semaine ont le même numéro",
    new Set(semaine.map(numeroSemaineISO)).size === 1);
}

// ─── Changement d'heure ───────────────────────────────────────────
console.log("\n✓ Le passage à l'heure d'été ne décale pas la semaine :");
{
  // 29 mars 2026 = passage à l'heure d'été en France. Une date interprétée à
  // minuit peut basculer la veille selon le fuseau, et changer de semaine.
  assert("2026-03-29 (dimanche) → S13", numeroSemaineISO("2026-03-29") === 13);
  assert("2026-03-30 (lundi) → S14", numeroSemaineISO("2026-03-30") === 14);
  // 25 octobre 2026 = retour à l'heure d'hiver.
  assert("2026-10-25 (dimanche) → S43", numeroSemaineISO("2026-10-25") === 43);
  assert("2026-10-26 (lundi) → S44", numeroSemaineISO("2026-10-26") === 44);
}

// ─── Semaines attendues ───────────────────────────────────────────
console.log("\n✓ Qui est attendu quelle semaine :");
{
  // S13 impaire, S14 paire.
  assert("paires : attendu en S14", estSemaineAttendue("2026-03-30", PAIRES));
  assert("paires : pas attendu en S13", !estSemaineAttendue("2026-03-23", PAIRES));
  assert("impaires : attendu en S13", estSemaineAttendue("2026-03-23", IMPAIRES));
  assert("impaires : pas attendu en S14", !estSemaineAttendue("2026-03-30", IMPAIRES));
  // Deux forfaits de parité opposée ne se croisent jamais.
  const dates = ["2026-03-23", "2026-03-30", "2026-04-06", "2026-04-13"];
  assert("les deux parités couvrent chaque semaine exactement une fois",
    dates.every(d => estSemaineAttendue(d, PAIRES) !== estSemaineAttendue(d, IMPAIRES)));
  // Alternance stricte : jamais deux semaines de suite.
  assert("alternance stricte sur 4 semaines",
    JSON.stringify(dates.map(d => estSemaineAttendue(d, PAIRES))) === JSON.stringify([false, true, false, true]));
}

// ─── Le doute profite à la présence ───────────────────────────────
console.log("\n✓ Tout ce qui n'est pas une quinzaine est attendu :");
{
  // Règle de sécurité : une absence affichée à tort se voit et se corrige,
  // un cavalier retiré en silence ne se remarque que le jour où il arrive.
  assert("forfait hebdo", estSemaineAttendue("2026-03-23", HEBDO));
  assert("forfait sans champ rythme (ancien)", estSemaineAttendue("2026-03-23", {}));
  assert("null", estSemaineAttendue("2026-03-23", null));
  assert("undefined", estSemaineAttendue("2026-03-23", undefined));
  assert("rythme inconnu", estSemaineAttendue("2026-03-23", { rythme: "mensuel" } as any));
  // Quinzaine sans parité enregistrée → traité comme « paires », la valeur
  // proposée par défaut à l'inscription.
  assert("quinzaine sans semainePaire → paires", estSemaineAttendue("2026-03-30", { rythme: "quinzaine" }));
  assert("quinzaine sans semainePaire → pas en S13", !estSemaineAttendue("2026-03-23", { rythme: "quinzaine" }));
}

// ─── Détection et libellés ────────────────────────────────────────
console.log("\n✓ Détection et libellés :");
{
  assert("estQuinzaine sur un forfait quinzaine", estQuinzaine(PAIRES));
  assert("estQuinzaine faux sur hebdo", !estQuinzaine(HEBDO));
  assert("estQuinzaine faux sur null", !estQuinzaine(null));
  assert("libellé paires", libelleRythme(PAIRES) === "1 sem/2 · paires");
  assert("libellé impaires", libelleRythme(IMPAIRES) === "1 sem/2 · impaires");
  assert("pas de libellé en hebdo", libelleRythme(HEBDO) === "");
  assert("explication : attendu", expliqueRythme("2026-03-30", PAIRES).includes("attendu cette semaine"));
  assert("explication : pas attendu", expliqueRythme("2026-03-23", PAIRES).includes("pas attendu"));
  assert("explication : dit que ce n'est pas une absence",
    expliqueRythme("2026-03-23", PAIRES).includes("pas une absence"));
  assert("explication vide en hebdo", expliqueRythme("2026-03-23", HEBDO) === "");
}

// ─── Décompte des séances ─────────────────────────────────────────
console.log("\n✓ Décompte des séances dues :");
{
  const saison = ["2026-03-23", "2026-03-30", "2026-04-06", "2026-04-13", "2026-04-20", "2026-04-27"];
  assert("hebdo : toutes les séances", seancesAttendues(saison, HEBDO) === 6);
  assert("quinzaine paires : la moitié", seancesAttendues(saison, PAIRES) === 3);
  assert("quinzaine impaires : la moitié", seancesAttendues(saison, IMPAIRES) === 3);
  assert("les deux parités se complètent",
    seancesAttendues(saison, PAIRES) + seancesAttendues(saison, IMPAIRES) === saison.length);
  assert("liste vide", seancesAttendues([], PAIRES) === 0);
  // Nombre impair de séances : une parité en a une de plus, jamais un demi.
  const impair = ["2026-03-23", "2026-03-30", "2026-04-06"];
  assert("nombre impair de séances reste entier",
    Number.isInteger(seancesAttendues(impair, PAIRES)) && seancesAttendues(impair, PAIRES) === 1);
}

console.log("\n══════════════════════════════════════════════════════════════");
console.log(`  ${passed} réussis · ${failed} échoués`);
if (failed > 0) {
  console.log("\n  Échecs :");
  failures.forEach(f => console.log(`   • ${f}`));
}
console.log("══════════════════════════════════════════════════════════════\n");
process.exit(failed > 0 ? 1 : 0);
