import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Galerie photos",
  description: "Découvrez en images les stages, balades sur la plage, compétitions, animaux et moments de vie du Centre Équestre d’Agon-Coutainville.",
  alternates: { canonical: "/galerie" },
};

export default function GalerieLayout({ children }: { children: React.ReactNode }) {
  return children;
}
