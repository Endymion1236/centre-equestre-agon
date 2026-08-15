/**
 * src/app/espace-cavalier/inscription-annuelle/creneaux.ts
 *
 * Reconstitution des cours hebdomadaires à partir des créneaux datés, et
 * filtrage de ceux qu'on a le droit de proposer à la famille.
 *
 * Un cours à l'année n'existe pas comme tel en base : il n'y a que des créneaux
 * datés, un par semaine. Ces fonctions les regroupent en « le mercredi 10h avec
 * Untel », qui est ce que la famille choisit réellement. Le regroupement porte
 * deux garde-fous qui ont chacun coûté un bug, détaillés au-dessus des
 * fonctions concernées : la clé de regroupement inclut la saison, et un slot
 * déjà pris par l'enfant n'est plus proposé.
 *
 * Fonctions PURES, sorties de `page.tsx` : elles reçoivent les créneaux et le
 * panier en paramètres, ne lisent pas Firestore et ne rendent rien.
 */

import { compareCreneauxByDow } from "@/lib/creneau-sort";
import { seasonOf } from "@/lib/forfait-pricing";
import { dayLabels, MIN_SEASON_INSCRIPTION } from "./constantes";
import type { Creneau, PanierItem, WeeklySlot, WeeklySlotAvecSaison } from "./types";

/**
 * Group creneaux into weekly recurring slots.
 * IMPORTANT : la clé inclut la SAISON (seasonOf) pour ne pas fusionner un
 * même cours de deux saisons differentes (ex: Galop d'or mercredi 10h qui
 * existe en 2025-2026 ET 2026-2027). Sans ça, totalSessions cumulait les
 * occurrences des deux saisons -> comptage et prorata faux.
 */
export function construireWeeklySlots(creneaux: Creneau[]): WeeklySlotAvecSaison[] {
  const map: Record<string, WeeklySlot & { season: number }> = {};
  for (const c of creneaux) {
    const d = new Date(c.date);
    const dow = (d.getDay() + 6) % 7;
    const season = seasonOf(c.date);
    const key = `${c.activityId}-${dow}-${c.startTime}-S${season}`;
    if (!map[key]) {
      map[key] = {
        key, activityId: c.activityId, activityTitle: c.activityTitle,
        dayOfWeek: dow, dayLabel: dayLabels[dow],
        startTime: c.startTime, endTime: c.endTime,
        monitor: c.monitor, maxPlaces: c.maxPlaces,
        totalSessions: 0, avgEnrolled: 0, spotsAvailable: 0, creneauIds: [],
        priceTTC: c.priceTTC || ((c.priceHT || 0) * (1 + (c.tvaTaux || 5.5) / 100)),
        season,
      };
    }
    map[key].totalSessions++;
    map[key].creneauIds.push(c.id);
    const enrolled = c.enrolled?.length || 0;
    map[key].avgEnrolled = Math.max(map[key].avgEnrolled, enrolled);
  }
  for (const slot of Object.values(map)) {
    slot.spotsAvailable = slot.maxPlaces - slot.avgEnrolled;
  }
  return Object.values(map).sort(compareCreneauxByDow);
}

/** Clés des slots déjà mis au panier pour l'enfant en cours d'inscription. */
export function slotKeysDuPanierPourEnfant(panier: PanierItem[], selectedChild: string): Set<string> {
  const s = new Set<string>();
  panier.forEach(p => { if (p.childId === selectedChild) p.slotKeys.forEach(k => s.add(k)); });
  return s;
}

/**
 * Un slot est "déjà pris" si l'enfant sélectionné est déjà inscrit sur l'un
 * de ses créneaux (en base) OU si ce slot est déjà dans le panier pour cet
 * enfant. Évite la double inscription au MÊME cours (doublon créneau).
 */
export function estSlotDejaPris(slot: any, params: {
  selectedChild: string;
  slotKeysPanier: Set<string>;
  creneaux: Creneau[];
}): boolean {
  const { selectedChild, slotKeysPanier, creneaux } = params;
  if (!selectedChild) return false;
  if (slotKeysPanier.has(slot.key)) return true;
  return (slot.creneauIds || []).some((cid: string) => {
    const cr = creneaux.find(c => c.id === cid);
    return (cr?.enrolled || []).some((e: any) => e.childId === selectedChild);
  });
}

/**
 * Slots proposables à la famille, filtrés par la recherche libre.
 *
 * BLOCAGE SAISON (étape 3) : on n'affiche QUE les créneaux dont la saison
 * est >= MIN_SEASON_INSCRIPTION. Les inscriptions annuelles self-service
 * sont fermées pour la saison en cours, ouvertes seulement à partir de
 * septembre 2026. On regarde la date du 1er créneau de chaque slot.
 */
export function filtrerSlots(params: {
  weeklySlots: WeeklySlotAvecSaison[];
  slotSearch: string;
  selectedChild: string;
  slotKeysPanier: Set<string>;
  creneaux: Creneau[];
}): WeeklySlotAvecSaison[] {
  const { weeklySlots, slotSearch, selectedChild, slotKeysPanier, creneaux } = params;
  const autorises = weeklySlots.filter(s => (s as any).season >= MIN_SEASON_INSCRIPTION
    && !estSlotDejaPris(s, { selectedChild, slotKeysPanier, creneaux }));
  if (!slotSearch.trim()) return autorises;
  const q = slotSearch.toLowerCase();
  return autorises.filter(s =>
    s.activityTitle.toLowerCase().includes(q) ||
    s.dayLabel.toLowerCase().includes(q) ||
    s.startTime.includes(q) ||
    s.monitor.toLowerCase().includes(q)
  );
}
