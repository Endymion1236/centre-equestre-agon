/**
 * Helpers pour détecter automatiquement la prochaine période de stages
 * (Pâques / Été / Toussaint / Noël / Hiver) à partir des créneaux Firestore.
 *
 * Logique : on regarde le MOIS du stage pour déduire la période vacances
 * scolaires correspondante. Les périodes sont génériques (zone B en
 * France pour Agon-Coutainville) et restent valables d'une année sur
 * l'autre sans avoir à hardcoder de dates précises.
 */

export type VacancePeriod =
  | "hiver"      // février
  | "paques"     // avril
  | "ete"        // juillet-août
  | "toussaint"  // octobre
  | "noel"       // décembre
  | "autre";     // hors période scolaire (stage isolé)

export interface PeriodInfo {
  id: VacancePeriod;
  label: string;       // ex : "Stages Pâques 2026"
  shortLabel: string;  // ex : "Stages Pâques"
}

/**
 * Identifie la période vacances correspondant à une date donnée.
 * Basé sur le mois (zone B France, indicatif).
 */
export function detectVacancePeriod(dateStr: string): VacancePeriod {
  // dateStr au format YYYY-MM-DD
  const [_y, m] = dateStr.split("-").map(Number);
  switch (m) {
    case 2:  return "hiver";
    case 4:  return "paques";
    case 7:
    case 8:  return "ete";
    case 10: return "toussaint";
    case 12: return "noel";
    default: return "autre";
  }
}

export function periodLabel(period: VacancePeriod, year: number): PeriodInfo {
  const labels: Record<VacancePeriod, string> = {
    hiver:     "Stages Hiver",
    paques:    "Stages Pâques",
    ete:       "Stages Été",
    toussaint: "Stages Toussaint",
    noel:      "Stages Noël",
    autre:     "Prochains stages",
  };
  const short = labels[period];
  return {
    id: period,
    label: period === "autre" ? short : `${short} ${year}`,
    shortLabel: short,
  };
}

/**
 * Format lisible d'une plage de dates (ex : "du 14 au 18 avril 2026").
 * Si même mois : "du 14 au 18 avril 2026"
 * Si mois différents : "du 28 octobre au 1er novembre 2026"
 * Si même jour : "le 14 avril 2026"
 */
export function formatDateRange(startStr: string, endStr: string): string {
  const [sy, sm, sd] = startStr.split("-").map(Number);
  const [ey, em, ed] = endStr.split("-").map(Number);
  const months = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

  const startDay = sd === 1 ? "1er" : `${sd}`;
  const endDay = ed === 1 ? "1er" : `${ed}`;

  if (sy === ey && sm === em && sd === ed) {
    return `le ${startDay} ${months[sm - 1]} ${sy}`;
  }
  if (sy === ey && sm === em) {
    return `du ${sd} au ${ed} ${months[sm - 1]} ${sy}`;
  }
  return `du ${startDay} ${months[sm - 1]} au ${endDay} ${months[em - 1]} ${ey}`;
}

export interface StageGroup {
  activityTitle: string;     // ex : "Baby Poney"
  startDate: string;         // YYYY-MM-DD
  endDate: string;           // YYYY-MM-DD
  totalPlaces: number;       // somme des maxPlaces
  enrolledCount: number;     // total inscrits
}

export interface NextStagesResult {
  period: PeriodInfo;
  year: number;
  weekRanges: { start: string; end: string }[]; // semaines distinctes
  stages: StageGroup[];                          // par activité (Baby/Bronze/...)
  earliestDate: string;                          // date de la première session
  latestDate: string;                            // date de la dernière session
}

/**
 * À partir d'une liste de créneaux Firestore (avec activityType "stage" ou
 * "stage_journee"), renvoie le groupe correspondant à la prochaine période
 * de vacances qui n'a pas encore commencé. Renvoie null si rien à venir.
 *
 * @param creneaux - Tous les créneaux du planning
 * @param todayStr - Date "aujourd'hui" en heure Paris (YYYY-MM-DD)
 */
