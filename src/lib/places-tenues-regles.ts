/**
 * src/lib/places-tenues-regles.ts — quels créneaux un paiement confirme.
 *
 * Octobre 2026 : un enfant inscrit au stage lundi et mardi, réglé pour ces
 * deux jours, se retrouvait inscrit toute la semaine dès l'encaissement. La
 * confirmation des places étendait chaque créneau de stage de la commande à
 * TOUS les jours de la semaine portant le même titre (filet prévu pour
 * d'anciennes commandes qui ne désignaient que le 1er jour), puis RECRÉAIT
 * l'inscription partout où l'enfant n'était pas. Elle prenait même le stage
 * du même nom à un autre horaire.
 *
 * Règles :
 *   - une inscription n'est recréée que sur un créneau que la commande
 *     désigne elle-même (creneauIds / creneauId) ;
 *   - le filet d'extension ne fait que confirmer une place DÉJÀ tenue, et
 *     seulement aux dates que la ligne annonce (stageDates), à la même heure.
 *
 * Pur, testé seul (tests/unit/places-tenues-regles.test.ts).
 */

export interface LignePlaces {
  childId?: string;
  creneauId?: string;
  creneauIds?: string[];
  stageDates?: { date?: string; startTime?: string }[];
}

/** Créneaux désignés par la commande → cavaliers, et dates annoncées par cavalier. */
export function ciblesDeCommande(items: LignePlaces[] | undefined): {
  explicites: Map<string, Set<string>>;
  datesParEnfant: Map<string, Set<string>>;
} {
  const explicites = new Map<string, Set<string>>();
  const datesParEnfant = new Map<string, Set<string>>();
  for (const item of items || []) {
    const ids = Array.isArray(item?.creneauIds) && item.creneauIds.length ? item.creneauIds : item?.creneauId ? [item.creneauId] : [];
    for (const cid of ids) {
      if (!cid) continue;
      if (!explicites.has(cid)) explicites.set(cid, new Set());
      if (item.childId) explicites.get(cid)!.add(item.childId);
    }
    if (item?.childId) {
      for (const d of item.stageDates || []) {
        if (!d?.date) continue;
        if (!datesParEnfant.has(item.childId)) datesParEnfant.set(item.childId, new Set());
        datesParEnfant.get(item.childId)!.add(d.date);
      }
    }
  }
  return { explicites, datesParEnfant };
}

/**
 * Jours frères d'un créneau de stage où ce cavalier a une place à confirmer :
 * même horaire, et seulement aux dates que sa ligne annonce. Sans dates
 * annoncées, aucun.
 */
export function freresAConfirmer(
  ref: { id: string; startTime?: string },
  freres: { id: string; date?: string; startTime?: string }[],
  datesAnnoncees: Set<string> | undefined,
): string[] {
  if (!datesAnnoncees || datesAnnoncees.size === 0) return [];
  return freres
    .filter((f) => f.id !== ref.id && !!f.date && datesAnnoncees.has(f.date) && (f.startTime || "") === (ref.startTime || ""))
    .map((f) => f.id);
}

/** Une place disparue se recrée-t-elle au paiement ? Seulement pour une commande passée en ligne. */
export function recreerSiAbsent(commande: { source?: string } | null | undefined): boolean {
  return commande?.source === "client";
}
