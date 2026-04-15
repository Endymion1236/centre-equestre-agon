export type PaymentMode =
  | "cb_terminal" | "cb_online" | "cheque" | "especes"
  | "cheque_vacances" | "pass_sport" | "ancv" | "virement"
  | "avoir" | "prelevement_sepa";

export interface BasketItem {
  id: string;
  activityTitle: string;
  childId?: string;
  childName: string;
  activityId?: string;
  creneauId?: string;
  activityType?: string;
  description: string;
  priceHT: number;
  tva: number;
  priceTTC: number;
  category?: string;
  compteComptable?: string;
}

export interface Payment {
  id?: string;
  familyId: string;
  familyName: string;
  items: BasketItem[];
  totalTTC: number;
  paymentMode: PaymentMode;
  paymentRef: string;
  status: "draft" | "paid" | "pending" | "partial" | "cancelled" | "sepa_scheduled";
  paidAmount: number;
  date: any;
}

export const paymentModes: { id: PaymentMode; label: string }[] = [
  { id: "cb_terminal", label: "CB (terminal)" },
  { id: "cb_online", label: "CB en ligne (CAWL)" },
  { id: "cheque", label: "Chèque" },
  { id: "especes", label: "Espèces" },
  { id: "cheque_vacances", label: "Chèques vacances" },
  { id: "pass_sport", label: "Pass'Sport" },
  { id: "ancv", label: "ANCV" },
  { id: "virement", label: "Virement" },
  { id: "avoir", label: "Avoir" },
  { id: "prelevement_sepa", label: "Prélèvement SEPA" },
];