export function getNextStagesGrouped(
  creneaux: any[],
  todayStr: string,
): NextStagesResult | null {
  // 1. Filtrer les stages à venir (date >= aujourd'hui)
  const upcoming = creneaux.filter(c => {
    const isStage = c.activityType === "stage" || c.activityType === "stage_journee";
    if (!isStage) return false;
    if (!c.date) return false;
    if (c.status === "closed" || c.status === "cancelled") return false;
    return c.date >= todayStr;
  });

  if (upcoming.length === 0) return null;

  // 2. Pour chaque créneau, calculer sa période
  const withPeriod = upcoming.map(c => ({
    ...c,
    period: detectVacancePeriod(c.date),
    year: parseInt(c.date.split("-")[0], 10),
  }));

  // 3. Trouver la prochaine période : celle dont la première date est la
  //    plus proche dans le temps. On groupe par (period, year) puis on
  //    prend le groupe avec la earliestDate la plus basse.
  const groupsByKey = new Map<string, typeof withPeriod>();
  for (const c of withPeriod) {
    const key = `${c.year}_${c.period}`;
    if (!groupsByKey.has(key)) groupsByKey.set(key, []);
    groupsByKey.get(key)!.push(c);
  }

  // Trouver le groupe avec la plus petite date
  let bestKey: string | null = null;
  let bestDate: string | null = null;
  for (const [key, items] of groupsByKey) {
    const minDate = items.reduce((min, c) => (c.date < min ? c.date : min), items[0].date);
    if (!bestDate || minDate < bestDate) {
      bestDate = minDate;
      bestKey = key;
    }
  }
  if (!bestKey) return null;

  const selected = groupsByKey.get(bestKey)!;
  const [yearStr, periodId] = bestKey.split("_");
  const year = parseInt(yearStr, 10);
  const period = periodLabel(periodId as VacancePeriod, year);

  // 4. Calculer les semaines distinctes (utile pour afficher "Semaines du X au Y et du Z au W")
  //    Une "semaine" = ensemble continu de dates. Pour simplifier, on groupe par
  //    écart < 4 jours entre dates consécutives.
  const uniqueDates = [...new Set(selected.map(c => c.date))].sort();
  const weekRanges: { start: string; end: string }[] = [];
  if (uniqueDates.length > 0) {
    let weekStart = uniqueDates[0];
    let weekEnd = uniqueDates[0];
    for (let i = 1; i < uniqueDates.length; i++) {
      const prev = new Date(weekEnd);
      const curr = new Date(uniqueDates[i]);
      const diffDays = Math.round((curr.getTime() - prev.getTime()) / 86400000);
      if (diffDays <= 4) {
        weekEnd = uniqueDates[i];
      } else {
        weekRanges.push({ start: weekStart, end: weekEnd });
        weekStart = uniqueDates[i];
        weekEnd = uniqueDates[i];
      }
    }
    weekRanges.push({ start: weekStart, end: weekEnd });
  }

  // 5. Regrouper par activityTitle pour afficher les types de stages disponibles
  const stagesByTitle = new Map<string, StageGroup>();
  for (const c of selected) {
    const title = c.activityTitle || "Stage";
    if (!stagesByTitle.has(title)) {
      stagesByTitle.set(title, {
        activityTitle: title,
        startDate: c.date,
        endDate: c.date,
        totalPlaces: 0,
        enrolledCount: 0,
      });
    }
    const g = stagesByTitle.get(title)!;
    if (c.date < g.startDate) g.startDate = c.date;
    if (c.date > g.endDate) g.endDate = c.date;
    g.totalPlaces += c.maxPlaces || 0;
    g.enrolledCount += typeof c.enrolledCount === "number"
      ? c.enrolledCount
      : (c.enrolled || []).length;
  }

  const earliestDate = uniqueDates[0];
  const latestDate = uniqueDates[uniqueDates.length - 1];

  return {
    period,
    year,
    weekRanges,
    stages: [...stagesByTitle.values()].sort((a, b) => a.activityTitle.localeCompare(b.activityTitle)),
    earliestDate,
    latestDate,
  };
}
