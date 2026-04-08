import { safeNumber } from "@/lib/utils";

export const normalizePayment = (d: any) => ({
  ...d,
  totalTTC: safeNumber(d.totalTTC),
  paidAmount: safeNumber(d.paidAmount),
  items: (d.items || []).map((i: any) => ({
    ...i,
    priceTTC: safeNumber(i.priceTTC),
    priceHT: safeNumber(i.priceHT),
    tva: safeNumber(i.tva || 5.5),
  })),
});

export const loadPayments = (docs: any[]) =>
  docs.map(d => normalizePayment({ id: d.id, ...d.data() }));
