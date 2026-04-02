/**
 * Ouvre une facture HTML dans un nouvel onglet via sessionStorage.
 * Méthode compatible avec tous les navigateurs modernes.
 */
export function openHtmlInTab(html: string): void {
  try {
    sessionStorage.setItem("facture_html", html);
    const w = window.open("/espace-cavalier/facture-print", "_blank");
    if (!w) {
      // Popup bloqué — fallback même onglet
      window.location.href = "/espace-cavalier/facture-print";
    }
  } catch {
    // Fallback final : Blob URL
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.target = "_blank";
    a.click();
    setTimeout(() => URL.revokeObjectURL(blobUrl), 30000);
  }
}
