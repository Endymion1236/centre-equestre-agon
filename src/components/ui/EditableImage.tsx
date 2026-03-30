"use client";

import { useState, useRef, useCallback } from "react";
import { useAuth } from "@/lib/auth-context";
import { useVitrineImages, VitrineImageKey } from "@/hooks/useVitrineImages";
import { Upload, Loader2, CheckCircle, Camera } from "lucide-react";

interface EditableImageProps {
  /** Clé unique de l'image (ex: "hero-plage", "equipe-nicolas") */
  imageKey: VitrineImageKey;
  /** Classes CSS appliquées au conteneur */
  className?: string;
  /** Style inline du conteneur */
  style?: React.CSSProperties;
  /** Rendu du contenu par-dessus l'image */
  children?: React.ReactNode;
  /** Label affiché dans le bouton d'upload */
  label?: string;
  /** Mode d'affichage : "background" (div avec bg) ou "img" (balise img) */
  mode?: "background" | "img";
  /** Alt text pour le mode img */
  alt?: string;
}

export function EditableImage({
  imageKey,
  className = "",
  style = {},
  children,
  label,
  mode = "background",
  alt = "",
}: EditableImageProps) {
  const { user, isAdmin } = useAuth();
  const { getImage, refresh } = useVitrineImages();
  const [uploading, setUploading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const [hover, setHover] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const currentUrl = getImage(imageKey);

  const handleUpload = useCallback(async (file: File) => {
    if (!user?.email) return;
    setUploading(true);
    setError("");
    setSuccess(false);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("key", imageKey);
      formData.append("adminEmail", user.email);

      const res = await fetch("/api/upload-vitrine", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "Erreur upload");

      setSuccess(true);
      refresh();
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      setError(err.message);
      setTimeout(() => setError(""), 4000);
    } finally {
      setUploading(false);
    }
  }, [user, imageKey, refresh]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleUpload(file);
    // Reset pour permettre re-upload du même fichier
    e.target.value = "";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith("image/")) handleUpload(file);
  };

  // Rendu commun : overlay admin
  const adminOverlay = isAdmin ? (
    <>
      {/* Input file caché */}
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleFileChange}
        style={{ display: "none" }}
      />

      {/* Zone de détection hover — toujours présente mais transparente */}
      <div
        style={{ position: "absolute", inset: 0, zIndex: 98, pointerEvents: "auto" }}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
      />

      {/* Bouton d'édition — visible au hover */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 99,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: hover ? "rgba(0,0,0,0.45)" : "transparent",
          transition: "background 0.25s ease",
          cursor: "pointer",
          pointerEvents: hover ? "auto" : "none",
        }}
        onClick={() => !uploading && inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setHover(true); }}
        onDragLeave={() => setHover(false)}
        onDrop={(e) => { setHover(false); handleDrop(e); }}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
      >
        {/* État normal — icône au hover */}
        {!uploading && !success && !error && hover && (
          <div style={{
            display: "flex", flexDirection: "column", alignItems: "center", gap: "0.5rem",
            background: "rgba(255,255,255,0.12)", backdropFilter: "blur(8px)",
            border: "2px dashed rgba(255,255,255,0.6)",
            borderRadius: "12px", padding: "1rem 1.5rem",
            color: "white", textAlign: "center",
          }}>
            <Camera size={28} />
            <span style={{ fontFamily: "sans-serif", fontSize: "0.8rem", fontWeight: 600 }}>
              {label || "Changer la photo"}
            </span>
            <span style={{ fontFamily: "sans-serif", fontSize: "0.68rem", opacity: 0.7 }}>
              JPG / PNG / WEBP · max 8 MB
            </span>
          </div>
        )}

        {/* Uploading */}
        {uploading && (
          <div style={{
            display: "flex", flexDirection: "column", alignItems: "center", gap: "0.5rem",
            background: "rgba(0,0,0,0.7)", borderRadius: "12px", padding: "1rem 1.5rem",
            color: "white",
          }}>
            <Loader2 size={28} style={{ animation: "spin 1s linear infinite" }} />
            <span style={{ fontFamily: "sans-serif", fontSize: "0.8rem" }}>Envoi en cours…</span>
          </div>
        )}

        {/* Succès */}
        {success && (
          <div style={{
            display: "flex", flexDirection: "column", alignItems: "center", gap: "0.5rem",
            background: "rgba(22,163,74,0.85)", borderRadius: "12px", padding: "1rem 1.5rem",
            color: "white",
          }}>
            <CheckCircle size={28} />
            <span style={{ fontFamily: "sans-serif", fontSize: "0.8rem", fontWeight: 600 }}>Photo mise à jour !</span>
          </div>
        )}

        {/* Erreur */}
        {error && (
          <div style={{
            background: "rgba(220,38,38,0.85)", borderRadius: "12px", padding: "0.75rem 1.2rem",
            color: "white", fontFamily: "sans-serif", fontSize: "0.75rem", maxWidth: "200px", textAlign: "center",
          }}>
            {error}
          </div>
        )}
      </div>

      {/* Badge "Admin — éditable" en coin */}
      {!uploading && !success && (
        <div style={{
          position: "absolute", top: "0.6rem", right: "0.6rem", zIndex: 100,
          background: "rgba(240,160,16,0.9)", backdropFilter: "blur(4px)",
          borderRadius: "6px", padding: "0.2rem 0.55rem",
          fontFamily: "sans-serif", fontSize: "0.6rem", fontWeight: 700,
          color: "#0C1A2E", letterSpacing: "0.05em", textTransform: "uppercase",
          display: "flex", alignItems: "center", gap: "0.3rem",
          opacity: hover ? 1 : 0.75,
          transition: "opacity 0.2s",
          pointerEvents: "none",
        }}>
          <Upload size={9} /> Éditable
        </div>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </>
  ) : null;

  // ── Mode background ──
  if (mode === "background") {
    const bgImage = currentUrl
      ? `url('${currentUrl}')`
      : (style.backgroundImage || undefined);

    return (
      <div
        className={`${className} ${!currentUrl ? "bg-hero" : ""}`}
        style={{
          ...style,
          position: "relative",
          ...(bgImage ? { backgroundImage: bgImage } : {}),
          backgroundSize: "cover",
          backgroundPosition: style.backgroundPosition || "center 40%",
        }}
      >
        {/* Contenu d'abord */}
        {children}
        {/* Overlay admin par-dessus tout */}
        {adminOverlay}
      </div>
    );
  }

  // ── Mode img ──
  return (
    <div className={className} style={{ ...style, position: "relative" }}>
      {currentUrl ? (
        <img
          src={currentUrl}
          alt={alt}
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
        />
      ) : (
        <div style={{
          width: "100%", height: "100%", minHeight: "200px",
          background: "linear-gradient(135deg, #e0e7ff, #c7d2fe)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <Camera size={40} style={{ color: "#6366f1", opacity: 0.4 }} />
        </div>
      )}
      {adminOverlay}
      {children}
    </div>
  );
}
