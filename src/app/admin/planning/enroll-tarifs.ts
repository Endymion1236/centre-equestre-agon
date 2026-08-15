/**
 * src/app/admin/planning/enroll-tarifs.ts
 *
 * Tout ce qui décide COMBIEN une inscription va coûter.
 *
 * Ces calculs vivaient au milieu du panneau d'inscription, entremêlés à l'état
 * React et au JSX. Ils étaient donc invérifiables autrement qu'en inscrivant
 * un vrai cavalier sur un vrai créneau — c'est-à-dire en créant un vrai
 * paiement. Or c'est exactement ici que se joue le risque du logiciel : une
 * erreur d'arrondi, un prorata inversé ou une réduction famille appliquée deux
 * fois se traduit par une facture fausse envoyée à une famille.
 *
 * Toutes les fonctions de ce fichier sont PURES : elles reçoivent leurs
 * données en paramètres (jamais l'état du composant), ne lisent pas Firestore
 * et ne rendent rien. C'est ce qui les rend enfin testables — voir
 * tests/unit/enroll-tarifs.test.ts.
 *
 * Règles métier qu'elles encodent, et qu'il ne faut pas « simplifier » :
 *  - le prorata ne dépasse jamais 100 % (inscription en début de saison) ;
 *  - une heure ajoutée en cours de saison se facture au DIFFÉRENTIEL de
 *    fréquence, pas à plein tarif ;
 *  - une quinzaine (garde alternée) = moitié des séances, donc moitié du
 *    tarif, appliquée AVANT le prorata et les réductions ;
 *  - les montants en euros sont arrondis au centime, jamais tronqués.
 */

import type { ParametresInscription } from "./enroll-constantes";

/**
 * Tarif plein d'un forfait annuel selon la fréquence hebdomadaire.
 * Au-delà de 3×/semaine on reste au tarif 3× : le club ne vend pas plus.
 */
export function prixForfaitPlein(frequence: number, params: ParametresInscription): number {
  return frequence >= 3 ? params.forfait3x : frequence === 2 ? params.forfait2x : params.forfait1x;
}

/**
 * Calcule la fin de saison "effective" pour un créneau donné.
 *
 * Une saison court de septembre à juin (fin = 30/06 par convention).
 * - Si le créneau est dans la saison en cours (avant `dateFinSaisonRef`),
 *   on garde la fin de saison de référence définie dans les paramètres.
 * - Si le créneau est postérieur (ex: pré-inscription pour la saison
 *   suivante en septembre), on bascule sur la fin de saison N+1 :
 *   30/06 de l'année qui suit le 1er septembre précédant le créneau.
 *
 * Cela permet de pré-inscrire un cavalier pour la saison suivante au
 * tarif plein, sans avoir à modifier les paramètres globaux.
 */
export function calculeFinSaisonEffective(dateFinSaisonRef: string, dateCreneau: string): Date {
  const refFin = new Date(dateFinSaisonRef);
  const creneauDate = new Date(dateCreneau);
  if (creneauDate <= refFin) return refFin;
  // Créneau dans une saison future — calculer le 30/06 qui suit
  const m = creneauDate.getMonth(); // 0-11
  const y = creneauDate.getFullYear();
  // Saison qui démarre en septembre Y_start et finit le 30/06 Y_start+1
  const yearStart = m >= 8 ? y : y - 1;
  return new Date(yearStart + 1, 5, 30); // mois 5 = juin
}

/**
 * Prorata = ratio sur la saison REELLE (créneaux générés), plafonné à 100%
 * pour gérer le cas où le cavalier s'inscrit au tout début (start <= debut saison).
 */
export function calculeProrata(sessionsRestantes: number, sessionsTotalSaison: number): number {
  return Math.min(1, sessionsTotalSaison > 0 ? sessionsRestantes / sessionsTotalSaison : 0);
}

// ── Helper : déduire la saison FFE d'une date ──────────────────────
// La saison FFE va du 1er septembre Y au 30 juin Y+1.
// - mois >= 8 (sept-déc) → saison Y/Y+1, on retourne Y
// - mois <= 7 (janv-août) → saison Y-1/Y, on retourne Y-1
export function saisonDe(dateStr: string | Date | { seconds: number }): number {
  let d: Date;
  if (typeof dateStr === "string") d = new Date(dateStr);
  else if (dateStr instanceof Date) d = dateStr;
  else if (dateStr && (dateStr as any).seconds) d = new Date((dateStr as any).seconds * 1000);
  else return 0;
  if (isNaN(d.getTime())) return 0;
  return d.getMonth() >= 8 ? d.getFullYear() : d.getFullYear() - 1;
}

/**
 * Rang de l'enfant dans sa fratrie pour l'adhésion dégressive et la réduction
 * famille : compte les enfants DÉJÀ inscrits en forfait annuel POUR LA MÊME
 * SAISON que le créneau qu'on est en train d'inscrire.
 *
 * Sans ce filtre de saison, le code comptait aussi les forfaits de la saison
 * précédente — donc un 1er enfant d'une nouvelle saison apparaissait comme N+1
 * si la famille avait des forfaits encore actifs de l'an dernier (non encore
 * passés en 'completed').
 *
 * Source de la saison cible : la date du créneau cliqué.
 * Source de la saison d'un forfait existant : son createdAt à défaut d'un
 * champ dédié (les anciens forfaits n'avaient pas seasonStartYear).
 */
