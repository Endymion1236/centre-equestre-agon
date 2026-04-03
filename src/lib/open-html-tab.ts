/**
 * Ouvre une facture HTML dans un nouvel onglet via Blob URL.
 * Ne nécessite aucune authentification — fonctionne sur mobile.
 */
export function openHtmlInTab(html: string): void {
  try {
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.target = "_blank";
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
  } catch {
    // Fallback : ouvrir dans le même onglet
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const blobUrl = URL.createObjectURL(blob);
    window.location.href = blobUrl;
  }
}
