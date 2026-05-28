"use client";

// ─────────────────────────────────────────────────────────────────────────
//  Page admin : Seed Test (import backup prod -> base test)
// ─────────────────────────────────────────────────────────────────────────
// Permet d'uploader un fichier backup JSON (genere depuis la prod via
// /api/admin/backup-json) et de peupler la base de TEST avec les donnees
// metier durables (familles, cavalerie, activites, settings, creneaux).
//
// Cette page n'a de sens que sur la branche test. Sur la prod, la route
// /api/admin/import-json refuse de s'executer (garde-fou anti-prod).

import { useState } from "react";
import { auth } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";

export default function SeedTestPage() {
  const { isAdmin } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");

  const handleImport = async () => {
    if (!file) { setError("Choisis un fichier backup .json"); return; }
    setError("");
    setResult(null);
    setImporting(true);
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch("/api/admin/import-json", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(json),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error + (data.details ? `\n${data.details}` : ""));
        return;
      }
      setResult(data);
    } catch (e: any) {
      setError(`Erreur : ${e.message}`);
    } finally {
      setImporting(false);
    }
  };

  if (!isAdmin) {
    return <div className="p-8"><h1 className="font-display text-2xl">Accès refusé</h1></div>;
  }

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto">
      <h1 className="font-display text-2xl font-bold text-slate-900 mb-2">
        Seed Test — Import des données prod
      </h1>
      <p className="font-body text-sm text-slate-600 mb-6">
        Importe un backup de la prod dans CETTE base. Seules les données métier
        sont copiées (familles, cavalerie, activités, paramètres, contenu site,
        planning). Les inscriptions des créneaux sont vidées pour repartir propre.
        Le transactionnel (paiements, SEPA…) est ignoré.
      </p>

      <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 mb-6">
        <p className="font-body text-sm text-amber-900">
          <strong>Procédure :</strong><br />
          1. Sur la PROD, télécharge le backup via l'outil de sauvegarde<br />
          2. Reviens ici (URL de test) et dépose le fichier ci-dessous<br />
          3. Clique sur Importer
        </p>
      </div>

      <input
        type="file"
        accept="application/json,.json"
        onChange={e => setFile(e.target.files?.[0] || null)}
        className="block w-full font-body text-sm mb-4 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-none file:bg-blue-600 file:text-white file:cursor-pointer"
      />

      <button
        onClick={handleImport}
        disabled={importing || !file}
        className="px-5 py-3 rounded-xl bg-blue-600 text-white font-body font-semibold disabled:opacity-40 disabled:cursor-not-allowed border-none cursor-pointer"
      >
        {importing ? "Import en cours…" : "Importer dans la base test"}
      </button>

      {error && (
        <div className="mt-4 p-4 rounded-xl bg-red-50 border border-red-200 font-body text-sm text-red-700 whitespace-pre-wrap">
          {error}
        </div>
      )}

      {result && (
        <div className="mt-4 p-4 rounded-xl bg-green-50 border border-green-200">
          <p className="font-body text-sm font-semibold text-green-800 mb-2">{result.message}</p>
          <p className="font-body text-xs text-green-700 mb-1">Base : {result.projectId}</p>
          <ul className="font-body text-sm text-green-700">
            {Object.entries(result.imported || {}).map(([k, v]) => (
              <li key={k}>• {k} : {String(v)} documents</li>
            ))}
          </ul>
          {result.skipped?.length > 0 && (
            <p className="font-body text-[11px] text-green-600 mt-2">
              Ignoré (transactionnel) : {result.skipped.join(", ")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
