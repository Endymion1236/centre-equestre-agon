/**
 * src/app/espace-cavalier/inscription-annuelle/types.ts
 *
 * Formes de données du parcours d'inscription à l'année côté familles.
 *
 * Ces types étaient déclarés en tête de `page.tsx`, et `PanierItem` vivait même
 * À L'INTÉRIEUR du composant. Ils en sortent parce qu'ils circulent maintenant
 * entre l'orchestrateur, les écrans d'étape et le module qui écrit dans
 * Firestore : une seule définition partagée évite qu'un `any` s'installe à la
 * frontière entre deux fichiers, exactement là où se jouent le prix facturé et
 * l'identité du cavalier inscrit.
 *
 * `PanierItem` porte volontairement des prix DÉJÀ calculés (totalAnnuel,
 * prixAdhesion, prixLicence, prixForfaitNet, detailLignes) ainsi que le rang de
 * l'enfant et la saison visée : tout cela est figé au moment de l'ajout au
 * panier et n'est jamais recalculé au paiement. C'est ce qui garantit qu'un
 * enfant ajouté en 2e position reste facturé au tarif « 2e enfant » même si un
 * autre enfant est retiré du panier ensuite.
 */

/** Un créneau tel que stocké dans la collection `creneaux`. */
export interface Creneau {
  id: string;
  activityId: string;
  activityTitle: string;
  activityType: string;
  date: string;
  startTime: string;
  endTime: string;
  monitor: string;
  maxPlaces: number;
  enrolled: any[];
  priceTTC?: number;
  priceHT?: number;
  tvaTaux?: number;
}

/**
 * Un cours hebdomadaire reconstitué : toutes les occurrences d'un même cours,
 * même jour et même heure, regroupées en une seule ligne à choisir.
 */
export interface WeeklySlot {
  key: string;
  activityId: string;
  activityTitle: string;
  dayOfWeek: number;
  dayLabel: string;
  startTime: string;
  endTime: string;
  monitor: string;
  maxPlaces: number;
  totalSessions: number;
  avgEnrolled: number;
  spotsAvailable: number;
  creneauIds: string[];
  priceTTC: number;
}

/**
 * Un slot hebdomadaire avec la saison à laquelle il appartient. La saison sert
 * à filtrer les créneaux proposés (self-service ouvert à partir d'une saison
 * donnée seulement) — voir MIN_SEASON_INSCRIPTION.
 */
export type WeeklySlotAvecSaison = WeeklySlot & { season: number };

/** Ce qu'on retient d'un slot une fois l'inscription mise au panier. */
export interface SlotInfo {
  activityTitle: string;
  dayLabel: string;
  startTime: string;
  endTime: string;
  totalSessions: number;
  creneauIds: string[];
}

/**
 * PANIER multi-enfants.
 * Chaque entrée = une inscription d'enfant validée mais pas encore payée.
 * Permet d'inscrire plusieurs enfants d'une fratrie puis de payer en
 * une seule fois (avec dégressivité famille appliquée au bon rang).
 */
export interface PanierItem {
  childId: string;
  childName: string;
  forfaitType: "1x" | "2x" | "3x";
  frequence: 1 | 2 | 3;
  slotKeys: string[];
  creneauIds: string[];
  slotsInfo: SlotInfo[];
  avecAdhesion: boolean;
  avecLicence: boolean;
  licenceMoins18: boolean;
  rangEnfant: number;          // rang figé au moment de l'ajout au panier
  seasonStartYear?: number;    // saison visée (pour détection licence/adhésion cross-panier)
  frequenceDejaInscrite?: number; // heures/sem déjà inscrites (>0 = forfait complément)
  totalAnnuel: number;
  detailLignes: { label: string; montantTTC: number }[];
  prixAdhesion: number;
  prixLicence: number;
  prixForfaitNet: number;
}

/** Moyen de règlement choisi par la famille au récapitulatif. */
export type MoyenPaiement = "cb" | "cheque" | "especes";

/** Échéancier choisi : tout de suite, en 3 fois ou en 10 fois. */
export type PaymentPlan = "1x" | "3x" | "10x";

/**
 * Ce que les actions d'inscription utilisent de la session `useAuth()`.
 * Types structurels volontairement minimaux : le module d'écriture Firestore
 * n'a pas besoin de connaître tout l'objet Family ni tout l'objet User.
 */
export type UtilisateurSession = { uid: string; email: string | null };
export type FamilleSession = { id?: string; parentName: string; parentEmail: string };
