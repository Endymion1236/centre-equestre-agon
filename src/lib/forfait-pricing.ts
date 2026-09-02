/**
 * Calcul centralisé du prix d'un forfait annuel.
 *
 * UTILISÉ PAR :
 *   - Espace admin (EnrollPanel) : inscription manuelle par le centre
 *   - Espace cavalier (inscription-annuelle) : inscription par la famille
 *
 * OBJECTIF : une seule source de vérité pour les prix. Les deux espaces
 * DOIVENT produire le même montant pour la même situation, sinon une famille
 * paierait un prix different de ce que l'admin facture. Toute la logique de
 * tarification vit ici.
 *
 * RÈGLES (alignées sur la logique historique de EnrollPanel) :
 *   1. Prix forfait selon fréquence (dégressivité heures) : 1x / 2x / 3x
 *      → tarifs lus depuis settings/inscription (forfait1x/2x/3x)
 *   2. Prorata si inscription en cours de saison :
 *      prorata = sessionsRestantes / sessionsTotalSaison, plafonné à 1
 *      prixBrut = round(prixForfaitAnnuel × prorata)
 *   3. Dégressivité famille : réduction % selon le rang de l'enfant
 *      (1er, 2e, 3e...) lue depuis settings/degressivite.familyDiscount
 *      → appliquée sur le prix brut (après prorata)
 *   4. Adhésion dégressive selon le rang (adhesion1/2/3/4plus)
 *   5. Licence FFE (montant fixe selon -18 / +18)
 *
 *   Total = (adhésion si demandée) + (licence si demandée) + prixForfaitNet
 *   où prixForfaitNet = prixBrut − réductionFamille
 */

import { formatFrequence } from "./rythme";

export interface ForfaitTarifs {
  forfait1x: number;
  forfait2x: number;
  forfait3x: number;
  adhesion1: number;
  adhesion2: number;
  adhesion3: number;
  adhesion4plus: number;
  licenceMoins18?: number;
  licencePlus18?: number;
}

export interface FamilyDiscountRule {
  nth: number;      // rang de l'enfant (2 = 2e enfant, etc.)
  discount: number; // pourcentage de réduction (ex: 10 = -10%)
}

/**
 * Tarif plein pour une fréquence hebdomadaire donnée, demi-fréquences comprises.
 *
 * Les paramètres du club ne définissent que trois barreaux — 1×, 2× et 3× par
 * semaine. Une quinzaine vaut 0,5, une quinzaine 3×/sem vaut 1,5 : il faut donc
 * savoir lire l'échelle ENTRE les barreaux. On interpole linéairement.
 *
 * Cette forme a une propriété qui compte pour la facturation : le montant total
 * d'un enfant ne dépend pas de l'ORDRE dans lequel ses forfaits ont été saisis.
 * Chaque nouveau forfait coûte tarif(cumul après) − tarif(cumul avant), et la
 * somme se télescope vers tarif(cumul total).
 *
 * Réserve : cette égalité est exacte sur les nombres réels, à l'euro près après
 * l'arrondi final. Avec des barreaux impairs (un forfait 1× à 675 €), deux
 * demi-forfaits peuvent totaliser 1 € de plus qu'un forfait entier. Sans
 * conséquence avec des tarifs pairs — à revoir à la prochaine revalorisation
 * si l'écart d'un euro devient gênant.
 *
 *   tarif(0,5) = moitié du forfait 1×          (une quinzaine seule)
 *   tarif(1)   = forfait 1×                     (deux quinzaines alternées)
 *   tarif(1,5) = forfait 1× + moitié de l'écart 1×→2×
 *   tarif(3)   = forfait 3×                     (plafond)
 */
export function tarifPourFrequence(
  tarifs: Pick<ForfaitTarifs, "forfait1x" | "forfait2x" | "forfait3x">,
  frequence: number,
): number {
  if (!(frequence > 0)) return 0;
  // Index = fréquence entière. Le barreau 0 vaut 0 € : pas de cours, pas de prix.
  const paliers = [0, tarifs.forfait1x, tarifs.forfait2x, tarifs.forfait3x];
  const f = Math.min(3, frequence);
  const bas = Math.floor(f);
  const reste = f - bas;
  if (reste === 0) return paliers[bas];
  return paliers[bas] + (paliers[bas + 1] - paliers[bas]) * reste;
}

