/**
 * tests/unit/enroll-tarifs.test.ts
 *
 * Tests des calculs de tarif du panneau d'inscription.
 *   npx tsx tests/unit/enroll-tarifs.test.ts
 *
 * Enjeu : ces fonctions décident du montant d'une vraie facture envoyée à une
 * vraie famille. Jusqu'ici elles vivaient dans le composant et ne pouvaient
 * être vérifiées qu'en inscrivant un cavalier pour de bon — donc en créant un
 * paiement pour de bon. Quatre erreurs sont particulièrement coûteuses, et
 * chacune a ses assertions ici :
 *   - un prorata qui dépasse 100 % (on ferait payer plus que le tarif plein) ;
 *   - une heure ajoutée facturée à plein tarif au lieu du différentiel ;
 *   - une quinzaine facturée comme un hebdo (le double du dû) ;
 *   - un acompte de stage supérieur au prix du stage.
 */

import {
  prixForfaitPlein, calculeFinSaisonEffective, calculeProrata, saisonDe,
  calculeRangEnfantFamille, calculeFrequenceDejaInscrite, calculePrixForfaitAnnuel,
  calculePrixForfaitBrut, calculeReductionFamille, calculeAdhesionDegressive,
  calculePriceTTC, prixAfficheEntete, calculePrixEffectifStage, prixJourAffiche,
  calculeAcompteStage, calculePrixStageApresAjoutJour,
} from "../../src/app/admin/planning/enroll-tarifs";
import { PARAMS_INSCRIPTION_DEFAUT } from "../../src/app/admin/planning/enroll-constantes";

let passed = 0, failed = 0;
const failures: string[] = [];
function assert(label: string, cond: boolean, details?: string) {
  if (cond) { passed++; console.log(`  ✅ ${label}`); }
  else { failed++; failures.push(label); console.log(`  ❌ ${label}${details ? " — " + details : ""}`); }
}

console.log("\n══════════════════════════════════════════════════════════════");
console.log("  Tests unitaires tarifs d'inscription");
console.log("══════════════════════════════════════════════════════════════\n");

// Barème de référence : celui du club, tel qu'il sert de repli avant réponse
// de Firestore. 1×/sem = 650 €, 2× = 1100 €, 3× = 1400 €.
const P = PARAMS_INSCRIPTION_DEFAUT;

// ─── Tarif plein par fréquence ────────────────────────────────────
console.log("✓ Tarif plein du forfait selon la fréquence :");
{
  assert("1×/sem → 650 €", prixForfaitPlein(1, P) === 650);
  assert("2×/sem → 1100 €", prixForfaitPlein(2, P) === 1100);
  assert("3×/sem → 1400 €", prixForfaitPlein(3, P) === 1400);
  // Au-delà de 3×, on reste au tarif 3× : le club ne vend pas plus.
  assert("4×/sem plafonné au tarif 3×", prixForfaitPlein(4, P) === 1400);
  // 0 (aucune heure déjà inscrite) retombe sur le tarif 1× : c'est ce que
  // suppose le calcul du différentiel, qui l'appelle avec 0.
  assert("0 → tarif 1× (utilisé par le différentiel)", prixForfaitPlein(0, P) === 650);
  // Le tarif est dégressif : deux heures coûtent moins que deux fois une.
  assert("la 2e heure coûte moins cher que la 1re",
    prixForfaitPlein(2, P) - prixForfaitPlein(1, P) < prixForfaitPlein(1, P));
}

