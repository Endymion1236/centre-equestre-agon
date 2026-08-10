import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Places disponibles : stages, cours et balades à Agon-Coutainville",
  description:
    "Consultez en direct les places restantes sur les stages, cours et balades du Centre Équestre d’Agon-Coutainville. Sans créer de compte.",
  alternates: { canonical: "/disponibilites" },
};

export default function DisponibilitesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
