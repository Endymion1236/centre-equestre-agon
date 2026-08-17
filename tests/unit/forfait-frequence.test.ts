/**
 * tests/unit/forfait-frequence.test.ts
 *
 * Tests du cumul de fréquence et de l'échelle tarifaire, demi-fréquences
 * comprises (rythme quinzaine).
 *   npx tsx tests/unit/forfait-frequence.test.ts
 *
 * Enjeu : c'est de l'argent facturé à une famille. Le cas qui a motivé ces
 * tests est celui d'un enfant en garde alternée inscrit sur deux créneaux en
 * semaines alternées — samedi les paires, mercredi les impaires. Il ne monte
 * qu'une fois par semaine, mais le compteur de fréquence voyait « 2 » et
 * facturait son second forfait au différentiel vers le tarif 2×/semaine.
 *
 * La propriété centrale vérifiée ici : le total facturé à un enfant ne dépend
 * ni de l'ordre de saisie de ses forfaits, ni du découpage en plusieurs
 * forfaits. Il ne dépend que de la fréquence hebdomadaire cumulée.
 */

import { frequenceEquivalente, coefficientRythme, formatFrequence, nombreDeCours } from "../../src/lib/rythme";
import { tarifPourFrequence, calculerForfaitAnnuel, type ForfaitTarifs } from "../../src/lib/forfait-pricing";

let passed = 0, failed = 0;
const failures: string[] = [];
function assert(label: string, cond: boolean, details?: string) {
  if (cond) { passed++; console.log(`  ✅ ${label}`); }
  else { failed++; failures.push(label); console.log(`  ❌ ${label}${details ? " — " + details : ""}`); }
}
function assertEgal(label: string, obtenu: number, attendu: number) {
  assert(label, Math.abs(obtenu - attendu) < 0.005, `obtenu ${obtenu}, attendu ${attendu}`);
}

console.log("\n══════════════════════════════════════════════════════════════");
console.log("  Tests unitaires fréquence & tarif (quinzaine)");
console.log("══════════════════════════════════════════════════════════════\n");

// Tarifs par défaut de l'application (settings/inscription).
const TARIFS: ForfaitTarifs = {
  forfait1x: 650, forfait2x: 1100, forfait3x: 1400,
  adhesion1: 60, adhesion2: 40, adhesion3: 20, adhesion4plus: 0,
  licenceMoins18: 25, licencePlus18: 36,
};

const QUINZAINE_PAIRES = { rythme: "quinzaine", semainePaire: true };
const QUINZAINE_IMPAIRES = { rythme: "quinzaine", semainePaire: false };
const HEBDO = { rythme: "hebdo" };

// ─── Fréquence équivalente ────────────────────────────────────────
console.log("✓ Fréquence hebdomadaire équivalente :");
{
  assertEgal("hebdo 1×/sem vaut 1", frequenceEquivalente(1, HEBDO), 1);
  assertEgal("hebdo 3×/sem vaut 3", frequenceEquivalente(3, HEBDO), 3);
  assertEgal("quinzaine 1×/sem vaut 0,5", frequenceEquivalente(1, QUINZAINE_PAIRES), 0.5);
  assertEgal("quinzaine 2×/sem vaut 1", frequenceEquivalente(2, QUINZAINE_IMPAIRES), 1);

  // Le doute profite à la présence, ici aussi : un forfait ancien sans champ
  // `rythme` est un hebdo. Le sous-évaluer ferait sous-facturer les heures
  // ajoutées ensuite.
  assertEgal("forfait ancien sans rythme = hebdo", frequenceEquivalente(1, {}), 1);
  assertEgal("forfait null = hebdo", frequenceEquivalente(2, null), 2);
  assertEgal("rythme inconnu = hebdo", frequenceEquivalente(1, { rythme: "bizarre" }), 1);

  // Deux écrans écrivent `frequence` et ne s'accordent pas sur le format : le
  // panneau du planning enregistre 2, la page Forfaits enregistre "2x". Lire
  // "2x" comme 0 rendait le forfait invisible au cumul, et l'heure ajoutée
  // ensuite passait à plein tarif (650 €) au lieu du différentiel (300 €).
  assertEgal("format « 1x » de la page Forfaits", frequenceEquivalente("1x", HEBDO), 1);
  assertEgal("format « 2x »", frequenceEquivalente("2x", HEBDO), 2);
  assertEgal("format « 3x » en quinzaine", frequenceEquivalente("3x", QUINZAINE_PAIRES), 1.5);
  assertEgal("nombreDeCours(« 2x ») = 2", nombreDeCours("2x"), 2);

  // Données abîmées : jamais de NaN dans un calcul de prix.
  assertEgal("frequence absente → 0", frequenceEquivalente(undefined, HEBDO), 0);
  assertEgal("frequence texte non numérique → 0", frequenceEquivalente("abc", HEBDO), 0);
  assertEgal("frequence en texte → convertie", frequenceEquivalente("2", HEBDO), 2);
  assertEgal("NaN → 0", frequenceEquivalente(NaN, HEBDO), 0);
  assertEgal("Infinity → 0", frequenceEquivalente(Infinity, HEBDO), 0);
  assert("jamais NaN", !Number.isNaN(frequenceEquivalente(null, QUINZAINE_PAIRES)));

  assertEgal("coefficient hebdo = 1", coefficientRythme(HEBDO), 1);
  assertEgal("coefficient quinzaine = 0,5", coefficientRythme(QUINZAINE_PAIRES), 0.5);
}

