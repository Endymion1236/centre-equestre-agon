import { estValorise } from "@/lib/offerts";

export interface OffertItemLike {
  activityTitle?: string;
  childName?: string;
  originalPriceTTC?: number;
}

export interface OffertPaymentLike {
  id?: string;
  familyName?: string;
  date?: { seconds?: number } | null;
  items?: OffertItemLike[];
  isFree?: boolean;
  freeReason?: string;
}

export function valeurOfferte(payment: OffertPaymentLike): number {
  return (payment.items || []).reduce(
    (total, item) => total + Number(item.originalPriceTTC || 0),
    0,
  );
}

export function trierOffertsRecents<T extends OffertPaymentLike>(payments: T[]): T[] {
  return [...payments].sort(
    (a, b) => Number(b.date?.seconds || 0) - Number(a.date?.seconds || 0),
  );
}

export function resumerOfferts<T extends OffertPaymentLike>(payments: T[]) {
  const gratuits = payments.filter((payment) => payment.isFree === true);
  const valorises = gratuits.filter((payment) => estValorise(payment.freeReason));
  const nonValorises = gratuits.filter((payment) => !estValorise(payment.freeReason));

  return {
    gratuits,
    valorises,
    nonValorises,
    totalValeur: valorises.reduce((total, payment) => total + valeurOfferte(payment), 0),
  };
}
