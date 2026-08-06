import type { Metadata, Viewport } from "next";

/**
 * Layout de la borne : attache le manifeste PWA DÉDIÉ (manifest-borne.json,
 * start_url = /borne, plein écran, paysage) à la place du manifeste général
 * du site (start_url = /).
 *
 * Raison : l'appli installée depuis n'importe quelle page du site s'ouvrait
 * sur la page d'accueil, sans barre d'adresse pour rejoindre /borne. En
 * visitant /borne dans Chrome puis « Installer l'application », la tablette
 * obtient une appli « Borne Câlin » qui démarre directement sur la borne,
 * en plein écran — exactement le comportement kiosque voulu.
 */
export const metadata: Metadata = {
  title: "Borne d'accueil — Câlin",
  manifest: "/manifest-borne.json",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#0C1A2E",
};

export default function BorneLayout({ children }: { children: React.ReactNode }) {
  return children;
}