// ─── Échelle tarifaire ────────────────────────────────────────────
console.log("\n✓ Échelle tarifaire (interpolation entre les barreaux) :");
{
  // Les barreaux définis dans les paramètres sont rendus à l'identique.
  assertEgal("tarif(1) = forfait 1×", tarifPourFrequence(TARIFS, 1), 650);
  assertEgal("tarif(2) = forfait 2×", tarifPourFrequence(TARIFS, 2), 1100);
  assertEgal("tarif(3) = forfait 3×", tarifPourFrequence(TARIFS, 3), 1400);

  // Demi-fréquences.
  assertEgal("tarif(0,5) = moitié du 1×", tarifPourFrequence(TARIFS, 0.5), 325);
  assertEgal("tarif(1,5) = 1× + moitié de l'écart 1×→2×", tarifPourFrequence(TARIFS, 1.5), 875);
  assertEgal("tarif(2,5) = 2× + moitié de l'écart 2×→3×", tarifPourFrequence(TARIFS, 2.5), 1250);

  // Bornes.
  assertEgal("tarif(0) = 0 €", tarifPourFrequence(TARIFS, 0), 0);
  assertEgal("tarif négatif = 0 €", tarifPourFrequence(TARIFS, -1), 0);
  assertEgal("tarif(4) plafonné au 3×", tarifPourFrequence(TARIFS, 4), 1400);
  assert("jamais NaN sur entrée abîmée", !Number.isNaN(tarifPourFrequence(TARIFS, NaN)));

  // L'échelle est croissante : ajouter du temps ne peut pas faire baisser le prix.
  let croissante = true;
  for (let f = 0; f <= 3; f += 0.25) {
    if (tarifPourFrequence(TARIFS, f) < tarifPourFrequence(TARIFS, Math.max(0, f - 0.25))) croissante = false;
  }
  assert("échelle croissante de 0 à 3", croissante);
}

// ─── Le cas Zoé ───────────────────────────────────────────────────
console.log("\n✓ Cas Zoé — samedi semaines paires + mercredi semaines impaires :");
{
  // Helper : prix d'un forfait ajouté, saison pleine, sans réduction famille.
  const prixForfait = (freqEquiv: number, dejaInscrite: number) =>
    calculerForfaitAnnuel({
      frequence: freqEquiv, sessionsRestantes: 1, sessionsTotalSaison: 1,
      rangEnfant: 1, avecAdhesion: false, avecLicence: false, licenceMoins18: true,
      tarifs: TARIFS, familyDiscountRules: [], frequenceDejaInscrite: dejaInscrite,
    }).prixForfaitNet;

  // Premier forfait : samedi, une semaine sur deux → 0,5 équivalent.
  const samedi = prixForfait(frequenceEquivalente(1, QUINZAINE_PAIRES), 0);
  assertEgal("1er forfait (samedi quinzaine) = moitié du 1×", samedi, 325);

  // Second forfait : mercredi, l'autre semaine. Le cumul atteint 1×/semaine.
  const deja = frequenceEquivalente(1, QUINZAINE_PAIRES);          // 0,5
  const mercredi = prixForfait(frequenceEquivalente(1, QUINZAINE_IMPAIRES), deja);
  assertEgal("2e forfait (mercredi quinzaine) = l'autre moitié du 1×", mercredi, 325);

  // Le point de l'affaire : le total vaut un forfait 1×/semaine, pas un 2×.
  assertEgal("total Zoé = prix d'un 1×/semaine", samedi + mercredi, 650);
  assert("total Zoé ≠ différentiel vers le 2×/semaine",
    samedi + mercredi !== 325 + Math.round((1100 - 650) * 0.5),
    "l'ancien calcul donnait 550 €");
}

