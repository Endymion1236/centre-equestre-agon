import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Centre équestre à Agon-Coutainville",
  description: "Stages dès 3 ans, cours d’équitation, balades à cheval sur la plage, Pony Games et mini-ferme pédagogique à Agon-Coutainville.",
  alternates: { canonical: "/accueil" },
  openGraph: {
    title: "Centre Équestre d’Agon-Coutainville",
    description: "L’équitation les pieds dans le sable : stages, cours et balades sur la plage en Normandie.",
    images: ["/images/hero-equestre.png"],
  },
};

export default function AccueilLayout({ children }: { children: React.ReactNode }) {
  return children;
}
