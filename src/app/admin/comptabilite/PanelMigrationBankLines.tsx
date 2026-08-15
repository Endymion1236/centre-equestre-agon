"use client";

/**
 * src/app/admin/comptabilite/PanelMigrationBankLines.tsx
 *
 * Panneau de migration des lignes bancaires, accessible via
 * `?debug=migrate-banklines`. À lancer UNE FOIS, après le déploiement du
 * rangement par mois.
 *
 * Le problème qu'il répare : avant le correctif, un import CSV rangeait TOUTES
 * les lignes dans le document du mois affiché. Importer en mai un relevé à
 * cheval sur avril et mai plaçait donc les lignes d'avril dans le document de
 * mai — d'où des doublons et des lignes introuvables quand on revenait sur
 * avril. Cette migration redistribue chaque ligne dans le mois de sa date
 * réelle, en conservant les pointages (en cas de doublon entre deux documents,
 * on garde celui qui est marqué rapproché).
 *
 * Idempotente : relançable sans danger.
 */

import { useState } from "react";
import { authFetch } from "@/lib/auth-fetch";
import { Loader2, RefreshCw } from "lucide-react";

export function PanelMigrationBankLines() {
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
    if (el && !migrateBlsDryRun && !migrateBlsLoading) {
      fetchMigrateBlsDryRun();
    }
  };

  return (
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
  );
}
