"use client";

import { useEffect, useRef, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { authFetch } from "@/lib/auth-fetch";

// Charge dynamiquement le script Tokenizer CAWL puis initialise l'iframe.
// Domaine preprod/prod selon CAWL_ENV (exposé via NEXT_PUBLIC).
const TOKENIZER_BASE =
  process.env.NEXT_PUBLIC_CAWL_ENV === "production"
    ? "https://payment.ca.cawl-solutions.fr"
    : "https://payment.preprod.ca.cawl-solutions.fr";

// NB CSP : si une Content-Security-Policy est ajoutée au site, penser à
// whitelister TOKENIZER_BASE dans script-src, connect-src et frame-src.

declare global {
  interface Window { Tokenizer?: any }
}

function TokenizePaiementInner() {
  const params = useSearchParams();
  const router = useRouter();
  const paymentId = params.get("paymentId") || "";
  const amount = params.get("amount") || "";       // acompte en euros
  const label = params.get("label") || "Acompte stage";

  const [status, setStatus] = useState<"loading" | "ready" | "submitting" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const tokenizerRef = useRef<any>(null);

  useEffect(() => {
    if (!paymentId || !amount) {
      setErrorMsg("Lien de paiement invalide.");
      setStatus("error");
      return;
    }

    let cancelled = false;

    const loadScript = (src: string) => new Promise<void>((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) return resolve();
      const s = document.createElement("script");
      s.src = src; s.onload = () => resolve(); s.onerror = () => reject(new Error("script load error"));
      document.body.appendChild(s);
    });

    (async () => {
      try {
        // 1. Créer la session de tokenisation côté serveur
        const res = await authFetch("/api/cawl/tokenize/session", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ locale: "fr-FR" }),
        });
        const data = await res.json();
        if (!res.ok || !data.hostedTokenizationUrl) throw new Error(data.error || "Session de tokenisation impossible");
        if (cancelled) return;

        // 2. Charger le script Tokenizer et initialiser l'iframe
        await loadScript(`${TOKENIZER_BASE}/hostedtokenization/js/client/tokenizer.min.js`);
        if (cancelled || !window.Tokenizer) throw new Error("Tokenizer indisponible");

        const tokenizer = new window.Tokenizer(
          data.hostedTokenizationUrl,
          "div-hosted-tokenization",
          { hideCardholderName: false },
        );
        tokenizerRef.current = tokenizer;
        await tokenizer.initialize();
        if (!cancelled) setStatus("ready");
      } catch (e: any) {
        if (!cancelled) { setErrorMsg(e?.message || "Erreur de chargement du paiement"); setStatus("error"); }
      }
    })();

    return () => { cancelled = true; try { tokenizerRef.current?.destroy?.(); } catch {} };
  }, [paymentId, amount]);

  const handleSubmit = async () => {
    if (!tokenizerRef.current) return;
    setStatus("submitting");
    try {
      const result = await tokenizerRef.current.submitTokenization();
      if (!result?.success || !result?.hostedTokenizationId) {
        throw new Error(result?.error?.message || "Carte refusée ou formulaire incomplet");
      }
      // Finaliser : créer le paiement de l'acompte avec le token permanent
      const res = await authFetch("/api/cawl/tokenize/finalize", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hostedTokenizationId: result.hostedTokenizationId,
          paymentId, amount: Number(amount),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Paiement refusé");

      if (data.requiresRedirect && data.redirectUrl) {
        window.location.href = data.redirectUrl; // 3-D Secure challenge
        return;
      }
      router.push(`/espace-cavalier/factures?cawlReturn=${paymentId}`);
    } catch (e: any) {
      setErrorMsg(e?.message || "Erreur lors du paiement");
      setStatus("error");
    }
  };

  return (
    <div className="max-w-lg mx-auto p-4">
      <h1 className="font-display text-xl font-bold text-blue-800 mb-1">{label}</h1>
      <p className="font-body text-sm text-gray-500 mb-4">
        Acompte de <strong>{Number(amount).toFixed(2)}€</strong>. Votre carte sera enregistrée
        pour le prélèvement automatique du solde une semaine avant le stage.
      </p>

      {status === "error" ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
          <p className="font-body text-sm text-red-700 mb-3">{errorMsg}</p>
          <button onClick={() => router.back()} className="px-4 py-2 rounded-lg bg-white border border-gray-200 font-body text-sm cursor-pointer">Retour</button>
        </div>
      ) : (
        <>
          {status === "loading" && <p className="font-body text-sm text-gray-400 text-center py-8">Chargement du paiement sécurisé…</p>}
          <div id="div-hosted-tokenization" />
          {status === "ready" && (
            <button onClick={handleSubmit}
              className="w-full mt-4 py-3 rounded-xl font-body text-sm font-semibold text-white bg-blue-500 border-none cursor-pointer hover:bg-blue-600">
              Payer l&apos;acompte {Number(amount).toFixed(2)}€
            </button>
          )}
          {status === "submitting" && <p className="font-body text-sm text-gray-400 text-center py-4">Traitement en cours…</p>}
        </>
      )}
    </div>
  );
}

export default function TokenizePaiementPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center font-body text-sm text-gray-400">Chargement…</div>}>
      <TokenizePaiementInner />
    </Suspense>
  );
}
