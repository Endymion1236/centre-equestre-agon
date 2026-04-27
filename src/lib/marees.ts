/**
 * Helper pour les marées à Pointe d'Agon (référence officielle SHOM la plus
 * proche d'Agon-Coutainville). Données stockées en local (pas d'API tierce).
 *
 * Mise à jour annuelle : importer les données depuis maree.shom.fr/harbor/POINTE_D_AGON
 * via l'outil de saisie dans /admin/parametres > Marées.
 */

export type MareeType = "PM" | "BM";

export interface Maree {
  type: MareeType;       // "PM" = pleine mer, "BM" = basse mer
  time: string;          // "HH:MM" en heure légale française
  height: number;        // hauteur en mètres au zéro hydrographique
  coef?: number;         // coefficient (uniquement pour PM, valeurs 20-120)
}

/**
 * Récupère les marées du jour donné, ou null si la date n'est pas couverte
 * par les données chargées.
 *
 * @param dateStr Date au format ISO "YYYY-MM-DD"
 */
export async function getMareesForDate(dateStr: string): Promise<Maree[] | null> {
  // Import dynamique pour éviter de charger le bundle des données partout
  const { MAREES_POINTE_AGON_2026 } = await import("./marees-data");
  const data = MAREES_POINTE_AGON_2026[dateStr];
  return data || null;
}

/**
 * Renvoie un libellé court pour une marée, ex: "PM 14h32 · 12,3 m · coef 95"
 */
export function formatMareeShort(m: Maree): string {
  const h = m.time.replace(":", "h");
  const hauteur = m.height.toFixed(2).replace(".", ",");
  const coefPart = m.coef ? ` · coef ${m.coef}` : "";
  return `${m.type} ${h} · ${hauteur} m${coefPart}`;
}

/**
 * Catégorise un coefficient pour la couleur d'affichage.
 * Source : terminologie SHOM standard.
 */
export function getMareeIntensity(coef?: number): "morte-eau" | "moyenne" | "vive-eau" | "grande-maree" | null {
  if (!coef) return null;
  if (coef < 45) return "morte-eau";
  if (coef < 70) return "moyenne";
  if (coef < 100) return "vive-eau";
  return "grande-maree";
}
