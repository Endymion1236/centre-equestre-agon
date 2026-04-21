"use client";

import { useState } from "react";
import { HelpCircle, Play, BookOpen, X } from "lucide-react";
import Link from "next/link";
import { startTour } from "@/lib/manual-tours";

interface HelpButtonProps {
  /** ID du tour guidé à lancer (ex: "planning-enroll") */
  tourId?: string;
  /** Lien vers le chapitre du manuel (ex: "/admin/manuel#planning") */
  manualLink?: string;
  /** Texte du bouton tour (optionnel) */
  tourLabel?: string;
  /** Label lecture manuel */
  manualLabel?: string;
}

/**
 * Petit bouton "?" flottant à placer en haut-à-droite d'une page admin.
 * Propose : lancer un tour guidé + ouvrir le manuel.
 */
export function HelpButton({
  tourId,
  manualLink,
  tourLabel = "Tour guidé",
  manualLabel = "Lire le manuel",
}: HelpButtonProps) {
  const [open, setOpen] = useState(false);

  if (!tourId && !manualLink) return null;

  return (
    <div className="relative inline-block">
      <button
        onClick={() => setOpen(o => !o)}
        title="Aide sur cette page"
        aria-label="Aide"
        className="flex items-center justify-center w-9 h-9 rounded-full bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-600 cursor-pointer transition-colors">
        <HelpCircle size={16} />
      </button>

      {open && (
        <>
          {/* Overlay pour fermer en cliquant à côté */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />

          {/* Menu déroulant */}
          <div className="absolute right-0 top-11 z-50 bg-white border border-gray-200 rounded-xl shadow-xl w-64 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100 bg-slate-50">
              <span className="font-body text-xs font-semibold text-slate-700 uppercase tracking-wider">Aide</span>
              <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600 bg-transparent border-none cursor-pointer">
                <X size={14} />
              </button>
            </div>
            <div className="p-2 flex flex-col gap-1">
              {tourId && (
                <button
                  onClick={() => { setOpen(false); startTour(tourId); }}
                  className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-white hover:bg-blue-50 border-none cursor-pointer text-left">
                  <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                    <Play size={14} className="text-blue-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-body text-sm font-semibold text-blue-800">{tourLabel}</div>
                    <div className="font-body text-[11px] text-slate-500">Visite guidée interactive</div>
                  </div>
                </button>
              )}
              {manualLink && (
                <Link
                  href={manualLink}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-white hover:bg-amber-50 no-underline">
                  <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0">
                    <BookOpen size={14} className="text-amber-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-body text-sm font-semibold text-blue-800">{manualLabel}</div>
                    <div className="font-body text-[11px] text-slate-500">Documentation complète</div>
                  </div>
                </Link>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
