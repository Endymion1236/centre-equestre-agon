/**
 * tests/unit/planning-decoupage.test.ts
 *
 * Le découpage automatique des tâches du planning salariés.
 *   npx tsx tests/unit/planning-decoupage.test.ts
 *
 * Quand on pose une tâche sur un créneau déjà occupé, les tâches en place
 * doivent s'écarter. Ce calcul décide de la journée de travail d'une personne
 * et n'avait aucun test : une erreur ici efface une tâche sans qu'on le voie.
 */

import { planDecoupage, heureToMin, minToHeure, roundToQuarter } from "../../src/app/admin/management/planning-utils";

let passed = 0, failed = 0;
const failures: string[] = [];
function assert(label: string, cond: boolean, details?: string) {
  if (cond) { passed++; console.log(`  ✅ ${label}`); }
  else { failed++; failures.push(label); console.log(`  ❌ ${label}${details ? " — " + details : ""}`); }
}

/** Une tâche placée, telle que le planning la stocke. */
const tache = (id: string, heureDebut: string, dureeMinutes: number, tacheLabel = "Tâche") =>
  ({ id, heureDebut, dureeMinutes, tacheLabel }) as any;

const h = heureToMin;

console.log("\n══════════════════════════════════════════════════════════════");
console.log("  Tests unitaires — découpage du planning salariés");
console.log("══════════════════════════════════════════════════════════════\n");

console.log("✓ Sans chevauchement, on ne touche à rien :");
{
  const ops = planDecoupage([tache("t1", "08:00", 60)], h("10:00"), h("11:00"));
  assert("aucune modification", ops.updates.length === 0);
  assert("aucune création", ops.creates.length === 0);
  assert("aucune suppression", ops.deletes.length === 0);

  // Deux tâches qui se touchent bout à bout ne se chevauchent pas.
  const jointives = planDecoupage([tache("t1", "08:00", 60)], h("09:00"), h("10:00"));
  assert("bout à bout n'est pas un chevauchement",
    jointives.updates.length + jointives.creates.length + jointives.deletes.length === 0);
}

console.log("\n✓ La nouvelle tâche tombe au milieu : l'ancienne est coupée en deux :");
{
  // Soins 8h–12h ; on pose une leçon 9h–10h.
  const ops = planDecoupage([tache("t1", "08:00", 240, "Soins")], h("09:00"), h("10:00"));
  assert("la tâche existante est raccourcie", ops.updates.length === 1, `${ops.updates.length}`);
  assert("son début ne bouge pas", ops.updates[0].heureDebut === "08:00", ops.updates[0].heureDebut);
  assert("elle s'arrête à 9h", ops.updates[0].dureeMinutes === 60, `${ops.updates[0].dureeMinutes}`);
  assert("un morceau d'après est créé", ops.creates.length === 1, `${ops.creates.length}`);
  assert("il reprend à 10h", ops.creates[0].heureDebut === "10:00", ops.creates[0].heureDebut);
  assert("et court jusqu'à 12h", ops.creates[0].dureeMinutes === 120, `${ops.creates[0].dureeMinutes}`);
  assert("rien n'est supprimé", ops.deletes.length === 0);
  // Le temps total de la tâche est conservé, moins la part recouverte.
  const restant = ops.updates[0].dureeMinutes + ops.creates[0].dureeMinutes;
  assert("le temps recouvert, et lui seul, est retiré", restant === 240 - 60, `${restant}`);
}

console.log("\n✓ Chevauchement par la fin : l'ancienne est raccourcie :");
{
  // Soins 8h–10h ; on pose 9h–11h.
  const ops = planDecoupage([tache("t1", "08:00", 120)], h("09:00"), h("11:00"));
  assert("une seule modification", ops.updates.length === 1);
  assert("le début est conservé", ops.updates[0].heureDebut === "08:00", ops.updates[0].heureDebut);
  assert("la fin recule à 9h", ops.updates[0].dureeMinutes === 60, `${ops.updates[0].dureeMinutes}`);
  assert("rien n'est créé ni supprimé", ops.creates.length === 0 && ops.deletes.length === 0);
}

