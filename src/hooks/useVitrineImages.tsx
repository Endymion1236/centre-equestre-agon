"use client";

import { useState, useEffect, createContext, useContext } from "react";

// ── Types ──────────────────────────────────────────────────────────────────

export type VitrineImageKey =
  | "hero-plage"
  | "hero-equestre"
  | "hero-laserbay"
  | "equipe-nicolas"
  | "equipe-emmeline"
  | "galerie-balades"
  | "galerie-stages"
  | "galerie-competitions"
  | "galerie-miniferme"
  | "galerie-club";

// Fallbacks locaux si pas encore uploadé dans Firebase
export const VITRINE_DEFAULTS: Record<VitrineImageKey, string> = {
  "hero-plage":          "/images/hero-plage.jpg",
  "hero-equestre":       "/images/hero-equestre.png",
  "hero-laserbay":       "/images/hero-laserbay.png",
  "equipe-nicolas":      "",
  "equipe-emmeline":     "",
  "galerie-balades":     "",
  "galerie-stages":      "",
  "galerie-competitions":"",
  "galerie-miniferme":   "",
  "galerie-club":        "",
};

// ── Context ────────────────────────────────────────────────────────────────

interface VitrineContextType {
  images: Record<string, string>;
  getImage: (key: VitrineImageKey) => string;
  refresh: () => void;
}

const VitrineContext = createContext<VitrineContextType>({
  images: {},
  getImage: (key) => VITRINE_DEFAULTS[key] || "",
  refresh: () => {},
});

export function VitrineProvider({ children }: { children: React.ReactNode }) {
  const [images, setImages] = useState<Record<string, string>>({});

  const load = async () => {
    try {
      const res = await fetch("/api/upload-vitrine");
      if (res.ok) {
        const data = await res.json();
        setImages(data.images || {});
      }
    } catch {
      // Silencieux — on utilise les fallbacks
    }
  };

  useEffect(() => {
    load();
  }, []);

  const getImage = (key: VitrineImageKey): string => {
    return images[key] || VITRINE_DEFAULTS[key] || "";
  };

  return (
    <VitrineContext.Provider value={{ images, getImage, refresh: load }}>
      {children}
    </VitrineContext.Provider>
  );
}

export function useVitrineImages() {
  return useContext(VitrineContext);
}
