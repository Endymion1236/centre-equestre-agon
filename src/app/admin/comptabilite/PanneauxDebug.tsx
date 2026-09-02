"use client";

/**
 * src/app/admin/comptabilite/PanneauxDebug.tsx
 *
 * Les quatre panneaux de maintenance de l'écran Comptabilité, accessibles
 * uniquement en ajoutant ?debug=… à l'URL :
 *
 *   ?debug=reset             remise à zéro de la comptabilité (irréversible)
 *   ?debug=diag              diagnostic en lecture seule des bordereaux
 *   ?debug=reset-cb          dépointage en masse des encaissements CB
 *   ?debug=migrate-banklines redistribution des lignes bancaires par mois
 *
 * Ils vivaient au milieu de l'écran comptable, dont ils occupaient près de
 * sept cents lignes alors qu'ils ne s'affichent jamais en usage courant. Les
 * sortir laisse l'écran à ce qu'il montre tous les jours, et met ces outils
 * dangereux dans un fichier qu'on ouvre exprès.
 *
 * Le comportement est inchangé : mêmes appels, mêmes confirmations, mêmes
 * jetons de confirmation renvoyés par les routes.
 */

import { useState, useEffect } from "react";
import { Loader2, AlertTriangle, RefreshCw, Search } from "lucide-react";
import { authFetch } from "@/lib/auth-fetch";
import { construireDiagnosticRemises } from "./diagnostic-remises-utils";

export interface PanneauxDebugProps {
  /** Valeur du paramètre ?debug= de l'URL, ou null. */
  debug: string | null;
  /** Mois affiché (YYYY-MM), visé par le dépointage CB. */
  period: string;
  remises: any[];
  encaissementsCompta: any[];
  /** Le diagnostic attend la fin du chargement des données de l'écran. */
  loading: boolean;
}

export default function PanneauxDebug({ debug, period, remises, encaissementsCompta, loading }: PanneauxDebugProps) {
  const showResetPanel = debug === "reset";
  const showDiagPanel = debug === "diag";
  const showDepointerCbPanel = debug === "reset-cb";
  const showMigrateBlsPanel = debug === "migrate-banklines";

  // Aucun panneau demandé : on ne monte rien du tout.
  if (!showResetPanel && !showDiagPanel && !showDepointerCbPanel && !showMigrateBlsPanel) return null;

  return <PanneauxDebugActifs
    showResetPanel={showResetPanel}
    showDiagPanel={showDiagPanel}
    showDepointerCbPanel={showDepointerCbPanel}
    showMigrateBlsPanel={showMigrateBlsPanel}
    period={period}
    remises={remises}
    encaissementsCompta={encaissementsCompta}
    loading={loading}
  />;
}

/**
 * Le contenu proprement dit. Séparé pour que le composant d'entrée puisse
 * renvoyer null sans déclarer de hooks : monter les quatre panneaux avec
 * leurs états sur chaque affichage de l'écran comptable ne servirait à rien.
 */
