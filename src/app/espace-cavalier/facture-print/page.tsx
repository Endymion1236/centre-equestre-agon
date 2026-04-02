"use client";
import { useEffect, useState } from "react";

export default function FacturePrintPage() {
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [downloading, setDownloading] = useState(false);

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

  const handleDownloadPDF = async () => {
    setDownloading(true);
    try {
      const iframe = document.getElementById("facture-frame") as HTMLIFrameElement;
      const iframeDoc = iframe?.contentDocument;
      if (!iframeDoc) return;

      const { default: html2canvas } = await import("html2canvas");
      const { default: jsPDF } = await import("jspdf");

      const body = iframeDoc.body;
      const canvas = await html2canvas(body, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: "#ffffff",
        windowWidth: 794, // A4 px à 96dpi
      });

      const imgData = canvas.toDataURL("image/jpeg", 0.95);
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const imgH = (canvas.height * pageW) / canvas.width;

      // Si la facture dépasse une page, on pagine
      let yPos = 0;
      while (yPos < imgH) {
        if (yPos > 0) pdf.addPage();
        pdf.addImage(imgData, "JPEG", 0, -yPos, pageW, imgH);
        yPos += pageH;
      }

      // Extraire le numéro de facture
      const match = html?.match(/FACTURE[^<]*<\/div>\s*<div[^>]*>([^<]+)/);
      const num = match?.[1]?.trim() || "Facture";
      pdf.save(`${num}.pdf`);
    } catch (e) {
      console.error("Erreur PDF:", e);
      // Fallback : imprimer en PDF via le navigateur
      const iframe = document.getElementById("facture-frame") as HTMLIFrameElement;
      iframe?.contentWindow?.print();
    } finally {
      setDownloading(false);
    }
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
          <button onClick={handlePrint} style={{
            background: "white", color: "#1e3a5f", border: "none",
            padding: "8px 16px", borderRadius: 8, fontFamily: "sans-serif",
            fontSize: 13, fontWeight: 600, cursor: "pointer",
          }}>
            🖨 Imprimer
          </button>
          <button onClick={handleDownloadPDF} disabled={downloading} style={{
            background: downloading ? "#64748b" : "#2050A0", color: "white", border: "none",
            padding: "8px 16px", borderRadius: 8, fontFamily: "sans-serif",
            fontSize: 13, fontWeight: 600, cursor: downloading ? "not-allowed" : "pointer",
          }}>
            {downloading ? "⏳ Génération..." : "⬇ Télécharger PDF"}
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

