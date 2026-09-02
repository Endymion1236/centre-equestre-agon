import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  // ─── Redirections ──────────────────────────────────────────────────
  // Quatre outils internes vivaient à la racine du site, hors /admin, avec
  // en prime une copie conforme imbriquée (/pedagogie/pedagogie…). Aucun
  // lien de l'application n'y menait, et une version plus complète existait
  // déjà sous /admin. Supprimés, mais redirigés : un favori ou un lien
  // partagé en interne continue de fonctionner.
  async redirects() {
    return [
      { source: "/pedagogie/:path*", destination: "/admin/pedagogie", permanent: true },
      { source: "/passage/:path*", destination: "/admin/passage", permanent: true },
      { source: "/bons-recup/:path*", destination: "/admin/bons-recup", permanent: true },
      { source: "/email-reprise/:path*", destination: "/admin/email-reprise", permanent: true },
      { source: "/modeles/:path*", destination: "/admin/modeles", permanent: true },
    ];
  },

  // ─── En-têtes de sécurité ──────────────────────────────────────────
  // L'application manipule des fiches sanitaires de mineurs, des IBAN de
  // mandats SEPA et une caisse soumise à l'inaltérabilité NF525, et n'envoyait
  // jusqu'ici AUCUN en-tête de sécurité (audit 29/08/2026).
  //
  // La CSP est volontairement en `Report-Only` pour l'instant : la passer en
  // mode bloquant sans observation casserait Firebase, le tunnel Sentry
  // (/monitoring) ou les polices Google. Relever les violations dans la
  // console du navigateur pendant quelques jours, ajuster, PUIS renommer
  // l'en-tête en `Content-Security-Policy`.
  async headers() {
    const csp = [
      "default-src 'self'",
      // Next.js injecte des scripts inline (hydratation, chunks) : 'unsafe-inline'
      // reste nécessaire tant qu'on n'a pas branché les nonces.
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.gstatic.com https://apis.google.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' data: https://fonts.gstatic.com",
      "img-src 'self' data: blob: https://firebasestorage.googleapis.com https://storage.googleapis.com https://images.unsplash.com https://*.googleusercontent.com",
      "media-src 'self' data: blob: https://firebasestorage.googleapis.com https://storage.googleapis.com",
      // Firebase (Auth, Firestore, Storage, FCM) + CAWL + le tunnel Sentry.
      "connect-src 'self' https://*.googleapis.com https://*.firebaseio.com wss://*.firebaseio.com https://*.cloudfunctions.net https://securetoken.googleapis.com https://identitytoolkit.googleapis.com",
      // Fenêtre de connexion Google/Facebook.
      "frame-src 'self' https://*.firebaseapp.com https://accounts.google.com https://www.facebook.com",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'self'",
      "upgrade-insecure-requests",
    ].join("; ");

    return [
      {
        source: "/:path*",
        headers: [
          // HTTPS obligatoire pendant deux ans, sous-domaines compris.
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          // Interdit au navigateur de deviner un type MIME : une image piégée
          // ne peut pas être réinterprétée en script.
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Anti-clickjacking (doublé par frame-ancestors dans la CSP).
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          // Ne fuite pas l'URL complète (qui contient des identifiants de
          // paiement et de famille) vers les sites tiers.
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Le micro est réservé à NOS pages (borne Câlin, assistant vocal,
          // dictée du montoir et de la progression) : `self` l'autorise sur
          // notre origine seule, jamais dans un cadre tiers. `microphone=()`
          // le coupait partout — le navigateur refusait sans même demander,
          // et la borne affichait « Micro refusé » quoi qu'on règle sur la
          // tablette. Caméra et géoloc restent interdites : rien ne les utilise.
          { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=(), payment=(), usb=()" },
          { key: "Content-Security-Policy-Report-Only", value: csp },
        ],
      },
    ];
  },

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

  // ─── Génération des PDF (factures, avoirs, mandats, livrets) ───────
  //
  // @react-pdf/renderer s'appuie sur pdfkit, qui charge ses polices
  // standard (Helvetica & co) en lisant des fichiers .cjs à l'exécution,
  // par un chemin construit à la volée. Le traceur de Next ne peut pas le
  // deviner : les fichiers restaient hors du bundle serverless et toute
  // facture mourait en production sur
  //   Cannot find module '/var/task/node_modules/pdfkit/js/standard-fonts/Helvetica.cjs'
  // — sans que rien ne le dise, puisque la route répondait « Erreur interne ».
  //
  // `serverExternalPackages` laisse ces paquets hors du bundle (ils sont
  // chargés depuis node_modules), et `outputFileTracingIncludes` force la
  // copie des polices dans la fonction de chaque route qui produit un PDF.
  serverExternalPackages: ["@react-pdf/renderer", "pdfkit", "fontkit"],
  outputFileTracingIncludes: {
    "/api/invoice-pdf": ["./node_modules/pdfkit/js/**/*"],
    "/api/avoir-pdf": ["./node_modules/pdfkit/js/**/*"],
    "/api/livret-pdf": ["./node_modules/pdfkit/js/**/*"],
    "/api/compta-export-pdf": ["./node_modules/pdfkit/js/**/*"],
    "/api/admin/sepa-mandate-pdf": ["./node_modules/pdfkit/js/**/*"],
    "/api/admin/facturx-pdf": ["./node_modules/pdfkit/js/**/*"],
  },

  // ─── Build — enlever les headers 'powered-by' inutiles ─────────────
  poweredByHeader: false,

  // ─── Empreinte du build ────────────────────────────────────────────
  // Injectee a la compilation pour savoir, depuis l'interface, QUELLE
  // version est reellement en ligne. Sans ce reperage, impossible de
  // distinguer « la fonctionnalite est absente » de « le deploiement
  // n'est pas passe » — on peut chercher un bug qui n'existe pas.
  env: {
    NEXT_PUBLIC_BUILD_SHA: (process.env.VERCEL_GIT_COMMIT_SHA || "local").slice(0, 7),
    NEXT_PUBLIC_BUILD_TIME: new Date().toISOString(),
  },
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