export function calculeRangEnfantFamille(
  familyId: string | undefined,
  allForfaits: any[],
  childId: string,
  dateCreneau: string,
): number {
  if (!familyId) return 1;
  const targetSeason = saisonDe(dateCreneau);
  const enfantsInscrits = new Set<string>();
  allForfaits
    .filter((f: any) => f.familyId === familyId)
    .forEach((f: any) => {
      if (!f.childId || f.childId === childId) return;
      if (f.status && f.status !== "actif" && f.status !== "active") return;
      // Comparaison de saison : on accepte le forfait si sa saison
      // (champ dédié ou createdAt) correspond à celle du créneau cible.
      const forfaitSeason = f.seasonStartYear ?? saisonDe(f.createdAt);
      if (forfaitSeason !== targetSeason) return;
      enfantsInscrits.add(f.childId);
    });
  return enfantsInscrits.size + 1;
}

/**
 * Fréquence (cours/semaine) déjà inscrite pour CET enfant cette saison.
 * Sert à facturer une heure supplémentaire au DIFFÉRENTIEL (dégressivité
 * horaire) plutôt qu'à plein tarif, comme côté famille.
 */
export function calculeFrequenceDejaInscrite(
  familyId: string | undefined,
  allForfaits: any[],
  childId: string,
  dateCreneau: string,
): number {
  if (!familyId || !childId) return 0;
  const targetSeason = saisonDe(dateCreneau);
  let total = 0;
  allForfaits
    .filter((f: any) => f.familyId === familyId && f.childId === childId)
    .forEach((f: any) => {
      if (f.status && f.status !== "actif" && f.status !== "active") return;
      const forfaitSeason = f.seasonStartYear ?? saisonDe(f.createdAt);
      if (forfaitSeason !== targetSeason) return;
      total += Number(f.frequence) || 0;
    });
  return total;
}

/**
 * Prix plein du forfait :
 *  - 1re inscription → tarif plein de la fréquence choisie
 *  - ajout d'heure(s) (frequenceDejaInscrite > 0) → DIFFÉRENTIEL vers la
 *    fréquence cumulée (plafonnée à 3×/sem). Aligné sur l'espace famille.
 *
 * Le Math.max(0, …) protège un cas réel : un enfant déjà à 3×/semaine à qui on
 * ajoute une heure. Le différentiel serait nul ou négatif — on ne rembourse
 * évidemment pas, on facture 0.
 */
export function calculePrixForfaitAnnuel(
  frequenceCours: number,
  frequenceDejaInscrite: number,
  params: ParametresInscription,
): number {
  const ajoutHeure = frequenceDejaInscrite > 0;
  const freqCumulee = Math.min(3, frequenceDejaInscrite + frequenceCours);
  return ajoutHeure
    ? Math.max(0, prixForfaitPlein(freqCumulee, params) - prixForfaitPlein(frequenceDejaInscrite, params))
    : prixForfaitPlein(frequenceCours, params);
}

/**
 * Montant du forfait avant réduction famille : tarif annuel × prorata × rythme.
 *
 * Une semaine sur deux = moitié des séances, donc moitié du tarif. Appliqué
 * avant le prorata et les réductions famille, qui restent proportionnelles.
 */
export function calculePrixForfaitBrut(prixForfaitAnnuel: number, prorata: number, quinzaine: boolean): number {
  const coefRythme = quinzaine ? 0.5 : 1;
  return Math.round(prixForfaitAnnuel * prorata * coefRythme);
}

/** Montant en euros de la réduction famille, arrondi au centime. */
export function calculeReductionFamille(prixForfaitBrut: number, pourcentage: number): number {
  return pourcentage > 0 ? Math.round(prixForfaitBrut * pourcentage / 100 * 100) / 100 : 0;
}

/** Adhésion dégressive selon le rang de l'enfant dans la fratrie. */
export function calculeAdhesionDegressive(rangEnfantFamille: number, params: ParametresInscription): number {
  return rangEnfantFamille === 1 ? params.adhesion1 :
    rangEnfantFamille === 2 ? params.adhesion2 :
    rangEnfantFamille === 3 ? params.adhesion3 :
    params.adhesion4plus;
}

/**
 * Prix TTC d'un créneau : le champ priceTTC s'il existe, sinon reconstitué
 * depuis le HT et le taux de TVA (5,5 % par défaut, taux des activités
 * équestres).
 */
export function calculePriceTTC(creneau: any): number {
  return creneau?.priceTTC || (creneau?.priceHT || 0) * (1 + (creneau?.tvaTaux || 5.5) / 100);
}

/** Grille des tarifs multi-jours configurés sur un stage (1 à 4 jours). */
export function tarifsStageConfigures(creneau: any): Record<number, number> {
  const prices: Record<number, number> = {};
  const cr = creneau as any;
  if (cr?.price1day) prices[1] = cr.price1day;
  if (cr?.price2days) prices[2] = cr.price2days;
  if (cr?.price3days) prices[3] = cr.price3days;
  if (cr?.price4days) prices[4] = cr.price4days;
  return prices;
}

