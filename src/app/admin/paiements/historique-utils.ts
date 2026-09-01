export type HistoriqueSort = "commande" | "encaissement" | "facture";

export interface HistoriqueFilters {
  familyId?: string;
  mode?: string;
  status?: string;
  search?: string;
  period?: string;
  sortBy: HistoriqueSort;
}

export function timestampMillis(src: any): number {
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

export function creerAvoirsOrphelins(payments: any[], encaissements: any[]): any[] {
  const paymentIds = new Set(payments.map((payment) => payment.id).filter(Boolean));
  return encaissements
    .filter((encaissement) => encaissement.mode === "avoir" && !paymentIds.has(encaissement.paymentId))
    .map((encaissement) => ({
      id: encaissement.id,
      familyId: encaissement.familyId,
      familyName: encaissement.familyName,
      date: encaissement.date,
      createdAt: encaissement.createdAt || encaissement.date,
      totalTTC: encaissement.montant || 0,
      paidAmount: encaissement.montant || 0,
      status: "paid",
      paymentMode: "avoir",
      items: [{ activityTitle: encaissement.activityTitle || "Avoir utilisé" }],
      _fromEncaissement: true,
    }));
}

export function filtrerHistorique(
  payments: any[],
  encaissements: any[],
  filters: HistoriqueFilters,
): any[] {
  let result = payments.filter((payment) =>
    payment.status === "paid" ||
    payment.status === "partial" ||
    payment.status === "cancelled" ||
    payment.status === "sepa_scheduled" ||
    Boolean(payment.invoiceNumber),
  );

  result = [...result, ...creerAvoirsOrphelins(payments, encaissements)];

  if (filters.familyId) {
    result = result.filter((payment) => payment.familyId === filters.familyId);
  }
  if (filters.mode && filters.mode !== "all") {
    result = result.filter((payment) => payment.paymentMode === filters.mode);
  }
  if (filters.status && filters.status !== "all") {
    result = result.filter((payment) => payment.status === filters.status);
  }
  if (filters.search?.trim()) {
    const q = filters.search.trim().toLowerCase();
    result = result.filter((payment) =>
      payment.familyName?.toLowerCase().includes(q) ||
      (payment.items || []).some((item: any) => item.activityTitle?.toLowerCase().includes(q)),
    );
  }
  if (filters.period) {
    result = result.filter((payment) => {
      const seconds = payment.date?.seconds;
      if (typeof seconds !== "number") return false;
      const date = new Date(seconds * 1000);
      const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      return month === filters.period;
    });
  }

  return trierHistorique(result, encaissements, filters.sortBy);
}

export function trierHistorique(
  payments: any[],
  encaissements: any[],
  sortBy: HistoriqueSort,
): any[] {
  const dernierEncaissementParPaiement = new Map<string, number>();
  for (const encaissement of encaissements) {
    if (!encaissement.paymentId) continue;
    const ts = timestampMillis(encaissement.createdAt) || timestampMillis(encaissement.date);
    const actuel = dernierEncaissementParPaiement.get(encaissement.paymentId) || 0;
    if (ts > actuel) dernierEncaissementParPaiement.set(encaissement.paymentId, ts);
  }

  return [...payments].sort((a, b) => {
    if (sortBy === "facture") {
      const na = String(a.invoiceNumber || a.id || "");
      const nb = String(b.invoiceNumber || b.id || "");
      const aHasNum = /^F-/.test(na);
      const bHasNum = /^F-/.test(nb);
      if (aHasNum !== bHasNum) return aHasNum ? -1 : 1;
      return nb.localeCompare(na);
    }

    const ts = (payment: any) => {
      if (sortBy === "encaissement") {
        const encTs = dernierEncaissementParPaiement.get(payment.id) || 0;
        if (encTs > 0) return encTs;
        return timestampMillis(payment.createdAt) || timestampMillis(payment.date);
      }
      return timestampMillis(payment.date) || timestampMillis(payment.createdAt);
    };

    const diff = ts(b) - ts(a);
    if (diff !== 0) return diff;
    return String(b.id || "").localeCompare(String(a.id || ""));
  });
}

export function calculerTotauxHistorique(payments: any[]) {
  const totalsByMode: Record<string, number> = {};
  for (const payment of payments) {
    const mode = payment.paymentMode || "autre";
    totalsByMode[mode] = (totalsByMode[mode] || 0) + Number(payment.totalTTC || 0);
  }
  return {
    totalsByMode,
    grandTotal: payments.reduce((total, payment) => total + Number(payment.totalTTC || 0), 0),
  };
}

export function preparerHistorique(
  payments: any[],
  encaissements: any[],
  filters: HistoriqueFilters,
) {
  const filtered = filtrerHistorique(payments, encaissements, filters);
  return { filtered, ...calculerTotauxHistorique(filtered) };
}
