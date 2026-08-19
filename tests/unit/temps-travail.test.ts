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
  calculerJournee, minutesTravaillees, SEUIL_BATTEMENT_MIN,
} from "../../src/lib/temps-travail";

let passed = 0, failed = 0;
const failures: string[] = [];
function assert(label: string, cond: boolean, details?: string) {
  if (cond) { passed++; console.log(`  ✅ ${label}`); }
  else { failed++; failures.push(label); console.log(`  ❌ ${label}${details ? " — " + details : ""}`); }
}

const t = (heureDebut: string, dureeMinutes: number, categorie = "soins") => ({ heureDebut, dureeMinutes, categorie });
const H = 60;

console.log("\n✓ Le trou du midi n'est plus payé :");
{
  const jour = [t("09:00", 3 * H), t("14:00", 3 * H)];
  assert("9h–12h et 14h–17h = 6 h", minutesTravaillees(jour) === 6 * H, `${minutesTravaillees(jour) / H} h`);
  // L'ancienne règle (amplitude 9h→17h) en comptait 8 : deux heures offertes
  // chaque jour, sur chaque salarié, sans que rien ne le signale.
  assert("l'amplitude en aurait compté 8", 8 * H - minutesTravaillees(jour) === 2 * H);
}

console.log("\n✓ Un battement court reste du travail :");
{
  assert("15 min entre deux tâches → compté",
    minutesTravaillees([t("09:00", 2 * H), t("11:15", 1 * H)]) === 3 * H + 15,
    `${minutesTravaillees([t("09:00", 2 * H), t("11:15", 1 * H)])} min`);
  assert("29 min → compté (sous le seuil)",
    minutesTravaillees([t("09:00", H), t("10:29", H)]) === 2 * H + 29);
  assert("30 min → pas compté (au seuil)",
    minutesTravaillees([t("09:00", H), t("10:30", H)]) === 2 * H);
  assert("le seuil est bien à 30 minutes", SEUIL_BATTEMENT_MIN === 30);
}

console.log("\n✓ Une pause saisie est déduite, même courte :");
{
  // Saisir une pause est une déclaration : elle prime sur le seuil.
  const jour = [t("09:00", 4 * H), t("13:00", 3 * H), t("12:00", 15, "pause")];
  assert("pause de 15 min retirée", minutesTravaillees(jour) === 7 * H - 15,
    `${minutesTravaillees(jour)} min`);

  // Une pause qui tombe dans une vraie coupure ne retire rien de plus :
  // la coupure n'était déjà pas comptée.
  const jour2 = [t("09:00", 3 * H), t("14:00", 3 * H), t("12:00", 2 * H, "pause")];
  assert("pause dans une coupure déjà non comptée : pas de double retrait",
    minutesTravaillees(jour2) === 6 * H, `${minutesTravaillees(jour2) / H} h`);

  // Une pause hors de la journée de travail ne retire rien.
  const jour3 = [t("09:00", 3 * H), t("08:00", 30, "pause")];
  assert("pause avant la prise de poste : sans effet", minutesTravaillees(jour3) === 3 * H);
}

console.log("\n✓ Deux tâches qui se chevauchent ne comptent pas double :");
{
  const jour = [t("09:00", 2 * H), t("10:00", 2 * H)];
  assert("9h–11h et 10h–12h = 3 h", minutesTravaillees(jour) === 3 * H, `${minutesTravaillees(jour) / H} h`);
  const identiques = [t("09:00", H), t("09:00", H)];
  assert("deux tâches identiques = 1 h", minutesTravaillees(identiques) === H);
}

console.log("\n✓ La coupure sert à couper matin / après-midi :");
{
  const j = calculerJournee([t("09:00", 3 * H), t("14:00", 3 * H)]);
  assert("coupure repérée de 12h à 14h", !!j.coupure && j.coupure.debut === 12 * H && j.coupure.fin === 14 * H);
  assert("début et fin de journée conservés", j.debutMin === 9 * H && j.finMin === 17 * H);
  const continu = calculerJournee([t("09:00", 3 * H), t("12:10", 2 * H)]);
  assert("journée continue : aucune coupure", continu.coupure === null);
  const troisSegments = calculerJournee([t("08:00", H), t("10:00", H), t("14:00", H)]);
  assert("avec trois segments, la PLUS LONGUE coupure est retenue",
    !!troisSegments.coupure && troisSegments.coupure.debut === 11 * H && troisSegments.coupure.fin === 14 * H);
}

console.log("\n✓ Bornes :");
{
  assert("aucune tâche → 0", minutesTravaillees([]) === 0);
  assert("que des pauses → 0", minutesTravaillees([t("12:00", H, "pause")]) === 0);
  assert("durée nulle → 0", minutesTravaillees([t("09:00", 0)]) === 0);
  assert("durée négative ignorée", minutesTravaillees([t("09:00", -60)]) === 0);
  const pauseGeante = [t("09:00", H), t("09:00", 5 * H, "pause")];
  assert("une pause plus longue que le travail ne rend pas négatif", minutesTravaillees(pauseGeante) === 0);
}

console.log("\n✓ Cas vécu — journée type d'un moniteur :");
{
  // 8h–12h de soins, coupure du midi, 14h–18h de cours, avec un battement
  // de 10 minutes entre deux cours l'après-midi.
  const jour = [
    t("08:00", 4 * H), t("14:00", 2 * H), t("16:10", 110),
  ];
  // 4 h + 2 h + 1h50 = 7h50 de tâches, plus les 10 min de battement = 8 h.
  assert("8h–12h puis 14h–18h d'affilée = 8 h, battement de 10 min compris",
    minutesTravaillees(jour) === 8 * H, `${minutesTravaillees(jour)} min`);
  const j = calculerJournee(jour);
  assert("une seule coupure retenue : celle du midi",
    !!j.coupure && j.coupure.debut === 12 * H && j.coupure.fin === 14 * H);
  assert("deux segments seulement : le battement a été ponté", j.segments.length === 2);
}

console.log("\n══════════════════════════════════════════════════════════════");
console.log(`  ${passed} réussis · ${failed} échoués`);
if (failed > 0) {
  console.log("\n  Échecs :");
  failures.forEach(f => console.log(`   • ${f}`));
}
console.log("══════════════════════════════════════════════════════════════\n");
process.exit(failed > 0 ? 1 : 0);
