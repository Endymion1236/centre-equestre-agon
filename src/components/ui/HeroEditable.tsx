"use client";

import { EditableImage } from "@/components/ui/EditableImage";

export function HeroEditable({ children }: { children: React.ReactNode }) {
  return (
    <EditableImage
      imageKey="hero-plage"
      mode="background"
      label="Changer la photo hero"
      className="relative min-h-screen flex items-center overflow-hidden"
      style={{ backgroundPosition: "center", backgroundSize: "cover" }}
    >
      {children}
    </EditableImage>
  );
}
