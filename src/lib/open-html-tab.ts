/**
 * Ouvre un document HTML dans un nouvel onglet de façon compatible
 * avec tous les navigateurs (évite les problèmes Blob URL / document.write).
 */
export function openHtmlInTab(html: string): void {
  // Encoder en base64 pour une data URL stable cross-navigateur
  const encoded = btoa(unescape(encodeURIComponent(html)));
  const dataUrl = `data:text/html;charset=utf-8;base64,${encoded}`;
  const w = window.open(dataUrl, "_blank");
  // Fallback : si le navigateur bloque les data URLs (rare), utiliser Blob
  if (!w) {
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const blobUrl = URL.createObjectURL(blob);
    window.open(blobUrl, "_blank");
    setTimeout(() => URL.revokeObjectURL(blobUrl), 30000);
  }
}
