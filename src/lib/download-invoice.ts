import { authFetch } from "@/lib/auth-fetch";

export interface PaymentDetail {
  mode: string;
  modeLabel?: string;
  montant: number;
  date?: string;
  ref?: string;
}

// Helper — télécharger une facture en PDF
export async function downloadInvoicePdf(params: {
  invoiceNumber: string;
  date: string;
  familyName: string;
  familyEmail: string;
  familyAddress?: string;
  items: any[];
  totalHT: number;
  totalTVA: number;
  totalTTC: number;
  paidAmount: number;
  paymentMode: string;
  paymentDate: string;
  /** Détail ligne-par-ligne des encaissements (optionnel, prioritaire sur paymentMode) */
  paymentDetails?: PaymentDetail[];
}) {
  const res = await authFetch("/api/invoice-pdf", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error("Erreur génération PDF");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `facture-${params.invoiceNumber}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}