export interface CalculForfaitInput {
  // Fréquence hebdomadaire ÉQUIVALENTE du forfait ajouté, quinzaine comprise :
  // un « 1×/semaine une semaine sur deux » se passe ici en 0,5, pas en 1.
  // Voir frequenceEquivalente() dans src/lib/rythme.ts.
  frequence: number;
  sessionsRestantes: number;
  sessionsTotalSaison: number;
  rangEnfant: number;           // 1 = 1er enfant de la famille pour cette saison
  avecAdhesion: boolean;
  avecLicence: boolean;
  licenceMoins18: boolean;      // true = tarif -18 ans
  tarifs: ForfaitTarifs;
  familyDiscountRules: FamilyDiscountRule[];
  // Fréquence (cours/semaine) DÉJÀ inscrite pour cet enfant cette saison.
  // 0 = première inscription (tarif plein selon `frequence`).
  // > 0 = l'enfant ajoute une/des heure(s) à un forfait existant : on facture
  // le DIFFÉRENTIEL vers la fréquence cumulée — tarif(freqDeja+frequence) −
  // tarif(freqDeja) — au lieu d'un nouveau forfait plein (dégressivité horaire).
  frequenceDejaInscrite?: number;
  /**
   * Remise famille imposée à la main, en pourcentage, qui prend le pas sur le
   * barème — y compris pour le descendre, ou pour en accorder une là où le
   * barème n'en prévoit aucune.
   *
   * Le barème s'arrête au rang prévu dans les paramètres ; une famille de cinq
   * cavaliers qui montent beaucoup sortait de l'échelle sans qu'on puisse rien
   * y faire. `null` ou absent = on suit le barème.
   */
  remisePersonnaliseePercent?: number | null;
}

export interface CalculForfaitResult {
  prixForfaitAnnuelPlein: number;  // tarif plein selon fréquence (avant prorata)
  prorata: number;                 // ratio 0-1
  prixForfaitBrut: number;         // après prorata, avant réduction famille
  familyDiscountPercent: number;
  familyDiscountAmount: number;
  /** Le pourcentage qu'aurait donné le barème seul. */
  remiseBaremePercent: number;
  /** Vrai quand la remise appliquée s'écarte du barème (saisie à la main). */
  remiseHorsBareme: boolean;
  prixForfaitNet: number;          // après réduction famille
  prixAdhesion: number;
  prixLicence: number;
  totalAnnuel: number;             // total à payer
  detailLignes: { label: string; montantTTC: number }[]; // pour affichage/items
}

const LICENCE_MOINS18_DEFAUT = 25;
const LICENCE_PLUS18_DEFAUT = 36;

/**
 * Calcule le prix d'un forfait annuel selon toutes les règles métier.
 */
