"use client";

import { EditableImage } from "@/components/ui/EditableImage";

// Hauteur de la photo d'accueil.
//
// Elle occupait tout l'écran (min-h-screen) : au chargement, le visiteur ne
// voyait qu'elle, et rien n'indiquait qu'il y avait une suite. En s'arrêtant
// un peu avant le bas, la section suivante affleure et invite à faire défiler.
//
// Unité `svh` et non `vh` : sur mobile, `vh` se cale sur la fenêtre barres de
// navigation masquées, ce qui rend le bloc plus haut que l'écran réellement
// visible et fait sauter la mise en page quand les barres réapparaissent.
const HAUTEUR = "min-h-[76svh] sm:min-h-[82svh]";

export function HeroEditable({ children }: { children: React.ReactNode }) {
  return (
    <EditableImage
      imageKey="hero-plage"
      mode="background"
      label="Changer la photo hero"
      className={`relative ${HAUTEUR} flex items-center overflow-hidden`}
      style={{ backgroundPosition: "center 40%", backgroundSize: "cover" }}
    >
      {/* Overlay sombre pour lisibilité du texte — toujours présent */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: "linear-gradient(135deg, rgba(12,26,46,0.72) 0%, rgba(32,80,160,0.35) 50%, rgba(12,26,46,0.55) 100%)",
          zIndex: 1,
        }}
      />
      {children}
    </EditableImage>
  );
}
