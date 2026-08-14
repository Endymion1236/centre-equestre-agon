"use client";

import { useThemeSaison } from "@/hooks/useThemeSaison";

/**
 * Titre de la page d'accueil, remplacé pendant un thème saisonnier.
 *
 * Hors thème, on rend exactement le titre habituel — « L'équitation les pieds
 * dans le sable » —, qui reste le meilleur argument du centre le reste de
 * l'année. Le voile teinté par-dessus la photo vient du même thème.
 */
export function HeroTitreSaison() {
  const { theme: t, actif } = useThemeSaison();

  if (!actif || !t.heroTitre) {
    return (
      <>
        L&apos;équitation<br />
        <span className="text-gradient-gold">les pieds dans le sable</span>
      </>
    );
  }

  return (
    <>
      <span aria-hidden="true">{t.emoji} </span>{t.heroTitre}<br />
      <span style={{
        background: `linear-gradient(90deg, ${t.accentClair} 0%, ${t.accent} 100%)`,
        WebkitBackgroundClip: "text",
        WebkitTextFillColor: "transparent",
        backgroundClip: "text",
      }}>
        {t.heroSousTitre}
      </span>
    </>
  );
}

/** Voile coloré posé sur la photo d'accueil pendant un thème. */
export function HeroVoileSaison() {
  const { theme: t, actif } = useThemeSaison();
  if (!actif || !t.heroVoile) return null;
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0"
      style={{ background: t.heroVoile, zIndex: 2 }} />
  );
}
