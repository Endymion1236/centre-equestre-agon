/**
 * src/app/espace-cavalier/inscription-annuelle/constantes.ts
 *
 * Valeurs de repli, verrou de saison et libellés du parcours d'inscription
 * annuelle côté familles.
 *
 * Pourquoi les sortir de `page.tsx` : au milieu de 1400 lignes, TARIFS_DEFAUT
 * se lisait comme la grille tarifaire officielle du club. Ce n'en est pas une :
 * ce sont des REPLIS, affichés le temps que Firestore réponde ou quand le
 * document settings/inscription n'existe pas encore. La source de vérité des
 * prix est Firestore, comme dans l'espace admin — c'est ce qui garantit qu'une
 * famille et le centre voient le même montant.
 *
 * MIN_SEASON_INSCRIPTION est le seul endroit qui décide quelle saison est
 * ouverte au self-service. Le déplacer ici le rend visible : c'est une valeur
 * à réviser chaque année, pas une constante technique.
 */

import type { ForfaitTarifs } from "@/lib/forfait-pricing";

// Saison minimale autorisée pour les inscriptions annuelles en self-service.
// Règle métier : on bloque la saison en cours, on n'ouvre qu'à partir de
// septembre 2026 (saison 2026-2027). À ajuster chaque année si besoin (ou
// à terme : lire depuis settings).
export const MIN_SEASON_INSCRIPTION = 2026;

// Tarifs par défaut (fallback si settings/inscription absent). Alignés sur
// EnrollPanel. La source réelle est Firestore settings/inscription.
export const TARIFS_DEFAUT: ForfaitTarifs = {
  forfait1x: 650, forfait2x: 1100, forfait3x: 1400,
  adhesion1: 60, adhesion2: 40, adhesion3: 20, adhesion4plus: 0,
  licenceMoins18: 25, licencePlus18: 36,
};
export const TOTAL_SESSIONS_SAISON_DEFAUT = 35;

/** Jours de la semaine, indexés lundi = 0 (comme le `dayOfWeek` des slots). */
export const dayLabels = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];

/** Étapes du parcours annuel, affichées dans la barre de progression. */
export const ETAPES_ANNUEL = [
  { num: 1, label: "Cavalier" },
  { num: 2, label: "Prérequis" },
  { num: 3, label: "Forfait" },
  { num: 4, label: "Créneaux" },
  { num: 5, label: "Récapitulatif" },
];

/** Étapes du parcours ponctuel (séance à l'unité). */
export const ETAPES_PONCTUEL = [
  { num: 1, label: "Cavalier" },
  { num: 2, label: "Créneau" },
  { num: 3, label: "Paiement" },
];
