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
  /** Site facturé — structure réglant pour plusieurs services. */
  serviceFacture?: string;
  items: any[];
  totalHT: number;
  totalTVA: number;
  totalTTC: number;
  paidAmount: number;
  paymentMode: string;
  paymentDate: string;
  /** Détail ligne-par-ligne des encaissements (optionnel, prioritaire sur paymentMode) */
  paymentDetails?: PaymentDetail[];
  /** ID du paiement : si fourni, la facture reconstruit le détail depuis les encaissements */
  paymentId?: string;
}) {
  const res = await authFetch("/api/invoice-pdf", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    // Le message du serveur dit ce qui manque (ligne sans prix, adresse
    // illisible…). Le jeter et n'afficher que « Erreur génération PDF »
    // obligeait à ouvrir les logs Vercel pour chaque facture récalcitrante.
    const motif = await res.json().then((d) => d?.error).catch(() => "");
    const message = motif || `Erreur génération PDF (HTTP ${res.status})`;
    // Prévenir ici plutôt que dans chacun des boutons : aucun des appelants
    // n'attrapait l'erreur, et le clic restait sans effet visible — la facture
    // ne se téléchargeait pas, sans un mot d'explication.
    if (typeof window !== "undefined") {
      window.alert(`La facture n'a pas pu être générée.\n\n${message}`);
    }
    throw new Error(message);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `facture-${params.invoiceNumber}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}