/**
 * Prix affiché dans l'en-tête du panneau : pour les stages, le tarif configuré
 * pour le nombre de jours réel du stage s'il existe, sinon le prix du créneau.
 */
export function prixAfficheEntete(creneau: any, priceTTC: number, estStage: boolean, nbJoursStage: number): number {
  if (!estStage) return priceTTC;
  const nbJours = nbJoursStage || 1;
  const prices = tarifsStageConfigures(creneau);
  return prices[nbJours] || priceTTC;
}

/**
 * Prix de référence d'UN enfant pour un stage, avant réductions.
 *
 * Mode jour : on facture le PRIX JOUR DÉFINI dans le stage (price1day),
 * brut, sans prorata ni réduction ni plancher. Fallback prorata seulement
 * si price1day n'est pas configuré du tout.
 *
 * Mode semaine : le tarif configuré pour ce nombre de jours, à condition
 * qu'il soit inférieur ou égal au prix complet (un tarif « 3 jours » plus cher
 * que la semaine entière est une erreur de saisie, on l'ignore).
 */
export function calculePrixEffectifStage(
  creneau: any,
  priceTTC: number,
  stageMode: "semaine" | "jour",
  nbJoursStage: number,
): number {
  const configuredPrices = tarifsStageConfigures(creneau);
  const prixStageComplet = priceTTC;
  const prixJourDefini = (configuredPrices[1] && configuredPrices[1] > 0)
    ? configuredPrices[1]
    : Math.round((prixStageComplet / nbJoursStage) * 100) / 100;
  return stageMode === "jour"
    ? prixJourDefini
    : (configuredPrices[nbJoursStage] && configuredPrices[nbJoursStage] <= prixStageComplet ? configuredPrices[nbJoursStage] : prixStageComplet);
}

/**
 * Prix jour affiché dans le récapitulatif stage.
 *
 * DOIT rester aligné sur ce qui est réellement facturé (cf. prixJourFacture) :
 * l'affichage retenait auparavant le PLUS PETIT du tarif configuré et du
 * prorata, alors que la facturation prend toujours le tarif configuré quand il
 * existe. Un stage à 45 €/jour dont le prorata tombait à 37,50 € annonçait
 * donc 37,50 € et facturait 45 €.
 */
export function prixJourAffiche(creneau: any, priceTTC: number, nbJours: number): number {
  const p1 = (creneau as any)?.price1day;
  if (p1 && p1 > 0) return p1;
  return Math.round((priceTTC / Math.max(1, nbJours)) * 100) / 100;
}

/**
 * Découpage acompte / solde d'une inscription à un stage.
 *
 * L'acompte est un forfait PAR ENFANT (source unique : STAGE_ACOMPTE_EUROS
 * dans cgv-clauses). Il n'a de sens qu'en semaine complète et seulement si le
 * total dépasse la somme des acomptes — sinon on demanderait un acompte plus
 * élevé que le prix du stage.
 */
export function calculeAcompteStage(params: {
  stageMode: "semaine" | "jour";
  stagePayChoice: "acompte" | "total";
  stageTotalTTC: number;
  nbEnfants: number;
  acompteParEnfant: number;
}): { showAcompte: boolean; stageAcompte: number; stageSolde: number } {
  const { stageMode, stagePayChoice, stageTotalTTC, nbEnfants, acompteParEnfant } = params;
  const showAcompte = stageMode === "semaine" && stagePayChoice === "acompte" && stageTotalTTC > acompteParEnfant * nbEnfants;
  const stageAcompte = showAcompte ? Math.min(acompteParEnfant * nbEnfants, stageTotalTTC) : stageTotalTTC;
  const stageSolde = showAcompte ? Math.round((stageTotalTTC - stageAcompte) * 100) / 100 : 0;
  return { showAcompte, stageAcompte, stageSolde };
}

/**
 * Tarif d'un stage après ajout d'un jour supplémentaire (panneau « inscrire
 * aussi dans d'autres jours ? »).
 *
 * Prix = prix jour × nb de jours ; si tous les jours sont pris, on retombe sur
 * le prix semaine complet. AUCUNE remise. Le prix jour est celui DÉFINI dans
 * le stage (price1day) ; le prorata n'est qu'un repli quand il n'est pas
 * configuré.
 */
export function calculePrixStageApresAjoutJour(
  creneauRef: any,
  nbJoursInscritsMaintenant: number,
  totalJoursStage: number,
): number {
  const cr = creneauRef as any;
  const prixComplet = calculePriceTTC(cr) || 0;
  const prixJour = (cr?.price1day && cr.price1day > 0)
    ? cr.price1day
    : Math.round((prixComplet / Math.max(1, totalJoursStage)) * 100) / 100;
  return (nbJoursInscritsMaintenant >= totalJoursStage)
    ? prixComplet
    : Math.round(prixJour * nbJoursInscritsMaintenant * 100) / 100;
}
