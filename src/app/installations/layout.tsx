import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Nos installations : 3 manèges et une carrière à Agon-Coutainville",
  description:
    "Trois manèges couverts, une carrière de 80 × 45 m, un club-house et une cavalerie suivie de près : découvrez les installations du Centre Équestre d’Agon-Coutainville, à deux pas de la plage.",
  alternates: { canonical: "/installations" },
};

export default function InstallationsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
