/**
 * tests/unit/inscription-annuelle-tarifs.test.ts
 *
 * Tests des calculs de tarif du parcours d'inscription à l'année, côté FAMILLES.
 *   npx tsx tests/unit/inscription-annuelle-tarifs.test.ts
 *
 * Enjeu : ici, c'est la famille elle-même qui clique. Personne du club ne relit
 * le montant avant qu'il ne parte en paiement CB. Ces fonctions ne calculent
 * pas le prix final (c'est src/lib/forfait-pricing.ts, partagé avec l'admin)
 * mais elles en fabriquent les ENTRÉES — et une entrée fausse donne un prix
 * faux sans que rien n'ait l'air cassé. Quatre erreurs coûteraient cher, et
 * chacune a ses assertions ici :
 *   - une licence ou une adhésion refacturée à un enfant qui l'a déjà payée
 *     cette saison (elles sont ANNUELLES) ;
 *   - une heure ajoutée facturée comme un second forfait plein au lieu du
 *     différentiel vers le forfait supérieur ;
 *   - un rang de fratrie faux, qui décale la réduction famille et l'adhésion
 *     dégressive pour tous les enfants suivants ;
 *   - un prix annoncé sur la vignette de choix différent du prix facturé
 *     ensuite — le pire, parce que la famille a consenti à l'autre montant.
 */

import {
  ageFromBirthDate, estLicenceMoins18, calculeRangEnfant,
  calculeChildIdsDejaInscrits, calculePrereqDejaPris, calculeFrequenceDejaInscrite,
  tarifPourFrequence, prixAjoutAffiche,
} from "../../src/app/espace-cavalier/inscription-annuelle/tarifs";
import {
  MIN_SEASON_INSCRIPTION, TARIFS_DEFAUT,
} from "../../src/app/espace-cavalier/inscription-annuelle/constantes";
import type { PanierItem } from "../../src/app/espace-cavalier/inscription-annuelle/types";
import { calculerForfaitAnnuel } from "../../src/lib/forfait-pricing";

let passed = 0, failed = 0;
const failures: string[] = [];
function assert(label: string, cond: boolean, details?: string) {
  if (cond) { passed++; console.log(`  ✅ ${label}`); }
  else { failed++; failures.push(label); console.log(`  ❌ ${label}${details ? " — " + details : ""}`); }
}

console.log("\n══════════════════════════════════════════════════════════════");
console.log("  Tests unitaires tarifs inscription annuelle (espace cavalier)");
console.log("══════════════════════════════════════════════════════════════\n");

const T = TARIFS_DEFAUT; // 650 / 1100 / 1400 · adhésions 60/40/20/0 · licences 25/36
const SAISON = MIN_SEASON_INSCRIPTION;

/** Date de naissance d'un cavalier qui a `annees` ans révolus depuis la veille. */
const neIlYA = (annees: number): string => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - annees);
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
};

/** Fabrique un forfait Firestore minimal. */
const forfait = (o: Partial<Record<string, any>>) => ({
  childId: "enfantA", seasonStartYear: SAISON, status: "actif", frequence: 1, ...o,
});

/** Fabrique une entrée de panier minimale (seuls les champs lus comptent). */
const item = (o: Partial<PanierItem>): PanierItem => ({
  childId: "enfantA", childName: "A", forfaitType: "1x", frequence: 1,
  slotKeys: [], creneauIds: [], slotsInfo: [],
  avecAdhesion: false, avecLicence: false, licenceMoins18: true,
  rangEnfant: 1, seasonStartYear: SAISON, frequenceDejaInscrite: 0,
  totalAnnuel: 0, detailLignes: [], prixAdhesion: 0, prixLicence: 0, prixForfaitNet: 0,
  ...o,
});

