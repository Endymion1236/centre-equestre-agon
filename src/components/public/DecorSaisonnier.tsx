"use client";

import { useState } from "react";
import { useThemeSaison } from "@/hooks/useThemeSaison";

/**
 * Décor saisonnier du site public : bandeau d'annonce, éléments flottants,
 * décorations d'angle et brume de bas de page.
 *
 * Tout est purement ornemental — retiré des lecteurs d'écran, ignoré par les
 * clics, et entièrement désactivé pour qui a demandé moins d'animations.
 */
export default function DecorSaisonnier() {
  const { theme: t, actif, message, lien } = useThemeSaison();
  const [ferme, setFerme] = useState(false);

  if (!actif) return null;

  const contenu = (
    <span className="font-body text-sm font-semibold">
      <span aria-hidden="true">{t.emoji}</span> {message}
    </span>
  );

  return (
    <>
      {!ferme && (
        <div
          className="relative z-40 flex items-center justify-center gap-3 px-4 py-2.5 text-center"
          style={{ background: t.bandeauFond, color: t.bandeauTexte, borderBottom: `2px solid ${t.bandeauBordure}` }}
        >
          {lien ? (
            <a href={lien} className="no-underline hover:underline" style={{ color: t.bandeauTexte }}>{contenu}</a>
          ) : contenu}
          <button onClick={() => setFerme(true)} aria-label="Masquer ce bandeau"
            className="absolute right-3 border-none bg-transparent text-lg leading-none opacity-60 hover:opacity-100"
            style={{ color: t.bandeauTexte, cursor: "pointer" }}>×</button>
        </div>
      )}

      <div aria-hidden="true" className="theme-decor pointer-events-none fixed inset-0 z-30 overflow-hidden">
        {/* Éléments flottants */}
        {Array.from({ length: t.densite }).map((_, i) => (
          <span key={i} className="theme-particule absolute select-none"
            style={{
              left: `${(i * 97 + 13) % 96}%`,
              fontSize: `${16 + (i % 4) * 8}px`,
              animationDelay: `${(i * 1.3) % 14}s`,
              animationDuration: `${12 + (i % 5) * 3}s`,
              opacity: 0.45,
            }}>
            {t.particules[i % t.particules.length]}
          </span>
        ))}

        {/* Décorations d'angle, en grand */}
        <span className="absolute left-2 top-24 select-none opacity-30" style={{ fontSize: 74, transform: "rotate(-14deg)" }}>{t.coins[0]}</span>
        <span className="absolute right-2 top-20 select-none opacity-25" style={{ fontSize: 66, transform: "rotate(18deg)" }}>{t.coins[1]}</span>
        <span className="absolute bottom-24 left-4 select-none opacity-25" style={{ fontSize: 58, transform: "rotate(10deg)" }}>{t.coins[2]}</span>
        <span className="absolute bottom-20 right-4 select-none opacity-30" style={{ fontSize: 62, transform: "rotate(-12deg)" }}>{t.coins[3]}</span>

        {/* Brume de bas de page */}
        <div className="absolute bottom-0 left-0 h-40 w-full"
          style={{ background: `linear-gradient(to top, ${t.brume} 0%, transparent 100%)` }} />
      </div>

      <style jsx global>{`
        @keyframes theme-chute {
          0%   { transform: translateY(-12vh) rotate(0deg); }
          100% { transform: translateY(112vh) rotate(300deg); }
        }
        .theme-particule {
          top: 0;
          animation-name: theme-chute;
          animation-timing-function: linear;
          animation-iteration-count: infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .theme-decor { display: none; }
        }
        @media (max-width: 640px) {
          /* Sur mobile, les grandes décorations d'angle mangent l'écran. */
          .theme-decor > span { display: none; }
        }
      `}</style>
    </>
  );
}
