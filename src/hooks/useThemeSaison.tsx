"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { THEMES, type ThemeId, type ThemeSaisonnier } from "@/lib/themes-saisonniers";

/**
 * Thème saisonnier courant, partagé par les composants du site public.
 *
 * Une seule lecture Firestore pour toute la page : le bandeau, le hero et les
 * décorations ont tous besoin du réglage, et trois lectures pour la même
 * donnée seraient du gaspillage.
 */

interface Ctx {
  theme: ThemeSaisonnier;
  actif: boolean;
  message: string;
  lien: string;
}

const ThemeCtx = createContext<Ctx>({ theme: THEMES.aucun, actif: false, message: "", lien: "" });

export function useThemeSaison() {
  return useContext(ThemeCtx);
}

export function ThemeSaisonProvider({ children }: { children: React.ReactNode }) {
  const [etat, setEtat] = useState<Ctx>({ theme: THEMES.aucun, actif: false, message: "", lien: "" });

  useEffect(() => {
    getDoc(doc(db, "settings", "theme"))
      .then(snap => {
        if (!snap.exists()) return;
        const d = snap.data() as any;
        if (d.actif === false) return;
        const id = (d.themeId || "aucun") as ThemeId;
        const t = THEMES[id];
        if (!t || id === "aucun") return;
        setEtat({
          theme: t,
          actif: true,
          message: (d.message || "").trim() || t.messageDefaut,
          lien: (d.lien || "").trim(),
        });
      })
      .catch(() => { /* un thème n'est pas critique */ });
  }, []);

  return <ThemeCtx.Provider value={etat}>{children}</ThemeCtx.Provider>;
}
