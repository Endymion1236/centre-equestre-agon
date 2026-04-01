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
      // Injecter le HTML dans un iframe pleine page
      const iframe = document.getElementById("facture-frame") as HTMLIFrameElement;
      if (iframe?.contentDocument) {
        iframe.contentDocument.open();
        iframe.contentDocument.write(html);
        iframe.contentDocument.close();
      }
    }
  }, [html]);

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
    <iframe
      id="facture-frame"
      style={{ width: "100vw", height: "100vh", border: "none" }}
      title="Facture"
    />
  );
}
