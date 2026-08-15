"use client";

/**
 * src/app/admin/comptabilite/AssistantIa.tsx
 *
 * La bulle flottante « Assistant comptable IA », en bas à droite de l'écran.
 *
 * Elle reste montée en permanence, quel que soit l'onglet : la question qu'on
 * se pose (« quel est mon taux d'impayés ? ») arrive rarement pendant qu'on
 * est déjà sur le bon onglet. L'état de la conversation et l'appel à /api/ia
 * restent dans la page, parce que la réponse dépend des chiffres de la
 * période affichée.
 */

import { Loader2, Sparkles, Bot } from "lucide-react";

export function AssistantIa({
  showAssistant, setShowAssistant,
  iaQuestion, setIaQuestion,
  iaAnswer, setIaAnswer,
  iaAnswerLoading, poserQuestion,
}: {
  showAssistant: boolean;
  setShowAssistant: (v: boolean) => void;
  iaQuestion: string;
  setIaQuestion: (v: string) => void;
  iaAnswer: string | null;
  setIaAnswer: (v: string | null) => void;
  iaAnswerLoading: boolean;
  poserQuestion: () => void;
}) {
  return (
  <div className="fixed bottom-6 right-6 z-[100] flex flex-col items-end gap-3">
    {/* Panel assistant */}
    {showAssistant && (
      <div className="bg-white rounded-2xl shadow-2xl border border-purple-100 w-96 flex flex-col overflow-hidden"
        style={{ maxHeight: "70vh" }}>
        <div className="flex items-center justify-between px-4 py-3 text-white"
          style={{ background: "linear-gradient(135deg,#7c3aed,#2050A0)" }}>
          <div className="flex items-center gap-2">
            <Sparkles size={16} />
            <span className="font-body text-sm font-semibold">Assistant comptable IA</span>
          </div>
          <button onClick={() => setShowAssistant(false)}
            className="text-white/70 hover:text-white bg-transparent border-none cursor-pointer text-lg leading-none">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3" style={{ minHeight: 200 }}>
          {/* Suggestions */}
          {!iaAnswer && (
            <div className="flex flex-col gap-2">
              <p className="font-body text-xs text-slate-500 mb-1">Questions fréquentes :</p>
              {[
                "Quel est mon taux d'impayés ce mois ?",
                "Quelles familles doivent le plus ?",
                "Quel mode de paiement est le plus utilisé ?",
                "Compare encaissé vs facturé",
              ].map(q => (
                <button key={q} onClick={() => { setIaQuestion(q); }}
                  className="text-left font-body text-xs text-blue-600 bg-blue-50 px-3 py-2 rounded-lg border-none cursor-pointer hover:bg-blue-100">
                  {q}
                </button>
              ))}
            </div>
          )}

          {/* Réponse IA */}
          {iaAnswerLoading && (
            <div className="flex items-center gap-2 text-purple-600 font-body text-sm">
              <Loader2 size={14} className="animate-spin" /> Analyse en cours...
            </div>
          )}
          {iaAnswer && (
            <div className="bg-purple-50 rounded-xl p-3 font-body text-sm text-blue-800 whitespace-pre-wrap leading-relaxed">
              {iaAnswer}
            </div>
          )}
          {iaAnswer && (
            <button onClick={() => { setIaAnswer(null); setIaQuestion(""); }}
              className="font-body text-xs text-slate-500 bg-transparent border-none cursor-pointer hover:text-blue-500 text-left">
              ← Nouvelle question
            </button>
          )}
        </div>

        {/* Input question */}
        <div className="border-t border-gray-100 p-3 flex gap-2">
          <input value={iaQuestion} onChange={e => setIaQuestion(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); poserQuestion(); } }}
            placeholder="Posez votre question..."
            className="flex-1 font-body text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-purple-400 focus:ring-1 focus:ring-purple-200" />
          <button onClick={poserQuestion} disabled={!iaQuestion.trim() || iaAnswerLoading}
            className="w-9 h-9 rounded-lg flex items-center justify-center text-white border-none cursor-pointer disabled:opacity-40"
            style={{ background: "linear-gradient(135deg,#7c3aed,#2050A0)" }}>
            <Bot size={16} />
          </button>
        </div>
      </div>
    )}

    {/* Bouton flottant */}
    <button onClick={() => setShowAssistant(!showAssistant)}
      className="w-14 h-14 rounded-full flex items-center justify-center text-white shadow-lg border-none cursor-pointer hover:scale-105 transition-transform"
      style={{ background: "linear-gradient(135deg,#7c3aed,#2050A0)" }}
      title="Assistant comptable IA">
      {showAssistant ? <span className="text-xl">✕</span> : <Sparkles size={22} />}
    </button>
  </div>
  );
}
