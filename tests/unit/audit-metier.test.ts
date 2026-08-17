/**
 * tests/unit/audit-metier.test.ts
 *
 * Les bugs métier de l'audit du 17 août, figés en tests.
 *   npx tsx tests/unit/audit-metier.test.ts
 *
 * Enjeu : ces quatre-là ont en commun de coûter de l'argent ou une place sans
 * rien afficher d'anormal à l'écran. Ils servent aussi d'étalon pour la
 * branche refactorisée : elle doit reproduire exactement ce comportement,
 * sinon on ne saura pas distinguer « le refactoring a cassé ça » de « c'était
 * déjà cassé avant ».
 */

import { estSemaineAttendue, seancesAttendues } from "../../src/lib/rythme";
import { isForfaitActif, rangEnfantPourSaison } from "../../src/lib/forfaits";
import {
  dateExpirationHold, HOLD_PAIEMENT_MINUTES, HOLD_REGLEMENT_DIFFERE_MINUTES,
} from "../../src/lib/places-tenues";

let passed = 0, failed = 0;
const failures: string[] = [];
function assert(label: string, cond: boolean, details?: string) {
  if (cond) { passed++; console.log(`  ✅ ${label}`); }
  else { failed++; failures.push(label); console.log(`  ❌ ${label}${details ? " — " + details : ""}`); }
}

console.log("\n══════════════════════════════════════════════════════════════");
console.log("  Tests unitaires — bugs métier de l'audit");
console.log("══════════════════════════════════════════════════════════════\n");

const PAIRES = { rythme: "quinzaine", semainePaire: true };
const IMPAIRES = { rythme: "quinzaine", semainePaire: false };
const HEBDO = { rythme: "hebdo" };

// ─── 1. Admin > Forfaits : facturé une semaine sur deux, inscrit toutes les semaines
console.log("✓ Un forfait quinzaine ne pose que la moitié des séances :");
{
  // Les mercredis d'une période, tels que les remonte la page Forfaits.
  const mercredis = [
    "2026-09-02", "2026-09-09", "2026-09-16", "2026-09-23", "2026-09-30",
    "2026-10-07", "2026-10-14", "2026-10-21",
  ];
  // Ce que faisait la page avant : tous les créneaux, quel que soit le rythme.
  const avant = mercredis.length;
  // Ce qu'elle fait depuis : le même filtre que le panneau du planning.
  const poses = mercredis.filter(d => estSemaineAttendue(d, PAIRES));

  assert("le cavalier n'est plus posé sur toutes les semaines", poses.length < avant);
  assert("il est posé sur la moitié des séances", poses.length === seancesAttendues(mercredis, PAIRES));
  assert("aucune séance posée hors de sa parité",
    poses.every(d => estSemaineAttendue(d, PAIRES)));
  assert("les deux parités couvrent la période sans doublon",
    seancesAttendues(mercredis, PAIRES) + seancesAttendues(mercredis, IMPAIRES) === mercredis.length);
  assert("un forfait hebdo garde toutes ses séances",
    mercredis.filter(d => estSemaineAttendue(d, HEBDO)).length === mercredis.length);

  // Le cœur du bug : facturation et présence doivent parler du même nombre.
  const seancesFacturees = Math.ceil(mercredis.length / 2); // règle de tarification
  assert("séances facturées = séances réellement posées",
    seancesFacturees === poses.length,
    `facturé ${seancesFacturees}, posé ${poses.length}`);
}

