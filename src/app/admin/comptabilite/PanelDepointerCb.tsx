"use client";

/**
 * src/app/admin/comptabilite/PanelDepointerCb.tsx
 *
 * Panneau « Dépointer les encaissements CB », accessible via `?debug=reset-cb`.
 *
 * Pourquoi cet outil : le matching automatique des remises CB par
 * sous-ensembles a été désactivé après le bug des 495 € attribués à la
 * mauvaise remise. Les encaissements qu'il avait rapprochés à tort portent
 * toujours `reconciledByBank: true` et n'apparaissent donc plus nulle part.
 * Ce panneau les relâche d'un coup pour le mois affiché, afin de les
 * re-rapprocher proprement via « Détail CA ».
 *
 * L'action est idempotente et ne touche PAS aux lignes bancaires : on peut la
 * relancer sans rien casser. Le dry-run se déclenche à l'ouverture du panneau,
 * via un callback de ref plutôt qu'un effet — l'élément n'existe que quand le
 * paramètre d'URL est présent.
 */

import { useState } from "react";
import { authFetch } from "@/lib/auth-fetch";
import { Loader2, RefreshCw } from "lucide-react";

export function PanelDepointerCb({ period }: { period: string }) {
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
    if (el && !depointerCbDryRun && !depointerCbLoading) {
      fetchDepointerCbDryRun();
    }
  };

  return (
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
  );
}
