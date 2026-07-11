import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Planning des activités",
  description: "Consultez les prochains stages, balades, animations et créneaux disponibles au Centre Équestre d’Agon-Coutainville.",
  alternates: { canonical: "/planning" },
};

export default function PlanningLayout({ children }: { children: React.ReactNode }) {
  return children;
}
