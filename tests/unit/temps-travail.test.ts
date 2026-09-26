/**
 * tests/unit/temps-travail.test.ts
 *
 * Temps de travail d'une journée à partir des tâches planifiées.
 *   npx tsx tests/unit/temps-travail.test.ts
 *
 * Enjeu : de la paie, sur tous les salariés à la fois. L'ancienne règle
 * comptait l'amplitude — première tâche → dernière — et n'en retirait que les
 * pauses saisies comme tâche. Une journée 9h–12h / 14h–17h sans pause saisie
 * comptait 8 h au lieu de 6, et le mois d'une salariée affichait 33 h
 * supplémentaires quand elle n'en avait aucune. Un calcul qui dépend d'une
 * saisie qu'on oublie n'est pas un calcul.
 */

import {
  calculerJournee, minutesTravaillees, SEUIL_ALERTE_BATTEMENT_MIN,
} from "../../src/lib/temps-travail";

let passed = 0, failed = 0;
const failures: string[] = [];
function assert(label: string, cond: boolean, details?: string) {
  if (cond) { passed++; console.log(`  ✅ ${label}`); }
  else { failed++; failures.push(label); console.log(`  ❌ ${label}${details ? " — " + details : ""}`); }
}

const t = (heureDebut: string, dureeMinutes: number, categorie = "soins") => ({ heureDebut, dureeMinutes, categorie });
const H = 60;

console.log("\n✓ Sans pause saisie, un battement est du travail (règle du 26/09/2026) :");
{
  assert("9h–12h et 14h–17h sans pause = 8 h", minutesTravaillees([t("09:00", 3 * H), t("14:00", 3 * H)]) === 8 * H);
  assert("15 min entre deux tâches → comptées", minutesTravaillees([t("09:00", 2 * H), t("11:15", H)]) === 3 * H + 15);
  assert("45 min → comptées aussi", minutesTravaillees([t("09:00", H), t("10:45", H)]) === 2 * H + 45);
}

console.log("\n✓ La pause saisie est déduite :");
{
  const jour = [t("09:00", 3 * H), t("14:00", 3 * H), t("12:00", 2 * H, "pause")];
  assert("9h–12h, pause 12h–14h, 14h–17h = 6 h", minutesTravaillees(jour) === 6 * H, `${minutesTravaillees(jour) / H} h`);
  const courte = [t("09:00", 4 * H), t("13:00", 3 * H), t("12:00", 15, "pause")];
  assert("pause de 15 min au milieu d'une tâche : retirée", minutesTravaillees(courte) === 7 * H - 15);
  const partielle = [t("09:00", 3 * H), t("14:00", 3 * H), t("12:00", H, "pause")];
  assert("pause d'1 h dans un trou de 2 h : l'autre heure reste travaillée", minutesTravaillees(partielle) === 7 * H);
  assert("pause avant la prise de poste : sans effet", minutesTravaillees([t("09:00", 3 * H), t("08:00", 30, "pause")]) === 3 * H);
}

console.log("\n✓ Alerte au-delà d'une heure de battement sans pause :");
{
  assert("le seuil d'alerte est d'une heure", SEUIL_ALERTE_BATTEMENT_MIN === 60);
  const j = calculerJournee([t("09:00", 3 * H), t("14:00", 3 * H)]);
  assert("2 h sans pause entre 12h et 14h → alerte", j.battementsLongs.length === 1 && j.battementsLongs[0].minutes === 2 * H && j.battementsLongs[0].debut === 12 * H);
  assert("1 h pile → pas d'alerte", calculerJournee([t("09:00", H), t("11:00", H)]).battementsLongs.length === 0);
  assert("1 h 01 → alerte", calculerJournee([t("09:00", H), t("11:01", H)]).battementsLongs.length === 1);
  const couvert = calculerJournee([t("09:00", 3 * H), t("14:00", 3 * H), t("12:00", 2 * H, "pause")]);
  assert("trou couvert par une pause → pas d'alerte", couvert.battementsLongs.length === 0);
  const moitie = calculerJournee([t("09:00", 3 * H), t("14:30", 3 * H), t("12:00", H, "pause")]);
  assert("trou de 2 h 30 dont 1 h de pause → alerte sur 1 h 30", moitie.battementsLongs.length === 1 && moitie.battementsLongs[0].minutes === 90);
}

console.log("\n✓ Deux tâches qui se chevauchent ne comptent pas double :");
{
  assert("9h–11h et 10h–12h = 3 h", minutesTravaillees([t("09:00", 2 * H), t("10:00", 2 * H)]) === 3 * H);
  assert("deux tâches identiques = 1 h", minutesTravaillees([t("09:00", H), t("09:00", H)]) === H);
}

console.log("\n✓ Bornes :");
{
  assert("aucune tâche → 0", minutesTravaillees([]) === 0);
  assert("que des pauses → 0", minutesTravaillees([t("12:00", H, "pause")]) === 0);
  assert("durée nulle → 0", minutesTravaillees([t("09:00", 0)]) === 0);
  assert("durée négative ignorée", minutesTravaillees([t("09:00", -60)]) === 0);
  assert("une pause plus longue que le travail ne rend pas négatif", minutesTravaillees([t("09:00", H), t("09:00", 5 * H, "pause")]) === 0);
  const j = calculerJournee([t("09:00", 3 * H), t("14:00", 3 * H)]);
  assert("début et fin de journée conservés", j.debutMin === 9 * H && j.finMin === 17 * H);
}

console.log("\n✓ Cas vécu — journée type d'un moniteur, pause saisie :");
{
  const jour = [t("08:00", 4 * H), t("12:00", 2 * H, "pause"), t("14:00", 2 * H), t("16:10", 110)];
  assert("8h–18h, pause 12h–14h, battement de 10 min compté = 8 h", minutesTravaillees(jour) === 8 * H, `${minutesTravaillees(jour)} min`);
  assert("aucune alerte", calculerJournee(jour).battementsLongs.length === 0);
}

console.log("\n══════════════════════════════════════════════════════════════");
console.log(`  ${passed} réussis · ${failed} échoués`);
if (failed > 0) {
  console.log("\n  Échecs :");
  failures.forEach(f => console.log(`   • ${f}`));
}
console.log("══════════════════════════════════════════════════════════════\n");
process.exit(failed > 0 ? 1 : 0);
