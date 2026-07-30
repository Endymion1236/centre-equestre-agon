/**
 * tests/unit/public-activities.test.ts
 *
 *   npx tsx tests/unit/public-activities.test.ts
 *
 * Deux mecanismes du site public :
 *   - la surcharge des fiches activites depuis Admin > Contenu ;
 *   - l'annonce du tarif journee sur le planning.
 *
 * Regle commune : une donnee absente ou vide ne doit JAMAIS effacer le
 * contenu d'origine ni annoncer une formule inexistante. Une fiche
 * publique a moitie vidée, ou un tarif faux, se voit immediatement par
 * les familles.
 */

import { PUBLIC_ACTIVITIES, applyVitrineOverride, activitesEditables } from "../../src/lib/public-activities";
import { tarifJournee } from "../../src/lib/public-planning";

let passed = 0, failed = 0;
const failures: string[] = [];
function assert(label: string, cond: boolean, details?: string) {
  if (cond) { passed++; console.log(`  ✅ ${label}`); }
  else { failed++; failures.push(label); console.log(`  ❌ ${label}${details ? " — " + details : ""}`); }
}

console.log("\n══════════════════════════════════════════════════════════════");
console.log("  Tests unitaires site public (fiches + tarif journee)");
console.log("══════════════════════════════════════════════════════════════\n");

const base = PUBLIC_ACTIVITIES.find(a => a.id === "bronze")!;

// ─── Surcharge : le vide ne doit rien effacer ────────────────────
console.log("✓ Surcharge — protection du contenu d'origine :");
{
  assert("override absent : fiche intacte", applyVitrineOverride(base, null).title === base.title);
  assert("override vide : fiche intacte", applyVitrineOverride(base, {}).description === base.description);
  assert("champ vide : texte d'origine conserve", applyVitrineOverride(base, { title: "" }).title === base.title);
  assert("champ en espaces : texte d'origine conserve", applyVitrineOverride(base, { title: "   " }).title === base.title);
  assert("liste vide : points forts conserves",
    applyVitrineOverride(base, { features: [] }).features.length === base.features.length);
  assert("liste de lignes vides : points forts conserves",
    applyVitrineOverride(base, { features: ["", "  "] }).features.length === base.features.length);
  assert("type inattendu : ignore",
    applyVitrineOverride(base, { features: "pas une liste" } as any).features.length === base.features.length);
}

// ─── Surcharge : cas nominal ─────────────────────────────────────
console.log("\n✓ Surcharge — modification effective :");
{
  const r = applyVitrineOverride(base, { title: "Nouveau titre", ages: "7 – 9 ans" });
  assert("titre remplace", r.title === "Nouveau titre");
  assert("ages remplaces", r.ages === "7 – 9 ans");
  assert("le reste est intact", r.description === base.description);
}
{
  const r = applyVitrineOverride(base, { features: ["Deux séquences de 1h", "Jeux à poney"] });
  assert("points forts remplaces", r.features.length === 2, `got ${r.features.length}`);
  assert("premier point correct", r.features[0] === "Deux séquences de 1h");
}
{
  const r = applyVitrineOverride(base, { features: ["  Avec espaces  ", "", "Deuxième"] });
  assert("lignes nettoyees", r.features[0] === "Avec espaces");
  assert("lignes vides retirees", r.features.length === 2, `got ${r.features.length}`);
}
{
  const r = applyVitrineOverride(base, { intro: "Nouvelle intro", practical: ["Bottes"] });
  assert("intro modifiable", r.intro === "Nouvelle intro");
  assert("infos pratiques modifiables", r.practical.join("") === "Bottes");
}

// ─── Champs optionnels ───────────────────────────────────────────
console.log("\n✓ Champs optionnels :");
{
  const r = applyVitrineOverride(base, { price: "190€ / semaine", level: "Tous niveaux" });
  assert("tarif modifiable", r.price === "190€ / semaine");
  assert("niveau modifiable", r.level === "Tous niveaux");
  const vide = applyVitrineOverride(base, { price: "" });
  assert("tarif vide retombe sur l'origine", vide.price === base.price);
}

// ─── Catalogue editable ──────────────────────────────────────────
console.log("\n✓ Catalogue editable :");
{
  const liste = activitesEditables();
  assert("toutes les fiches sont editables", liste.length === PUBLIC_ACTIVITIES.length,
    `${liste.length} vs ${PUBLIC_ACTIVITIES.length}`);
  assert("le stage Galop 3-4 y figure", liste.some(a => a.id === "galop34"),
    "il manquait dans l'ancienne liste en dur");
  assert("les cles sont uniques", new Set(liste.map(a => a.key)).size === liste.length);
  assert("aucune cle vide", liste.every(a => a.key && a.key.length > 0));
}

// ─── Tarif journee ───────────────────────────────────────────────
console.log("\n✓ Tarif journee (planning public) :");
{
  assert("ouvert + tarif : annonce", tarifJournee({ allowDayBooking: true, priceTTCDay: 40 }) === 40);
  assert("non ouvert : rien", tarifJournee({ allowDayBooking: false, priceTTCDay: 40 }) === null);
  assert("ouverture absente : rien", tarifJournee({ priceTTCDay: 40 }) === null);
  assert("ouvert sans tarif : rien", tarifJournee({ allowDayBooking: true }) === null,
    "ne jamais annoncer une formule sans prix");
  assert("tarif nul : rien", tarifJournee({ allowDayBooking: true, priceTTCDay: 0 }) === null);
  assert("tarif negatif : rien", tarifJournee({ allowDayBooking: true, priceTTCDay: -5 }) === null);
  assert("tarif non numerique : rien", tarifJournee({ allowDayBooking: true, priceTTCDay: "40" as any }) === null);
  assert("NaN : rien", tarifJournee({ allowDayBooking: true, priceTTCDay: NaN }) === null);
  assert("objet vide : rien", tarifJournee({} as any) === null);
  assert("tarif decimal accepte", tarifJournee({ allowDayBooking: true, priceTTCDay: 42.5 }) === 42.5);
}

console.log("\n══════════════════════════════════════════════════════════════");
console.log(`  RESUME : ${passed} passes, ${failed} echoues`);
console.log("══════════════════════════════════════════════════════════════\n");
if (failed > 0) { console.log("\n❌ Echecs :"); failures.forEach(f => console.log("  • " + f)); process.exit(1); }
console.log("\n✅ Tous les tests sont passes !\n");
process.exit(0);