export function calculerForfaitAnnuel(input: CalculForfaitInput): CalculForfaitResult {
  const {
    frequence, sessionsRestantes, sessionsTotalSaison, rangEnfant,
    avecAdhesion, avecLicence, licenceMoins18, tarifs, familyDiscountRules,
    frequenceDejaInscrite = 0, remisePersonnaliseePercent = null,
  } = input;

  // Tarif plein pour une fréquence donnée (dégressivité horaire 1x/2x/3x),
  // demi-fréquences comprises. Plafonné à 3×/semaine.
  const tarifPourFreq = (f: number): number => tarifPourFrequence(tarifs, f);

  // 1. Prix plein.
  //    - Première inscription (frequenceDejaInscrite = 0) → tarif plein de `frequence`.
  //    - Ajout d'heure(s) → DIFFÉRENTIEL : tarif(freqCumulée) − tarif(freqDéjà),
  //      la fréquence cumulée étant plafonnée à 3×/semaine.
  const freqCumulee = Math.min(3, frequenceDejaInscrite + frequence);
  const ajoutHeure = frequenceDejaInscrite > 0;
  const prixForfaitAnnuelPlein = ajoutHeure
    ? Math.max(0, tarifPourFreq(freqCumulee) - tarifPourFreq(frequenceDejaInscrite))
    : tarifPourFreq(frequence);

  // 2. Prorata (plafonné à 1 si inscription en début de saison)
  const prorata = sessionsTotalSaison > 0
    ? Math.min(1, sessionsRestantes / sessionsTotalSaison)
    : 1;
  const prixForfaitBrut = Math.round(prixForfaitAnnuelPlein * prorata);

  // 3. Dégressivité famille (sur le prix brut). Une remise saisie à la main
  //    prend le pas sur le barème, bornée à l'intervalle 0–100 %.
  const rule = familyDiscountRules.find(r => r.nth === rangEnfant);
  const remiseBaremePercent = rule?.discount || 0;
  const remiseImposee = typeof remisePersonnaliseePercent === "number"
    && Number.isFinite(remisePersonnaliseePercent);
  const familyDiscountPercent = remiseImposee
    ? Math.min(100, Math.max(0, remisePersonnaliseePercent as number))
    : remiseBaremePercent;
  const remiseHorsBareme = remiseImposee && familyDiscountPercent !== remiseBaremePercent;
  const familyDiscountAmount = familyDiscountPercent > 0
    ? Math.round(prixForfaitBrut * familyDiscountPercent / 100 * 100) / 100
    : 0;
  const prixForfaitNet = prixForfaitBrut - familyDiscountAmount;

  // 4. Adhésion dégressive selon le rang
  const prixAdhesion = !avecAdhesion ? 0 :
    rangEnfant === 1 ? tarifs.adhesion1 :
    rangEnfant === 2 ? tarifs.adhesion2 :
    rangEnfant === 3 ? tarifs.adhesion3 :
    tarifs.adhesion4plus;

  // 5. Licence FFE
  const prixLicence = !avecLicence ? 0 :
    (licenceMoins18
      ? (tarifs.licenceMoins18 ?? LICENCE_MOINS18_DEFAUT)
      : (tarifs.licencePlus18 ?? LICENCE_PLUS18_DEFAUT));

  const totalAnnuel = prixAdhesion + prixLicence + prixForfaitNet;

  // Détail des lignes (pour items de paiement + affichage récap)
  const detailLignes: { label: string; montantTTC: number }[] = [];
  if (avecAdhesion) detailLignes.push({ label: `Adhésion annuelle (enfant ${rangEnfant})`, montantTTC: prixAdhesion });
  if (avecLicence) detailLignes.push({ label: `Licence FFE ${licenceMoins18 ? "-18 ans" : "+18 ans"}`, montantTTC: prixLicence });
  detailLignes.push({
    label: ajoutHeure
      ? `Forfait — heure suppl. (passage ${formatFrequence(frequenceDejaInscrite)}×→${formatFrequence(freqCumulee)}×/sem)${prorata < 1 ? ` (prorata ${Math.round(prorata * 100)}%)` : ""}`
      : `Forfait ${formatFrequence(frequence)}×/semaine${prorata < 1 ? ` (prorata ${Math.round(prorata * 100)}%)` : ""}`,
    montantTTC: prixForfaitBrut,
  });
  if (familyDiscountAmount > 0) {
    detailLignes.push({
      label: remiseHorsBareme
        ? `Réduction famille (-${familyDiscountPercent}%)`
        : `Réduction famille (${rangEnfant}e enfant, -${familyDiscountPercent}%)`,
      montantTTC: -familyDiscountAmount,
    });
  }

  return {
    prixForfaitAnnuelPlein,
    prorata,
    prixForfaitBrut,
    familyDiscountPercent,
    familyDiscountAmount,
    remiseBaremePercent,
    remiseHorsBareme,
    prixForfaitNet,
    prixAdhesion,
    prixLicence,
    totalAnnuel,
    detailLignes,
  };
}

/**
 * Déduit la saison FFE (année de début, 1er sept) d'une date.
 * mois >= 8 (sept-déc) → saison Y ; sinon (janv-août) → Y-1.
 */
export function seasonOf(dateInput: string | Date | { seconds: number }): number {
  let d: Date;
  if (typeof dateInput === "string") d = new Date(dateInput);
  else if (dateInput instanceof Date) d = dateInput;
  else if (dateInput && (dateInput as any).seconds) d = new Date((dateInput as any).seconds * 1000);
  else return 0;
  if (isNaN(d.getTime())) return 0;
  return d.getMonth() >= 8 ? d.getFullYear() : d.getFullYear() - 1;
}

/**
 * Indique si une date appartient à la saison "à venir" autorisée pour les
 * inscriptions annuelles en self-service (famille).
 *
 * Règle métier (demande Nicolas) : on bloque les inscriptions annuelles
 * pour la SAISON EN COURS et on n'autorise que la saison suivante (>=
 * septembre 2026 au moment de la mise en place).
 *
 * @param creneauDate date du créneau visé
 * @param minSeasonStartYear année de début de saison minimale autorisée
 *        (ex: 2026 pour n'autoriser que la saison 2026-2027 et après)
 */
export function inscriptionAnnuelleAutorisee(
  creneauDate: string | Date,
  minSeasonStartYear: number,
): boolean {
  return seasonOf(creneauDate) >= minSeasonStartYear;
}
