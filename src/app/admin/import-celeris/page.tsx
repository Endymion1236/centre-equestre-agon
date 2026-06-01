"use client";

import { useState } from "react";
import { authFetch } from "@/lib/auth-fetch";

// Page admin temporaire pour importer les familles des stages de juillet 2026
// depuis Celeris, sur la base TEST uniquement. À retirer après usage.
export default function ImportCelerisPage() {
  const [loading, setLoading] = useState(false);
  const [rapport, setRapport] = useState<any>(null);
  const [erreur, setErreur] = useState("");

  const lancer = async (apply: boolean) => {
    setLoading(true); setErreur(""); setRapport(null);
    try {
      const res = await authFetch(`/api/admin/import-stages-juillet${apply ? "?apply=true" : ""}`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) { setErreur(data.error || "Erreur"); }
      else setRapport(data);
    } catch (e: any) {
      setErreur(e?.message || "Erreur réseau");
    }
    setLoading(false);
  };

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="font-display text-2xl font-bold text-blue-800 mb-2">Import Celeris — Stages juillet 2026</h1>
      <p className="font-body text-sm text-gray-500 mb-4">
        Crée les familles + enfants des inscrits aux stages de juillet (sans inscription aux stages
        ni paiement). Fonctionne uniquement sur la base <strong>test</strong>. Les familles dont
        l&apos;email existe déjà sont ignorées.
      </p>

      <div className="flex gap-3 mb-6">
        <button onClick={() => lancer(false)} disabled={loading}
          className="px-4 py-2.5 rounded-xl font-body text-sm font-semibold text-blue-700 bg-blue-50 border border-blue-200 cursor-pointer disabled:opacity-50">
          {loading ? "…" : "1. Aperçu (sans rien écrire)"}
        </button>
        <button onClick={() => { if (confirm("Créer réellement les familles sur la base TEST ?")) lancer(true); }} disabled={loading}
          className="px-4 py-2.5 rounded-xl font-body text-sm font-semibold text-white bg-blue-500 border-none cursor-pointer disabled:opacity-50">
          {loading ? "…" : "2. Importer pour de vrai"}
        </button>
      </div>

      {erreur && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 font-body text-sm text-red-700 mb-4">{erreur}</div>
      )}

      {rapport && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 font-body text-sm">
          <div className="font-semibold text-blue-800 mb-2">Rapport — {rapport.mode}</div>
          <div className="text-xs text-gray-500 mb-3">Base : {rapport.projectId}</div>
          <ul className="space-y-1 mb-3">
            <li>Familles dans le fichier : <strong>{rapport.total_familles_fichier}</strong></li>
            <li className="text-green-700">À créer : <strong>{rapport.a_creer}</strong> (dont {rapport.sans_email_crees} sans email)</li>
            <li>Enfants : <strong>{rapport.enfants_crees}</strong></li>
            <li className="text-amber-700">Ignorées (enfant déjà en base) : <strong>{rapport.skip_enfant_existant}</strong></li>
          </ul>
          {rapport.details_crees?.length > 0 && (
            <details className="mb-2">
              <summary className="cursor-pointer text-blue-600">Détail des {rapport.details_crees.length} familles à créer</summary>
              <ul className="mt-2 text-xs text-gray-600 space-y-0.5 max-h-64 overflow-y-auto">
                {rapport.details_crees.map((d: string, i: number) => <li key={i}>• {d}</li>)}
              </ul>
            </details>
          )}
          {rapport.details_skip?.length > 0 && (
            <details>
              <summary className="cursor-pointer text-amber-600">Détail des {rapport.details_skip.length} ignorées</summary>
              <ul className="mt-2 text-xs text-gray-500 space-y-0.5 max-h-48 overflow-y-auto">
                {rapport.details_skip.map((d: string, i: number) => <li key={i}>• {d}</li>)}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
