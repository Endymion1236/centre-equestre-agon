/**
 * src/app/admin/forfaits/types.ts
 *
 * Les formes de données manipulées par l'écran « Forfaits annuels » :
 * ce qui est lu dans Firestore (forfait, paiement, créneau) et ce qui n'existe
 * qu'à l'écran (créneau hebdomadaire agrégé, créneau réel détecté, état de la
 * modale de changement de créneau).
 *
 * Pourquoi séparé : ces types sont partagés par l'orchestrateur (page.tsx),
 * les calculs purs (calculs.ts), les écritures Firestore (actions.ts) et les
 * trois sous-composants. Les laisser dans page.tsx obligeait chaque nouveau
 * fichier à importer depuis l'écran lui-même, ce qui crée des dépendances
 * circulaires dès qu'un composant a besoin d'un type.
 *
 * Attention : un forfait porte AUSSI, en base, des champs non déclarés ici
 * (`seasonStartYear`, `frequence`, `creneauIds`…) — le code historique y accède
 * via `(f as any)`. On garde ce comportement tel quel : élargir l'interface
 * changerait le typage de code métier qu'on ne veut pas toucher ici.
 */

export interface Forfait {
  id: string;
  familyId: string;
  familyName: string;
  childId: string;
  childName: string;
  slotKey: string;
  activityTitle: string;
  dayLabel: string;
  startTime: string;
  endTime: string;
  totalSessions: number;
  attendedSessions: number;
  licenceFFE: boolean;
  licenceType: string;
  adhesion: boolean;
  forfaitPriceTTC: number;
  totalPaidTTC: number;
  paymentPlan: string;
  status: "active" | "actif" | "suspended" | "completed" | "cancelled";
  createdAt: any;
}

export interface Payment {
  id: string;
  familyId: string;
  totalTTC: number;
  paidAmount: number;
  status: string;
  items: any[];
  date: any;
}

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
 * Un « créneau hebdomadaire » : l'agrégation de toutes les séances de la
 * saison qui tombent le même jour, à la même heure, pour la même activité.
 * C'est l'unité à laquelle on inscrit un cavalier à l'année (le forfait porte
 * un rendez-vous hebdomadaire, pas une liste de dates).
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
 * Créneau réellement suivi par un cavalier, reconstitué depuis les
 * inscriptions présentes dans `creneaux.enrolled` (voir
 * `detecteCreneauxReels` dans calculs.ts). `isPrincipal` marque celui que le
 * document forfait connaît via son `slotKey`.
 */
export interface CreneauReel {
  key: string;
  dayLabel: string;
  startTime: string;
  endTime: string;
  activityTitle: string;
  count: number;
  isPrincipal: boolean;
}

/**
 * Ancien créneau visé par un changement ciblé.
 * S'il est absent, le changement porte sur TOUS les créneaux du forfait
 * (comportement historique des forfaits 1×/semaine).
 */
export interface AncienCreneau {
  dayOfWeek: number;
  startTime: string;
  activityTitle: string;
}

/** État de la modale « Changer de créneau » (null = modale fermée). */
export interface EtatChangementCreneau {
  forfait: Forfait;
  newSlotSearch: string;
  oldSlot?: AncienCreneau;
}

/** Règle de dégressivité famille lue dans `settings/degressivite`. */
export interface RegleReductionFamille {
  nth: number;
  discount: number;
}
