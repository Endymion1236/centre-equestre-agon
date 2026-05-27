import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  // ─── Images ────────────────────────────────────────────────────────
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "firebasestorage.googleapis.com" },
    ],
    // Formats modernes par défaut (AVIF → WebP → fallback). AVIF = 30-50 %
    // plus léger que JPEG à qualité équivalente. Next.js sert le meilleur
    // format supporté par le navigateur.
    formats: ["image/avif", "image/webp"],
    // Tailles de device courantes pour ne générer que les formats utiles
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
    imageSizes: [16, 32, 48, 64, 96, 128, 256],
    // Cache 30 jours côté CDN Vercel (images ne changent quasi jamais)
    minimumCacheTTL: 60 * 60 * 24 * 30,
  },

  // ─── Compression ───────────────────────────────────────────────────
  // gzip déjà activé par défaut sur Vercel, mais on le rend explicite
  compress: true,

  // ─── Optimisations packages ────────────────────────────────────────
  // `optimizePackageImports` fait du tree-shaking ciblé sur ces libs —
  // au lieu d'importer le package entier quand on fait `import { X }
  // from "lucide-react"`, Next.js ne pack que les icônes réellement
  // utilisées. Gain important sur lucide-react (500+ icônes) et
  // date-fns (300+ fonctions).
  experimental: {
    optimizePackageImports: ["lucide-react", "date-fns"],
  },

  // ─── Build — enlever les headers 'powered-by' inutiles ─────────────
  poweredByHeader: false,
};

// ─── Sentry wrapper ────────────────────────────────────────────────────
// Doit etre le dernier wrapper applique. Upload automatiquement les source
// maps a chaque deploy pour que les stack traces dans Sentry pointent vers
// du TypeScript lisible et non pas du JS minifie.
export default withSentryConfig(nextConfig, {
  // Identite du projet — alignee avec les variables d'env Vercel
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,

  // Token Vercel pour upload source maps (skipped si absent : build OK
  // mais pas de symbolication des stack traces — c'est gerable)
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // Pas de logs Sentry pendant le build : Vercel a deja des logs verbeux
  silent: !process.env.CI,

  // Tree-shake les logs Sentry verbeux en prod (gain ~5KB sur bundle final)
  disableLogger: true,

  // Tunnel : route les requetes Sentry via notre propre domaine pour
  // contourner les bloqueurs de pub qui filtrent ingest.sentry.io. Sinon
  // on perd 20-30% des erreurs des familles qui ont uBlock Origin.
  tunnelRoute: "/monitoring",

  // Pas d'upload des source maps si on est juste en preview, pour eviter
  // de saturer le quota Sentry — on garde l'upload aux deploys prod
  widenClientFileUpload: false,
});

