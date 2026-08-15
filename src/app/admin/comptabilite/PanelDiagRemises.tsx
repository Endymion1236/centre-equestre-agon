"use client";

/**
 * src/app/admin/comptabilite/PanelDiagRemises.tsx
 *
 * Panneau de diagnostic des remises, accessible via `?debug=diag` dans l'URL.
 *
 * Read-only, et volontairement : il sert à répondre à la question « pourquoi
 * l'écran m'affiche X remises alors que j'en ai créé Y ? ». Le rapport est
 * calculé À PARTIR DES DONNÉES DÉJÀ CHARGÉES par la page — aucune requête
 * supplémentaire — pour montrer exactement ce que l'interface voit, et non un
 * second état qui pourrait diverger.
 *
 * La recherche par nom, elle, interroge le serveur (/api/admin/diag-paiement)
 * car elle doit voir au-delà de la période affichée.
 */

import { useState, useEffect } from "react";
import { authFetch } from "@/lib/auth-fetch";
import { Loader2, Search } from "lucide-react";

export function PanelDiagRemises({
  remises, encaissementsCompta, loading,
}: {
  remises: any[];
  encaissementsCompta: any[];
  loading: boolean;
}) {
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

  // ─────────────────────────────────────────────────────────────────────────
  //  Diagnostic remises (panel ?debug=diag)
  //  Calcule un rapport read-only à partir des données déjà chargées dans
  //  l'UI (remises, encaissementsCompta, payments). Pas de requête supplémentaire.
  // ─────────────────────────────────────────────────────────────────────────
  const buildDiagReport = () => {
    const total = (remises || []).length;
    const parMois: Record<string, { count: number; totalEur: number; pointees: number }> = {};
    const parEtat = { pointees: 0, nonPointees: 0 };
    const parMode: Record<string, number> = {};
    const recentes: any[] = [];

    for (const r of (remises || [])) {
      const date = r.createdAt?.seconds ? new Date(r.createdAt.seconds * 1000) : null;
      const moisCle = date
        ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
        : "???";
      if (!parMois[moisCle]) parMois[moisCle] = { count: 0, totalEur: 0, pointees: 0 };
      parMois[moisCle].count += 1;
      parMois[moisCle].totalEur += r.total || 0;
      if (r.pointee) parMois[moisCle].pointees += 1;

      if (r.pointee) parEtat.pointees += 1;
      else parEtat.nonPointees += 1;

      const mode = r.paymentMode || r.mode || "?";
      parMode[mode] = (parMode[mode] || 0) + 1;
    }

    const sorted = [...(remises || [])]
      .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
      .slice(0, 15);

    for (const r of sorted) {
      const d = r.createdAt?.seconds ? new Date(r.createdAt.seconds * 1000) : null;
      recentes.push({
        id: r.id,
        date: d ? d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" }) : "???",
        mode: r.paymentMode || r.mode || "?",
        total: r.total || 0,
        pointee: !!r.pointee,
        pointeeNote: r.pointeeNote || null,
        nbEncaissements: (r.encaissementIds || []).length,
        nbPaymentsLegacy: (r.paymentIds || []).length,
      });
    }

    // Stats sur les encaissements pour comprendre l'écart
    const totalEnc = (encaissementsCompta || []).length;
    const reconciledEnc = (encaissementsCompta || []).filter((e: any) => e.reconciledByBank).length;
    const cbEnc = (encaissementsCompta || []).filter((e: any) => e.mode === "cb_terminal").length;

    return {
      total,
      parMois,
      parEtat,
      parMode,
      recentes,
      encaissements: { total: totalEnc, reconciled: reconciledEnc, cbTerminal: cbEnc },
    };
  };

  useEffect(() => {
    if (!diagLoading && !diagReport && (remises?.length !== undefined)) {
      // Attendre que les données soient chargées
      if (loading) return;
      setDiagLoading(true);
      try {
        const report = buildDiagReport();
        setDiagReport(report);
      } catch (e) {
        console.error("Erreur diag:", e);
      }
      setDiagLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, remises]);

  return (
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
  );
}
