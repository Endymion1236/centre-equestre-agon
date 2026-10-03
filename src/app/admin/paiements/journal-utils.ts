import { safeNumber } from "@/lib/utils";
import { paymentModes } from "./types";

export interface JournalFilters {
  dateFrom?: string;
  dateTo?: string;
  montantMin?: string;
  montantMax?: string;
  mode?: string;
  search?: string;
}

export function journalTimestamp(line: any): number {
  const src = line?.createdAt || line?.date;
  if (!src) return 0;
  if (typeof src.seconds === "number") {
    return src.seconds * 1000 + Number(src.nanoseconds || 0) / 1e6;
  }
  if (typeof src.toDate === "function") {
    const date = src.toDate();
    return date instanceof Date ? date.getTime() : 0;
  }
  return 0;
}

export function creerLignesJournalFallback(payments: any[], encaissements: any[]): any[] {
  const paymentIdsAvecEncaissement = new Set(
    encaissements.map((encaissement) => encaissement.paymentId).filter(Boolean),
  );

  return payments
    .filter((payment) =>
      (payment.status === "paid" || payment.paidAmount > 0) &&
      payment.status !== "cancelled" &&
      !paymentIdsAvecEncaissement.has(payment.id),
    )
    .map((payment) => ({
      id: `fallback_${payment.id}`,
      paymentId: payment.id,
      familyId: payment.familyId,
      familyName: payment.familyName,
      montant: payment.paidAmount || payment.totalTTC || 0,
      mode: payment.paymentMode || "",
      modeLabel: paymentModes.find((mode) => mode.id === payment.paymentMode)?.label || payment.paymentMode || "—",
      ref: payment.paymentRef || "",
      activityTitle: (payment.items || []).map((item: any) => item.activityTitle).join(", "),
      date: payment.date,
    }));
}

export function filtrerJournal(lines: any[], filters: JournalFilters): any[] {
  let filtered = [...lines];

  if (filters.dateFrom) {
    const min = new Date(filters.dateFrom);
    filtered = filtered.filter((line) => {
      const date = line.date?.seconds ? new Date(line.date.seconds * 1000) : null;
      return Boolean(date && date >= min);
    });
  }
  if (filters.dateTo) {
    const max = new Date(`${filters.dateTo}T23:59:59`);
    filtered = filtered.filter((line) => {
      const date = line.date?.seconds ? new Date(line.date.seconds * 1000) : null;
      return Boolean(date && date <= max);
    });
  }
  if (filters.montantMin) {
    const min = safeNumber(filters.montantMin);
    filtered = filtered.filter((line) => Number(line.montant || 0) >= min);
  }
  if (filters.montantMax) {
    const max = safeNumber(filters.montantMax);
    filtered = filtered.filter((line) => Number(line.montant || 0) <= max);
  }
  if (filters.mode && filters.mode !== "all") {
    filtered = filtered.filter((line) => line.mode === filters.mode);
  }
  if (filters.search?.trim()) {
    const q = filters.search.trim().toLowerCase();
    filtered = filtered.filter((line) =>
      line.familyName?.toLowerCase().includes(q) ||
      line.activityTitle?.toLowerCase().includes(q) ||
      line.ref?.toLowerCase().includes(q),
    );
  }

  return filtered.sort((a, b) => {
    const diff = journalTimestamp(b) - journalTimestamp(a);
    if (diff !== 0) return diff;
    return String(b.id || "").localeCompare(String(a.id || ""));
  });
}

export function calculerTotauxJournal(lines: any[]) {
  const totalsByMode: Record<string, number> = {};
  for (const line of lines) {
    const mode = line.mode || "autre";
    totalsByMode[mode] = (totalsByMode[mode] || 0) + Number(line.montant || 0);
  }
  return {
    totalsByMode,
    grandTotal: lines.reduce((total, line) => total + Number(line.montant || 0), 0),
  };
}

export function preparerJournal(payments: any[], encaissements: any[], filters: JournalFilters) {
  const lines = [...encaissements, ...creerLignesJournalFallback(payments, encaissements)];
  const filtered = filtrerJournal(lines, filters);
  return { filtered, ...calculerTotauxJournal(filtered) };
}

/**
 * Règlement groupé : un seul paiement (un passage de carte, un chèque) qui
 * règle plusieurs factures de la même famille. Octobre 2026 : une carte de
 * séances (247 €) et une adhésion (60 €) encaissées ensemble, 307 € au TPE,
 * apparaissaient au journal comme deux encaissements sans lien. Chaque
 * facture garde son encaissement (une écriture par facture réglée) ; elles
 * portent la même marque `reglementGroupe`, que le journal affiche.
 */
export interface ReglementGroupe { id: string; total: number; nbFactures: number }

export function nouveauReglementGroupe(montants: number[], id: string): ReglementGroupe | null {
  const utiles = montants.filter((m) => Math.round(m * 100) > 0);
  if (utiles.length < 2) return null;
  return { id, total: Math.round(utiles.reduce((s, m) => s + m, 0) * 100) / 100, nbFactures: utiles.length };
}

/** « Réglé en une fois : 307,00 € pour 2 factures », ou "" pour un encaissement seul. */
export function libelleReglementGroupe(enc: { reglementGroupe?: Partial<ReglementGroupe> | null }): string {
  const g = enc?.reglementGroupe;
  if (!g || !Number(g.total) || Number(g.nbFactures) < 2) return "";
  return `Réglé en une fois : ${Number(g.total).toFixed(2).replace(".", ",")} € pour ${g.nbFactures} factures`;
}
