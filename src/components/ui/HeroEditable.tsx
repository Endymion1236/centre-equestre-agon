"use client";

import { EditableImage } from "@/components/ui/EditableImage";

export function HeroEditable({ children }: { children: React.ReactNode }) {
  return (
    <EditableImage
      imageKey="hero-plage"
      mode="background"
      label="Changer la photo hero"
      className="relative min-h-screen flex items-center overflow-hidden"
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
