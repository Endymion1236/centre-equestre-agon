import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "L’équipe, l’histoire et les poneys",
  description: "Découvrez l’histoire familiale du Centre Équestre d’Agon-Coutainville, son équipe et les poneys qui accompagnent les cavaliers.",
  alternates: { canonical: "/equipe" },
};

export default function EquipeLayout({ children }: { children: React.ReactNode }) {
  return children;
}
