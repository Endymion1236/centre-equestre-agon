/**
 * Helpers pour le système de progression FFE.
 *
 * Format Firestore stocké dans `progressions/{childId}_{familyId}.acquis` :
 *
 *   acquis: {
 *     "pb_01": true,                  // domaine "connaissances"/"soins" → binaire
 *     "pb_15": { level: 3 },          // domaine "pratique_*" → échelle 1-5
 *     "pb_18": false,                 // jamais utilisé en pratique (= absent)
 *     "pb_19": true                   // ANCIEN format pratique (rétrocompat) : on
 *                                     // l'interprète comme level: 5 (validé FFE)
 *   }
 *
 * Rétrocompatibilité : avant ce commit, TOUS les domaines stockaient un
 * boolean. Pour les compétences pratiques, un `true` legacy est interprété
 * comme `level: 5` (équivalent acquis = validé FFE). Les nouvelles données
 * écrites en mode pratique utilisent toujours `{ level: number }`.
 *
 * Conversion bilans FFE : une compétence pratique compte comme "validée FFE"
 * si son niveau >= seuil défini dans settings/progression_labels.validatedFfe
 * (par défaut 5). Les autres domaines : true = validé, false = non.
 */

import type { Domaine } from "./galops-programme";

export type AcquisValue = boolean | { level: number };

export type Acquis = Record<string, AcquisValue>;

/**
 * Domaines qui utilisent l'échelle 1-5. Les autres restent en binaire.
 * Modification de cette constante → impact sur ProgressionEditor + espace
 * cavalier + PDF. Centralisation pour ne pas avoir le test partout.
 */
export const DOMAINES_ECHELLE: Set<Domaine> = new Set(["pratique_cheval", "pratique_pied"]);

export function isDomaineEchelle(domaine: Domaine): boolean {
  return DOMAINES_ECHELLE.has(domaine);
}

/**
 * Récupère le niveau (1-5) d'une compétence pratique.
 * Retourne 0 si la compétence n'a pas été touchée.
 *
 * Rétrocompat : si la valeur stockée est `true` (ancien format), on retourne
 * 5 (= validé FFE équivalent). Si `false` ou absent, retourne 0.
 */
export function getCompetenceLevel(value: AcquisValue | undefined): number {
  if (!value) return 0;
  if (value === true) return 5; // legacy
  if (typeof value === "object" && typeof value.level === "number") {
    return Math.max(0, Math.min(5, value.level));
  }
  return 0;
}

/**
 * Compétence binaire : true = validée, false/absent = non.
 * Pour les pratiques en nouveau format, on considère validée si level >= seuil.
 */
export function isCompetenceValidated(
  value: AcquisValue | undefined,
  seuilFFE: number = 5
): boolean {
  if (!value) return false;
  if (value === true) return true;
  if (typeof value === "object" && typeof value.level === "number") {
    return value.level >= seuilFFE;
  }
  return false;
}

/**
 * Labels par défaut de l'échelle 1-5. Surchargeables dans
 * settings/progression_labels (modifiables par l'admin via paramètres).
 *
 * Inspiré du vocabulaire pédagogique FFE :
 * 1 = découverte (ne sait pas faire)
 * 2 = avec aide importante
 * 3 = avec aide ponctuelle
 * 4 = en autonomie occasionnelle
 * 5 = acquis (équivalent "validé" FFE)
 */
export const DEFAULT_ECHELLE_LABELS: string[] = [
  "Découverte",
  "Avec aide",
  "Aide ponctuelle",
  "Autonomie",
  "Acquis",
];

/** Seuil par défaut pour qu'une compétence pratique compte comme "validée FFE" */
export const DEFAULT_VALIDATED_FFE_LEVEL = 5;

export interface ProgressionLabelsSettings {
  echelle: string[]; // 5 entries, indices 0-4 pour niveaux 1-5
  validatedFfe: number; // niveau >= ce seuil = considéré validé FFE
  updatedAt?: any;
  updatedBy?: string;
}

/**
 * Couleurs associées aux niveaux 1-5 (utilisées partout pour cohérence visuelle).
 * Progression du rouge (1) au vert (5).
 */
export const LEVEL_COLORS: string[] = [
  "#fee2e2", // 1 - rouge clair
  "#fed7aa", // 2 - orange clair
  "#fef3c7", // 3 - jaune clair
  "#d1fae5", // 4 - vert clair
  "#86efac", // 5 - vert
];

export const LEVEL_COLORS_BORDER: string[] = [
  "#ef4444", // 1
  "#f97316", // 2
  "#eab308", // 3
  "#10b981", // 4
  "#16a34a", // 5
];