// ─── Fin de saison effective ──────────────────────────────────────
console.log("\n✓ Fin de saison effective (pré-inscription saison suivante) :");
{
  const REF = "2026-06-30";
  // Créneau dans la saison en cours → on garde la référence des paramètres.
  assert("créneau de mars 2026 → 30/06/2026",
    calculeFinSaisonEffective(REF, "2026-03-15").getTime() === new Date(REF).getTime());
  assert("le jour même de la fin de saison reste dans la saison",
    calculeFinSaisonEffective(REF, "2026-06-30").getTime() === new Date(REF).getTime());
  // Créneau de septembre 2026 → saison 2026/2027, qui finit le 30/06/2027.
  const suivante = calculeFinSaisonEffective(REF, "2026-09-14");
  assert("créneau de septembre 2026 → 30/06/2027",
    suivante.getFullYear() === 2027 && suivante.getMonth() === 5 && suivante.getDate() === 30);
  // Créneau de juillet 2026 (après la fin, avant septembre) : il appartient
  // encore à la saison 2025/2026 au sens du découpage sept-juin, donc la
  // saison suivante visée finit le 30/06/2026… le calcul retient l'année de
  // rattachement, pas la date brute.
  const juillet = calculeFinSaisonEffective(REF, "2026-07-10");
  assert("créneau de juillet 2026 → 30/06/2026 (saison de rattachement)",
    juillet.getFullYear() === 2026 && juillet.getMonth() === 5 && juillet.getDate() === 30);
}

// ─── Prorata ──────────────────────────────────────────────────────
console.log("\n✓ Prorata des séances restantes :");
{
  assert("moitié de saison → 0,5", calculeProrata(15, 30) === 0.5);
  assert("inscription en début de saison → 1", calculeProrata(30, 30) === 1);
  // Garde-fou : le cavalier inscrit avant la génération complète des créneaux
  // peut avoir PLUS de séances restantes que le total compté. On ne facture
  // jamais plus que le tarif plein.
  assert("jamais plus de 100 %", calculeProrata(40, 30) === 1);
  // Garde-fou : division par zéro si aucun créneau n'a été trouvé.
  assert("aucun créneau sur la saison → 0", calculeProrata(10, 0) === 0);
  assert("plus aucune séance restante → 0", calculeProrata(0, 30) === 0);
}

// ─── Saison FFE ───────────────────────────────────────────────────
console.log("\n✓ Saison FFE d'une date (1er sept Y → 30 juin Y+1) :");
{
  assert("septembre 2025 → saison 2025", saisonDe("2025-09-01") === 2025);
  assert("décembre 2025 → saison 2025", saisonDe("2025-12-24") === 2025);
  assert("janvier 2026 → saison 2025", saisonDe("2026-01-15") === 2025);
  assert("juin 2026 → saison 2025", saisonDe("2026-06-29") === 2025);
  assert("septembre 2026 → saison 2026", saisonDe("2026-09-02") === 2026);
  assert("accepte un Date", saisonDe(new Date("2026-09-02T12:00:00")) === 2026);
  assert("accepte un Timestamp Firestore", saisonDe({ seconds: Math.floor(new Date("2025-10-01T12:00:00").getTime() / 1000) }) === 2025);
  // Une date absente ou illisible ne doit pas faire planter la tarification.
  assert("date illisible → 0", saisonDe("pas une date") === 0);
  assert("valeur vide → 0", saisonDe(null as any) === 0);
}

// ─── Rang de l'enfant dans la fratrie ─────────────────────────────
console.log("\n✓ Rang de l'enfant (adhésion dégressive, réduction famille) :");
{
  const DATE = "2025-10-01"; // saison 2025
  const forfaits = [
    { familyId: "F1", childId: "A", status: "actif", seasonStartYear: 2025, frequence: 1 },
    { familyId: "F1", childId: "B", status: "actif", seasonStartYear: 2025, frequence: 1 },
    // Saison précédente : ne doit PAS compter (bug historique).
    { familyId: "F1", childId: "C", status: "actif", seasonStartYear: 2024, frequence: 1 },
    // Forfait résilié : ne compte pas.
    { familyId: "F1", childId: "D", status: "annule", seasonStartYear: 2025, frequence: 1 },
    // Autre famille : ne compte pas.
    { familyId: "F2", childId: "E", status: "actif", seasonStartYear: 2025, frequence: 1 },
  ];
  assert("aucune famille sélectionnée → 1er enfant",
    calculeRangEnfantFamille(undefined, forfaits, "Z", DATE) === 1);
  assert("2 frères déjà inscrits cette saison → 3e enfant",
    calculeRangEnfantFamille("F1", forfaits, "Z", DATE) === 3);
  assert("l'enfant qu'on inscrit ne se compte pas lui-même",
    calculeRangEnfantFamille("F1", forfaits, "A", DATE) === 2);
  assert("les forfaits de la saison précédente ne comptent pas",
    calculeRangEnfantFamille("F1", forfaits.filter(f => f.childId === "C"), "Z", DATE) === 1);
  // Forfait ancien sans seasonStartYear : on retombe sur createdAt.
  const ancien = [{ familyId: "F1", childId: "A", status: "actif", createdAt: "2025-09-15" }];
  assert("forfait ancien : saison déduite de createdAt",
    calculeRangEnfantFamille("F1", ancien, "Z", DATE) === 2);
}

