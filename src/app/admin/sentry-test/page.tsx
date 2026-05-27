"use client";

// ─────────────────────────────────────────────────────────────────────────
//  Page de test Sentry — admin uniquement
// ─────────────────────────────────────────────────────────────────────────
// Permet a Nicolas de declencher des erreurs volontaires pour verifier que
// Sentry recoit bien les events et que les emails arrivent.
//
// 3 boutons :
//   1. Erreur client (TypeError sur undefined.toLowerCase)
//      → teste instrumentation-client.ts
//   2. Erreur serveur (route API qui throw)
//      → teste instrumentation.ts (runtime nodejs)
//   3. Erreur non gerée dans une Promise
//      → teste la capture des unhandled rejections
//
// Apres avoir clique, va sur sentry.io → Issues → tu dois voir l'erreur
// apparaitre en 10-30 secondes. Tu recois aussi un email immediatement
// (sauf si l'erreur exacte existe deja "resolue" dans le dashboard).

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";

export default function SentryTestPage() {
  const { isAdmin } = useAuth();
  const [status, setStatus] = useState<string>("");

  if (!isAdmin) {
    return (
      <div className="p-8">
        <h1 className="font-display text-2xl">Acces refuse</h1>
        <p>Cette page est reservee aux administrateurs.</p>
      </div>
    );
  }

  const triggerClientError = () => {
    setStatus("Declenchement erreur client…");
    // Cast pour faire taire TS — on VEUT planter ici
    const undef: any = undefined;
    undef.toLowerCase(); // → TypeError envoye a Sentry
  };

  const triggerServerError = async () => {
    setStatus("Declenchement erreur serveur…");
    try {
      const res = await fetch("/api/sentry-test", { method: "POST" });
      const data = await res.json();
      setStatus(`Reponse serveur : ${JSON.stringify(data)}`);
    } catch (e: any) {
      setStatus(`Erreur fetch : ${e.message}`);
    }
  };

  const triggerUnhandledPromise = () => {
    setStatus("Declenchement promise rejetee…");
    // Pas de catch volontaire — Sentry doit attraper
    Promise.reject(new Error("Test unhandled promise rejection from Sentry test page"));
  };

  return (
    <div className="p-8 max-w-2xl">
      <h1 className="font-display text-2xl mb-2">Test Sentry</h1>
      <p className="text-slate-600 mb-6">
        Declenche des erreurs volontaires pour verifier que Sentry capture
        bien et que tu recois les emails. Les erreurs apparaissent sur
        sentry.io → Issues en 10-30 secondes.
      </p>

      <div className="flex flex-col gap-3">
        <button
          onClick={triggerClientError}
          className="px-4 py-3 rounded-xl bg-red-500 text-white font-body font-semibold hover:bg-red-600"
        >
          1. Erreur cote client (TypeError)
        </button>
        <button
          onClick={triggerServerError}
          className="px-4 py-3 rounded-xl bg-orange-500 text-white font-body font-semibold hover:bg-orange-600"
        >
          2. Erreur cote serveur (route API)
        </button>
        <button
          onClick={triggerUnhandledPromise}
          className="px-4 py-3 rounded-xl bg-purple-500 text-white font-body font-semibold hover:bg-purple-600"
        >
          3. Promise rejetee non geree
        </button>
      </div>

      {status && (
        <div className="mt-6 p-4 rounded-xl bg-slate-100 font-mono text-sm">
          {status}
        </div>
      )}

      <div className="mt-8 p-4 rounded-xl bg-blue-50 border border-blue-200">
        <p className="font-body text-sm text-blue-900">
          <strong>Note :</strong> Sentry n'est actif qu'en production
          (Vercel). En dev local (npm run dev), les erreurs s'affichent
          dans la console mais ne partent pas vers Sentry.
        </p>
      </div>
    </div>
  );
}
