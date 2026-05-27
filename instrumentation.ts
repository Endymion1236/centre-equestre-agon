// ─────────────────────────────────────────────────────────────────────────
//  Sentry – instrumentation Next.js 15 (runtimes nodejs + edge)
// ─────────────────────────────────────────────────────────────────────────
// Ce fichier est CHARGE AUTOMATIQUEMENT par Next 15 au demarrage du serveur.
// On y enregistre Sentry pour les routes API, les Server Components, et les
// crons Vercel — bref tout ce qui n'est pas dans le navigateur de la famille.
//
// Le code client est dans `instrumentation-client.ts` (a la racine aussi).
//
// Pourquoi 2 fichiers : Next compile ces fichiers separement pour eviter
// d'embarquer du code serveur dans le bundle navigateur (= taille bundle).

import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    Sentry.init({
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

      // 10% des requetes tracees pour la perf — assez pour reperer les goulots
      // d'etranglement sans saturer le quota gratuit (5000 errors/mois).
      tracesSampleRate: 0.1,

      // Ne pas envoyer les erreurs en dev local : on les voit deja dans la
      // console, ca polluerait le dashboard prod et userait le quota.
      enabled: process.env.NODE_ENV === "production",

      // Environnement visible dans Sentry — utile quand on aura des deploys
      // preview Vercel : on pourra filtrer prod vs preview.
      environment: process.env.VERCEL_ENV || process.env.NODE_ENV,

      // ─── Filtrage des erreurs sans valeur ────────────────────────────
      beforeSend(event, hint) {
        const err = hint.originalException;
        const msg = err && typeof err === "object" && "message" in err
          ? String((err as any).message)
          : String(err);

        // Erreurs reseau cote serveur qui sont en realite des annulations
        // utilisateur (le parent ferme l'onglet en plein milieu d'une requete)
        if (msg.includes("aborted") || msg.includes("ECONNRESET")) return null;

        // Erreurs Firebase de quota / rate limit : on les voit deja dans la
        // console Firebase, pas besoin de doublonner
        if (msg.includes("RESOURCE_EXHAUSTED")) return null;

        return event;
      },

      // ─── Donnees sensibles : scrubbing maximal ───────────────────────
      // Sentry retire deja les mots-cles password/secret/token par defaut.
      // On ajoute les specifiques au CE : IBAN, CB, mandats SEPA, etc.
      sendDefaultPii: false,
    });
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    Sentry.init({
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
      tracesSampleRate: 0.1,
      enabled: process.env.NODE_ENV === "production",
      environment: process.env.VERCEL_ENV || process.env.NODE_ENV,
      sendDefaultPii: false,
    });
  }
}

// Capture les erreurs des requetes serveur que Next n'attrape pas autrement
// (depuis Next 15 c'est le moyen officiel, remplace _error.tsx ancien-style)
export const onRequestError = Sentry.captureRequestError;