// ─── Fréquence déjà inscrite ──────────────────────────────────────
console.log("\n✓ Fréquence déjà inscrite cette saison pour un cavalier :");
{
  const DATE = "2025-10-01";
  const forfaits = [
    { familyId: "F1", childId: "A", status: "actif", seasonStartYear: 2025, frequence: 1 },
    { familyId: "F1", childId: "A", status: "actif", seasonStartYear: 2025, frequence: 1 },
    { familyId: "F1", childId: "A", status: "actif", seasonStartYear: 2024, frequence: 3 },
    { familyId: "F1", childId: "B", status: "actif", seasonStartYear: 2025, frequence: 2 },
  ];
  assert("deux forfaits 1× cette saison → 2", calculeFrequenceDejaInscrite("F1", forfaits, "A", DATE) === 2);
  assert("un autre enfant n'entre pas dans le compte", calculeFrequenceDejaInscrite("F1", forfaits, "B", DATE) === 2);
  assert("aucun cavalier sélectionné → 0", calculeFrequenceDejaInscrite("F1", forfaits, "", DATE) === 0);
  assert("aucune famille → 0", calculeFrequenceDejaInscrite(undefined, forfaits, "A", DATE) === 0);
}

// ─── Différentiel d'heures ────────────────────────────────────────
console.log("\n✓ Ajout d'heures : facturé au différentiel, pas à plein tarif :");
{
  assert("1re inscription 1×/sem → 650 €", calculePrixForfaitAnnuel(1, 0, P) === 650);
  assert("1re inscription 2×/sem → 1100 €", calculePrixForfaitAnnuel(2, 0, P) === 1100);
  // Déjà 1×/sem, on ajoute 1 heure : 1100 − 650 = 450 €, et non 650 €.
  assert("déjà 1×, +1 heure → 450 € (différentiel)", calculePrixForfaitAnnuel(1, 1, P) === 450);
  assert("déjà 1×, +2 heures → 750 € (vers 3×/sem)", calculePrixForfaitAnnuel(2, 1, P) === 750);
  assert("déjà 2×, +1 heure → 300 €", calculePrixForfaitAnnuel(1, 2, P) === 300);
  // Déjà au maximum : le différentiel serait nul ou négatif, on facture 0.
  assert("déjà 3×, +1 heure → 0 € (jamais négatif)", calculePrixForfaitAnnuel(1, 3, P) === 0);
  // Cohérence : ajouter deux fois une heure coûte le même prix que d'en
  // ajouter deux d'un coup.
  assert("1×+1×+1× = 1× puis +2×",
    calculePrixForfaitAnnuel(1, 1, P) + calculePrixForfaitAnnuel(1, 2, P) === calculePrixForfaitAnnuel(2, 1, P));
}

// ─── Prorata + rythme quinzaine ───────────────────────────────────
console.log("\n✓ Montant brut du forfait (prorata × rythme) :");
{
  assert("tarif plein, saison entière", calculePrixForfaitBrut(650, 1, false) === 650);
  assert("moitié de saison → moitié du tarif", calculePrixForfaitBrut(650, 0.5, false) === 325);
  // Garde alternée : moitié des séances, donc moitié du tarif.
  assert("quinzaine sur saison entière → moitié", calculePrixForfaitBrut(650, 1, true) === 325);
  assert("quinzaine + moitié de saison → quart", calculePrixForfaitBrut(650, 0.5, true) === 163);
  assert("montant arrondi à l'euro", Number.isInteger(calculePrixForfaitBrut(650, 1 / 3, false)));
  assert("prorata nul → 0 €", calculePrixForfaitBrut(650, 0, false) === 0);
}

