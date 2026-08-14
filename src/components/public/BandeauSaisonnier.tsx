"use client";

import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { THEMES, type ThemeId } from "@/lib/themes-saisonniers";

/**
 * Bandeau saisonnier du site vitrine, plus quelques éléments décoratifs.
 *
 * Ne s'affiche que si un thème a été activé depuis l'admin. La charte du
 * centre n'est pas touchée : seul ce bandeau porte les couleurs de saison.
 */
export default function BandeauSaisonnier() {
  const [theme, setTheme] = useState<ThemeId>("aucun");
  const [message, setMessage] = useState("");
  const [lien, setLien] = useState("");
  const [ferme, setFerme] = useState(false);

  useEffect(() => {
    getDoc(doc(db, "settings", "theme"))
      .then(snap => {
        if (!snap.exists()) return;
        const d = snap.data() as any;
        if (d.actif === false) return;
        const id = (d.themeId || "aucun") as ThemeId;
        if (!THEMES[id] || id === "aucun") return;
        setTheme(id);
        setMessage((d.message || "").trim() || THEMES[id].messageDefaut);
        setLien((d.lien || "").trim());
      })
      .catch(() => { /* silencieux : un thème n'est pas critique */ });
  }, []);

  if (theme === "aucun" || ferme) return null;
  const t = THEMES[theme];

  const contenu = (
    <span className="font-body text-sm font-semibold">
      <span aria-hidden="true">{t.emoji}</span> {message}
    </span>
  );

  return (
    <>
      <div
        className="relative z-40 flex items-center justify-center gap-3 px-4 py-2.5 text-center"
        style={{ background: t.bandeauFond, color: t.bandeauTexte, borderBottom: `2px solid ${t.bandeauBordure}` }}
      >
        {lien ? (
          <a href={lien} className="no-underline hover:underline" style={{ color: t.bandeauTexte }}>
            {contenu}
          </a>
        ) : contenu}
        <button
          onClick={() => setFerme(true)}
          aria-label="Masquer ce bandeau"
          className="absolute right-3 bg-transparent border-none cursor-pointer text-lg leading-none opacity-60 hover:opacity-100"
          style={{ color: t.bandeauTexte }}
        >
          ×
        </button>
      </div>

      {/* Décor flottant : purement ornemental, retiré des lecteurs d'écran et
          désactivé pour qui demande moins d'animations (prefers-reduced-motion). */}
      {t.particules.length > 0 && (
        <div aria-hidden="true" className="theme-particules pointer-events-none fixed inset-0 z-30 overflow-hidden">
          {Array.from({ length: 9 }).map((_, i) => (
            <span
              key={i}
              className="theme-particule absolute select-none"
              style={{
                left: `${(i * 11 + 4) % 96}%`,
                fontSize: `${14 + (i % 3) * 6}px`,
                animationDelay: `${i * 1.7}s`,
                animationDuration: `${13 + (i % 4) * 4}s`,
                opacity: 0.35,
              }}
            >
              {t.particules[i % t.particules.length]}
            </span>
          ))}
        </div>
      )}

      <style jsx global>{`
        @keyframes theme-chute {
          0%   { transform: translateY(-8vh) rotate(0deg); }
          100% { transform: translateY(108vh) rotate(240deg); }
        }
        .theme-particule {
          top: 0;
          animation-name: theme-chute;
          animation-timing-function: linear;
          animation-iteration-count: infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .theme-particules { display: none; }
        }
      `}</style>
    </>
  );
}
