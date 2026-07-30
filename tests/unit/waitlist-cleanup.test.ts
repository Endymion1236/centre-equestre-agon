/**
 * tests/unit/waitlist-cleanup.test.ts
 *
 *   npx tsx tests/unit/waitlist-cleanup.test.ts
 *
 * Ces regles pilotent une suppression DEFINITIVE. Le pire scenario n'est
 * pas d'oublier de nettoyer, c'est d'effacer une demande encore active :
 * la famille attend alors un appel que plus personne ne peut lui passer.
 * Les cas negatifs comptent donc autant que les cas nominaux.
 */

import {
  DELAI_GRACE_JOURS, classerWaitlist, dateDeFin, estPerimee, estSupprimable,
} from "../../src/lib/waitlist-cleanup";

let passed = 0, failed = 0;
const failures: string[] = [];
function assert(label: string, cond: boolean, details?: string) {
  if (cond) { passed++; console.log(`  ✅ ${label}`); }
  else { failed++; failures.push(label); console.log(`  ❌ ${label}${details ? " — " + details : ""}`); }
}

console.log("\n══════════════════════════════════════════════════════════════");
console.log("  Tests unitaires purge liste d'attente");
console.log("══════════════════════════════════════════════════════════════\n");

const AUJ = "2026-07-30";

// ─── Date de fin ─────────────────────────────────────────────────
console.log("✓ Determination de la date de fin :");
{
  assert("stage : la date de FIN prime", dateDeFin({ date: "2026-07-20", dateFin: "2026-07-24" }) === "2026-07-24");
  assert("cours simple : la date suffit", dateDeFin({ date: "2026-07-20" }) === "2026-07-20");
  assert("aucune date -> null", dateDeFin({}) === null);
  assert("date vide -> null", dateDeFin({ date: "" }) === null);
  assert("format invalide -> null", dateDeFin({ date: "20/07/2026" }) === null);
  assert("date partielle -> null", dateDeFin({ date: "2026-07" }) === null);
  assert("valeur parasite -> null", dateDeFin({ date: "bientot" }) === null);
}

// ─── Perime (affichage) ──────────────────────────────────────────
console.log("\n✓ Demande perimee (affichage) :");
{
  assert("hier -> perimee", estPerimee({ date: "2026-07-29" }, AUJ));
  assert("le jour meme -> ACTIVE", !estPerimee({ date: AUJ }, AUJ), "une seance du jour compte encore");
  assert("demain -> active", !estPerimee({ date: "2026-07-31" }, AUJ));
  assert("stage en cours -> active", !estPerimee({ date: "2026-07-27", dateFin: "2026-07-31" }, AUJ),
    "le stage court encore, la place peut se liberer");
  assert("stage termine hier -> perimee", estPerimee({ date: "2026-07-20", dateFin: "2026-07-29" }, AUJ));
  assert("sans date -> jamais perimee", !estPerimee({}, AUJ));
}

// ─── Supprimable (definitif) ─────────────────────────────────────
console.log("\n✓ Suppression definitive :");
{
  assert("delai de grace = 7 jours", DELAI_GRACE_JOURS === 7);
  assert("perimee d'hier : PAS encore supprimable", !estSupprimable({ date: "2026-07-29" }, AUJ),
    "le delai de grace doit s'appliquer");
  assert("perimee de 6 jours : pas supprimable", !estSupprimable({ date: "2026-07-24" }, AUJ));
  assert("perimee de 10 jours : supprimable", estSupprimable({ date: "2026-07-20" }, AUJ));
  assert("stage fini il y a 10 jours : supprimable", estSupprimable({ date: "2026-07-15", dateFin: "2026-07-20" }, AUJ));
  assert("stage fini il y a 2 jours : conservee", !estSupprimable({ date: "2026-07-24", dateFin: "2026-07-28" }, AUJ));
  assert("future : jamais supprimable", !estSupprimable({ date: "2026-08-15" }, AUJ));
  assert("sans date : JAMAIS supprimable", !estSupprimable({}, AUJ), "dans le doute on garde");
  assert("date illisible : JAMAIS supprimable", !estSupprimable({ date: "n/a" }, AUJ));
}

// ─── Le piege : stage multi-jours ────────────────────────────────
console.log("\n✓ Piege du stage multi-jours :");
{
  // Debut il y a 12 jours mais fin AUJOURD'HUI : ne doit surtout pas partir
  const encours = { date: "2026-07-18", dateFin: AUJ };
  assert("commence il y a 12j mais finit aujourd'hui : conservee", !estSupprimable(encours, AUJ),
    "supprimer ici effacerait une demande encore valable");
  assert("et non perimee non plus", !estPerimee(encours, AUJ));
}

// ─── Classement d'ensemble ───────────────────────────────────────
console.log("\n✓ Classement :");
{
  const entries = [
    { id: "a", date: "2026-08-10" },                          // future
    { id: "b", date: AUJ },                                    // aujourd'hui
    { id: "c", date: "2026-07-29" },                           // hier
    { id: "d", date: "2026-07-10" },                           // vieille
    { id: "e" },                                               // sans date
    { id: "f", date: "2026-07-01", dateFin: "2026-07-05" },    // vieux stage
  ];
  const { actives, perimees, aSupprimer } = classerWaitlist(entries, AUJ);
  assert("3 actives (future, aujourd'hui, sans date)", actives.length === 3, `got ${actives.length}`);
  assert("3 perimees", perimees.length === 3, `got ${perimees.length}`);
  assert("2 a supprimer seulement", aSupprimer.length === 2, `got ${aSupprimer.length}`);
  const ids = aSupprimer.map(e => e.id).sort();
  assert("ce sont bien d et f", ids.join(",") === "d,f", ids.join(","));
  assert("l'entree sans date reste active", actives.some(e => e.id === "e"));
  assert("hier est perimee mais pas supprimee", perimees.some(e => e.id === "c") && !aSupprimer.some(e => e.id === "c"));
}
{
  const vide = classerWaitlist([], AUJ);
  assert("liste vide ne plante pas", vide.actives.length === 0 && vide.aSupprimer.length === 0);
  const nul = classerWaitlist(null as any, AUJ);
  assert("entree nulle ne plante pas", nul.aSupprimer.length === 0);
}

// ─── Delai configurable ──────────────────────────────────────────
console.log("\n✓ Delai configurable :");
{
  assert("delai 0 : hier devient supprimable", estSupprimable({ date: "2026-07-29" }, AUJ, 0));
  assert("delai 0 : aujourd'hui reste protege", !estSupprimable({ date: AUJ }, AUJ, 0));
  assert("delai 30 : 10 jours ne suffisent pas", !estSupprimable({ date: "2026-07-20" }, AUJ, 30));
}

// ─── Passage de mois ─────────────────────────────────────────────
console.log("\n✓ Changement de mois :");
{
  assert("debut de mois : recule bien sur juin", estSupprimable({ date: "2026-06-20" }, "2026-07-02"));
  assert("et conserve le tout recent", !estSupprimable({ date: "2026-06-30" }, "2026-07-02"));
}

console.log("\n══════════════════════════════════════════════════════════════");
console.log(`  RESUME : ${passed} passes, ${failed} echoues`);
console.log("══════════════════════════════════════════════════════════════\n");
if (failed > 0) { console.log("\n❌ Echecs :"); failures.forEach(f => console.log("  • " + f)); process.exit(1); }
console.log("\n✅ Tous les tests sont passes !\n");
process.exit(0);
