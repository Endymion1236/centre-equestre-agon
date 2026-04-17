import type { NextConfig } from "next";

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

export default nextConfig;
