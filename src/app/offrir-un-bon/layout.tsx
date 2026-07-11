import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Bon cadeau équitation",
  description: "Offrez un bon cadeau du Centre Équestre d’Agon-Coutainville pour une balade à cheval, un stage, un cours ou une activité équestre.",
  alternates: { canonical: "/offrir-un-bon" },
  openGraph: {
    title: "Offrir une expérience équestre à Agon-Coutainville",
    description: "Choisissez le montant et recevez votre bon cadeau par email après le paiement sécurisé.",
    images: ["/images/hero-equestre.png"],
  },
};

export default function GiftLayout({ children }: { children: React.ReactNode }) {
  return children;
}
