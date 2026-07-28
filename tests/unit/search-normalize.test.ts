/**
 * tests/unit/search-normalize.test.ts
 *
 * Tests unitaires pour lib/search-normalize. Lance sans framework via :
 *   npx tsx tests/unit/search-normalize.test.ts
 *
 * Cette lib est utilisee par la recherche des fiches familles/cavaliers et
 * par la recherche globale (Cmd+K). Une regression ici rend des fiches
 * introuvables en pleine inscription : c'est bloquant au comptoir.
 */

import { normalizeSearch, compactSearch, searchMatches, searchMatchesAny } from "../../src/lib/search-normalize";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(label: string, condition: boolean, details?: string) {
  if (condition) {
    passed++;
    console.log(`  ✅ ${label}`);
  } else {
    failed++;
    failures.push(`${label}${details ? " — " + details : ""}`);
    console.log(`  ❌ ${label}${details ? " — " + details : ""}`);
  }
}

console.log("\n══════════════════════════════════════════════════════════════");
console.log("  Tests unitaires recherche (accents / tirets)");
console.log("══════════════════════════════════════════════════════════════\n");

// ─── normalizeSearch ──────────────────────────────────────────────
console.log("✓ normalizeSearch :");
{
  assert("accents retires", normalizeSearch("Léa") === "lea", normalizeSearch("Léa"));
  assert("cedille et trema", normalizeSearch("Françoise Noëlle") === "francoise noelle");
  assert("tiret devient espace", normalizeSearch("Jean-Pierre") === "jean pierre");
  assert("apostrophe devient espace", normalizeSearch("N'Diaye") === "n diaye");
  assert("espaces multiples reduits", normalizeSearch("  Anne   Marie  ") === "anne marie");
  assert("valeur nulle geree", normalizeSearch(null) === "");
  assert("valeur undefined geree", normalizeSearch(undefined) === "");
  assert("email preserve (point et arobase)", normalizeSearch("L.Dupont@Gmail.com") === "l.dupont@gmail.com");
}

// ─── compactSearch ────────────────────────────────────────────────
console.log("\n✓ compactSearch :");
{
  assert("tout colle", compactSearch("Jean-Pierre") === "jeanpierre");
  assert("accents + espaces", compactSearch("Léa Marie") === "leamarie");
}

// ─── searchMatches : accents ──────────────────────────────────────
console.log("\n✓ searchMatches — accents :");
{
  assert("sans accent trouve avec accent", searchMatches("Léa Dupont", "lea"));
  assert("avec accent trouve sans accent", searchMatches("Lea Dupont", "Léa"));
  assert("accent au milieu", searchMatches("Benoît Muller", "benoit"));
  assert("majuscules ignorees", searchMatches("DUPONT", "dupont"));
  assert("recherche accentuee sur nom accentue", searchMatches("Éléonore", "éléonore"));
}

// ─── searchMatches : tirets et apostrophes ────────────────────────
console.log("\n✓ searchMatches — tirets / apostrophes :");
{
  assert("espace trouve tiret", searchMatches("Jean-Pierre Martin", "jean pierre"));
  assert("tiret trouve espace", searchMatches("Jean Pierre Martin", "jean-pierre"));
  assert("colle trouve tiret", searchMatches("Jean-Pierre Martin", "jeanpierre"));
  assert("tiret trouve colle", searchMatches("Jeanpierre Martin", "jean-pierre"));
  assert("apostrophe ignoree", searchMatches("N'Diaye", "ndiaye"));
  assert("nom compose avec accent", searchMatches("Marie-Hélène", "marie helene"));
  assert("tiret typographique long", searchMatches("Anne–Sophie", "anne sophie"));
}

// ─── searchMatches : cas negatifs (pas de faux positifs) ──────────
console.log("\n✓ searchMatches — cas negatifs :");
{
  assert("nom different non trouve", !searchMatches("Léa Dupont", "martin"));
  assert("cible vide non trouvee", !searchMatches("", "lea"));
  assert("cible nulle non trouvee", !searchMatches(null, "lea"));
  assert("recherche vide passe tout", searchMatches("Léa", ""));
  assert("recherche espaces seuls passe tout", searchMatches("Léa", "   "));
  assert("prenom partiel ne matche pas un autre", !searchMatches("Thomas", "thomasine"));
}

// ─── searchMatchesAny ─────────────────────────────────────────────
console.log("\n✓ searchMatchesAny :");
{
  const champs = ["Dupont", "Léa", "lea.dupont@gmail.com", null, undefined];
  assert("trouve dans le prenom", searchMatchesAny(champs, "lea"));
  assert("trouve dans le nom", searchMatchesAny(champs, "DUPONT"));
  assert("trouve dans l'email", searchMatchesAny(champs, "dupont@gmail"));
  assert("champs nuls ne plantent pas", searchMatchesAny(champs, "zzz") === false);
  assert("recherche vide passe tout", searchMatchesAny(champs, ""));
}

// ─── Scenarios reels du club ──────────────────────────────────────
console.log("\n✓ Scenarios reels :");
{
  assert("fiche 'Léa' tapee 'lea'", searchMatches("Léa", "lea"));
  assert("fiche 'Lea' tapee 'léa'", searchMatches("Lea", "léa"));
  assert("cavalier different du responsable", searchMatchesAny(["Martin Sophie", "Léa Dubois"], "dubois"));
  assert("recherche nom + prenom", searchMatchesAny(["Dupont Léa", "Léa Dupont"], "lea dupont"));
  assert("recherche prenom + nom inverse", searchMatchesAny(["Dupont Léa", "Léa Dupont"], "dupont lea"));
}

// ─── Resume ──────────────────────────────────────────────────────
console.log("\n══════════════════════════════════════════════════════════════");
console.log(`  RESUME : ${passed} passes, ${failed} echoues`);
console.log("══════════════════════════════════════════════════════════════\n");

if (failed > 0) {
  console.log("\n❌ Echecs :");
  for (const f of failures) {
    console.log("  • " + f);
  }
  process.exit(1);
} else {
  console.log("\n✅ Tous les tests sont passes !\n");
  process.exit(0);
}