// ─── Âge et tarif de licence ──────────────────────────────────────
console.log("✓ Âge du cavalier et tarif de licence :");
{
  assert("date absente → âge inconnu", ageFromBirthDate(null) === null);
  assert("chaîne vide → âge inconnu", ageFromBirthDate("") === null);
  assert("date illisible → âge inconnu", ageFromBirthDate("pas une date") === null);
  assert("objet inattendu → âge inconnu", ageFromBirthDate({ nimporte: "quoi" }) === null);
  assert("chaîne ISO", ageFromBirthDate(neIlYA(12)) === 12);
  assert("objet Date", ageFromBirthDate(new Date(neIlYA(9))) === 9);
  // Firestore renvoie les dates sous deux formes selon le chemin de lecture.
  const seconds = Math.floor(new Date(neIlYA(30)).getTime() / 1000);
  assert("Timestamp Firestore {seconds}", ageFromBirthDate({ seconds }) === 30);
  assert("Timestamp Firestore .toDate()",
    ageFromBirthDate({ toDate: () => new Date(neIlYA(7)) }) === 7);
  assert("toDate() qui explose → âge inconnu",
    ageFromBirthDate({ toDate: () => { throw new Error("boom"); } }) === null);
  // Garde-fou contre les dates saisies de travers (1900, ou année à 5 chiffres) :
  // mieux vaut « âge inconnu » qu'un « 126 ans » affiché à une famille.
  assert("âge aberrant (130 ans) → âge inconnu", ageFromBirthDate(neIlYA(130)) === null);
  assert("date dans le futur → âge inconnu",
    ageFromBirthDate(new Date(Date.now() + 86400000 * 400).toISOString().slice(0, 10)) === null);

  // Le doute profite à la famille : sans date de naissance on facture le tarif
  // -18 ans, le moins cher. On ne surfacture jamais par ignorance.
  assert("licence -18 quand la date manque", estLicenceMoins18(undefined) === true);
  assert("licence -18 quand la date est illisible", estLicenceMoins18("n'importe quoi") === true);
  assert("17 ans → licence -18", estLicenceMoins18(neIlYA(17)) === true);
  assert("18 ans → licence +18", estLicenceMoins18(neIlYA(18)) === false);
  assert("40 ans → licence +18", estLicenceMoins18(neIlYA(40)) === false);
}

// ─── Tarif plein par fréquence ────────────────────────────────────
console.log("\n✓ Tarif plein selon la fréquence hebdomadaire :");
{
  assert("1×/sem → forfait1x", tarifPourFrequence(T, 1) === T.forfait1x);
  assert("2×/sem → forfait2x", tarifPourFrequence(T, 2) === T.forfait2x);
  assert("3×/sem → forfait3x", tarifPourFrequence(T, 3) === T.forfait3x);
  // Plafond : au-delà de 3×/sem on ne facture pas davantage.
  assert("4×/sem plafonné au forfait3x", tarifPourFrequence(T, 4) === T.forfait3x);
  // Comportement documenté, non atteignable par l'interface : la fonction n'est
  // appelée avec 0 que si l'enfant n'a rien, cas traité en amont.
  assert("0×/sem retombe sur forfait1x (cas non atteignable)", tarifPourFrequence(T, 0) === T.forfait1x);
}

// ─── Prix annoncé sur les vignettes de choix ──────────────────────
console.log("\n✓ Prix annoncé à la famille avant qu'elle choisisse :");
{
  const prix = (dejaInscrite: number, nNouveau: number) =>
    prixAjoutAffiche({ tarifs: T, frequenceDejaInscrite: dejaInscrite, nNouveau });

  // Première inscription : tarif plein, sans surprise.
  assert("première inscription 1× → 650", prix(0, 1) === 650);
  assert("première inscription 2× → 1100", prix(0, 2) === 1100);
  assert("première inscription 3× → 1400", prix(0, 3) === 1400);

  // Ajout d'heures : seule la différence vers le forfait supérieur est due.
  assert("déjà 1×, ajout 1× → 450 (différentiel 1100−650)", prix(1, 1) === 450);
  assert("déjà 1×, ajout 2× → 750 (différentiel 1400−650)", prix(1, 2) === 750);
  assert("déjà 2×, ajout 1× → 300 (différentiel 1400−1100)", prix(2, 1) === 300);
  // L'erreur qui coûte le plus cher : facturer un second forfait plein.
  assert("un ajout ne coûte jamais un forfait plein", prix(1, 1) < 650 && prix(2, 1) < 650);

  // Cumul plafonné à 3×/semaine : au-delà, le supplément ne grossit plus.
  assert("déjà 2×, ajout 2× plafonné au différentiel vers 3×", prix(2, 2) === 300);
  assert("déjà 3×, ajout 1× → 0", prix(3, 1) === 0);
  assert("jamais de montant négatif", prix(3, 3) >= 0);
}

// ─── Cohérence entre le prix annoncé et le prix facturé ───────────
console.log("\n✓ Le prix annoncé est bien celui qui sera facturé :");
{
  // La vignette de l'étape « Type de forfait » et le calcul central doivent
  // tomber sur le même montant. S'ils divergent, la famille consent à un prix
  // et en paie un autre — le scénario le plus grave de cet écran.
  const pleinCentral = (dejaInscrite: number, frequence: 1 | 2 | 3) =>
    calculerForfaitAnnuel({
      frequence,
      sessionsRestantes: 35, sessionsTotalSaison: 35,
      rangEnfant: 1, avecAdhesion: false, avecLicence: false, licenceMoins18: true,
      tarifs: T, familyDiscountRules: [], frequenceDejaInscrite: dejaInscrite,
    }).prixForfaitAnnuelPlein;

  const cas: [number, 1 | 2 | 3][] = [[0, 1], [0, 2], [0, 3], [1, 1], [1, 2], [2, 1], [2, 2], [3, 1]];
  for (const [deja, freq] of cas) {
    assert(`déjà ${deja}× + ${freq}× : vignette = calcul central`,
      prixAjoutAffiche({ tarifs: T, frequenceDejaInscrite: deja, nNouveau: freq }) === pleinCentral(deja, freq),
      `vignette ${prixAjoutAffiche({ tarifs: T, frequenceDejaInscrite: deja, nNouveau: freq })} vs central ${pleinCentral(deja, freq)}`);
  }
}

