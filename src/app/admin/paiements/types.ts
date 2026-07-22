export type PaymentMode =
  | "cb_terminal" | "cb_online" | "cheque" | "cheque_differe" | "especes"
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
  { id: "cheque_differe", label: "Chèques différés" },
  { id: "especes", label: "Espèces" },
  { id: "cheque_vacances", label: "Chèques vacances" },
  { id: "pass_sport", label: "Pass'Sport" },
  { id: "ancv", label: "ANCV" },
  { id: "virement", label: "Virement" },
  { id: "avoir", label: "Avoir" },
  { id: "prelevement_sepa", label: "Prélèvement SEPA" },
];

/**
 * Modes utilisables pour un encaissement SAISI À LA MAIN par l'admin.
 *
 * "cb_online" (CAWL) en est EXCLU : un encaissement CAWL ne peut exister que
 * s'il correspond à une transaction réelle chez Worldline (webhook, retour
 * status, ou lien de paiement). Le saisir à la main créait une écriture
 * comptable fantôme — un paiement "réglé par CAWL" sans qu'aucun argent
 * n'ait transité, et sans référence de transaction. `cb_online` reste dans
 * `paymentModes` ci-dessus pour l'AFFICHAGE des vrais paiements CAWL passés.
 *
 * "cb_terminal" (TPE physique) reste, lui : la carte est bien passée sur
 * place, l'admin ne fait que constater un encaissement réel hors CAWL.
 */
export const manualPaymentModes = paymentModes.filter((m) => m.id !== "cb_online");
