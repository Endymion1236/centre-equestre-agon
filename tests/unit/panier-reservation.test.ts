/**
 * tests/unit/panier-reservation.test.ts
 *
 * Les totaux du panier de réservation en ligne, et l'acompte.
 *   npx tsx tests/unit/panier-reservation.test.ts
 *
 * L'acompte est un montant fixe PAR ENFANT inscrit à un stage, pas un
 * pourcentage. Deux enfants sur un stage, c'est deux acomptes — c'est la
 * règle qui explique le montant qu'une famille voit à l'écran, et celui qui
 * lui est réellement prélevé.
 */

import {
  totauxPanier, montantsAcompteStage, acompteApplicable, ACOMPTE_PAR_ENFANT,
} from "../../src/lib/panier-reservation";

let passed = 0, failed = 0;
const failures: string[] = [];
function assert(label: string, cond: boolean, details?: string) {
  if (cond) { passed++; console.log(`  ✅ ${label}`); }
  else { failed++; failures.push(label); console.log(`  ❌ ${label}${details ? " — " + details : ""}`); }
}

const ligne = (prixFinal: number, remiseEuros = 0, isStage = false) => ({ prixFinal, remiseEuros, isStage });

console.log("\n══════════════════════════════════════════════════════════════");
console.log("  Tests unitaires — panier de réservation");
console.log(`  (acompte de référence : ${ACOMPTE_PAR_ENFANT} € par enfant)`);
console.log("══════════════════════════════════════════════════════════════\n");

console.log("✓ Panier vide :");
{
  const t = totauxPanier([]);
  assert("total nul", t.total === 0);
  assert("aucun acompte", t.acompte === 0);
  assert("aucun solde", t.solde === 0);
  assert("pas de stage", !t.contientUnStage);
}

console.log("\n✓ Une balade, sans stage :");
{
  const t = totauxPanier([ligne(57)]);
  assert("total = 57 €", t.total === 57, `${t.total}`);
  assert("aucun stage détecté", !t.contientUnStage);
  // Sans stage, il n'y a pas d'acompte : la balade se règle en entier.
  assert("pas d'acompte", t.acompte === 0, `${t.acompte}`);
  assert("donc rien à solder", t.solde === 57, `${t.solde}`);
}

console.log("\n✓ Un enfant sur un stage :");
{
  const t = totauxPanier([ligne(350, 0, true)]);
  assert("un stage détecté", t.contientUnStage);
  assert("un enfant concerné", t.nbEnfantsStage === 1, `${t.nbEnfantsStage}`);
  assert("un acompte", t.acompte === ACOMPTE_PAR_ENFANT, `${t.acompte}`);
  assert("le solde est le reste", t.solde === 350 - ACOMPTE_PAR_ENFANT, `${t.solde}`);
  assert("acompte + solde = total", t.acompte + t.solde === t.total);
}

console.log("\n✓ Deux enfants sur un stage : deux acomptes :");
{
  // Le cas qui explique un montant prélevé plus élevé que prévu : la dame
  // avait inscrit deux enfants.
  const t = totauxPanier([ligne(350, 0, true), ligne(350, 0, true)]);
  assert("deux enfants concernés", t.nbEnfantsStage === 2, `${t.nbEnfantsStage}`);
  assert("l'acompte est doublé", t.acompte === ACOMPTE_PAR_ENFANT * 2, `${t.acompte}`);
  assert("le solde suit", t.solde === 700 - ACOMPTE_PAR_ENFANT * 2, `${t.solde}`);
  assert("acompte + solde = total", Math.round((t.acompte + t.solde) * 100) === Math.round(t.total * 100));
}

console.log("\n✓ L'acompte ne dépasse jamais le panier :");
{
  // Un stage à la journée moins cher que l'acompte : on règle tout, il ne
  // reste rien à solder — surtout pas un solde négatif.
  const t = totauxPanier([ligne(20, 0, true)]);
  assert("l'acompte est plafonné au total", t.acompte === 20, `${t.acompte}`);
  assert("aucun solde à venir", t.solde === 0, `${t.solde}`);
  assert("jamais de solde négatif", t.solde >= 0);
}

console.log("\n✓ Panier mixte : stage et balade :");
{
  const t = totauxPanier([ligne(350, 0, true), ligne(57)]);
  assert("total = 407 €", t.total === 407, `${t.total}`);
  assert("un seul enfant en stage", t.nbEnfantsStage === 1, `${t.nbEnfantsStage}`);
  assert("un seul acompte", t.acompte === ACOMPTE_PAR_ENFANT, `${t.acompte}`);
  // La balade est donc réglée dans le solde, pas dans l'acompte.
  assert("la balade tombe dans le solde", t.solde === 407 - ACOMPTE_PAR_ENFANT, `${t.solde}`);
  assert("la clause stage s'applique", t.contientUnStage);
}

console.log("\n✓ Les réductions sont comptées à part :");
{
  const t = totauxPanier([ligne(315, 35, true), ligne(315, 35, true)]);
  assert("le total est déjà net de réduction", t.total === 630, `${t.total}`);
  assert("les réductions sont additionnées", t.reductions === 70, `${t.reductions}`);
}

console.log("\n✓ Centimes :");
{
  const t = totauxPanier([ligne(10.1), ligne(20.2), ligne(0.35)]);
  assert("pas de dérive en virgule flottante", t.total === 30.65, `${t.total}`);
}

console.log("\n✓ L'acompte vu par l'écran d'inscription :");
{
  // La même règle sert en ligne et au comptoir. Ces vérifications existent
  // pour que les deux ne puissent plus diverger : une famille ne doit pas
  // lire un montant en ligne et en voir un autre sur sa facture.
  const un = montantsAcompteStage(1, 350);
  assert("un enfant : un acompte", un.acompte === ACOMPTE_PAR_ENFANT, `${un.acompte}`);
  assert("le solde suit", un.solde === 350 - ACOMPTE_PAR_ENFANT, `${un.solde}`);

  const deux = montantsAcompteStage(2, 700);
  assert("deux enfants : deux acomptes", deux.acompte === ACOMPTE_PAR_ENFANT * 2, `${deux.acompte}`);

  const petit = montantsAcompteStage(1, 20);
  assert("plafonné au total", petit.acompte === 20, `${petit.acompte}`);
  assert("aucun solde négatif", petit.solde === 0, `${petit.solde}`);

  assert("aucun enfant, aucun acompte", montantsAcompteStage(0, 350).acompte === 0);

  // Proposer un acompte égal au total n'aurait aucun sens : on l'écarte.
  assert("acompte proposé quand le total le dépasse", acompteApplicable(1, 350));
  assert("pas d'acompte quand le total l'égale", !acompteApplicable(1, ACOMPTE_PAR_ENFANT));
  assert("pas d'acompte en dessous", !acompteApplicable(1, 20));
  assert("deux enfants : il faut dépasser deux acomptes",
    !acompteApplicable(2, ACOMPTE_PAR_ENFANT * 2) && acompteApplicable(2, ACOMPTE_PAR_ENFANT * 2 + 1));
}

console.log("\n══════════════════════════════════════════════════════════════");
console.log(`  RESUME : ${passed} passes, ${failed} echoues`);
console.log("══════════════════════════════════════════════════════════════\n");
if (failed > 0) { console.log("Echecs :"); failures.forEach(f => console.log(`  - ${f}`)); process.exit(1); }
console.log("✅ Tous les tests sont passes !\n");
