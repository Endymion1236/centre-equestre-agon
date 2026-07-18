// Téléchargement du XML Factur-X d'une facture définitive (côté client).
// Passe par authFetch (route admin) puis déclenche le download du blob.

import { authFetch } from "@/lib/auth-fetch";

export async function downloadFacturX(paymentId: string, invoiceNumber: string): Promise<void> {
  const r = await authFetch(`/api/admin/facturx?paymentId=${encodeURIComponent(paymentId)}`);
  if (!r.ok) {
    const d = await r.json().catch(() => ({}));
    alert(d?.error || "Impossible de générer le Factur-X.");
    return;
  }
  const blob = await r.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `FACTUR-X_${String(invoiceNumber).replace(/[^\w.-]/g, "_")}.xml`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Variante PDF hybride : la facture PDF avec le XML Factur-X embarqué. */
export async function downloadFacturXPdf(paymentId: string, invoiceNumber: string): Promise<void> {
  const r = await authFetch(`/api/admin/facturx-pdf?paymentId=${encodeURIComponent(paymentId)}`);
  if (!r.ok) {
    const d = await r.json().catch(() => ({}));
    alert(d?.error || "Impossible de générer le PDF Factur-X.");
    return;
  }
  const blob = await r.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `FACTURX_${String(invoiceNumber).replace(/[^\w.-]/g, "_")}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