// ─── Indépendance à l'ordre et au découpage ───────────────────────
console.log("\n✓ Le total ne dépend ni de l'ordre de saisie ni du découpage :");
{
  const prix = (freqEquiv: number, deja: number) =>
    calculerForfaitAnnuel({
      frequence: freqEquiv, sessionsRestantes: 1, sessionsTotalSaison: 1,
      rangEnfant: 1, avecAdhesion: false, avecLicence: false, licenceMoins18: true,
      tarifs: TARIFS, familyDiscountRules: [], frequenceDejaInscrite: deja,
    }).prixForfaitNet;

  // Un hebdo 1× puis une quinzaine, ou l'inverse : même total.
  const hebdoPuisQuinzaine = prix(1, 0) + prix(0.5, 1);
  const quinzainePuisHebdo = prix(0.5, 0) + prix(1, 0.5);
  assertEgal("hebdo puis quinzaine", hebdoPuisQuinzaine, 875);
  assertEgal("quinzaine puis hebdo", quinzainePuisHebdo, 875);
  assert("les deux ordres donnent le même total", hebdoPuisQuinzaine === quinzainePuisHebdo);
  assertEgal("et ce total vaut tarif(1,5)", hebdoPuisQuinzaine, tarifPourFrequence(TARIFS, 1.5));

  // Deux forfaits 1× successifs coûtent exactement un forfait 2×.
  assertEgal("1× puis 1× = forfait 2×", prix(1, 0) + prix(1, 1), 1100);
  // Trois forfaits 1× successifs coûtent exactement un forfait 3×.
  assertEgal("1× ×3 = forfait 3×", prix(1, 0) + prix(1, 1) + prix(1, 2), 1400);
  // Un seul forfait 2× coûte la même chose que deux forfaits 1×.
  assertEgal("2× d'un coup = 1× puis 1×", prix(2, 0), prix(1, 0) + prix(1, 1));

  // Le plafond de 3×/semaine ne peut pas produire un prix négatif.
  assert("au-delà du plafond, prix ≥ 0", prix(1, 3) >= 0);
  assertEgal("au-delà du plafond, prix = 0", prix(1, 3), 0);
}

// ─── Prorata et réduction famille restent proportionnels ──────────
console.log("\n✓ Prorata et réduction famille s'appliquent après :");
{
  const res = calculerForfaitAnnuel({
    frequence: 0.5, sessionsRestantes: 17, sessionsTotalSaison: 34,
    rangEnfant: 2, avecAdhesion: false, avecLicence: false, licenceMoins18: true,
    tarifs: TARIFS, familyDiscountRules: [{ nth: 2, discount: 10 }],
    frequenceDejaInscrite: 0,
  });
  assertEgal("plein tarif d'une quinzaine", res.prixForfaitAnnuelPlein, 325);
  assertEgal("prorata mi-saison", res.prorata, 0.5);
  assertEgal("brut après prorata", res.prixForfaitBrut, 163);       // round(325 × 0,5)
  assertEgal("réduction 2e enfant -10%", res.familyDiscountAmount, 16.3);
  assertEgal("net", res.prixForfaitNet, 146.7);
  assert("montant arrondi à l'euro au brut", Number.isInteger(res.prixForfaitBrut));
}

// ─── Affichage ────────────────────────────────────────────────────
console.log("\n✓ Affichage des demi-fréquences :");
{
  assert("1 → « 1 »", formatFrequence(1) === "1");
  assert("0,5 → « 0,5 » (virgule)", formatFrequence(0.5) === "0,5");
  assert("1,5 → « 1,5 »", formatFrequence(1.5) === "1,5");
  assert("3 → « 3 »", formatFrequence(3) === "3");
  assert("pas de point décimal à l'anglaise", !formatFrequence(2.5).includes("."));
}

console.log("\n══════════════════════════════════════════════════════════════");
console.log(`  ${passed} réussis · ${failed} échoués`);
if (failed > 0) {
  console.log("\n  Échecs :");
  failures.forEach(f => console.log(`   • ${f}`));
}
console.log("══════════════════════════════════════════════════════════════\n");
process.exit(failed > 0 ? 1 : 0);