// ─── Réduction famille et adhésion ────────────────────────────────
console.log("\n✓ Réduction famille et adhésion dégressive :");
{
  assert("aucune règle → aucune remise", calculeReductionFamille(650, 0) === 0);
  assert("-10 % sur 650 € → 65 €", calculeReductionFamille(650, 10) === 65);
  // Arrondi au centime, jamais tronqué.
  assert("-15 % sur 325 € → 48,75 €", calculeReductionFamille(325, 15) === 48.75);
  assert("arrondi au centime", calculeReductionFamille(333, 7) === 23.31);

  assert("1er enfant → 60 €", calculeAdhesionDegressive(1, P) === 60);
  assert("2e enfant → 40 €", calculeAdhesionDegressive(2, P) === 40);
  assert("3e enfant → 20 €", calculeAdhesionDegressive(3, P) === 20);
  assert("4e enfant → 0 €", calculeAdhesionDegressive(4, P) === 0);
  assert("5e enfant → 0 € (comme le 4e)", calculeAdhesionDegressive(5, P) === 0);
}

// ─── Prix TTC d'un créneau ────────────────────────────────────────
console.log("\n✓ Prix TTC d'un créneau :");
{
  assert("priceTTC prioritaire s'il existe", calculePriceTTC({ priceTTC: 22, priceHT: 1 }) === 22);
  // Reconstitution depuis le HT avec la TVA des activités équestres (5,5 %).
  assert("reconstitué depuis le HT à 5,5 %",
    Math.round(calculePriceTTC({ priceHT: 100 }) * 100) / 100 === 105.5);
  assert("taux de TVA explicite respecté",
    Math.round(calculePriceTTC({ priceHT: 100, tvaTaux: 20 }) * 100) / 100 === 120);
  assert("créneau gratuit → 0", calculePriceTTC({}) === 0);
}

// ─── Tarifs de stage ──────────────────────────────────────────────
console.log("\n✓ Tarifs de stage (en-tête, mode jour, mode semaine) :");
{
  const stage = { price1day: 45, price2days: 85, price3days: 120, priceTTC: 150 };
  assert("en-tête : tarif du nombre de jours réel", prixAfficheEntete(stage, 150, true, 3) === 120);
  assert("en-tête : repli sur le prix du créneau si non configuré", prixAfficheEntete(stage, 150, true, 5) === 150);
  assert("en-tête : hors stage, prix du créneau", prixAfficheEntete(stage, 150, false, 3) === 150);

  // Mode jour : prix jour DÉFINI, brut, sans prorata ni remise.
  assert("mode jour : price1day tel quel", calculePrixEffectifStage(stage, 150, "jour", 4) === 45);
  // Sans price1day configuré : repli sur le prorata prix complet / nb jours.
  assert("mode jour sans price1day : prorata",
    calculePrixEffectifStage({ priceTTC: 150 }, 150, "jour", 4) === 37.5);
  // Mode semaine : tarif configuré pour ce nombre de jours.
  assert("mode semaine : tarif 3 jours", calculePrixEffectifStage(stage, 150, "semaine", 3) === 120);
  // Un tarif configuré PLUS CHER que la semaine complète est une erreur de
  // saisie : on l'ignore et on facture le prix complet.
  assert("tarif jour aberrant (> prix complet) ignoré",
    calculePrixEffectifStage({ price2days: 999, priceTTC: 150 }, 150, "semaine", 2) === 150);

  // ⚠️ Le prix jour AFFICHÉ dans le récapitulatif retient le MOINS cher des
  // deux (price1day ou prorata), alors que le prix FACTURÉ retient toujours
  // price1day. Comportement d'origine, conservé tel quel et documenté ici :
  // avec price1day = 45 € et un prorata à 37,50 €, l'écran annonce 37,50 €/jour
  // et la commande porte 45 €.
  assert("prix jour affiché : le moins cher des deux (prorata ici)",
    prixJourAffiche(stage, 150, 4) === 37.5);
  assert("prix jour affiché : price1day s'il est plus bas que le prorata",
    prixJourAffiche({ price1day: 30 }, 150, 4) === 30);
  assert("écart assumé entre prix affiché et prix facturé",
    prixJourAffiche(stage, 150, 4) !== calculePrixEffectifStage(stage, 150, "jour", 4));
}