console.log("\n✓ Chevauchement par le début : l'ancienne est décalée :");
{
  // Soins 9h–11h ; on pose 8h–10h.
  const ops = planDecoupage([tache("t1", "09:00", 120)], h("08:00"), h("10:00"));
  assert("une seule modification", ops.updates.length === 1);
  assert("elle commence désormais à 10h", ops.updates[0].heureDebut === "10:00", ops.updates[0].heureDebut);
  assert("et dure une heure", ops.updates[0].dureeMinutes === 60, `${ops.updates[0].dureeMinutes}`);
}

console.log("\n✓ Recouvrement complet : l'ancienne disparaît :");
{
  const ops = planDecoupage([tache("t1", "09:00", 60, "Curage")], h("08:00"), h("12:00"));
  assert("elle est supprimée", ops.deletes.length === 1, `${ops.deletes.length}`);
  assert("son nom est rappelé", ops.deletes[0].label === "Curage", ops.deletes[0].label);
  assert("et sa plage d'origine aussi", ops.deletes[0].plage === "09:00→10:00", ops.deletes[0].plage);
  assert("rien n'est raccourci", ops.updates.length === 0);

  // Bornes identiques : c'est encore un recouvrement complet.
  const exact = planDecoupage([tache("t1", "09:00", 60)], h("09:00"), h("10:00"));
  assert("des bornes identiques suppriment aussi", exact.deletes.length === 1, `${exact.deletes.length}`);
}

console.log("\n✓ Plusieurs tâches touchées à la fois :");
{
  const ops = planDecoupage([
    tache("t1", "08:00", 120, "Soins"),      // 8h–10h  → raccourcie
    tache("t2", "10:00", 60, "Curage"),      // 10h–11h → supprimée
    tache("t3", "11:00", 120, "Leçon"),      // 11h–13h → décalée
    tache("t4", "15:00", 60, "Reprise"),     // hors zone
  ], h("09:00"), h("12:00"));
  assert("deux tâches ajustées", ops.updates.length === 2, `${ops.updates.length}`);
  assert("une supprimée", ops.deletes.length === 1, `${ops.deletes.length}`);
  assert("c'est bien le curage", ops.deletes[0].label === "Curage", ops.deletes[0].label);
  assert("la tâche hors zone est intacte",
    !ops.updates.some(u => u.id === "t4") && !ops.deletes.some(d => d.id === "t4"));
}

console.log("\n✓ Conversions d'heures :");
{
  assert("08:00 → 480 min", h("08:00") === 480, `${h("08:00")}`);
  assert("00:00 → 0", h("00:00") === 0);
  assert("480 min → 08:00", minToHeure(480) === "08:00", minToHeure(480));
  assert("545 min → 09:05", minToHeure(545) === "09:05", minToHeure(545));
  assert("aller-retour stable", minToHeure(h("14:45")) === "14:45", minToHeure(h("14:45")));
}

console.log("\n✓ Arrondi au quart d'heure :");
{
  assert("5 min devient 15", roundToQuarter(5) === 15, `${roundToQuarter(5)}`);
  assert("15 reste 15", roundToQuarter(15) === 15);
  assert("20 devient 15", roundToQuarter(20) === 15, `${roundToQuarter(20)}`);
  assert("25 devient 30", roundToQuarter(25) === 30, `${roundToQuarter(25)}`);
  assert("60 reste 60", roundToQuarter(60) === 60);
  assert("jamais moins d'un quart d'heure", roundToQuarter(0) === 15 && roundToQuarter(-10) === 15);
}

console.log("\n══════════════════════════════════════════════════════════════");
console.log(`  RESUME : ${passed} passes, ${failed} echoues`);
console.log("══════════════════════════════════════════════════════════════\n");
if (failed > 0) { console.log("Echecs :"); failures.forEach(f => console.log(`  - ${f}`)); process.exit(1); }
console.log("✅ Tous les tests sont passes !\n");
