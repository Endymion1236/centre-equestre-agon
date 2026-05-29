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

export interface CalculForfaitInput {
  frequence: 1 | 2 | 3;
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
}

export interface CalculForfaitResult {
  prixForfaitAnnuelPlein: number;  // tarif plein selon fréquence (avant prorata)
  prorata: number;                 // ratio 0-1
  prixForfaitBrut: number;         // après prorata, avant réduction famille
  familyDiscountPercent: number;
  familyDiscountAmount: number;
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
    frequenceDejaInscrite = 0,
  } = input;

  // Tarif plein pour une fréquence donnée (dégressivité horaire 1x/2x/3x).
  // Plafonné à 3×/semaine (au-delà, tarif 3x).
  const tarifPourFreq = (f: number): number => {
    if (f <= 0) return 0;
    if (f === 1) return tarifs.forfait1x;
    if (f === 2) return tarifs.forfait2x;
    return tarifs.forfait3x;
  };

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

  // 3. Dégressivité famille (sur le prix brut)
  const rule = familyDiscountRules.find(r => r.nth === rangEnfant);
  const familyDiscountPercent = rule?.discount || 0;
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
      ? `Forfait — heure suppl. (passage ${frequenceDejaInscrite}×→${freqCumulee}×/sem)${prorata < 1 ? ` (prorata ${Math.round(prorata * 100)}%)` : ""}`
      : `Forfait ${frequence}×/semaine${prorata < 1 ? ` (prorata ${Math.round(prorata * 100)}%)` : ""}`,
    montantTTC: prixForfaitBrut,
  });
  if (familyDiscountAmount > 0) {
    detailLignes.push({
      label: `Réduction famille (${rangEnfant}e enfant, -${familyDiscountPercent}%)`,
      montantTTC: -familyDiscountAmount,
    });
  }

  return {
    prixForfaitAnnuelPlein,
    prorata,
    prixForfaitBrut,
    familyDiscountPercent,
    familyDiscountAmount,
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
