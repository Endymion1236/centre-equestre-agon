export type SortMode = "retard" | "prochaine" | "alpha";

export interface EcheanceFilters {
  search?: string;
  onlyOverdue?: boolean;
  sortMode?: SortMode;
}

export interface EcheancesStats {
  totalThisMonth: number;
  countThisMonth: number;
  totalOverdue: number;
  countOverdue: number;
  totalThreeMonths: number;
  countThreeMonths: number;
  nbFamilies: number;
}

export interface EcheancierEntry {
  key: string;
  echs: any[];
  familyName: string;
  hasOverdue: boolean;
  overdueCount: number;
  nextEchDate: string;
}

function dateIsoLocale(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function todayIso(now = new Date()): string {
  return dateIsoLocale(now);
}

export function estEcheanceSepa(payment: any): boolean {
  return payment?.paymentMode === "prelevement_sepa" || payment?.status === "sepa_scheduled";
}

export function computeDefaultDate(echeanceDate?: string, today = todayIso()): string {
  if (!echeanceDate) return today;
  return echeanceDate < today ? echeanceDate : today;
}

export function preparerEcheanciers(
  payments: any[],
  filters: EcheanceFilters = {},
  today = todayIso(),
): { groupesList: [string, any[]][]; statsRecap: EcheancesStats; hasOverdue: boolean } {
  const [year, month, day] = today.split("-").map(Number);
  const todayDate = new Date(year, month - 1, day, 12, 0, 0);
  const monthEnd = dateIsoLocale(new Date(year, month, 0, 12, 0, 0));
  const threeMonthsEnd = dateIsoLocale(new Date(year, month - 1 + 3, day, 12, 0, 0));

  const echeances = payments.filter((payment) =>
    Number(payment?.echeancesTotal || 0) > 1 &&
    !estEcheanceSepa(payment) &&
    payment?.status !== "cancelled",
  );

  let totalThisMonth = 0;
  let countThisMonth = 0;
  let totalOverdue = 0;
  let countOverdue = 0;
  let totalThreeMonths = 0;
  let countThreeMonths = 0;

  for (const echeance of echeances) {
    if (echeance.status === "paid") continue;
    const date = echeance.echeanceDate;
    if (!date) continue;
    const amount = Number(echeance.totalTTC || 0);

    if (date < today) {
      totalOverdue += amount;
      countOverdue++;
    } else if (date <= monthEnd) {
      totalThisMonth += amount;
      countThisMonth++;
    }

    if (date >= today && date <= threeMonthsEnd) {
      totalThreeMonths += amount;
      countThreeMonths++;
    }
  }

  const groupes = new Map<string, any[]>();
  for (const payment of echeances) {
    const key = `${payment.familyId}_${payment.forfaitRef || ""}`;
    const group = groupes.get(key) || [];
    group.push(payment);
    groupes.set(key, group);
  }

  const entries: EcheancierEntry[] = [...groupes.entries()].map(([key, group]) => {
    const echs = [...group].sort((a, b) => Number(a.echeance || 0) - Number(b.echeance || 0));
    const familyName = String(echs[0]?.familyName || "");
    const overdueCount = echs.filter((e) => e.status !== "paid" && e.echeanceDate && e.echeanceDate < today).length;
    const nextNonPaid = echs.find((e) => e.status !== "paid" && e.echeanceDate);
    return {
      key,
      echs,
      familyName,
      hasOverdue: overdueCount > 0,
      overdueCount,
      nextEchDate: nextNonPaid?.echeanceDate || "9999-12-31",
    };
  });

  const hasOverdue = entries.some((entry) => entry.hasOverdue);
  let filtered = [...entries];

  if (filters.search?.trim()) {
    const query = filters.search.trim().toLowerCase();
    filtered = filtered.filter((entry) => entry.familyName.toLowerCase().includes(query));
  }
  if (filters.onlyOverdue) {
    filtered = filtered.filter((entry) => entry.hasOverdue);
  }

  const sortMode = filters.sortMode || "retard";
  if (sortMode === "retard") {
    filtered.sort((a, b) => {
      if (a.hasOverdue !== b.hasOverdue) return a.hasOverdue ? -1 : 1;
      return a.nextEchDate.localeCompare(b.nextEchDate);
    });
  } else if (sortMode === "prochaine") {
    filtered.sort((a, b) => a.nextEchDate.localeCompare(b.nextEchDate));
  } else {
    filtered.sort((a, b) => a.familyName.localeCompare(b.familyName, "fr"));
  }

  return {
    groupesList: filtered.map((entry) => [entry.key, entry.echs]),
    statsRecap: {
      totalThisMonth,
      countThisMonth,
      totalOverdue,
      countOverdue,
      totalThreeMonths,
      countThreeMonths,
      nbFamilies: entries.length,
    },
    hasOverdue,
  };
}
