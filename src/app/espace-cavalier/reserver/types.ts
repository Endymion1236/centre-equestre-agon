/** Types partagés de la réservation en ligne (page, panier, ajout, paiement). */
import type { NiveauPromenade } from "@/lib/promenade-niveau";
import type { IdFormule } from "@/lib/creneau-sur-demande";

/** Un créneau tel que l'écran de réservation le manipule. */
export interface Creneau {
  id: string; activityId: string; activityTitle: string; activityType: string;
  date: string; startTime: string; endTime: string; monitor: string;
  maxPlaces: number; enrolled: any[]; enrolledCount: number;
  priceHT: number; priceTTC?: number; tvaTaux: number;
}

export interface CartItem {
  creneauIds: string[];
  activityTitle: string;
  dates: string;
  childId: string;
  childName: string;
  prixBase: number;
  remiseEuros: number;
  rang: number;
  prixFinal: number;
  isStage: boolean;
  niveauPromenade?: NiveauPromenade;
  /** Créneau sur demande : formule choisie (anniversaire, cours particulier). */
  formuleSurDemande?: IdFormule;
  /** Cavalier lié : famille d'origine. */
  sourceFamilyId?: string;
  /** Séance prise sur une carte de séances : rien à payer. */
  cardId?: string;
  carteLabel?: string;
}
