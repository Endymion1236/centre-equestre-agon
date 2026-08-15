"use client";
/**
 * src/app/admin/planning/BarreActionsPlanning.tsx
 *
 * L'en-tête du planning : titre, lien vers le montoir, sélecteur de vue
 * (Mois / Semaine / Timeline / Jour), menu « + Ajouter », bouton Dupliquer et
 * menu « ⋯ » (export PDF, analyse IA).
 *
 * Sortie de la page parce que c'est 120 lignes de présentation pure : aucune
 * décision métier, aucune écriture. Tout ce qu'un bouton déclenche est fourni
 * par la page sous forme de fonction — la barre ne fait qu'appeler. Elle reste
 * ainsi lisible comme ce qu'elle est : la liste exhaustive de ce qu'un admin
 * peut lancer depuis cet écran.
 *
 * Le menu « + Ajouter » s'ouvre aussi au raccourci clavier « N » : c'est la
 * page qui écoute l'événement et pilote `menuAddOpen`, l'état vit donc en
 * dehors d'ici.
 */

import { Plus, Calendar, Loader2, CalendarDays, Briefcase, Sparkles, Printer, MoreHorizontal, Copy } from "lucide-react";
import { Creneau, fmtDate } from "./types";

export default function BarreActionsPlanning({
  viewMode, setViewMode, currentDay, creneaux, dayCreneaux,
  menuAddOpen, setMenuAddOpen, menuMoreOpen, setMenuMoreOpen,
  showDuplicate, setShowDuplicate, setShowSimple, setShowGenerator,
  setSelectedDate, setShowRdvForm, exportPDF, analyserPlanning, iaLoading,
}: {
  viewMode: "week" | "day" | "month" | "timeline";
  setViewMode: (v: "week" | "day" | "month" | "timeline") => void;
  currentDay: Date;
  creneaux: (Creneau & { id: string })[];
  dayCreneaux: (Creneau & { id: string })[];
  menuAddOpen: boolean;
  setMenuAddOpen: (fn: boolean | ((o: boolean) => boolean)) => void;
  menuMoreOpen: boolean;
  setMenuMoreOpen: (fn: boolean | ((o: boolean) => boolean)) => void;
  showDuplicate: boolean;
  setShowDuplicate: (v: boolean) => void;
  setShowSimple: (v: boolean) => void;
  setShowGenerator: (v: boolean) => void;
  setSelectedDate: (v: string | undefined) => void;
  setShowRdvForm: (v: boolean) => void;
  exportPDF: () => void;
  analyserPlanning: () => void;
  iaLoading: boolean;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-6">
      <div className="flex items-center gap-3">
        <h1 className="font-display text-2xl font-bold text-blue-800">Planning</h1>
        <a href={`/admin/montoir?date=${fmtDate(currentDay)}`}
          className="flex items-center gap-1.5 font-body text-xs font-semibold text-blue-600 bg-blue-50 px-3 py-1.5 rounded-lg no-underline hover:bg-blue-100">
          🐴 Montoir
        </a>
      </div>
      <div className="flex items-center gap-2 flex-wrap">

        {/* ─── Segmented control : Mois / Semaine / Timeline / Jour ─── */}
        <div className="inline-flex bg-blue-500/[0.06] rounded-full p-[3px] gap-0.5">
          {(["month","week","timeline","day"] as const).map(v => (
            <button key={v} onClick={() => setViewMode(v)}
              className={`px-3 sm:px-4 py-1.5 rounded-full font-body text-xs font-semibold cursor-pointer border-none transition-all whitespace-nowrap ${
                viewMode === v
                  ? "bg-white text-blue-500 shadow-[0_2px_8px_rgba(32,80,160,0.12)]"
                  : "text-slate-600 bg-transparent hover:text-blue-500"
              }`}>
              {v === "week" ? "Semaine" : v === "day" ? "Jour" : v === "timeline" ? "Timeline" : "Mois"}
            </button>
          ))}
        </div>

        {/* ─── Bouton + Ajouter (principal) avec menu ─── */}
        <div className="relative" data-menu="add">
          <button
            onClick={(e) => { e.stopPropagation(); setMenuAddOpen(o => !o); setMenuMoreOpen(false); }}
            className="flex items-center gap-1.5 font-body text-xs sm:text-sm font-semibold text-white px-4 py-2 rounded-full border-none cursor-pointer transition-all hover:-translate-y-px active:scale-[0.96]"
            style={{
              background: "linear-gradient(135deg, #2050A0 0%, #1a4590 100%)",
              boxShadow: "0 4px 12px rgba(32, 80, 160, 0.28)",
            }}
            aria-label="Ajouter"
            aria-expanded={menuAddOpen}>
            <Plus size={16} strokeWidth={2.5} />
            <span className="hidden sm:inline">Ajouter</span>
          </button>
          {menuAddOpen && (
            <div className="absolute top-[calc(100%+8px)] right-0 bg-white rounded-2xl shadow-[0_12px_40px_rgba(12,26,46,0.18)] p-2 min-w-[240px] z-50 border border-black/[0.04]">
              <div className="font-body text-[10px] font-bold text-slate-400 uppercase tracking-[0.8px] px-3.5 pt-2 pb-1">Créer</div>
              <button
                onClick={() => { setMenuAddOpen(false); setShowSimple(true); setShowGenerator(false); setSelectedDate(viewMode === "day" ? fmtDate(currentDay) : undefined); }}
                className="w-full text-left px-3.5 py-2.5 rounded-xl bg-transparent border-none cursor-pointer flex items-center gap-3 hover:bg-sand transition-colors">
                <span className="w-8 h-8 rounded-xl bg-blue-50 text-blue-500 inline-flex items-center justify-center flex-shrink-0">
                  <Calendar size={16} />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="font-body text-sm font-medium text-blue-800">Créneau unique</div>
                  <div className="font-body text-[11px] text-slate-400">Un cours, une balade…</div>
                </div>
              </button>
              <button
                onClick={() => { setMenuAddOpen(false); setShowGenerator(true); setShowSimple(false); }}
                className="w-full text-left px-3.5 py-2.5 rounded-xl bg-transparent border-none cursor-pointer flex items-center gap-3 hover:bg-sand transition-colors">
                <span className="w-8 h-8 rounded-xl bg-gold-400/20 text-amber-700 inline-flex items-center justify-center flex-shrink-0">
                  <CalendarDays size={16} />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="font-body text-sm font-medium text-blue-800">Générateur périodes</div>
                  <div className="font-body text-[11px] text-slate-400">Toute une saison en 1 clic</div>
                </div>
              </button>
              <button
                onClick={() => { setMenuAddOpen(false); setShowRdvForm(true); }}
                className="w-full text-left px-3.5 py-2.5 rounded-xl bg-transparent border-none cursor-pointer flex items-center gap-3 hover:bg-sand transition-colors">
                <span className="w-8 h-8 rounded-xl bg-orange-50 text-orange-700 inline-flex items-center justify-center flex-shrink-0">
                  <Briefcase size={16} />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="font-body text-sm font-medium text-blue-800">RDV Pro</div>
                  <div className="font-body text-[11px] text-slate-400">Vétérinaire, maréchal…</div>
                </div>
              </button>
            </div>
          )}
        </div>

        {/* ─── Dupliquer (visible en vue Semaine/Timeline uniquement) ─── */}
        {(viewMode === "week" || viewMode === "timeline") && creneaux.length > 0 && (
          <button
            onClick={() => setShowDuplicate(!showDuplicate)}
            className="flex items-center gap-1.5 font-body text-xs sm:text-sm font-semibold text-blue-500 bg-blue-500/[0.08] px-4 py-2 rounded-full border-none cursor-pointer transition-all hover:bg-blue-500/[0.14] active:scale-[0.96]">
            <Copy size={14} />
            Dupliquer
          </button>
        )}

        {/* ─── Menu ⋯ (actions secondaires : PDF + IA) ─── */}
        <div className="relative" data-menu="more">
          <button
            onClick={(e) => { e.stopPropagation(); setMenuMoreOpen(o => !o); setMenuAddOpen(false); }}
            className="w-[38px] h-[38px] rounded-full border-none cursor-pointer flex items-center justify-center bg-gray-100 text-slate-600 transition-all hover:bg-gray-200 hover:text-blue-800 active:scale-[0.96]"
            aria-label="Plus d'actions"
            aria-expanded={menuMoreOpen}>
            <MoreHorizontal size={18} />
          </button>
          {menuMoreOpen && (
            <div className="absolute top-[calc(100%+8px)] right-0 bg-white rounded-2xl shadow-[0_12px_40px_rgba(12,26,46,0.18)] p-2 min-w-[200px] z-50 border border-black/[0.04]">
              <button
                onClick={() => { setMenuMoreOpen(false); exportPDF(); }}
                disabled={(viewMode === "day" ? dayCreneaux : creneaux).length === 0}
                className="w-full text-left px-3.5 py-2.5 rounded-xl bg-transparent border-none cursor-pointer flex items-center gap-3 hover:bg-sand transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                <span className="w-8 h-8 rounded-xl bg-gray-100 text-slate-600 inline-flex items-center justify-center flex-shrink-0">
                  <Printer size={16} />
                </span>
                <span className="font-body text-sm font-medium text-blue-800">Export PDF</span>
              </button>
              <button
                onClick={() => { setMenuMoreOpen(false); analyserPlanning(); }}
                disabled={iaLoading || (viewMode === "day" ? dayCreneaux : creneaux).length === 0}
                className="w-full text-left px-3.5 py-2.5 rounded-xl bg-transparent border-none cursor-pointer flex items-center gap-3 hover:bg-sand transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                <span className="w-8 h-8 rounded-xl inline-flex items-center justify-center flex-shrink-0"
                  style={{ background: "linear-gradient(135deg, #ede9fe 0%, #ddd6fe 100%)", color: "#7c3aed" }}>
                  {iaLoading ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                </span>
                <span className="font-body text-sm font-medium text-blue-800">
                  {iaLoading ? "Analyse en cours..." : "Analyse IA"}
                </span>
              </button>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
