import { authFetch } from "@/lib/auth-fetch";

// Helper — télécharger un avoir / note de crédit en PDF
export async function downloadAvoirPdf(params: {
  avoirNumber: string;
  date: string;
  familyName: string;
  familyEmail?: string;
  familyAddress?: string;
  sourceInvoiceNumber?: string;
  reason?: string;
  items?: any[];
  totalHT: number;
  totalTVA: number;
  totalTTC: number;
  type?: "avoir" | "avance";
  expiryDate?: string;
}) {
  const res = await authFetch("/api/avoir-pdf", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const motif = await res.json().then((d) => d?.error).catch(() => "");
    const message = motif || `Erreur génération PDF avoir (HTTP ${res.status})`;
    if (typeof window !== "undefined") {
      window.alert(`L'avoir n'a pas pu être généré.\n\n${message}`);
    }
    throw new Error(message);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `avoir-${params.avoirNumber}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}
