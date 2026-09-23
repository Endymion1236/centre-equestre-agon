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

// ── Lien de paiement d'une échéance ─────────────────────────────────────────
//
// Chaque échéance est une commande à part entière (`payments`, `echeance: n`
// sur `echeancesTotal`). Un lien de paiement s'envoie donc échéance par
// échéance, comme pour n'importe quelle commande — ce qui manquait jusqu'ici,
// alors que l'écran proposait déjà d'encaisser en CB, chèque, espèces ou
// virement. Une famille qui voulait régler en ligne n'avait aucun moyen de le
// faire : il fallait la rappeler et saisir sa carte à la main.

/** Ce qu'une échéance doit encore, au centime. */
export function resteDuEcheance(echeance: any): number {
  const du = Number(echeance?.totalTTC || 0) - Number(echeance?.paidAmount || 0);
  return Math.max(0, Math.round(du * 100) / 100);
}

/** « 23 novembre 2026 » — la date d'échéance en toutes lettres. */
export function dateEcheanceLisible(dateIso?: string): string {
  if (!dateIso || !/^\d{4}-\d{2}-\d{2}/.test(dateIso)) return "";
  return new Date(`${dateIso.slice(0, 10)}T12:00:00`).toLocaleDateString("fr-FR", {
    day: "numeric", month: "long", year: "numeric",
  });
}

/**
 * Le message par défaut du lien : il dit DE QUELLE échéance il s'agit.
 *
 * Sans lui, une famille en 10 fois recevait dix emails identiques à
 * « voici le lien de paiement pour régler 69,90 € » et ne pouvait pas savoir
 * lequel elle avait déjà réglé — ni si celui du mois dernier traînait encore
 * dans sa boîte.
 */
export function messageLienEcheance(echeance: any, aujourdhui = todayIso()): string {
  const numero = Number(echeance?.echeance || 0);
  const total = Number(echeance?.echeancesTotal || 0);
  const date = String(echeance?.echeanceDate || "");
  const enRetard = Boolean(date) && date < aujourdhui;
  const quand = dateEcheanceLisible(date);

  const rappel = numero > 0 && total > 0 ? `l'échéance ${numero}/${total}` : "cette échéance";
  const situation = !quand
    ? ""
    : enRetard
      ? ` Elle était attendue le ${quand}.`
      : ` Elle est prévue pour le ${quand}.`;

  return `Bonjour,\n\nVoici le lien pour régler ${rappel} de votre forfait.${situation}`
    + `\n\nSi vous l'avez déjà réglée entre-temps, ce message est sans objet.`;
}

// ─── Échéanciers réglés par lien de paiement CB, mois après mois ───────────
//
// Certaines familles ne sont ni au prélèvement, ni au comptoir : Nicolas leur
// envoie chaque fin de mois un lien de paiement CB pour l'échéance suivante.
// Rien ne le rappelait. Un échéancier porte donc un repère, posé sur toutes
// ses échéances depuis l'onglet Échéances, et le rappel de fin de mois (cron
// liens-cb-mensuels) liste ce qu'il faut envoyer.

/** Champ posé sur chaque échéance d'un échéancier réglé par lien CB. */
export const CHAMP_LIEN_CB = "reglementParLienCb";

export function estReglementParLienCb(payment: any): boolean {
  return payment?.[CHAMP_LIEN_CB] === true;
}

/** Dernier jour du mois suivant, « AAAA-MM-JJ ». */
export function finDuMoisSuivant(today = todayIso()): string {
  const [annee, mois] = today.split("-").map(Number);
  return dateIsoLocale(new Date(annee, mois + 1, 0, 12, 0, 0));
}

export interface LienCbAEnvoyer {
  paymentId: string;
  familyId: string;
  familyName: string;
  numero: number;
  total: number;
  date: string;
  reste: number;
  enRetard: boolean;
  /** Autres échéances de la même série, non réglées et déjà dépassées. */
  autresEnRetard: number;
}

/**
 * Une ligne par échéancier marqué : sa prochaine échéance non réglée, si elle
 * tombe d'ici la fin du mois suivant. Un lien couvre UNE échéance ; les
 * retards supplémentaires sont comptés à part pour ne pas les oublier.
 */
export function liensCbAEnvoyer(payments: any[], today = todayIso()): LienCbAEnvoyer[] {
  const limite = finDuMoisSuivant(today);
  const series = new Map<string, any[]>();
  for (const p of payments) {
    if (!estReglementParLienCb(p) || estEcheanceSepa(p)) continue;
    if (p.status === "paid" || p.status === "cancelled") continue;
    if (Number(p.echeancesTotal || 0) <= 1 || !p.echeanceDate || resteDuEcheance(p) <= 0) continue;
    const key = `${p.familyId}_${p.forfaitRef || ""}`;
    series.set(key, [...(series.get(key) || []), p]);
  }
  const lignes: LienCbAEnvoyer[] = [];
  for (const echs of series.values()) {
    echs.sort((a, b) => String(a.echeanceDate).localeCompare(String(b.echeanceDate)));
    const prochaine = echs[0];
    if (prochaine.echeanceDate > limite) continue;
    lignes.push({
      paymentId: prochaine.id,
      familyId: prochaine.familyId || "",
      familyName: prochaine.familyName || "(sans nom)",
      numero: Number(prochaine.echeance || 0),
      total: Number(prochaine.echeancesTotal || 0),
      date: prochaine.echeanceDate,
      reste: resteDuEcheance(prochaine),
      enRetard: prochaine.echeanceDate < today,
      autresEnRetard: echs.slice(1).filter((e) => e.echeanceDate < today).length,
    });
  }
  return lignes.sort((a, b) => a.date.localeCompare(b.date) || a.familyName.localeCompare(b.familyName));
}