// ─── 2. Un forfait annulé ne compte plus dans le rang fratrie
console.log("\n✓ Rang de l'enfant pour la réduction fratrie :");
{
  const SAISON = 2026;
  const saisonDe = (f: any) => f.seasonStartYear ?? 0;
  const forfait = (childId: string, status: string, seasonStartYear = SAISON) =>
    ({ childId, status, seasonStartYear });

  assert("seul enfant inscrit → 1er enfant",
    rangEnfantPourSaison([], "eliot", SAISON, saisonDe) === 1);

  assert("un aîné actif → le cadet est 2e enfant",
    rangEnfantPourSaison([forfait("ambre", "actif")], "eliot", SAISON, saisonDe) === 2);

  // Le bug : Ambre désinscrite, Eliot restait 2e enfant et gardait la réduction.
  assert("un aîné ANNULÉ ne compte plus → le cadet redevient 1er enfant",
    rangEnfantPourSaison([forfait("ambre", "cancelled")], "eliot", SAISON, saisonDe) === 1);

  assert("un forfait suspendu ne compte pas non plus",
    rangEnfantPourSaison([forfait("ambre", "suspended")], "eliot", SAISON, saisonDe) === 1);

  // L'orthographe historique "active" doit continuer de compter.
  assert("un aîné en statut « active » compte comme « actif »",
    rangEnfantPourSaison([forfait("ambre", "active")], "eliot", SAISON, saisonDe) === 2);

  assert("un forfait d'une autre saison ne compte pas",
    rangEnfantPourSaison([forfait("ambre", "actif", 2025)], "eliot", SAISON, saisonDe) === 1);

  assert("l'enfant courant ne se compte jamais lui-même",
    rangEnfantPourSaison([forfait("eliot", "actif")], "eliot", SAISON, saisonDe) === 1);

  assert("deux forfaits du même aîné ne le comptent qu'une fois",
    rangEnfantPourSaison(
      [forfait("ambre", "actif"), forfait("ambre", "actif")], "eliot", SAISON, saisonDe) === 2);

  assert("trois aînés actifs → 4e enfant",
    rangEnfantPourSaison(
      [forfait("a", "actif"), forfait("b", "actif"), forfait("c", "actif")],
      "eliot", SAISON, saisonDe) === 4);

  // Un forfait sans statut date d'avant le champ : il compte (comportement historique).
  assert("un forfait sans statut compte encore",
    rangEnfantPourSaison([{ childId: "ambre", seasonStartYear: SAISON }], "eliot", SAISON, saisonDe) === 2);
}

// ─── 3. Places tenues : un chèque ne doit pas être purgé en trente minutes
console.log("\n✓ Durée de protection d'une place selon le mode de règlement :");
{
  const t0 = new Date("2026-08-17T10:00:00.000Z");
  const minutesApres = (iso: string) =>
    Math.round((new Date(iso).getTime() - t0.getTime()) / 60_000);

  assert("CB en ligne : trente minutes",
    minutesApres(dateExpirationHold(t0, "cb")) === HOLD_PAIEMENT_MINUTES);
  assert("mode absent : trente minutes (comportement d'origine)",
    minutesApres(dateExpirationHold(t0)) === HOLD_PAIEMENT_MINUTES);

  // Le bug : la place réservée par un chèque déclaré disparaissait avant que
  // le chèque n'arrive au bureau.
  for (const mode of ["cheque", "especes", "virement"]) {
    assert(`${mode} : plusieurs jours, pas trente minutes`,
      minutesApres(dateExpirationHold(t0, mode)) === HOLD_REGLEMENT_DIFFERE_MINUTES);
  }
  assert("un règlement différé tient au moins un week-end",
    HOLD_REGLEMENT_DIFFERE_MINUTES >= 3 * 24 * 60);
  assert("mais pas indéfiniment — la place finit par repartir",
    HOLD_REGLEMENT_DIFFERE_MINUTES <= 30 * 24 * 60);
  assert("un chèque tient plus longtemps qu'une CB",
    HOLD_REGLEMENT_DIFFERE_MINUTES > HOLD_PAIEMENT_MINUTES);
  assert("la date renvoyée est bien dans le futur",
    new Date(dateExpirationHold(t0, "cheque")).getTime() > t0.getTime());
}

// ─── 4. Les deux orthographes du statut d'un forfait
console.log("\n✓ Statut d'un forfait — « actif » et « active » cohabitent en base :");
{
  assert("« actif » (espace famille, créations récentes)", isForfaitActif("actif"));
  assert("« active » (créations admin plus anciennes)", isForfaitActif("active"));
  assert("sans statut → considéré actif", isForfaitActif(undefined));
  assert("chaîne vide → considéré actif", isForfaitActif(""));
  assert("« cancelled » n'est pas actif", !isForfaitActif("cancelled"));
  assert("« suspended » n'est pas actif", !isForfaitActif("suspended"));
  assert("« completed » n'est pas actif", !isForfaitActif("completed"));
}

console.log("\n══════════════════════════════════════════════════════════════");
console.log(`  ${passed} réussis · ${failed} échoués`);
if (failed > 0) {
  console.log("\n  Échecs :");
  failures.forEach(f => console.log(`   • ${f}`));
}
console.log("══════════════════════════════════════════════════════════════\n");
process.exit(failed > 0 ? 1 : 0);