// ─── Acompte / solde d'un stage ───────────────────────────────────
console.log("\n✓ Acompte et solde d'un stage :");
{
  const base = { stageMode: "semaine" as const, stagePayChoice: "acompte" as const, acompteParEnfant: 30 };
  const deuxEnfants = { ...base, stageTotalTTC: 240, nbEnfants: 2 };
  const a = calculeAcompteStage(deuxEnfants);
  assert("acompte = 30 € par enfant", a.showAcompte && a.stageAcompte === 60);
  assert("solde = total − acompte", a.stageSolde === 180);
  assert("acompte + solde = total", a.stageAcompte + a.stageSolde === 240);

  // Total inférieur à la somme des acomptes : on ne demande jamais plus que
  // le prix du stage, et il n'y a pas de solde.
  const petit = calculeAcompteStage({ ...base, stageTotalTTC: 40, nbEnfants: 2 });
  assert("total < somme des acomptes → pas d'acompte", !petit.showAcompte);
  assert("… et on demande le total", petit.stageAcompte === 40 && petit.stageSolde === 0);

  // Mode jour ou paiement intégral : tout est dû tout de suite.
  const total = calculeAcompteStage({ ...base, stagePayChoice: "total", stageTotalTTC: 240, nbEnfants: 2 });
  assert("paiement intégral → aucun acompte", !total.showAcompte && total.stageAcompte === 240);
  const jour = calculeAcompteStage({ ...base, stageMode: "jour", stageTotalTTC: 240, nbEnfants: 2 });
  assert("mode jour → aucun acompte", !jour.showAcompte && jour.stageAcompte === 240);
}

// ─── Ajout d'un jour à un stage déjà commandé ─────────────────────
console.log("\n✓ Recalcul du tarif quand on ajoute un jour de stage :");
{
  const stage = { price1day: 45, priceTTC: 150 };
  assert("2 jours sur 4 → 2 × 45 €", calculePrixStageApresAjoutJour(stage, 2, 4) === 90);
  assert("3 jours sur 4 → 3 × 45 €", calculePrixStageApresAjoutJour(stage, 3, 4) === 135);
  // Tous les jours pris : on retombe sur le prix semaine complète, qui est
  // plus avantageux que 4 × 45 = 180 €.
  assert("tous les jours pris → prix semaine complète", calculePrixStageApresAjoutJour(stage, 4, 4) === 150);
  assert("… et jamais la somme des jours", calculePrixStageApresAjoutJour(stage, 4, 4) < 45 * 4);
  // Sans price1day : prorata du prix complet.
  assert("sans price1day : prorata", calculePrixStageApresAjoutJour({ priceTTC: 200 }, 2, 4) === 100);
  // Garde-fou : un stage annoncé à 0 jour ne doit pas diviser par zéro.
  assert("0 jour au total → pas de division par zéro",
    Number.isFinite(calculePrixStageApresAjoutJour({ priceTTC: 200 }, 1, 0)));
}

console.log("\n══════════════════════════════════════════════════════════════");
console.log(`  ${passed} réussis · ${failed} échoués`);
if (failed > 0) {
  console.log("\n  Échecs :");
  failures.forEach(f => console.log(`   • ${f}`));
}
console.log("══════════════════════════════════════════════════════════════\n");
process.exit(failed > 0 ? 1 : 0);
