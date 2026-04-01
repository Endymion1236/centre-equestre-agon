"use client";
import { useEffect, useState } from "react";

export default function FacturePrintPage() {
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem("facture_html");
      if (stored) {
        setHtml(stored);
        sessionStorage.removeItem("facture_html");
      } else {
        setError(true);
      }
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    if (html) {
      const iframe = document.getElementById("facture-frame") as HTMLIFrameElement;
      if (iframe?.contentDocument) {
        iframe.contentDocument.open();
        iframe.contentDocument.write(html);
        iframe.contentDocument.close();
      }
    }
  }, [html]);

  const handlePrint = () => {
    const iframe = document.getElementById("facture-frame") as HTMLIFrameElement;
    iframe?.contentWindow?.print();
  };

  const handleDownload = () => {
    if (!html) return;
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    // Extraire le numéro de facture depuis le HTML pour le nom du fichier
    const match = html.match(/Facture\s+([\w-]+)/);
    a.download = match ? `Facture-${match[1]}.html` : "Facture.html";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  };

  if (error) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: "sans-serif", color: "#666" }}>
      <div style={{ textAlign: "center" }}>
        <p style={{ fontSize: 18, marginBottom: 8 }}>Facture expirée ou introuvable.</p>
        <p style={{ fontSize: 13 }}>Veuillez régénérer la facture depuis l'interface.</p>
      </div>
    </div>
  );

  if (!html) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh" }}>
      <div style={{ width: 32, height: 32, border: "3px solid #2050A0", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      {/* Barre d'actions */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 20px", background: "#1e3a5f", flexShrink: 0,
      }}>
        <span style={{ color: "white", fontFamily: "sans-serif", fontSize: 14, fontWeight: 600 }}>
          📄 Facture
        </span>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={handleDownload} style={{
            display: "flex", alignItems: "center", gap: 6,
            background: "white", color: "#1e3a5f", border: "none",
            padding: "8px 16px", borderRadius: 8, fontFamily: "sans-serif",
            fontSize: 13, fontWeight: 600, cursor: "pointer",
          }}>
            ⬇ Télécharger
          </button>
          <button onClick={handlePrint} style={{
            display: "flex", alignItems: "center", gap: 6,
            background: "#2050A0", color: "white", border: "none",
            padding: "8px 16px", borderRadius: 8, fontFamily: "sans-serif",
            fontSize: 13, fontWeight: 600, cursor: "pointer",
          }}>
            🖨 Imprimer
          </button>
        </div>
      </div>

      {/* Iframe facture */}
      <iframe
        id="facture-frame"
        style={{ flex: 1, border: "none", width: "100%" }}
        title="Facture"
      />
    </div>
  );
}