// ─── Rang de l'enfant dans la fratrie ─────────────────────────────
console.log("\n✓ Rang de l'enfant (réduction famille + adhésion dégressive) :");
{
  const rang = (allForfaits: any[], panier: PanierItem[] = [], selectedChild = "enfantA") =>
    calculeRangEnfant({ familyId: "fam1", allForfaits, panier, selectedChild, targetSeason: SAISON });

  assert("sans famille identifiée → 1er enfant",
    calculeRangEnfant({ familyId: undefined, allForfaits: [forfait({ childId: "enfantB" })], panier: [], selectedChild: "enfantA", targetSeason: SAISON }) === 1);
  assert("aucun forfait → 1er enfant", rang([]) === 1);
  assert("un frère déjà inscrit → 2e enfant", rang([forfait({ childId: "enfantB" })]) === 2);
  assert("deux frères déjà inscrits → 3e enfant",
    rang([forfait({ childId: "enfantB" }), forfait({ childId: "enfantC" })]) === 3);
  // Un même frère avec deux forfaits (2 cours/sem) ne compte qu'une fois,
  // sinon la fratrie « grandirait » à chaque cours ajouté.
  assert("un frère avec 2 forfaits ne compte qu'une fois",
    rang([forfait({ childId: "enfantB" }), forfait({ childId: "enfantB", frequence: 2 })]) === 2);
  assert("l'enfant lui-même ne se compte pas",
    rang([forfait({ childId: "enfantA" })]) === 1);
  assert("un frère inscrit une AUTRE saison ne compte pas",
    rang([forfait({ childId: "enfantB", seasonStartYear: SAISON - 1 })]) === 1);
  assert("forfait sans seasonStartYear : saison déduite de createdAt",
    rang([forfait({ childId: "enfantB", seasonStartYear: undefined, createdAt: `${SAISON}-09-10` })]) === 2);
  assert("forfait sans childId ignoré", rang([forfait({ childId: null })]) === 1);
  // Un frère encore dans le panier compte déjà : c'est ce qui donne le bon
  // tarif quand on inscrit toute la fratrie d'un coup, avant de payer.
  assert("un frère dans le panier compte", rang([], [item({ childId: "enfantB" })]) === 2);
  assert("panier + base cumulés",
    rang([forfait({ childId: "enfantB" })], [item({ childId: "enfantC" })]) === 3);
  // Comportement ACTUEL, volontairement figé ici : contrairement aux autres
  // calculs, le rang ne filtre pas les forfaits annulés. Un frère dont le
  // forfait est annulé continue donc de faire passer l'enfant au rang 2.
  assert("un frère au forfait ANNULÉ compte quand même (comportement actuel)",
    rang([forfait({ childId: "enfantB", status: "annule" })]) === 2);
}

// ─── Licence / adhésion déjà payées cette saison ──────────────────
console.log("\n✓ Licence et adhésion ne sont jamais payées deux fois :");
{
  const prereq = (allForfaits: any[], panier: PanierItem[] = [], selectedChild = "enfantA") =>
    calculePrereqDejaPris({ allForfaits, panier, selectedChild, targetSeason: SAISON });

  assert("aucun enfant sélectionné → rien de pris",
    prereq([forfait({ licenceFFE: true, adhesion: true })], [], "").licence === false);
  assert("aucun forfait → rien de pris", prereq([]).licence === false && prereq([]).adhesion === false);
  assert("licence déjà prise en base", prereq([forfait({ licenceFFE: true })]).licence === true);
  assert("adhésion déjà prise en base", prereq([forfait({ adhesion: true })]).adhesion === true);
  assert("licence prise ≠ adhésion prise",
    prereq([forfait({ licenceFFE: true })]).adhesion === false);
  assert("le forfait d'un frère ne compte pas",
    prereq([forfait({ childId: "enfantB", licenceFFE: true })]).licence === false);
  // Un forfait annulé ne vaut pas licence payée : sinon on laisserait partir un
  // cavalier sans licence FFE valide.
  assert("un forfait ANNULÉ ne vaut pas licence prise",
    prereq([forfait({ status: "annule", licenceFFE: true })]).licence === false);
  assert("une AUTRE saison ne vaut pas licence prise",
    prereq([forfait({ seasonStartYear: SAISON - 1, licenceFFE: true })]).licence === false);
  // Le panier compte aussi : 2 cours ajoutés d'affilée pour le même enfant ne
  // doivent pas facturer la licence deux fois avant même le paiement.
  assert("licence déjà dans le panier", prereq([], [item({ avecLicence: true })]).licence === true);
  assert("adhésion déjà dans le panier", prereq([], [item({ avecAdhesion: true })]).adhesion === true);
  assert("entrée de panier d'une autre saison ignorée",
    prereq([], [item({ avecLicence: true, seasonStartYear: SAISON - 1 })]).licence === false);
  assert("entrée de panier sans saison : prise en compte",
    prereq([], [item({ avecLicence: true, seasonStartYear: undefined })]).licence === true);
}