function PanneauxDebugActifs({
  showResetPanel, showDiagPanel, showDepointerCbPanel, showMigrateBlsPanel,
  period, remises, encaissementsCompta, loading,
}: {
  showResetPanel: boolean; showDiagPanel: boolean;
  showDepointerCbPanel: boolean; showMigrateBlsPanel: boolean;
  period: string; remises: any[]; encaissementsCompta: any[]; loading: boolean;
}) {
  // ── Reset compta : debug panel accessible via ?debug=reset dans l'URL ──
  const [resetSecret, setResetSecret] = useState("");
  const [resetDryRun, setResetDryRun] = useState<any>(null);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetApplied, setResetApplied] = useState<any>(null);

  // ── Diag remises : debug panel accessible via ?debug=diag dans l'URL ──
  const [diagReport, setDiagReport] = useState<any>(null);
  const [diagLoading, setDiagLoading] = useState(false);

  // ── Recherche d'un paiement par nom (sous-section du panel diag) ──
  const [diagSearch, setDiagSearch] = useState("");
  const [diagSearching, setDiagSearching] = useState(false);
  const [diagSearchResult, setDiagSearchResult] = useState<any>(null);
  const runDiagSearch = async () => {
    if (!diagSearch.trim()) return;
    setDiagSearching(true);
    setDiagSearchResult(null);
    try {
      const res = await authFetch(`/api/admin/diag-paiement?q=${encodeURIComponent(diagSearch.trim())}`);
      const data = await res.json();
      if (!res.ok) {
        setDiagSearchResult({ error: data?.error || `Erreur HTTP ${res.status}` });
      } else {
        setDiagSearchResult(data);
      }
    } catch (e: any) {
      setDiagSearchResult({ error: e?.message || "Erreur réseau" });
    }
    setDiagSearching(false);
  };

  // ── Dépointer CB en masse (?debug=reset-cb) ──
  const [depointerCbDryRun, setDepointerCbDryRun] = useState<any>(null);
  const [depointerCbApplied, setDepointerCbApplied] = useState<any>(null);
  const [depointerCbLoading, setDepointerCbLoading] = useState(false);

  const fetchDepointerCbDryRun = async () => {
    setDepointerCbLoading(true);
    setDepointerCbDryRun(null);
    setDepointerCbApplied(null);
    try {
      const res = await authFetch(`/api/admin/depointer-cb?period=${encodeURIComponent(period)}`);
      const data = await res.json();
      setDepointerCbDryRun(data);
    } catch (e: any) {
      setDepointerCbDryRun({ error: e?.message || "Erreur réseau" });
    }
    setDepointerCbLoading(false);
  };

  const applyDepointerCb = async () => {
    if (!depointerCbDryRun?.confirmToken) return;
    if (!confirm(`Confirmer le dépointage de ${depointerCbDryRun.aDepointer} encaissements CB sur ${period} ?\n\nIls réapparaîtront dans "Encaissements à remettre". Tu pourras les re-rapprocher via Détail CA sur les remises CARTE.\n\nCette action peut être refaite (idempotente).`)) return;
    setDepointerCbLoading(true);
    try {
      const res = await authFetch(`/api/admin/depointer-cb`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ period, confirm: depointerCbDryRun.confirmToken }),
      });
      const data = await res.json();
      setDepointerCbApplied(data);
      // Reload de la page pour rafraîchir les données affichées
      setTimeout(() => window.location.reload(), 2000);
    } catch (e: any) {
      setDepointerCbApplied({ error: e?.message || "Erreur réseau" });
    }
    setDepointerCbLoading(false);
  };

  // Auto-fetch dry-run quand on ouvre le panel : déclenché via callback ref
  // sur la modale (déclaration period plus bas). On utilise un ref-callback
  // qui se déclenche quand l'élément se monte.
  const depointerPanelInitRef = (el: HTMLDivElement | null) => {
    if (el && showDepointerCbPanel && !depointerCbDryRun && !depointerCbLoading) {
      fetchDepointerCbDryRun();
    }
  };

  // ── Migration bankLines par mois (?debug=migrate-banklines) ──
  // Redistribue toutes les bankLines dans le bon doc rapprochements/{ym}
  // selon leur date réelle. Utile une fois après le fix de l'étape 1
  // pour rattraper les données déjà mal rangées.
  const [migrateBlsDryRun, setMigrateBlsDryRun] = useState<any>(null);
  const [migrateBlsApplied, setMigrateBlsApplied] = useState<any>(null);
  const [migrateBlsLoading, setMigrateBlsLoading] = useState(false);
  const fetchMigrateBlsDryRun = async () => {
    setMigrateBlsLoading(true);
    setMigrateBlsDryRun(null);
    setMigrateBlsApplied(null);
    try {
      const res = await authFetch(`/api/admin/migrate-bankLines`);
      const data = await res.json();
      setMigrateBlsDryRun(data);
    } catch (e: any) {
      setMigrateBlsDryRun({ error: e?.message || "Erreur réseau" });
    }
    setMigrateBlsLoading(false);
  };
  const applyMigrateBls = async () => {
    if (!migrateBlsDryRun?.confirmToken) return;
    if (!confirm(`Confirmer la migration de ${migrateBlsDryRun.stats?.nbBlsMalRangees || 0} bankLines vers leur bon mois ?\n\nIdempotente : peut être relancée sans danger.\nUn marqueur 'migratedAt' sera posé sur chaque doc.`)) return;
    setMigrateBlsLoading(true);
    try {
      const res = await authFetch(`/api/admin/migrate-bankLines`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: migrateBlsDryRun.confirmToken }),
      });
      const data = await res.json();
      setMigrateBlsApplied(data);
      setTimeout(() => window.location.reload(), 2500);
    } catch (e: any) {
      setMigrateBlsApplied({ error: e?.message || "Erreur réseau" });
    }
    setMigrateBlsLoading(false);
  };
  const migrateBlsPanelInitRef = (el: HTMLDivElement | null) => {
    if (el && showMigrateBlsPanel && !migrateBlsDryRun && !migrateBlsLoading) {
      fetchMigrateBlsDryRun();
    }
  };


  useEffect(() => {
    if (showDiagPanel && !diagLoading && !diagReport && (remises?.length !== undefined)) {
      // Attendre que les données soient chargées
      if (loading) return;
      setDiagLoading(true);
      try {
        const report = construireDiagnosticRemises(remises || [], encaissementsCompta || []);
        setDiagReport(report);
      } catch (e) {
        console.error("Erreur diag:", e);
      }
      setDiagLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showDiagPanel, loading, remises]);

  return (
    <>

      {/* ═══ PANEL DEBUG : Reset compta ═══
          Accessible UNIQUEMENT en ajoutant ?debug=reset à l'URL.
          Permet de remettre à zéro toute la comptabilité pour refaire des
          tests propres. Ne doit JAMAIS être utilisé en production réelle
          (des familles ont leurs factures envoyées).
          Réservé à la phase de test interne (avant septembre 2026). */}
      {showResetPanel && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 flex flex-col gap-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center gap-3">
              <AlertTriangle className="text-red-500" size={28} />
              <h2 className="font-display text-xl font-bold text-red-600">Reset compta — Zone dangereuse</h2>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 font-body text-sm text-red-900">
              <p className="font-semibold mb-1">⚠️ Opération IRRÉVERSIBLE</p>
              <p className="text-xs leading-relaxed">
                Efface tous les encaissements, remises, rapprochements, échéances SEPA, chèques différés,
                avoirs et cumuls fidélité. Les <b>paiements</b> (factures) sont conservés mais réinitialisés
                en "à encaisser". Les <b>réservations, familles, mandats SEPA</b> ne sont pas touchés.
              </p>
            </div>

            {/* Étape 1 : secret + dry-run */}
            {!resetDryRun && (
              <>
                <div>
                  <label className="font-body text-xs font-semibold text-slate-700 block mb-1">
                    Mot de passe admin (CRON_SECRET)
                  </label>
                  <input type="password" value={resetSecret} onChange={e => setResetSecret(e.target.value)}
                    placeholder="Saisir le CRON_SECRET"
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-300 font-body text-sm focus:outline-none focus:border-red-400" />
                </div>
                <button
                  disabled={!resetSecret || resetLoading}
                  onClick={async () => {
                    setResetLoading(true);
                    try {
                      const res = await fetch(`/api/admin/reset-compta?secret=${encodeURIComponent(resetSecret)}`);
                      const data = await res.json();
                      if (data.success) {
                        setResetDryRun(data);
                      } else {
                        alert(`Erreur : ${data.error}`);
                      }
                    } catch (e: any) {
                      alert(`Erreur réseau : ${e.message}`);
                    } finally {
                      setResetLoading(false);
                    }
                  }}
                  className="px-5 py-3 rounded-xl font-body text-sm font-semibold text-white bg-orange-500 hover:bg-orange-600 border-none cursor-pointer disabled:opacity-50">
                  {resetLoading ? <Loader2 size={16} className="animate-spin inline mr-2" /> : "👁️ "}
                  Afficher le rapport (dry-run)
                </button>
              </>
            )}

            {/* Étape 2 : rapport + confirmation */}
            {resetDryRun && !resetApplied && (
              <>
                <div className="bg-orange-50 border border-orange-200 rounded-xl p-3">
                  <p className="font-body text-xs font-semibold text-orange-800 mb-2">📊 Ce qui sera effacé :</p>
                  <div className="flex flex-col gap-1 font-body text-xs text-slate-700">
                    {Object.entries(resetDryRun.report.deleteCollections).map(([col, n]: any) => (
                      <div key={col} className="flex justify-between">
                        <span>{col}</span>
                        <span className="font-mono font-semibold">{n}</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 pt-2 border-t border-orange-200 font-body text-xs text-slate-700 flex flex-col gap-1">
                    <div className="flex justify-between"><span>Total encaissements</span><span className="font-mono font-bold">{resetDryRun.report.totals.encaissementsEuros} €</span></div>
                    <div className="flex justify-between"><span>Total avoirs</span><span className="font-mono font-bold">{resetDryRun.report.totals.avoirsEuros} €</span></div>
                    <div className="flex justify-between"><span>Factures concernées (total TTC)</span><span className="font-mono font-bold">{resetDryRun.report.totals.paymentsTotalEuros} €</span></div>
                    <div className="flex justify-between"><span>dont déjà encaissé</span><span className="font-mono font-bold">{resetDryRun.report.totals.paymentsDejaEncaisseEuros} €</span></div>
                  </div>
                </div>
                <div className="bg-green-50 border border-green-200 rounded-xl p-3">
                  <p className="font-body text-xs font-semibold text-green-800 mb-1">✅ Préservé :</p>
                  <div className="flex flex-col gap-0.5 font-body text-xs text-slate-700">
                    {Object.entries(resetDryRun.report.preservedCollections).map(([col, n]: any) => (
                      <div key={col} className="flex justify-between">
                        <span>{col}</span>
                        <span className="font-mono">{n}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="bg-red-50 border-2 border-red-400 rounded-xl p-3">
                  <p className="font-body text-xs font-semibold text-red-800 mb-2">
                    Pour confirmer, copier-coller ce token :
                  </p>
                  <code className="block font-mono text-sm bg-white px-3 py-2 rounded border border-red-200 text-red-900">
                    {resetDryRun.confirmTokenExpected}
                  </code>
                </div>
                <input type="text" placeholder={resetDryRun.confirmTokenExpected}
                  id="reset-confirm-input"
                  className="w-full px-3 py-2.5 rounded-xl border border-red-300 font-mono text-sm focus:outline-none focus:border-red-500" />
                <div className="flex gap-3">
                  <button
                    onClick={() => { setResetDryRun(null); setResetSecret(""); }}
                    className="px-5 py-3 rounded-xl font-body text-sm text-slate-600 bg-gray-100 border-none cursor-pointer">
                    Annuler
                  </button>
                  <button
                    disabled={resetLoading}
                    onClick={async () => {
                      const input = document.getElementById("reset-confirm-input") as HTMLInputElement;
                      const token = input?.value?.trim();
                      if (token !== resetDryRun.confirmTokenExpected) {
                        alert("Token de confirmation incorrect");
                        return;
                      }
                      if (!confirm("Dernière confirmation : effacer définitivement toute la compta ?")) return;
                      setResetLoading(true);
                      try {
                        const res = await fetch(`/api/admin/reset-compta?secret=${encodeURIComponent(resetSecret)}`, {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ confirm: token }),
                        });
                        const data = await res.json();
                        if (data.success) {
                          setResetApplied(data);
                        } else {
                          alert(`Erreur : ${data.error}`);
                        }
                      } catch (e: any) {
                        alert(`Erreur réseau : ${e.message}`);
                      } finally {
                        setResetLoading(false);
                      }
                    }}
                    className="flex-1 px-5 py-3 rounded-xl font-body text-sm font-semibold text-white bg-red-600 hover:bg-red-700 border-none cursor-pointer disabled:opacity-50">
                    {resetLoading ? <Loader2 size={16} className="animate-spin inline mr-2" /> : "🔥 "}
                    Effacer tout maintenant
                  </button>
                </div>
              </>
            )}

            {/* Étape 3 : résultat */}
            {resetApplied && (
              <>
                <div className="bg-green-50 border-2 border-green-400 rounded-xl p-3">
                  <p className="font-body text-sm font-semibold text-green-800 mb-2">✅ Reset effectué en {resetApplied.durationMs} ms</p>
                  <div className="flex flex-col gap-1 font-body text-xs text-slate-700">
                    {Object.entries(resetApplied.deleted).map(([col, n]: any) => (
                      <div key={col} className="flex justify-between">
                        <span>{col}</span>
                        <span className="font-mono">{n === -1 ? "❌ erreur" : n}</span>
                      </div>
                    ))}
                  </div>
                </div>
                {resetApplied.errors && resetApplied.errors.length > 0 && (
                  <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                    <p className="font-body text-xs font-semibold text-red-800 mb-1">Erreurs :</p>
                    <ul className="font-body text-xs text-red-700 list-disc pl-4">
                      {resetApplied.errors.map((e: string, i: number) => <li key={i}>{e}</li>)}
                    </ul>
                  </div>
                )}
                <button
                  onClick={() => { window.location.href = "/admin/comptabilite"; }}
                  className="px-5 py-3 rounded-xl font-body text-sm font-semibold text-white bg-blue-600 border-none cursor-pointer">
                  Retour à la compta
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* ═══ PANEL DIAG : Diagnostic remises ═══
          Accessible UNIQUEMENT via ?debug=diag dans l'URL.
          Read-only, affiche l'état réel de la collection 'remises' pour
          comprendre les écarts entre ce qu'on voit et ce qui existe en base. */}
      {showDiagPanel && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 flex flex-col gap-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center gap-3">
              <Search className="text-purple-500" size={28} />
              <h2 className="font-display text-xl font-bold text-purple-700">Diagnostic remises</h2>
            </div>
            {!diagReport && (
              <div className="flex items-center gap-3 text-slate-500">
                <Loader2 className="animate-spin" size={20} />
                <span className="font-body text-sm">Chargement des données...</span>
              </div>
            )}
            {diagReport && (
              <>
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
                  <div className="font-body text-xs font-semibold text-blue-800 mb-2">📊 Total</div>
                  <div className="font-body text-2xl font-bold text-blue-700">{diagReport.total} remises</div>
                  <div className="font-body text-xs text-slate-600 mt-1">
                    {diagReport.parEtat.pointees} pointées · {diagReport.parEtat.nonPointees} non pointées
                  </div>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                  <div className="font-body text-xs font-semibold text-slate-700 mb-2">📅 Par mois (création)</div>
                  <div className="flex flex-col gap-1 font-body text-xs">
                    {Object.entries(diagReport.parMois)
                      .sort(([a], [b]) => b.localeCompare(a))
                      .map(([mois, stats]: any) => (
                      <div key={mois} className="flex justify-between items-center bg-white px-2 py-1.5 rounded">
                        <span className="font-mono">{mois}</span>
                        <span>
                          <span className="font-bold">{stats.count}</span> remises ·
                          <span className="text-green-700"> {stats.pointees}</span> pointées ·
                          <span className="font-mono"> {stats.totalEur.toFixed(2)}€</span>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                  <div className="font-body text-xs font-semibold text-slate-700 mb-2">💳 Par mode</div>
                  <div className="flex flex-wrap gap-2 font-body text-xs">
                    {Object.entries(diagReport.parMode).map(([mode, n]: any) => (
                      <div key={mode} className="bg-white px-2 py-1 rounded border border-slate-200">
                        <span className="text-slate-500">{mode}</span> <span className="font-bold ml-1">{n}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                  <div className="font-body text-xs font-semibold text-slate-700 mb-2">💰 Encaissements (vue actuelle)</div>
                  <div className="font-body text-xs text-slate-700">
                    Total : <b>{diagReport.encaissements.total}</b> · Rapprochés banque : <b className="text-green-700">{diagReport.encaissements.reconciled}</b> · CB Terminal : <b>{diagReport.encaissements.cbTerminal}</b>
                  </div>
                </div>

                <div className="bg-purple-50 border border-purple-200 rounded-xl p-3">
                  <div className="font-body text-xs font-semibold text-purple-800 mb-2">🕐 15 plus récentes</div>
                  <div className="flex flex-col gap-1 font-body text-[11px]">
                    {diagReport.recentes.map((r: any) => (
                      <div key={r.id} className="bg-white px-2 py-1.5 rounded border border-purple-100 flex flex-wrap gap-x-2 gap-y-0.5 items-center">
                        <span className="font-mono text-slate-600">{r.date}</span>
                        <span className="text-slate-500 text-[10px]">[{r.mode}]</span>
                        <span className="font-bold">{r.total.toFixed(2)}€</span>
                        {r.pointee
                          ? <span className="bg-green-100 text-green-700 text-[10px] px-1.5 py-0.5 rounded">✓ pointée</span>
                          : <span className="bg-orange-100 text-orange-700 text-[10px] px-1.5 py-0.5 rounded">non pointée</span>}
                        <span className="text-slate-400 text-[10px]">{r.nbEncaissements} encs · {r.nbPaymentsLegacy} legacy</span>
                        {r.pointeeNote && (
                          <div className="w-full text-[10px] text-slate-400 italic">{r.pointeeNote}</div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* ── Recherche d'un paiement par nom (utile en cas de doute) ──
                    Appelle /api/admin/diag-paiement?q=xxx avec le token Firebase
                    Auth de l'utilisateur (read-only, pas de modification possible) */}
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                  <div className="font-body text-xs font-semibold text-amber-800 mb-2">🔍 Rechercher un paiement par nom</div>
                  <div className="flex gap-2 mb-2">
                    <input
                      type="text"
                      placeholder="ex: gourmelon"
                      value={diagSearch}
                      onChange={(e) => setDiagSearch(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") runDiagSearch(); }}
                      className="flex-1 px-3 py-1.5 rounded-md border border-amber-300 font-body text-xs"
                    />
                    <button
                      onClick={runDiagSearch}
                      disabled={diagSearching || !diagSearch.trim()}
                      className="px-4 py-1.5 rounded-md font-body text-xs font-semibold text-white bg-amber-600 border-none cursor-pointer disabled:opacity-50">
                      {diagSearching ? "..." : "Chercher"}
                    </button>
                  </div>
                  {diagSearchResult && (
                    <div className="bg-white rounded-md border border-amber-200 p-2 max-h-72 overflow-y-auto">
                      {diagSearchResult.error ? (
                        <div className="text-red-600 text-xs">{diagSearchResult.error}</div>
                      ) : (
                        <>
                          <div className="text-xs font-semibold text-slate-700 mb-2">
                            💳 {diagSearchResult.payments?.count || 0} paiement(s) — total {(diagSearchResult.payments?.totalTTC || 0).toFixed(2)}€
                          </div>
                          {(diagSearchResult.payments?.list || []).map((p: any) => (
                            <div key={p.id} className="border-l-2 border-blue-300 pl-2 mb-2 text-[10px]">
                              <div className="font-semibold">
                                {p.date} · {p.familyName} · <span className={`${p.status === "paid" ? "text-green-700" : "text-orange-700"}`}>{p.status}</span> · {p.paymentMode}
                              </div>
                              <div className="text-slate-600">Total {p.totalTTC?.toFixed(2)}€ · Payé {p.paidAmount?.toFixed(2)}€ · {p.nbItems} item(s)</div>
                              {p.items.map((it: any, i: number) => (
                                <div key={i} className="ml-2 text-slate-500">
                                  • {it.childName} · {it.activityTitle} · {it.priceTTC?.toFixed(2)}€
                                </div>
                              ))}
                            </div>
                          ))}
                          <div className="text-xs font-semibold text-slate-700 mb-2 mt-3 pt-2 border-t border-slate-200">
                            💰 {diagSearchResult.encaissements?.count || 0} encaissement(s) — total {(diagSearchResult.encaissements?.totalEur || 0).toFixed(2)}€
                          </div>
                          {(diagSearchResult.encaissements?.list || []).map((e: any) => (
                            <div key={e.id} className="border-l-2 border-green-300 pl-2 mb-1 text-[10px]">
                              <div className="font-semibold">
                                {e.date} · {e.familyName} · {e.activityTitle} · <b>{e.montant?.toFixed(2)}€</b> · {e.mode}
                              </div>
                              <div className="text-slate-500">
                                {e.reconciledByBank ? "✓ rapproché banque" : "non rapproché"}
                                {e.paymentId && ` · paymentId ${e.paymentId.slice(0, 8)}...`}
                                {e.remiseId && ` · remiseId ${e.remiseId.slice(0, 8)}...`}
                              </div>
                            </div>
                          ))}
                        </>
                      )}
                    </div>
                  )}
                </div>

                <button
                  onClick={() => { window.location.href = "/admin/comptabilite"; }}
                  className="px-5 py-3 rounded-xl font-body text-sm font-semibold text-white bg-blue-600 border-none cursor-pointer">
                  Retour à la compta
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* ═══ PANEL DÉPOINTER CB : remettre tous les encaissements CB en non rapproché ═══
          Accessible UNIQUEMENT via ?debug=reset-cb dans l'URL.
          Workflow : Nicolas a désactivé le matching CB par sous-ensembles
          (suite au bug 495€) et veut repartir d'un état propre pour utiliser
          Détail CA sur chaque remise CARTE. */}
      {showDepointerCbPanel && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" ref={depointerPanelInitRef}>
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 flex flex-col gap-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center gap-3">
              <RefreshCw className="text-orange-500" size={28} />
              <h2 className="font-display text-xl font-bold text-orange-700">Dépointer encaissements CB</h2>
            </div>
            <p className="font-body text-sm text-slate-600">
              Action : remet tous les encaissements <b>CB Terminal</b> de <b>{period}</b> en <i>non rapproché</i>.
              Ils réapparaîtront dans "Encaissements à remettre" et pourront être re-rapprochés
              proprement via <b>Détail CA</b> sur chaque remise CARTE.
            </p>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-900">
              <b>⚠️ Effet de l'action :</b> les encaissements CB seront marqués <code className="bg-amber-100 px-1 rounded">reconciledByBank: false</code>.
              Les remises bancaires (bankLines) ne sont pas modifiées. Idempotent : peut être relancé sans danger.
            </div>

            {!depointerCbDryRun && depointerCbLoading && (
              <div className="flex items-center gap-2 text-slate-500 font-body text-sm">
                <Loader2 size={16} className="animate-spin" /> Calcul...
              </div>
            )}

            {depointerCbDryRun && !depointerCbDryRun.error && !depointerCbApplied && (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                <div className="font-body text-sm font-semibold text-slate-700 mb-2">📊 Aperçu pour {depointerCbDryRun.period}</div>
                <div className="grid grid-cols-3 gap-3 mb-3">
                  <div className="bg-white rounded-md p-2 text-center">
                    <div className="font-body text-2xl font-bold text-slate-700">{depointerCbDryRun.total}</div>
                    <div className="font-body text-[10px] text-slate-500 uppercase tracking-wide">Total CB</div>
                  </div>
                  <div className="bg-green-50 rounded-md p-2 text-center">
                    <div className="font-body text-2xl font-bold text-green-700">{depointerCbDryRun.reconciledByBank}</div>
                    <div className="font-body text-[10px] text-green-700 uppercase tracking-wide">Rapprochés</div>
                  </div>
                  <div className="bg-orange-50 rounded-md p-2 text-center">
                    <div className="font-body text-2xl font-bold text-orange-700">{depointerCbDryRun.aDepointer}</div>
                    <div className="font-body text-[10px] text-orange-700 uppercase tracking-wide">À dépointer</div>
                  </div>
                </div>
                {depointerCbDryRun.samples?.length > 0 && (
                  <div className="text-[11px] font-body text-slate-600">
                    <b>5 premiers (aperçu) :</b>
                    <ul className="mt-1 space-y-0.5">
                      {depointerCbDryRun.samples.map((s: any) => (
                        <li key={s.id} className="font-mono text-[10px]">
                          {s.date} · {s.familyName} · <b>{s.montant?.toFixed(2)}€</b> · {s.reconciledByBank ? "✓ rapproché" : "non rapproché"}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {depointerCbDryRun?.error && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700 font-body">
                ❌ {depointerCbDryRun.error}
              </div>
            )}

            {depointerCbApplied && !depointerCbApplied.error && (
              <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-sm text-green-800 font-body">
                ✅ <b>{depointerCbApplied.nbEncaissementsDepointes}</b> encaissements dépointés.
                <div className="text-xs mt-1">Rechargement automatique...</div>
              </div>
            )}
            {depointerCbApplied?.error && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700 font-body">
                ❌ {depointerCbApplied.error}
              </div>
            )}

            <div className="flex gap-2 mt-2">
              <button
                onClick={() => { window.location.href = "/admin/comptabilite"; }}
                className="flex-1 px-5 py-3 rounded-xl font-body text-sm font-semibold text-slate-600 bg-slate-100 border-none cursor-pointer">
                Annuler
              </button>
              {depointerCbDryRun?.aDepointer > 0 && !depointerCbApplied && (
                <button
                  onClick={applyDepointerCb}
                  disabled={depointerCbLoading}
                  className="flex-1 px-5 py-3 rounded-xl font-body text-sm font-semibold text-white bg-orange-500 hover:bg-orange-600 border-none cursor-pointer disabled:opacity-50">
                  {depointerCbLoading ? "..." : `Dépointer ${depointerCbDryRun.aDepointer} encaissements`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══ PANEL MIGRATION BANKLINES (?debug=migrate-banklines) ═══
          Redistribue les bankLines deja stockees dans le mauvais doc
          rapprochements/{period} vers le doc correspondant a leur date
          reelle. A lancer une fois apres deploiement de l'etape 1. */}
      {showMigrateBlsPanel && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" ref={migrateBlsPanelInitRef}>
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 flex flex-col gap-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center gap-3">
              <RefreshCw className="text-purple-500" size={28} />
              <h2 className="font-display text-xl font-bold text-purple-700">Migration des bankLines par mois</h2>
            </div>
            <p className="font-body text-sm text-slate-600">
              Redistribue toutes les bankLines déjà stockées dans le mauvais doc
              <code className="bg-slate-100 px-1 rounded mx-1">rapprochements/&#123;period&#125;</code>
              vers le doc correspondant à leur <b>date réelle</b>.
              Action <b>idempotente</b> : peut être relancée sans danger.
            </p>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-900">
              <b>ℹ️ Pourquoi cette migration :</b> avant le fix de l'étape 1, à chaque
              import CSV toutes les bankLines étaient sauvegardées dans le doc de la
              période active (mai si tu importes en mai), même si elles concernaient
              avril. Cette migration les redistribue dans le bon mois.
              <br /><br />
              <b>Action :</b> chaque doc <code>rapprochements/YYYY-MM</code> sera réécrit
              avec uniquement les bankLines dont la date tombe dans ce mois. Les pointages
              existants sont préservés (en cas de doublon entre 2 docs, on garde celui
              qui est marqué <i>matched</i>).
            </div>

            {!migrateBlsDryRun && migrateBlsLoading && (
              <div className="flex items-center gap-2 text-slate-500 font-body text-sm">
                <Loader2 size={16} className="animate-spin" /> Analyse en cours...
              </div>
            )}

            {migrateBlsDryRun?.error && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700 font-body">
                ❌ {migrateBlsDryRun.error}
              </div>
            )}

            {migrateBlsDryRun && !migrateBlsDryRun.error && !migrateBlsApplied && (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                <div className="font-body text-sm font-semibold text-slate-700 mb-2">📊 Analyse</div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
                  <div className="bg-white rounded-md p-2 text-center">
                    <div className="font-body text-xl font-bold text-slate-700">{migrateBlsDryRun.stats?.nbDocs || 0}</div>
                    <div className="font-body text-[10px] text-slate-500 uppercase">Docs actuels</div>
                  </div>
                  <div className="bg-white rounded-md p-2 text-center">
                    <div className="font-body text-xl font-bold text-slate-700">{migrateBlsDryRun.stats?.nbBls || 0}</div>
                    <div className="font-body text-[10px] text-slate-500 uppercase">BankLines</div>
                  </div>
                  <div className="bg-orange-50 rounded-md p-2 text-center">
                    <div className="font-body text-xl font-bold text-orange-700">{migrateBlsDryRun.stats?.nbBlsMalRangees || 0}</div>
                    <div className="font-body text-[10px] text-orange-700 uppercase">Mal rangées</div>
                  </div>
                  <div className="bg-purple-50 rounded-md p-2 text-center">
                    <div className="font-body text-xl font-bold text-purple-700">{migrateBlsDryRun.stats?.nbDocsApresMigration || 0}</div>
                    <div className="font-body text-[10px] text-purple-700 uppercase">Docs après</div>
                  </div>
                </div>

                {migrateBlsDryRun.docsApresMigration && migrateBlsDryRun.docsApresMigration.length > 0 && (
                  <div className="text-[11px] font-body text-slate-600">
                    <b>Répartition cible par mois :</b>
                    <table className="mt-1 w-full">
                      <tbody>
                        {migrateBlsDryRun.docsApresMigration.map((d: any) => (
                          <tr key={d.ym} className="font-mono text-[10px]">
                            <td className="py-0.5">{d.ym}</td>
                            <td className="py-0.5 text-right">{d.nbBls} bankLines</td>
                            <td className="py-0.5 text-right text-green-700">{d.nbMatched} pointées</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {migrateBlsDryRun.stats?.nbOrphelines > 0 && (
                  <div className="mt-2 text-[10px] text-amber-700 italic">
                    ⚠️ {migrateBlsDryRun.stats.nbOrphelines} bankLine(s) avec date invalide laissées dans leur doc d'origine.
                  </div>
                )}
              </div>
            )}

            {migrateBlsApplied && !migrateBlsApplied.error && (
              <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-sm text-green-800 font-body">
                ✅ <b>{migrateBlsApplied.nbBlsDeplacees}</b> bankLine(s) déplacée(s) dans le bon mois.
                <div className="text-xs mt-1">{migrateBlsApplied.nbDocsModifies} doc(s) modifié(s). Rechargement...</div>
              </div>
            )}
            {migrateBlsApplied?.error && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700 font-body">
                ❌ {migrateBlsApplied.error}
              </div>
            )}

            <div className="flex gap-2 mt-2">
              <button
                onClick={() => { window.location.href = "/admin/comptabilite"; }}
                className="flex-1 px-5 py-3 rounded-xl font-body text-sm font-semibold text-slate-600 bg-slate-100 border-none cursor-pointer">
                Annuler
              </button>
              {migrateBlsDryRun && !migrateBlsDryRun.error && !migrateBlsApplied && (
                <button
                  onClick={applyMigrateBls}
                  disabled={migrateBlsLoading || (migrateBlsDryRun.stats?.nbBlsMalRangees || 0) === 0}
                  className="flex-1 px-5 py-3 rounded-xl font-body text-sm font-semibold text-white bg-purple-500 hover:bg-purple-600 border-none cursor-pointer disabled:opacity-50">
                  {migrateBlsLoading
                    ? "..."
                    : (migrateBlsDryRun.stats?.nbBlsMalRangees || 0) === 0
                    ? "Rien à migrer"
                    : `Migrer ${migrateBlsDryRun.stats.nbBlsMalRangees} bankLines`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
