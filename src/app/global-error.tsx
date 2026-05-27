"use client";

// ─────────────────────────────────────────────────────────────────────────
//  Global Error Boundary (App Router)
// ─────────────────────────────────────────────────────────────────────────
// Capture les erreurs de rendu React qui remontent au-dela de tous les
// error.tsx locaux. Sans ce fichier, Next.js affiche une page 500 generique
// sans rien rapporter a Sentry — on perd le crash.
//
// Recommandation officielle Sentry pour Next App Router :
// https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/#react-render-errors-in-app-router

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="fr">
      <body>
        <div style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "2rem",
          fontFamily: "system-ui, sans-serif",
          background: "#f8fafc",
        }}>
          <div style={{
            maxWidth: 500,
            background: "white",
            padding: "2rem",
            borderRadius: 16,
            boxShadow: "0 4px 20px rgba(0,0,0,0.08)",
          }}>
            <h1 style={{ fontSize: "1.5rem", marginBottom: "1rem", color: "#0f172a" }}>
              Une erreur est survenue
            </h1>
            <p style={{ color: "#64748b", marginBottom: "1.5rem", lineHeight: 1.6 }}>
              Desole, quelque chose s'est mal passe. L'equipe technique a ete
              automatiquement prevenue. Tu peux essayer de rafraichir la page
              ou revenir a l'accueil.
            </p>
            {error.digest && (
              <p style={{ fontSize: "0.75rem", color: "#94a3b8", marginBottom: "1.5rem", fontFamily: "monospace" }}>
                Reference : {error.digest}
              </p>
            )}
            <div style={{ display: "flex", gap: "0.75rem" }}>
              <button
                onClick={reset}
                style={{
                  flex: 1,
                  padding: "0.75rem 1.5rem",
                  background: "#0f172a",
                  color: "white",
                  border: "none",
                  borderRadius: 12,
                  cursor: "pointer",
                  fontWeight: 600,
                }}
              >
                Reessayer
              </button>
              <a
                href="/"
                style={{
                  flex: 1,
                  padding: "0.75rem 1.5rem",
                  background: "#e2e8f0",
                  color: "#0f172a",
                  textDecoration: "none",
                  borderRadius: 12,
                  fontWeight: 600,
                  textAlign: "center",
                }}
              >
                Retour accueil
              </a>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
