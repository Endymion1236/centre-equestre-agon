/**
 * tests/unit/caisse-mouvements.test.ts
 *
 * Séparation recettes / mouvements de trésorerie dans le livre de caisse.
 *   npx tsx tests/unit/caisse-mouvements.test.ts
 *
 * Enjeu : le tiroir-caisse contient de l'argent qui ne vient pas d'une vente
 * (fonds de caisse du gérant) et en perd sans qu'il y ait dépense (versement
 * en banque). Les deux DOIVENT figurer au livre de caisse — sinon le solde
 * théorique ne colle plus au comptage — et ne DOIVENT PAS entrer dans le
 * chiffre d'affaires ni dans le ticket Z. Ce test verrouille cette frontière :
 * c'est elle qui, oubliée dans un seul écran, fait un CA faux.
 */

import {
  estApportCaisse, estVersementBanque, estMouvementDeTresorerie, estRecette, refApport,
} from "../../src/lib/caisse-mouvements";

let passed = 0, failed = 0;
const failures: string[] = [];
function assert(label: string, cond: boolean, details?: string) {
  if (cond) { passed++; console.log(`  ✅ ${label}`); }
  else { failed++; failures.push(label); console.log(`  ❌ ${label}${details ? " — " + details : ""}`); }
}

const vente = { montant: 57, mode: "especes" };
const venteCB = { montant: 114, mode: "cb_terminal" };
const contrePassation = { montant: -57, mode: "especes", correctionDe: "abc" } as any;
const apport = { montant: 150, mode: "especes", isApportCaisse: true };
const versement = { montant: -595, mode: "especes", isVersementBanque: true };

console.log("\n✓ Nature de chaque écriture :");
{
  assert("une vente en espèces est une recette", estRecette(vente));
  assert("une vente CB est une recette", estRecette(venteCB));
  assert("une contre-passation reste une recette (négative)", estRecette(contrePassation));
  assert("un apport n'est pas une recette", !estRecette(apport));
  assert("un versement n'est pas une recette", !estRecette(versement));
}

console.log("\n✓ Reconnaissance des deux mouvements de trésorerie :");
{
  assert("apport reconnu", estApportCaisse(apport) && estMouvementDeTresorerie(apport));
  assert("versement reconnu", estVersementBanque(versement) && estMouvementDeTresorerie(versement));
  assert("une vente n'est pas un mouvement de trésorerie", !estMouvementDeTresorerie(vente));
  assert("un apport n'est pas pris pour un versement", !estVersementBanque(apport));
  assert("un versement n'est pas pris pour un apport", !estApportCaisse(versement));
  assert("drapeau absent = recette", estRecette({ montant: 20, mode: "especes" }));
  assert("drapeau à false = recette", estRecette({ montant: 20, mode: "especes", isApportCaisse: false }));
}

console.log("\n✓ Cas vécu : premier jour de caisse (150€ de fonds, 57€ encaissés, 595€ versés) :");
{
  const journee = [apport, vente, versement];

  // Le livre de caisse totalise TOUT : c'est le solde physique du tiroir.
  const soldeLivre = journee.reduce((s, e) => s + e.montant, 0);
  assert("solde du livre de caisse = 150 + 57 - 595", soldeLivre === 150 + 57 - 595,
    `obtenu ${soldeLivre}`);

  // Le ticket Z ne totalise que les recettes.
  const totalZ = journee.filter(estRecette).reduce((s, e) => s + e.montant, 0);
  assert("ticket Z = 57€ (ni l'apport ni le versement)", totalZ === 57, `obtenu ${totalZ}`);

  // Le CA du mois du tableau de bord ne retient que les entrées de recettes.
  const caMois = journee
    .filter(estRecette)
    .filter(e => e.montant > 0)
    .reduce((s, e) => s + e.montant, 0);
  assert("CA du mois = 57€ (l'apport ne gonfle pas le CA)", caMois === 57, `obtenu ${caMois}`);

  // Sans le tri, le Z serait négatif : c'est exactement le bug évité.
  const zSansTri = journee.reduce((s, e) => s + e.montant, 0);
  assert("sans le tri, le Z serait négatif (bug évité)", zSansTri < 0);
}

console.log("\n✓ Référence d'apport :");
{
  assert("format APPORT-AAAAMMJJ", refApport(new Date("2026-09-01T08:00:00Z")) === "APPORT-20260901",
    refApport(new Date("2026-09-01T08:00:00Z")));
}

console.log("\n══════════════════════════════════════════════════════════════");
console.log(`  ${passed} réussis · ${failed} échoués`);
if (failed > 0) {
  console.log("\n  Échecs :");
  failures.forEach(f => console.log(`   • ${f}`));
}
console.log("══════════════════════════════════════════════════════════════\n");
process.exit(failed > 0 ? 1 : 0);
