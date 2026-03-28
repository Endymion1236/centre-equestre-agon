import type { Metadata, Viewport } from "next";
import { Providers } from "@/components/Providers";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Centre Équestre d'Agon-Coutainville | Stages, Balades, Cours",
    template: "%s | Centre Équestre Agon",
  },
  description:
    "Stages vacances dès 3 ans, balades à cheval sur la plage, cours toute l'année et mini-ferme pédagogique. À 800m de la mer, à Agon-Coutainville (Manche, Normandie).",
  keywords: [
    "centre équestre", "agon coutainville", "poney club",
    "balade cheval plage", "stage équitation normandie",
    "baby poney", "pony games", "mini-ferme",
  ],
  manifest: "/manifest.json",
  icons: {
    icon: "/images/favicon.ico",
    apple: "/icons/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "CE Agon",
  },
  openGraph: {
    title: "Centre Équestre d'Agon-Coutainville",
    description:
      "L'équitation les pieds dans le sable — stages, balades au coucher du soleil et mini-ferme pédagogique.",
    url: "https://www.centreequestreagon.com",
    siteName: "Centre Équestre Agon-Coutainville",
    locale: "fr_FR",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#0C1A2E",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Libre+Baskerville:wght@400;700&family=Outfit:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
        <script dangerouslySetInnerHTML={{
          __html: `
            if ('serviceWorker' in navigator) {
              window.addEventListener('load', () => {
                navigator.serviceWorker.register('/sw.js').catch(console.error);
              });
            }
          `
        }} />
      </head>
      <body className="antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
