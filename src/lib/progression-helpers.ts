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
 *
 * Note rétrocompat : passer un domaine de binaire à échelle ne perd pas les
 * données. Les anciennes valeurs `true` sont interprétées comme level: 5
 * (cf getCompetenceLevel), donc une compétence soins déjà validée reste
 * affichée "Acquis" (niveau 5).
 */
export const DOMAINES_ECHELLE: Set<Domaine> = new Set(["pratique_cheval", "pratique_pied", "soins"]);

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

/**
 * Calcule la "progression globale" d'une liste de compétences.
 * Différent du pourcentage de validation FFE :
 *
 * - Pour une compétence pratique (échelle 1-5) :
 *   level / 5 → ex. niveau 3 = 60% de progression
 * - Pour une compétence binaire :
 *   true = 100%, absent = 0%
 *
 * Retourne un nombre entre 0 et 100 (déjà arrondi).
 *
 * Différence avec le calcul "validé FFE" :
 * - Validé FFE = combien de compétences atteignent le seuil (binaire)
 * - Progression = à quel point l'apprentissage avance (continu)
 *
 * Exemple : un cavalier à niveau 4/5 partout en pratique aurait :
 * - 0% validé FFE (seuil = 5, jamais atteint)
 * - 80% de progression (4/5 sur chaque)
 *
 * @param items - Liste { id, domaine } des compétences à évaluer
 * @param acquis - Map des valeurs stockées
 */
export function computeProgressionPercent(
  items: { id: string; domaine: Domaine }[],
  acquis: Acquis
): number {
  if (items.length === 0) return 0;
  let totalScore = 0;
  for (const c of items) {
    const v = acquis[c.id];
    if (isDomaineEchelle(c.domaine)) {
      // Pratique : level / 5 (max 1.0)
      totalScore += getCompetenceLevel(v) / 5;
    } else {
      // Binaire : true = 1, absent = 0
      totalScore += v === true ? 1 : 0;
    }
  }
  return Math.round((totalScore / items.length) * 100);
}

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
