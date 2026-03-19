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
