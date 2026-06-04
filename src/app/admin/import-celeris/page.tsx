"use client";

import { useState } from "react";
import { authFetch } from "@/lib/auth-fetch";

// Page admin temporaire pour importer les familles des stages de juillet 2026
// depuis Celeris, sur la base TEST uniquement. À retirer après usage.
export default function ImportCelerisPage() {
  const [loading, setLoading] = useState(false);
  const [rapport, setRapport] = useState<any>(null);
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [erreur, setErreur] = useState("");
  const [semaine, setSemaine] = useState("2026-07-06");
  const [stages, setStages] = useState<any>(null);
  const [rapportInsc, setRapportInsc] = useState<any>(null);

  const inscrireStages = async (apply: boolean) => {
    // Écriture réelle en PROD : exiger le mot-clé (basé sur l'aperçu en cours).
    const isProd = !!rapportInsc?.projectId && !rapportInsc.projectId.includes("test");
    if (apply && isProd) {
      const mot = window.prompt("⚠️ Inscription en PRODUCTION. Pour inscrire réellement en prod, tapez : INSCRIRE-PROD");
      if (mot !== "INSCRIRE-PROD") { setErreur("Mot-clé incorrect — inscription en prod annulée."); return; }
    }
    setLoading(true); setErreur(""); setRapportInsc(null);
    try {
      const params = new URLSearchParams({ semaine });
      if (apply) {
        params.set("apply", "true");
        if (isProd) params.set("confirmProd", "INSCRIRE-PROD");
      }
      const res = await authFetch(`/api/admin/inscrire-stages-semaine?${params.toString()}`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) { setErreur(data.error || "Erreur"); }
      else setRapportInsc(data);
    } catch (e: any) {
      setErreur(e?.message || "Erreur réseau");
    }
    setLoading(false);
  };

  const listerStages = async () => {
    setLoading(true); setErreur(""); setStages(null);
    try {
      const res = await authFetch(`/api/admin/diag-stages-semaine?semaine=${encodeURIComponent(semaine)}`, { method: "GET" });
      const data = await res.json();
      if (!res.ok) { setErreur(data.error || "Erreur"); }
      else setStages(data);
    } catch (e: any) {
      setErreur(e?.message || "Erreur réseau");
    }
    setLoading(false);
  };

  // Semaines de stages été 2026 (lundis). On importe une semaine à la fois.
  const SEMAINES: { value: string; label: string }[] = [
    { value: "2026-07-06", label: "Semaine du 6 juillet" },
    { value: "2026-07-13", label: "Semaine du 13 juillet" },
    { value: "2026-07-20", label: "Semaine du 20 juillet" },
    { value: "2026-07-27", label: "Semaine du 27 juillet" },
    { value: "2026-08-03", label: "Semaine du 3 août" },
    { value: "2026-08-10", label: "Semaine du 10 août" },
    { value: "2026-08-17", label: "Semaine du 17 août" },
    { value: "2026-08-24", label: "Semaine du 24 août" },
    { value: "2026-08-31", label: "Semaine du 31 août" },
  ];

  const lancer = async (apply: boolean) => {
    // Si l'aperçu en cours indique la PROD, exiger le mot-clé avant écriture réelle.
    const isProd = !!rapport?.projectId && !rapport.projectId.includes("test");
    if (apply && isProd) {
      const mot = window.prompt("⚠️ Écriture en PRODUCTION. Pour importer réellement en prod, tapez : IMPORT-PROD");
      if (mot !== "IMPORT-PROD") { setErreur("Mot-clé incorrect — import en prod annulé."); return; }
    }
    setLoading(true); setErreur(""); setRapport(null);
    try {
      const params = new URLSearchParams({ semaine });
      if (apply) {
        params.set("apply", "true");
        if (isProd) params.set("confirmProd", "IMPORT-PROD");
      }
      const res = await authFetch(`/api/admin/import-stages-juillet?${params.toString()}`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) { setErreur(data.error || "Erreur"); }
      else setRapport(data);
    } catch (e: any) {
      setErreur(e?.message || "Erreur réseau");
    }
    setLoading(false);
  };

  const restaurer = async (file: File, apply: boolean) => {
    setLoading(true); setErreur(""); setRapport(null);
    try {
      const texte = await file.text();
      const backup = JSON.parse(texte);
      let url = `/api/admin/restore-backup`;
      if (apply) {
        const mot = window.prompt("Pour restaurer réellement, tapez exactement : RESTAURER");
        if (mot !== "RESTAURER") { setErreur("Mot-clé incorrect — restauration annulée."); setLoading(false); return; }
        url += `?apply=true&confirm=${encodeURIComponent(mot)}`;
      }
      const res = await authFetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(backup) });
      const data = await res.json();
      if (!res.ok) { setErreur(data.error || "Erreur"); setLoading(false); return; }
      setRapport({ kind: "reset", mode: data.mode + " — RESTAURATION", projectId: data.projectId, total_documents: data.total_restaure, par_collection: data.par_collection || {} });
    } catch (e: any) {
      setErreur(e?.message || "Fichier invalide");
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
      <h1 className="font-display text-2xl font-bold text-blue-800 mb-2">Import Celeris — Stages été 2026</h1>
      <p className="font-body text-sm text-gray-500 mb-4">
        Crée les familles + enfants des inscrits aux stages d'été, <strong>une semaine à la fois</strong> (sans
        inscription aux stages ni paiement). La détection des doublons se fait par enfant (prénom + nom).
      </p>

      <div className="mb-4">
        <label className="font-body text-sm font-semibold text-blue-800 block mb-1">Semaine à importer</label>
        <select value={semaine} onChange={e => { setSemaine(e.target.value); setRapport(null); setErreur(""); setStages(null); setRapportInsc(null); }}
          className="px-3 py-2.5 rounded-xl font-body text-sm text-gray-700 bg-white border border-blue-200 cursor-pointer w-full max-w-xs">
          {SEMAINES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <p className="font-body text-xs text-gray-400 mt-1">
          Seules les familles taguées pour cette semaine seront importées. Les familles déjà en base sont ignorées.
        </p>
        <button onClick={listerStages} disabled={loading}
          className="mt-2 px-3 py-2 rounded-xl font-body text-xs font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 cursor-pointer disabled:opacity-50">
          {loading ? "…" : "🔎 Lister les créneaux-stages de cette semaine (diagnostic)"}
        </button>
      </div>

      {stages && (
        <div className="bg-indigo-50/50 border border-indigo-200 rounded-xl p-4 font-body text-sm mb-6">
          <div className="font-semibold text-indigo-800 mb-1">
            Stages du {stages.lundi} au {stages.dimanche} — {stages.nb_stages} stage(s)
          </div>
          <div className="text-xs text-gray-500 mb-3">Base : {stages.projectId}</div>
          {stages.stages.length === 0 ? (
            <div className="text-amber-700 text-xs">Aucun créneau-stage trouvé sur cette semaine.</div>
          ) : (
            <ul className="space-y-2">
              {stages.stages.map((s: any, i: number) => (
                <li key={i} className="border-b border-indigo-100 pb-2 last:border-0">
                  <div className="font-semibold text-gray-800">
                    {s.startTime}–{s.endTime} · {s.activityTitle}
                    <span className="text-gray-400 font-normal"> · {s.monitor} · {s.priceTTC ?? "—"}€ · {s.jours.length} jour(s) · {s.nbInscritsMax} inscrit(s)</span>
                  </div>
                  <div className="text-[11px] text-gray-500 mt-0.5">stageKey : <code>{s.stageKey}</code></div>
                  <div className="text-[11px] text-gray-400 mt-0.5">dates : {s.dates.join(", ")}</div>
                  <div className="text-[11px] text-gray-400 break-all">creneauIds : {s.creneauIds.join(", ")}</div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="flex gap-3 mb-6 flex-wrap">
        <button onClick={() => lancer(false)} disabled={loading}
          className="px-4 py-2.5 rounded-xl font-body text-sm font-semibold text-blue-700 bg-blue-50 border border-blue-200 cursor-pointer disabled:opacity-50">
          {loading ? "…" : "1. Aperçu de la semaine (sans rien écrire)"}
        </button>
        <button onClick={() => { if (confirm(`Créer réellement les familles de la ${SEMAINES.find(s => s.value === semaine)?.label} sur la base TEST ?`)) lancer(true); }} disabled={loading}
          className="px-4 py-2.5 rounded-xl font-body text-sm font-semibold text-white bg-blue-500 border-none cursor-pointer disabled:opacity-50">
          {loading ? "…" : "2. Importer cette semaine pour de vrai"}
        </button>
        <button onClick={exporter} disabled={loading}
          className="px-4 py-2.5 rounded-xl font-body text-sm font-semibold text-gray-700 bg-gray-100 border border-gray-200 cursor-pointer disabled:opacity-50">
          {loading ? "…" : "Exporter les familles (JSON)"}
        </button>
      </div>

      <div className="flex gap-3 mb-6 flex-wrap border-t border-teal-100 pt-4">
        <span className="font-body text-xs text-teal-600 w-full">
          🐴 Étape 2 — Inscrit les enfants de la semaine dans leurs stages, <strong>sans créer de paiement</strong>
          (marqués « réglé via Celeris », exclus des impayés). À faire APRÈS l'import des fiches ci-dessus.
        </span>
        <button onClick={() => inscrireStages(false)} disabled={loading}
          className="px-4 py-2.5 rounded-xl font-body text-sm font-semibold text-teal-700 bg-teal-50 border border-teal-200 cursor-pointer disabled:opacity-50">
          {loading ? "…" : "Aperçu inscription aux stages"}
        </button>
        <button onClick={() => { if (confirm(`Inscrire les enfants de la ${SEMAINES.find(s => s.value === semaine)?.label} dans leurs stages (sans paiement) sur la base TEST ?`)) inscrireStages(true); }} disabled={loading}
          className="px-4 py-2.5 rounded-xl font-body text-sm font-semibold text-white bg-teal-600 border-none cursor-pointer disabled:opacity-50">
          {loading ? "…" : "Inscrire aux stages pour de vrai"}
        </button>
      </div>

      {rapportInsc && (
        <div className="bg-teal-50/50 border border-teal-200 rounded-xl p-4 font-body text-sm mb-6">
          <div className="font-semibold text-teal-800 mb-1">Inscription stages — {rapportInsc.mode}</div>
          <div className="text-xs text-gray-500 mb-2">Base : {rapportInsc.projectId} · Semaine {rapportInsc.semaine} · {rapportInsc.statut}</div>
          <ul className="space-y-1 mb-2">
            <li>Inscriptions attendues : <strong>{rapportInsc.total_attendu}</strong></li>
            <li className="text-teal-700">À inscrire : <strong>{rapportInsc.a_inscrire}</strong></li>
            <li className="text-gray-500">Déjà inscrites : <strong>{rapportInsc.deja_inscrit}</strong></li>
            <li>Réservations créées : <strong>{rapportInsc.reservations_creees}</strong></li>
            {rapportInsc.problemes?.length > 0 && <li className="text-red-600">Problèmes : <strong>{rapportInsc.problemes.length}</strong></li>}
          </ul>
          {rapportInsc.problemes?.length > 0 && (
            <details className="mb-2" open>
              <summary className="cursor-pointer text-red-600">Détail des {rapportInsc.problemes.length} problème(s)</summary>
              <ul className="mt-2 text-xs text-red-500 space-y-0.5 max-h-48 overflow-y-auto">
                {rapportInsc.problemes.map((p: string, i: number) => <li key={i}>• {p}</li>)}
              </ul>
            </details>
          )}
          {rapportInsc.details?.length > 0 && (
            <details>
              <summary className="cursor-pointer text-teal-600">Détail des {rapportInsc.details.length} inscription(s)</summary>
              <ul className="mt-2 text-xs text-gray-600 space-y-0.5 max-h-64 overflow-y-auto">
                {rapportInsc.details.map((d: string, i: number) => <li key={i}>• {d}</li>)}
              </ul>
            </details>
          )}
        </div>
      )}

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

      <div className="flex gap-3 mb-6 flex-wrap border-t border-blue-100 pt-4">
        <span className="font-body text-xs text-blue-500 w-full">♻️ Restauration depuis un fichier de sauvegarde (en cas de pépin). Sélectionne le fichier JSON téléchargé, puis aperçu avant restauration réelle.</span>
        <input type="file" accept="application/json,.json" onChange={e => setRestoreFile(e.target.files?.[0] || null)}
          className="font-body text-xs text-gray-600 w-full" />
        <button onClick={() => restoreFile && restaurer(restoreFile, false)} disabled={loading || !restoreFile}
          className="px-4 py-2.5 rounded-xl font-body text-sm font-semibold text-blue-700 bg-blue-50 border border-blue-200 cursor-pointer disabled:opacity-50">
          {loading ? "…" : "Aperçu restauration"}
        </button>
        <button onClick={() => restoreFile && restaurer(restoreFile, true)} disabled={loading || !restoreFile}
          className="px-4 py-2.5 rounded-xl font-body text-sm font-semibold text-white bg-blue-600 border-none cursor-pointer disabled:opacity-50">
          {loading ? "…" : "Restaurer (mot-clé)"}
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
                {rapport.semaine && <li className="text-blue-700">Semaine importée : <strong>{rapport.semaine}</strong></li>}
                <li>Familles de cette semaine : <strong>{rapport.total_familles_fichier}</strong></li>
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
