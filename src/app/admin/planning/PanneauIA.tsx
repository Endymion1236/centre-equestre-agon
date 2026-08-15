"use client";
/**
 * src/app/admin/planning/PanneauIA.tsx
 *
 * Bandeau de résultats de l'analyse IA du planning : jauges de remplissage et
 * suggestions en texte libre.
 *
 * Sorti de la page parce que c'est un affichage purement consultatif, sans
 * aucune action possible dessus — il n'écrit rien, ne déclenche rien, et
 * n'avait donc aucune raison d'occuper cinquante lignes au milieu des vues du
 * planning. Le calcul, lui, vit dans planning-ia.ts.
 */

import { X, Loader2, Sparkles } from "lucide-react";

export default function PanneauIA({ iaStats, iaLoading, iaSuggestions, onClose }: {
  iaStats: any;
  iaLoading: boolean;
  iaSuggestions: string | null;
  onClose: () => void;
}) {
  return (
    <div className="mb-6 rounded-2xl border p-5" style={{ borderColor: "#7c3aed33", background: "linear-gradient(135deg,#f5f3ff,#eff6ff)" }}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: "linear-gradient(135deg,#7c3aed,#2050A0)" }}>
            <Sparkles size={15} className="text-white" />
          </div>
          <div>
            <div className="font-body text-sm font-semibold text-blue-800">Analyse IA du planning</div>
            {iaStats && (
              <div className="font-body text-xs text-slate-600">
                {iaStats.tauxGlobal}% de remplissage · {iaStats.sousRemplis} sous-remplis · {iaStats.complets} complets · {iaStats.vides} vides
              </div>
            )}
          </div>
        </div>
        <button onClick={onClose}
          className="text-slate-600 bg-transparent border-none cursor-pointer hover:text-gray-600"><X size={16}/></button>
      </div>

      {/* Jauges de remplissage rapides */}
      {iaStats && (
        <div className="grid grid-cols-3 gap-2 mb-4">
          {[
            { label: "Taux global", value: iaStats.tauxGlobal, color: iaStats.tauxGlobal >= 70 ? "#16a34a" : iaStats.tauxGlobal >= 40 ? "#d97706" : "#dc2626" },
            { label: "Sous-remplis", value: iaStats.total > 0 ? Math.round(iaStats.sousRemplis/iaStats.total*100) : 0, color: "#d97706", suffix: ` (${iaStats.sousRemplis})` },
            { label: "Complets", value: iaStats.total > 0 ? Math.round(iaStats.complets/iaStats.total*100) : 0, color: "#16a34a", suffix: ` (${iaStats.complets})` },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-xl p-2.5">
              <div className="font-body text-xs text-slate-600 mb-1">{s.label}</div>
              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden mb-1">
                <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, s.value)}%`, background: s.color }} />
              </div>
              <div className="font-body text-sm font-bold" style={{ color: s.color }}>{s.value}%{s.suffix || ""}</div>
            </div>
          ))}
        </div>
      )}

      {iaLoading ? (
        <div className="flex items-center gap-2 py-4 justify-center text-purple-600">
          <Loader2 size={16} className="animate-spin" />
          <span className="font-body text-sm">Analyse en cours...</span>
        </div>
      ) : iaSuggestions ? (
        <div className="font-body text-sm text-blue-800 whitespace-pre-wrap leading-relaxed bg-white rounded-xl p-4">
          {iaSuggestions}
        </div>
      ) : null}
    </div>
  );
}
