/**
 * tests/unit/date-saisie.test.ts
 *
 * Saisie d'une date au clavier dans les écrans de navigation du planning.
 *   npx tsx tests/unit/date-saisie.test.ts
 *
 * Enjeu : le champ `<input type="date">` émet un événement à chaque frappe, y
 * compris sur une année incomplète. Trois écrans réagissaient à ces valeurs
 * intermédiaires — le planning sautait à « Octobre 1902 » et vidait le champ
 * avant la fin de la saisie. Le scénario complet de frappe est rejoué ici :
 * c'est lui qui doit rester vert, pas seulement la fonction prise isolément.
 */

import { dateSaisieComplete } from "../../src/lib/date-saisie";

let passed = 0, failed = 0;
const failures: string[] = [];
function assert(label: string, cond: boolean, details?: string) {
  if (cond) { passed++; console.log(`  ✅ ${label}`); }
  else { failed++; failures.push(label); console.log(`  ❌ ${label}${details ? " — " + details : ""}`); }
}

console.log("\n══════════════════════════════════════════════════════════════");
console.log("  Tests unitaires saisie de date");
console.log("══════════════════════════════════════════════════════════════\n");

// ─── Le scénario qui a produit « Octobre 1902 » ───────────────────────
console.log("✓ Frappe de « 13/10/2026 », chiffre par chiffre :");
{
  // Ce que le navigateur émet quand on tape l'année : elle se remplit par la
  // gauche, donc 2, 0, 2, 6 donnent successivement 0002, 0020, 0202, 2026.
  const frappes = ["0002-10-13", "0020-10-13", "0202-10-13", "2026-10-13"];
  const acceptees = frappes.filter(v => dateSaisieComplete(v) !== null);

  assert("une seule frappe est acceptée", acceptees.length === 1,
    `acceptées : ${acceptees.join(", ") || "aucune"}`);
  assert("c'est la dernière, la date complète", acceptees[0] === "2026-10-13");
  for (const partielle of frappes.slice(0, 3)) {
    assert(`année incomplète ignorée : ${partielle}`, dateSaisieComplete(partielle) === null);
  }

  const d = dateSaisieComplete("2026-10-13")!;
  assert("la date rendue est la bonne", d.getFullYear() === 2026 && d.getMonth() === 9 && d.getDate() === 13);
}

// ─── Autres saisies en cours ──────────────────────────────────────────
console.log("\n✓ Saisies incomplètes ou hors bornes :");
{
  assert("champ vide", dateSaisieComplete("") === null);
  assert("jour seul", dateSaisieComplete("0000-00-13") === null);
  assert("mois manquant", dateSaisieComplete("2026-00-13") === null);
  assert("jour manquant", dateSaisieComplete("2026-10-00") === null);
  assert("année 26 (deux chiffres tapés)", dateSaisieComplete("0026-10-13") === null);
  assert("année 1902", dateSaisieComplete("1902-10-13") === null);
  assert("année 1999, juste sous la borne", dateSaisieComplete("1999-12-31") === null);
  assert("année 2101, juste au-dessus", dateSaisieComplete("2101-01-01") === null);
  assert("valeur qui n'est pas une date", dateSaisieComplete("coucou") === null);
}

// ─── Dates valides ────────────────────────────────────────────────────
console.log("\n✓ Dates complètes acceptées :");
{
  assert("2000-01-01, borne basse", dateSaisieComplete("2000-01-01") !== null);
  assert("2100-12-31, borne haute", dateSaisieComplete("2100-12-31") !== null);
  assert("29 février d'une année bissextile", dateSaisieComplete("2028-02-29") !== null);
  const rentree = dateSaisieComplete("2026-09-01")!;
  assert("1er septembre 2026", rentree.getFullYear() === 2026 && rentree.getMonth() === 8 && rentree.getDate() === 1);
}

// ─── Dates qui n'existent pas ─────────────────────────────────────────
console.log("\n✓ Dates inexistantes rejetées (collage, champ pré-rempli) :");
{
  // new Date(2026, 1, 31) donnerait le 3 mars sans ce contrôle : on
  // naviguerait vers un jour que l'utilisateur n'a pas demandé.
  assert("31 février", dateSaisieComplete("2026-02-31") === null);
  assert("29 février d'une année non bissextile", dateSaisieComplete("2026-02-29") === null);
  assert("31 avril", dateSaisieComplete("2026-04-31") === null);
  assert("mois 13", dateSaisieComplete("2026-13-01") === null);
  assert("jour 32", dateSaisieComplete("2026-01-32") === null);
}

console.log("\n══════════════════════════════════════════════════════════════");
console.log(`  ${passed} réussis · ${failed} échoués`);
if (failed > 0) {
  console.log("\n  Échecs :");
  failures.forEach(f => console.log(`   • ${f}`));
}
console.log("══════════════════════════════════════════════════════════════\n");
process.exit(failed > 0 ? 1 : 0);
