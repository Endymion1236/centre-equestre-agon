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
 * Récupère les marées du jour donné, ou null si la date n'est pas couverte.
 *
 * Lookup en cascade :
 *   1. Cache mémoire (chargé depuis Firestore au premier appel)
 *   2. Données locales (fichier marees-data.ts) en fallback
 *
 * @param dateStr Date au format ISO "YYYY-MM-DD"
 */

// Cache mémoire global (re-fetch au reload de page)
let mareesCache: Record<string, Maree[]> | null = null;
let cachePromise: Promise<Record<string, Maree[]>> | null = null;

async function loadAllMareesFromFirestore(): Promise<Record<string, Maree[]>> {
  if (mareesCache) return mareesCache;
  if (cachePromise) return cachePromise;

  cachePromise = (async () => {
    try {
      const { collection, getDocs } = await import("firebase/firestore");
      const { db } = await import("./firebase");
      const snap = await getDocs(collection(db, "marees"));
      const out: Record<string, Maree[]> = {};
      snap.forEach(doc => {
        const data = doc.data() as { marees?: Maree[] };
        if (data.marees && Array.isArray(data.marees)) {
          out[doc.id] = data.marees;
        }
      });
      mareesCache = out;
      return out;
    } catch (e) {
      console.warn("[marees] Firestore unavailable, using local fallback:", e);
      mareesCache = {};
      return {};
    }
  })();

  return cachePromise;
}

/**
 * Vide le cache pour forcer un rechargement au prochain appel.
 * À appeler après une modification (saisie en masse, suppression).
 */
export function invalidateMareesCache() {
  mareesCache = null;
  cachePromise = null;
}

export async function getMareesForDate(dateStr: string): Promise<Maree[] | null> {
  // 1. Tenter Firestore d'abord
  const fromFirestore = await loadAllMareesFromFirestore();
  if (fromFirestore[dateStr]) return fromFirestore[dateStr];

  // 2. Fallback sur les données locales (3-4 jours seed dans marees-data.ts)
  const { MAREES_POINTE_AGON_2026 } = await import("./marees-data");
  return MAREES_POINTE_AGON_2026[dateStr] || null;
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
