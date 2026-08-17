// ═══ Calendrier scolaire et forfaits ═══

// Périodes de vacances scolaires 2025-2026 (Zone B — Normandie)
export const SCHOOL_HOLIDAYS_2025_2026 = [
  { name: "Toussaint", start: "2025-10-18", end: "2025-11-03" },
  { name: "Noël", start: "2025-12-20", end: "2026-01-05" },
  { name: "Hiver", start: "2026-02-07", end: "2026-02-23" },
  { name: "Printemps", start: "2026-04-11", end: "2026-04-27" },
  { name: "Été", start: "2026-07-04", end: "2026-09-01" },
];

// Saison équestre = septembre à juin
export const SEASON_2025_2026 = {
  start: "2025-09-01",
  end: "2026-06-30",
  label: "Saison 2025-2026",
};

// Fermeture hivernale
export const WINTER_CLOSURE = {
  start: "2025-12-15",
  end: "2026-02-28",
};

// Prérequis pour les cours à l'année
export const ANNUAL_PREREQUISITES = {
  licenceFFE: {
    label: "Licence FFE",
    description: "Obligatoire pour tous les cavaliers pratiquant en club",
    price: 25, // Prix TTC (refacturé, TVA 0%)
    accountCode: "70100000",
  },
  adhesion: {
    label: "Adhésion au club",
    description: "Cotisation annuelle au Centre Équestre d'Agon-Coutainville",
    price: 50, // Prix TTC
    accountCode: "70611110",
    tvaTaux: 5.5,
  },
};

// ═══ Statut d'un forfait ═══
// Deux orthographes coexistent en base : "actif" (inscription en ligne des
// familles, avoirs, créations récentes) et "active" (créations depuis l'admin
// jusqu'à cette correction). Un forfait écrit "active" était invisible pour
// l'espace famille : licence et adhésion re-facturées, heure supplémentaire
// vendue à plein tarif au lieu du différentiel, garde anti-double-inscription
// contournée.
//
// On écrit désormais "actif" partout, et on lit les deux — les forfaits déjà
// enregistrés en "active" restent valides sans migration.
// Un forfait sans statut est considéré actif (comportement historique).
export const FORFAIT_STATUT_ACTIF = "actif";

export function isForfaitActif(status?: string | null): boolean {
  return !status || status === "actif" || status === "active";
}

/**
 * Rang de l'enfant dans sa famille pour une saison : 1er, 2e, 3e…
 *
 * Sert à la réduction fratrie. On compte les AUTRES enfants de la famille
 * ayant un forfait actif sur la même saison, et on ajoute 1.
 *
 * Deux filtres décident du montant facturé :
 *   - le statut : un forfait annulé ne compte plus. Sans ce filtre, un aîné
 *     désinscrit continuait de faire passer le cadet en 2e enfant, avec la
 *     réduction indue qui va avec ;
 *   - la saison : les saisons ne se mélangent pas, sinon le rang gonflerait
 *     d'année en année.
 *
 * @param forfaits    forfaits connus (base et/ou panier en cours)
 * @param childId     enfant pour lequel on calcule le rang (exclu du compte)
 * @param saison      année de début de la saison visée
 * @param saisonDe    lit la saison d'un forfait (champ dédié ou date de création)
 */
export function rangEnfantPourSaison(
  forfaits: { childId?: string | null; status?: string | null; seasonStartYear?: number; createdAt?: unknown }[],
  childId: string,
  saison: number,
  saisonDe: (f: { seasonStartYear?: number; createdAt?: unknown }) => number,
): number {
  const autresEnfants = new Set<string>();
  for (const f of forfaits) {
    if (!f.childId || f.childId === childId) continue;
    if (!isForfaitActif(f.status)) continue;
    if (saisonDe(f) !== saison) continue;
    autresEnfants.add(f.childId);
  }
  return autresEnfants.size + 1;
}

// Calcul du nombre de séances dans une période
export function countSessionsInPeriod(
  startDate: string,
  endDate: string,
  dayOfWeek: number, // 0=Lun, 1=Mar, 2=Mer, 3=Jeu, 4=Ven, 5=Sam, 6=Dim
  holidays: { start: string; end: string }[]
): number {
  let count = 0;
  const current = new Date(startDate);
  const end = new Date(endDate);

  while (current <= end) {
    const dow = (current.getDay() + 6) % 7; // 0=Lun
    if (dow === dayOfWeek) {
      // Check if in holidays
      const dateStr = current.toISOString().split("T")[0];
      const inHoliday = holidays.some(
        (h) => dateStr >= h.start && dateStr <= h.end
      );
      if (!inHoliday) count++;
    }
    current.setDate(current.getDate() + 1);
  }
  return count;
}

// Calcul du prorata pour une arrivée en cours d'année
export function calculateProrata(
  enrollDate: string,
  seasonEnd: string,
  dayOfWeek: number,
  holidays: { start: string; end: string }[],
  annualPriceTTC: number
): { sessions: number; totalSessions: number; priceTTC: number; perSessionTTC: number } {
  // Total sessions for the full season
  const totalSessions = countSessionsInPeriod(
    SEASON_2025_2026.start,
    seasonEnd,
    dayOfWeek,
    holidays
  );

  // Remaining sessions from enrollment date
  const sessions = countSessionsInPeriod(
    enrollDate,
    seasonEnd,
    dayOfWeek,
    holidays
  );

  const perSessionTTC = totalSessions > 0 ? annualPriceTTC / totalSessions : 0;
  const priceTTC = Math.round(sessions * perSessionTTC * 100) / 100;

  return { sessions, totalSessions, priceTTC, perSessionTTC: Math.round(perSessionTTC * 100) / 100 };
}
