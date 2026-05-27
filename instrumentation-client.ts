// ─────────────────────────────────────────────────────────────────────────
//  Sentry – instrumentation client (navigateur des familles + admin)
// ─────────────────────────────────────────────────────────────────────────
// Charge automatiquement par Next 15 au demarrage de l'app cote navigateur.
// Capture toutes les erreurs JS non-attrapees, les rejets de promesses, et
// (selon la config) les performances de navigation.
//
// On ne charge PAS Session Replay : ca filme l'ecran des familles pour
// rejouer les bugs visuellement. Genial techniquement mais lourd cote RGPD
// (consentement explicite requis dans une CGU dediee). On peut activer plus
// tard si Nicolas veut investir 2h sur les CGU.

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  tracesSampleRate: 0.1,
  enabled: process.env.NODE_ENV === "production",
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.NODE_ENV,

  // ─── Pas de Session Replay (RGPD-friendly par defaut) ─────────────────
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,

  // ─── Filtrage cote client ──────────────────────────────────────────────
  ignoreErrors: [
    // Erreurs des extensions navigateur (AdBlock, Grammarly, etc.) — pas
    // notre faute, on ne peut rien y faire
    /chrome-extension/,
    /moz-extension/,
    "ResizeObserver loop limit exceeded",
    "ResizeObserver loop completed with undelivered notifications",

    // Reseau 4G qui coupe en pleine inscription : tres frequent en mobile
    // au centre equestre (= zone rurale Agon-Coutainville). Pas de valeur
    // pour Sentry, ca polluerait le dashboard
    "Network request failed",
    "Failed to fetch",
    "Load failed",
    "AbortError",
    "The user aborted a request",

    // Erreurs Firebase Auth normales (utilisateur deconnecte par expiration)
    "auth/user-token-expired",
    "auth/network-request-failed",
  ],

  // ─── Anonymisation : pas d'email ni IP dans les events par defaut ─────
  // Si un jour on veut tracer une famille precise pour debugger, on le fera
  // en activant ponctuellement sendDefaultPii sur une session admin.
  sendDefaultPii: false,

  beforeSend(event) {
    // Strip toute mention d'IBAN, mandat SEPA, numero carte qui aurait pu
    // se glisser dans une exception (defense en profondeur — Sentry scrub
    // deja les mots-cles standards, on ajoute les notres)
    if (event.exception?.values) {
      for (const exc of event.exception.values) {
        if (exc.value) {
          exc.value = exc.value
            .replace(/FR\d{2}\s?\d{4}(\s?\d{4}){4}\s?\d{3}/g, "[IBAN]")
            .replace(/\b\d{16}\b/g, "[CB]")
            .replace(/\b\d{4}\s?\d{4}\s?\d{4}\s?\d{4}\b/g, "[CB]");
        }
      }
    }
    return event;
  },
});

// Capture les changements de route — utile pour reconstituer le chemin
// quand on debugge une erreur ("la famille etait sur /reserver puis a
// cliqué sur /panier et BOUM")
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
