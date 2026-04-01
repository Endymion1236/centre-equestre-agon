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
  | "galerie-club"
  | "activite-baby"
  | "activite-bronze"
  | "activite-argent"
  | "activite-or"
  | "activite-galop34"
  | "activite-balade-soleil"
  | "activite-balade-jour"
  | "activite-balade-privee"
  | "activite-randonnee-jeunes"
  | "activite-cours-loisir"
  | "activite-cours-compet"
  | "activite-cso"
  | "activite-ponygames"
  | "activite-equifun"
  | "activite-anniversaire"
  | "activite-ponyride";

// Fallbacks locaux si pas encore uploadé dans Firebase
export const VITRINE_DEFAULTS: Record<VitrineImageKey, string> = {
  "hero-plage":                "/images/hero-plage.jpg",
  "hero-equestre":             "/images/hero-equestre.png",
  "hero-laserbay":             "/images/hero-laserbay.png",
  "equipe-nicolas":            "",
  "equipe-emmeline":           "",
  "galerie-balades":           "",
  "galerie-stages":            "",
  "galerie-competitions":      "",
  "galerie-miniferme":         "",
  "galerie-club":              "",
  "activite-baby":             "",
  "activite-bronze":           "",
  "activite-argent":           "",
  "activite-or":               "",
  "activite-galop34":          "",
  "activite-balade-soleil":    "",
  "activite-balade-jour":      "",
  "activite-balade-privee":    "",
  "activite-randonnee-jeunes": "",
  "activite-cours-loisir":     "",
  "activite-cours-compet":     "",
  "activite-cso":              "",
  "activite-ponygames":        "",
  "activite-equifun":          "",
  "activite-anniversaire":     "",
  "activite-ponyride":         "",
};

// ── Context ────────────────────────────────────────────────────────────────

interface VitrineContextType {
  images: Record<string, string>;
  getImage: (key: VitrineImageKey) => string;
  refresh: () => void;
  cacheBust: number;
}

const VitrineContext = createContext<VitrineContextType>({
  images: {},
  getImage: (key) => VITRINE_DEFAULTS[key] || "",
  refresh: () => {},
  cacheBust: 0,
});

export function VitrineProvider({ children }: { children: React.ReactNode }) {
  const [images, setImages] = useState<Record<string, string>>({});
  const [cacheBust, setCacheBust] = useState(() => Date.now());

  const load = async () => {
    try {
      const res = await fetch("/api/upload-vitrine");
      if (res.ok) {
        const data = await res.json();
        setImages(data.images || {});
        setCacheBust(Date.now()); // force re-render des images
      }
    } catch {
      // Silencieux — on utilise les fallbacks
    }
  };

  useEffect(() => {
    load();
  }, []);

  const getImage = (key: VitrineImageKey): string => {
    const url = images[key] || VITRINE_DEFAULTS[key] || "";
    if (!url) return "";
    // Ajouter cache-busting seulement sur les URLs Firebase Storage
    if (url.includes("storage.googleapis.com")) {
      return `${url}?v=${cacheBust}`;
    }
    return url;
  };

  return (
    <VitrineContext.Provider value={{ images, getImage, refresh: load, cacheBust }}>
      {children}
    </VitrineContext.Provider>
  );
}

export function useVitrineImages() {
  return useContext(VitrineContext);
}
