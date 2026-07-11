import type { Metadata, Viewport } from "next";
import { Providers } from "@/components/Providers";
import { SITE_CONFIG } from "@/lib/config";
import "./globals.css";

const socialImage = "/images/hero-equestre.png";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_CONFIG.url),
  title: {
    default: "Centre Équestre d'Agon-Coutainville | Stages, Balades, Cours",
    template: "%s | Centre Équestre Agon",
  },
  description:
    "Stages vacances dès 3 ans, balades à cheval sur la plage, cours toute l'année, Pony Games et mini-ferme pédagogique à Agon-Coutainville, dans la Manche.",
  keywords: [
    "centre équestre Agon-Coutainville",
    "poney club Manche",
    "balade cheval plage Normandie",
    "stage équitation Normandie",
    "baby poney",
    "Pony Games",
    "cours équitation Agon",
    "mini-ferme pédagogique",
  ],
  authors: [{ name: SITE_CONFIG.name, url: SITE_CONFIG.url }],
  creator: SITE_CONFIG.name,
  publisher: SITE_CONFIG.name,
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
    description: "L'équitation les pieds dans le sable : stages, balades sur la plage, cours et mini-ferme pédagogique.",
    url: SITE_CONFIG.url,
    siteName: "Centre Équestre Agon-Coutainville",
    locale: "fr_FR",
    type: "website",
    images: [{ url: socialImage, width: 1200, height: 630, alt: "Centre Équestre d'Agon-Coutainville" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Centre Équestre d'Agon-Coutainville",
    description: "Stages, balades à cheval sur la plage et cours toute l'année en Normandie.",
    images: [socialImage],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 },
  },
  category: "sports",
};

export const viewport: Viewport = {
  themeColor: "#0C1A2E",
  width: "device-width",
  initialScale: 1,
};

const structuredData = {
  "@context": "https://schema.org",
  "@type": ["SportsActivityLocation", "LocalBusiness"],
  name: SITE_CONFIG.name,
  description: "Centre équestre et poney club proposant stages, cours, balades sur la plage, Pony Games et activités pédagogiques.",
  url: SITE_CONFIG.url,
  image: `${SITE_CONFIG.url}${socialImage}`,
  telephone: SITE_CONFIG.contact.phone,
  email: SITE_CONFIG.contact.email,
  foundingDate: String(SITE_CONFIG.since),
  priceRange: "€€",
  address: {
    "@type": "PostalAddress",
    streetAddress: SITE_CONFIG.address.street,
    postalCode: SITE_CONFIG.address.zip,
    addressLocality: SITE_CONFIG.address.city,
    addressRegion: SITE_CONFIG.address.region,
    addressCountry: "FR",
  },
  areaServed: ["Agon-Coutainville", "Coutances", "Manche", "Normandie"],
  sameAs: [SITE_CONFIG.social.facebook].filter(Boolean),
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Libre+Baskerville:wght@400;700&family=Outfit:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />
        <script dangerouslySetInnerHTML={{
          __html: `
            if ('serviceWorker' in navigator) {
              window.addEventListener('load', () => {
                navigator.serviceWorker.register('/sw.js').catch(console.error);
              });
            }
          `,
        }} />
      </head>
      <body className="antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