// ─── Heures déjà inscrites cette saison ───────────────────────────
console.log("\n✓ Heures/semaine déjà inscrites (base du tarif différentiel) :");
{
  const freq = (allForfaits: any[], panier: PanierItem[] = [], selectedChild = "enfantA") =>
    calculeFrequenceDejaInscrite({ allForfaits, panier, selectedChild, targetSeason: SAISON });

  assert("aucun enfant sélectionné → 0", freq([forfait({ frequence: 2 })], [], "") === 0);
  assert("aucun forfait → 0", freq([]) === 0);
  assert("un forfait 1× → 1", freq([forfait({ frequence: 1 })]) === 1);
  assert("deux forfaits cumulés → 3", freq([forfait({ frequence: 1 }), forfait({ frequence: 2 })]) === 3);
  assert("forfait d'un frère ignoré", freq([forfait({ childId: "enfantB", frequence: 2 })]) === 0);
  assert("forfait ANNULÉ ignoré", freq([forfait({ status: "annule", frequence: 2 })]) === 0);
  assert("autre saison ignorée", freq([forfait({ seasonStartYear: SAISON - 1, frequence: 2 })]) === 0);
  // Vieux forfaits sans champ `frequence` : comptés 0 plutôt que NaN, qui
  // contaminerait tout le calcul de prix en aval.
  assert("forfait sans fréquence → 0, jamais NaN",
    freq([forfait({ frequence: undefined })]) === 0);
  assert("fréquence illisible → 0, jamais NaN",
    freq([forfait({ frequence: "beaucoup" })]) === 0);
  assert("panier compté", freq([], [item({ frequence: 2 })]) === 2);
  assert("base + panier cumulés", freq([forfait({ frequence: 1 })], [item({ frequence: 2 })]) === 3);
  assert("entrée de panier d'une autre saison ignorée",
    freq([], [item({ frequence: 2, seasonStartYear: SAISON - 1 })]) === 0);

  // Ce cumul plafonne le choix proposé : un enfant déjà à 3×/sem ne peut plus
  // rien ajouter (freqMaxAjoutable = 3 − déjà inscrit).
  const dejaTrois = freq([forfait({ frequence: 3 })]);
  assert("déjà 3×/sem → plus aucune heure ajoutable", Math.max(0, 3 - dejaTrois) === 0);
}

// ─── Enfants déjà inscrits (blocage de la double inscription) ─────
console.log("\n✓ Détection des enfants déjà inscrits pour la saison ouverte :");
{
  const dejaInscrits = (allForfaits: any[], panier: PanierItem[] = []) =>
    calculeChildIdsDejaInscrits(allForfaits, panier);

  assert("aucun forfait → personne", dejaInscrits([]).size === 0);
  assert("forfait actif de la saison ouverte → détecté",
    dejaInscrits([forfait({ childId: "enfantA" })]).has("enfantA"));
  assert("forfait ANNULÉ ignoré",
    !dejaInscrits([forfait({ childId: "enfantA", status: "annule" })]).has("enfantA"));
  // La détection se fait sur la saison ouverte au self-service, pas sur celle
  // du créneau : un enfant inscrit l'an dernier n'est pas « déjà inscrit ».
  assert("saison précédente ignorée",
    !dejaInscrits([forfait({ childId: "enfantA", seasonStartYear: SAISON - 1 })]).has("enfantA"));
  assert("forfait sans childId ignoré", dejaInscrits([forfait({ childId: null })]).size === 0);
  assert("enfant du panier détecté", dejaInscrits([], [item({ childId: "enfantD" })]).has("enfantD"));
  assert("un enfant du panier compte quelle que soit sa saison",
    dejaInscrits([], [item({ childId: "enfantD", seasonStartYear: SAISON - 1 })]).has("enfantD"));
}

console.log("\n══════════════════════════════════════════════════════════════");
console.log(`  ${passed} réussis · ${failed} échoués`);
if (failed > 0) {
  console.log("\n  Échecs :");
  failures.forEach(f => console.log(`   • ${f}`));
}
console.log("══════════════════════════════════════════════════════════════\n");
process.exit(failed > 0 ? 1 : 0);
