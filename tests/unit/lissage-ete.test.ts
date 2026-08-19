/**
 * tests/unit/lissage-ete.test.ts
 *
 * Lissage des horaires sur juillet + août.
 *   npx tsx tests/unit/lissage-ete.test.ts
 *
 * Enjeu : de la paie. Le reste de l'année, chaque semaine est tranchée seule —
 * au-delà du contrat c'est de l'heure sup, en dessous c'est un déficit. L'été,
 * cette règle surpaie : une semaine à 45 h en août compensée par une semaine à
 * 25 h en juillet ne produit aucune heure supplémentaire sur la période, alors
 * que le décompte hebdomadaire en facturerait dix. C'est ce cas-là que le
 * lissage corrige, et c'est lui qui doit rester vert.
 */

import { soldeLissage, MOIS_LISSES, MOIS_DECOMPTE_LISSAGE } from "../../src/lib/lissage-ete";

let passed = 0, failed = 0;
const failures: string[] = [];
function assert(label: string, cond: boolean, details?: string) {
  if (cond) { passed++; console.log(`  ✅ ${label}`); }
  else { failed++; failures.push(label); console.log(`  ❌ ${label}${details ? " — " + details : ""}`); }
}

const H = 60;                 // une heure en minutes
const CONTRAT = 35 * H;       // 35 h/semaine

console.log("\n✓ La période, pas la semaine :");
{
  // 9 semaines : 4 à 25 h (juillet creux), 5 à 45 h (août chargé).
  const travaille = 4 * 25 * H + 5 * 45 * H; // 325 h
  const s = soldeLissage({ contratMin: CONTRAT, semaines: 9, travailleMin: travaille, absMin: 0 });
  assert("contrat de la période = 9 × 35 h", s.contratPeriode === 9 * 35 * H, `${s.contratPeriode}`);
  assert("325 h travaillées pour 315 h dues → 10 h sup", s.surplus === 10 * H, `${s.surplus / H} h`);

  // Le décompte hebdomadaire aurait retenu 5 × 10 h = 50 h sup.
  const supHebdo = 5 * Math.max(0, 45 * H - CONTRAT);
  assert("le décompte hebdomadaire en aurait facturé 50", supHebdo === 50 * H);
  assert("le lissage en retient 5 fois moins", s.surplus < supHebdo);
}

console.log("\n✓ Un creux non compensé n'est pas dû :");
{
  // 9 semaines à 30 h : 45 h de moins que le contrat.
  const s = soldeLissage({ contratMin: CONTRAT, semaines: 9, travailleMin: 9 * 30 * H, absMin: 0 });
  assert("aucune heure sup", s.surplus === 0);
  assert("le déficit est affiché", s.deficit === 45 * H, `${s.deficit / H} h`);
  // Le déficit est une information : l'écran ne le porte à aucun compteur.
}

console.log("\n✓ Les congés payés ne fabriquent pas d'heures sup :");
{
  // 2 semaines de congés, 7 semaines à 45 h : 315 h travaillées pour 315 h dues.
  const s = soldeLissage({
    contratMin: CONTRAT, semaines: 9,
    travailleMin: 7 * 45 * H,
    absMin: 2 * CONTRAT,
  });
  assert("315 h travaillées = contrat de la période", s.contratPeriode === 315 * H && s.surplus === 0,
    `surplus ${s.surplus / H} h`);
  assert("ni déficit : les congés couvrent le manque", s.deficit === 0, `${s.deficit / H} h`);
}

console.log("\n✓ Congés ET vrai surplus :");
{
  // 1 semaine de congé, 8 semaines à 45 h = 360 h pour 315 h dues.
  const s = soldeLissage({
    contratMin: CONTRAT, semaines: 9,
    travailleMin: 8 * 45 * H,
    absMin: CONTRAT,
  });
  assert("45 h sup retenues", s.surplus === 45 * H, `${s.surplus / H} h`);
  assert("pas de déficit en même temps", s.deficit === 0);
}

console.log("\n✓ Temps partiel :");
{
  const contrat24 = 24 * H;
  const s = soldeLissage({ contratMin: contrat24, semaines: 9, travailleMin: 9 * 26 * H, absMin: 0 });
  assert("contrat de la période = 9 × 24 h", s.contratPeriode === 216 * H);
  assert("18 h sup", s.surplus === 18 * H, `${s.surplus / H} h`);
}

console.log("\n✓ Bornes et cas dégénérés :");
{
  const vide = soldeLissage({ contratMin: CONTRAT, semaines: 0, travailleMin: 0, absMin: 0 });
  assert("aucune semaine écoulée → tout à zéro", vide.contratPeriode === 0 && vide.surplus === 0 && vide.deficit === 0);

  const debut = soldeLissage({ contratMin: CONTRAT, semaines: 1, travailleMin: 0, absMin: 0 });
  assert("une semaine sans travail → déficit, jamais de surplus", debut.surplus === 0 && debut.deficit === CONTRAT);

  const negatif = soldeLissage({ contratMin: -10, semaines: -3, travailleMin: -5, absMin: -2 });
  assert("des valeurs absurdes ne produisent pas de montant négatif",
    negatif.contratPeriode >= 0 && negatif.surplus >= 0 && negatif.deficit >= 0);

  const pile = soldeLissage({ contratMin: CONTRAT, semaines: 9, travailleMin: 9 * CONTRAT, absMin: 0 });
  assert("pile le contrat → ni sup ni déficit", pile.surplus === 0 && pile.deficit === 0);
}

console.log("\n✓ Les mois concernés :");
{
  assert("juillet et août seulement", MOIS_LISSES.length === 2 && MOIS_LISSES.includes(6) && MOIS_LISSES.includes(7));
  assert("le solde tombe en août", MOIS_DECOMPTE_LISSAGE === 7);
  assert("juin n'est pas lissé", !MOIS_LISSES.includes(5));
  assert("septembre non plus", !MOIS_LISSES.includes(8));
}

console.log("\n══════════════════════════════════════════════════════════════");
console.log(`  ${passed} réussis · ${failed} échoués`);
if (failed > 0) {
  console.log("\n  Échecs :");
  failures.forEach(f => console.log(`   • ${f}`));
}
console.log("══════════════════════════════════════════════════════════════\n");
process.exit(failed > 0 ? 1 : 0);
