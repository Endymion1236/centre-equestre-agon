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

  const sauvegarder = async () => {
    setLoading(true); setErreur(""); setRapport(null);
    try {
      const res = await authFetch(`/api/admin/backup-all`, { method: "GET" });
      const data = await res.json();
      if (!res.ok) { setErreur(data.error || "Erreur"); setLoading(false); return; }
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `backup-complet-${data.projectId}-${new Date().toISOString().slice(0,19).replace(/[:T]/g,"-")}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setRapport({ kind: "backup", mode: `Sauvegarde — ${data.total_documents} documents téléchargés`, projectId: data.projectId, total_documents: data.total_documents, par_collection: data.compteur || {} });
    } catch (e: any) {
      setErreur(e?.message || "Erreur réseau");
    }
    setLoading(false);
  };

  const resetDonnees = async (apply: boolean) => {
    setLoading(true); setErreur(""); setRapport(null);
    try {
      let url = `/api/admin/reset-donnees`;
      if (apply) {
        // Mot-clé de confirmation saisi par l'utilisateur (anti-accident).
        const mot = window.prompt("Pour effacer le financier, tapez exactement : EFFACER-PROD");
        if (mot !== "EFFACER-PROD") { setErreur("Mot-clé incorrect — opération annulée."); setLoading(false); return; }
        url += `?apply=true&confirm=${encodeURIComponent(mot)}`;
      }
      const res = await authFetch(url, { method: "POST" });
      const data = await res.json();
      if (!res.ok) { setErreur(data.error || "Erreur"); setLoading(false); return; }
      setRapport({ kind: "reset", mode: data.mode + " — REMISE À ZÉRO FINANCIER", projectId: data.projectId, total_documents: data.total_documents, par_collection: data.par_collection || {} });
    } catch (e: any) {
      setErreur(e?.message || "Erreur réseau");
    }
    setLoading(false);
  };

  const copierProd = async (apply: boolean) => {
    setLoading(true); setErreur(""); setRapport(null);
    try {
      const res = await authFetch(`/api/admin/copy-prod-to-test${apply ? "?apply=true" : ""}`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) { setErreur(data.error || "Erreur"); setLoading(false); return; }
      setRapport({ mode: data.mode + ` — COPIE PROD→TEST`, projectId: data.projectId, total_familles_fichier: data.total_snapshot, a_creer: data.a_copier, skip_enfant_existant: data.skip_existant, sans_email_crees: 0, enfants_crees: data.enfants_copies, details_crees: [], details_skip: [] });
    } catch (e: any) {
      setErreur(e?.message || "Erreur réseau");
    }
    setLoading(false);
  };

  const exporter = async () => {
    setLoading(true); setErreur(""); setRapport(null);
    try {
      const res = await authFetch(`/api/admin/export-families`, { method: "GET" });
      const data = await res.json();
      if (!res.ok) { setErreur(data.error || "Erreur"); setLoading(false); return; }
      // Télécharge le JSON exporté.
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `familles-export-${data.projectId}-${new Date().toISOString().slice(0,10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setRapport({ mode: `Export — ${data.count} familles téléchargées`, projectId: data.projectId, total_familles_fichier: data.count, a_creer: 0, skip_enfant_existant: 0, sans_email_crees: 0, enfants_crees: 0, details_crees: [], details_skip: [] });
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
        ni paiement). La détection des doublons se fait par enfant (prénom + nom + date de naissance).
      </p>

      <div className="flex gap-3 mb-6 flex-wrap">
        <button onClick={() => lancer(false)} disabled={loading}
          className="px-4 py-2.5 rounded-xl font-body text-sm font-semibold text-blue-700 bg-blue-50 border border-blue-200 cursor-pointer disabled:opacity-50">
          {loading ? "…" : "1. Aperçu (sans rien écrire)"}
        </button>
        <button onClick={() => { if (confirm("Créer réellement les familles sur la base TEST ?")) lancer(true); }} disabled={loading}
          className="px-4 py-2.5 rounded-xl font-body text-sm font-semibold text-white bg-blue-500 border-none cursor-pointer disabled:opacity-50">
          {loading ? "…" : "2. Importer pour de vrai"}
        </button>
        <button onClick={exporter} disabled={loading}
          className="px-4 py-2.5 rounded-xl font-body text-sm font-semibold text-gray-700 bg-gray-100 border border-gray-200 cursor-pointer disabled:opacity-50">
          {loading ? "…" : "Exporter les familles (JSON)"}
        </button>
      </div>

      <div className="flex gap-3 mb-6 flex-wrap border-t border-gray-100 pt-4">
        <span className="font-body text-xs text-gray-400 w-full">Copie du snapshot PROD vers la base TEST (pour tester en conditions réelles) :</span>
        <button onClick={() => copierProd(false)} disabled={loading}
          className="px-4 py-2.5 rounded-xl font-body text-sm font-semibold text-purple-700 bg-purple-50 border border-purple-200 cursor-pointer disabled:opacity-50">
          {loading ? "…" : "Aperçu copie prod→test"}
        </button>
        <button onClick={() => { if (confirm("Copier les familles PROD dans la base TEST ?")) copierProd(true); }} disabled={loading}
          className="px-4 py-2.5 rounded-xl font-body text-sm font-semibold text-white bg-purple-500 border-none cursor-pointer disabled:opacity-50">
          {loading ? "…" : "Copier prod→test pour de vrai"}
        </button>
      </div>

      <div className="flex gap-3 mb-6 flex-wrap border-t border-green-100 pt-4">
        <span className="font-body text-xs text-green-600 w-full">💾 Sauvegarde complète de toutes les collections (à faire AVANT toute remise à zéro). Télécharge un fichier JSON à conserver.</span>
        <button onClick={sauvegarder} disabled={loading}
          className="px-4 py-2.5 rounded-xl font-body text-sm font-semibold text-green-700 bg-green-50 border border-green-200 cursor-pointer disabled:opacity-50">
          {loading ? "…" : "💾 Sauvegarde complète (JSON)"}
        </button>
      </div>

      <div className="flex gap-3 mb-6 flex-wrap border-t border-red-100 pt-4">
        <span className="font-body text-xs text-red-400 w-full">⚠️ Efface uniquement le FINANCIER (paiements, SEPA, encaissements, compta, cartes, fidélité, avoirs, forfaits, remises, CAWL). Conserve : familles, progression, péda, présences, réservations, planning, structure. Effacement réel protégé par mot-clé.</span>
        <button onClick={() => resetDonnees(false)} disabled={loading}
          className="px-4 py-2.5 rounded-xl font-body text-sm font-semibold text-red-700 bg-red-50 border border-red-200 cursor-pointer disabled:opacity-50">
          {loading ? "…" : "Aperçu remise à zéro (comptage)"}
        </button>
        <button onClick={() => { if (confirm("EFFACER toutes les données (familles, paiements, etc.) sur TEST ?\n\nLa structure est conservée. Action irréversible.") && confirm("DERNIÈRE CONFIRMATION — effacer les données de la base test ?")) resetDonnees(true); }} disabled={loading}
          className="px-4 py-2.5 rounded-xl font-body text-sm font-semibold text-white bg-red-500 border-none cursor-pointer disabled:opacity-50">
          {loading ? "…" : "Remettre à zéro (2 confirmations)"}
        </button>
      </div>

      {erreur && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 font-body text-sm text-red-700 mb-4">{erreur}</div>
      )}

      {rapport && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 font-body text-sm">
          <div className="font-semibold text-blue-800 mb-2">Rapport — {rapport.mode}</div>
          <div className="text-xs text-gray-500 mb-3">Base : {rapport.projectId}</div>

          {(rapport.kind === "reset" || rapport.kind === "backup") ? (
            <>
              <ul className="space-y-1 mb-3">
                <li className={rapport.kind === "reset" ? "text-red-700" : "text-green-700"}>
                  {rapport.kind === "reset" ? "Documents financiers concernés" : "Documents sauvegardés"} : <strong>{rapport.total_documents}</strong>
                </li>
              </ul>
              <details className="mb-2" open>
                <summary className="cursor-pointer text-blue-600">Détail par collection</summary>
                <ul className="mt-2 text-xs text-gray-600 space-y-0.5 max-h-72 overflow-y-auto">
                  {Object.entries(rapport.par_collection || {}).map(([k, v]) => (
                    <li key={k} className={typeof v === "string" ? "text-red-500" : ((v as number) > 0 ? "" : "text-gray-300")}>
                      • {k} : <strong>{String(v)}</strong>
                    </li>
                  ))}
                </ul>
              </details>
            </>
          ) : (
            <>
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
            </>
          )}
        </div>
      )}
    </div>
  );
}
