"use client";

/**
 * src/app/admin/comptabilite/PanelResetCompta.tsx
 *
 * Panneau de remise à zéro de la comptabilité, accessible UNIQUEMENT en
 * ajoutant `?debug=reset` à l'URL.
 *
 * Pourquoi il existe : pendant la phase de test interne (avant septembre
 * 2026), il faut pouvoir repartir d'une compta vierge après avoir saisi des
 * jeux d'essai. Pourquoi il est caché derrière un paramètre d'URL, un mot de
 * passe serveur, un dry-run et un token à recopier : parce qu'il efface des
 * encaissements réels et que des familles ont déjà reçu leurs factures.
 *
 * ⚠️ NE DOIT JAMAIS ÊTRE UTILISÉ EN PRODUCTION RÉELLE.
 *
 * L'état de ce panneau (mot de passe, rapport, résultat) ne sert qu'ici : il
 * vit donc dans le composant, et non dans la page.
 */

import { useState } from "react";
import { Loader2, AlertTriangle } from "lucide-react";

export function PanelResetCompta() {
  const [resetSecret, setResetSecret] = useState("");
  const [resetDryRun, setResetDryRun] = useState<any>(null);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetApplied, setResetApplied] = useState<any>(null);

  return (
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
  );
}
