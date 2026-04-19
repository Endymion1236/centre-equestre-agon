"use client";

// ═══════════════════════════════════════════════════════════════════
// src/components/admin/GlobalKeyboardShortcuts.tsx
// ───────────────────────────────────────────────────────────────────
// Raccourcis clavier globaux pour l'admin.
//
// Actifs UNIQUEMENT quand on n'est pas en train de taper dans :
//   - <input>, <textarea>, [contenteditable]
//   - un champ de recherche ⌘K ouvert (détecté par la présence d'un
//     élément .global-search-open ou par focus sur un input déjà actif)
//
// Raccourcis :
//   N         → raccourci 'nouvelle' (contextuel selon la page)
//                planning : ouvre le menu "+ Ajouter"
//                cavaliers : nouvelle famille
//                devis : nouveau devis
//                sinon : ouvre la recherche ⌘K
//   P         → va direct à /admin/paiements
//   Shift+P   → va à /admin/paiements?tab=impayes (raccourci pro)
//   D         → retour au dashboard
//   G puis P  → planning (style Gmail — goto planning)
//   G puis M  → montoir
//   G puis C  → cavalerie
//   G puis D  → dashboard
//   ?         → ouvre un panneau d'aide avec la liste des raccourcis
//
// Échap est déjà géré par les modales individuelles (GlobalSearch,
// dropdowns, etc.) — pas besoin de l'intercepter globalement.
// ═══════════════════════════════════════════════════════════════════

import { useEffect, useState, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";

type ShortcutKey = { key: string; label: string; action: string };

const SHORTCUTS: ShortcutKey[] = [
  { key: "N", label: "Nouvelle entrée (contextuel)", action: "new" },
  { key: "P", label: "Paiements", action: "payments" },
  { key: "Shift+P", label: "Paiements impayés", action: "payments-unpaid" },
  { key: "D", label: "Dashboard", action: "dashboard" },
  { key: "G puis P", label: "Aller au planning", action: "goto-planning" },
  { key: "G puis M", label: "Aller au montoir", action: "goto-montoir" },
  { key: "G puis C", label: "Aller à la cavalerie", action: "goto-cavalerie" },
  { key: "G puis D", label: "Aller au dashboard", action: "goto-dashboard" },
  { key: "/  ou  ⌘K", label: "Recherche globale", action: "search" },
  { key: "?", label: "Afficher cette aide", action: "help" },
];

/** Détermine si le focus actuel est sur un champ de saisie. */
function isTypingInInput(): boolean {
  const el = document.activeElement as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName?.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return true;
  if (el.isContentEditable) return true;
  // Si une modale de recherche est ouverte, on considère qu'on est dans un input
  if (document.querySelector('[data-global-search-open="true"]')) return true;
  return false;
}

export default function GlobalKeyboardShortcuts() {
  const router = useRouter();
  const pathname = usePathname();
  const [showHelp, setShowHelp] = useState(false);
  const [gPressed, setGPressed] = useState(false);

  // Reset du mode "G pressé" après 1.5s
  useEffect(() => {
    if (!gPressed) return;
    const t = setTimeout(() => setGPressed(false), 1500);
    return () => clearTimeout(t);
  }, [gPressed]);

  // Dispatche l'action "nouvelle entrée" selon la page active
  const handleNew = useCallback(() => {
    if (!pathname) return;
    // Planning : déclenche l'ouverture du menu "+ Ajouter"
    if (pathname.startsWith("/admin/planning")) {
      window.dispatchEvent(new Event("planning:open-add-menu"));
      return;
    }
    // Cavaliers : simule un clic sur le bouton "Nouvelle famille"
    if (pathname.startsWith("/admin/cavaliers")) {
      window.dispatchEvent(new Event("cavaliers:new-family"));
      return;
    }
    // Devis : nouveau devis
    if (pathname.startsWith("/admin/devis")) {
      window.dispatchEvent(new Event("devis:new"));
      return;
    }
    // Fallback : ouvre la recherche globale
    window.dispatchEvent(new Event("open-global-search"));
  }, [pathname]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ignorer si on tape dans un input
      if (isTypingInInput()) return;

      // Ignorer les modificateurs qui ne nous intéressent pas
      if (e.altKey || e.metaKey || e.ctrlKey) {
        // Exception : Shift+P est géré dans nos raccourcis
        if (!e.shiftKey) return;
      }

      // ?  → afficher l'aide
      if (e.key === "?") {
        e.preventDefault();
        setShowHelp((prev) => !prev);
        return;
      }

      // Escape → fermer l'aide si ouverte
      if (e.key === "Escape" && showHelp) {
        e.preventDefault();
        setShowHelp(false);
        return;
      }

      // Mode "G pressé" puis lettre de navigation
      if (gPressed) {
        const k = e.key.toLowerCase();
        if (k === "p") { e.preventDefault(); router.push("/admin/planning"); setGPressed(false); return; }
        if (k === "m") { e.preventDefault(); router.push("/admin/montoir"); setGPressed(false); return; }
        if (k === "c") { e.preventDefault(); router.push("/admin/cavalerie"); setGPressed(false); return; }
        if (k === "d") { e.preventDefault(); router.push("/admin/dashboard"); setGPressed(false); return; }
        // Sinon annuler le mode G
        setGPressed(false);
      }

      // G → entrer en mode navigation (style Gmail)
      if (e.key === "g" && !e.shiftKey) {
        e.preventDefault();
        setGPressed(true);
        return;
      }

      // Shift+P → impayés
      if (e.shiftKey && e.key === "P") {
        e.preventDefault();
        router.push("/admin/paiements?tab=impayes");
        return;
      }

      // P → paiements
      if (e.key === "p" && !e.shiftKey) {
        e.preventDefault();
        router.push("/admin/paiements");
        return;
      }

      // N → nouvelle entrée contextuelle
      if (e.key === "n" && !e.shiftKey) {
        e.preventDefault();
        handleNew();
        return;
      }

      // D → dashboard
      if (e.key === "d" && !e.shiftKey) {
        e.preventDefault();
        router.push("/admin/dashboard");
        return;
      }
    };

    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [router, showHelp, gPressed, handleNew]);

  if (!showHelp) {
    // Indicateur discret du mode "G"
    if (gPressed) {
      return (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] bg-blue-800 text-white px-4 py-2 rounded-full shadow-lg font-body text-xs font-semibold flex items-center gap-2 animate-pulse">
          <kbd className="px-2 py-0.5 rounded bg-white/15 font-mono">G</kbd>
          <span>Tapez <kbd className="px-1.5 py-0.5 rounded bg-white/15 font-mono">P</kbd>, <kbd className="px-1.5 py-0.5 rounded bg-white/15 font-mono">M</kbd>, <kbd className="px-1.5 py-0.5 rounded bg-white/15 font-mono">C</kbd> ou <kbd className="px-1.5 py-0.5 rounded bg-white/15 font-mono">D</kbd></span>
        </div>
      );
    }
    return null;
  }

  // Panneau d'aide
  return (
    <div
      className="fixed inset-0 z-[150] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={() => setShowHelp(false)}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
        onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <div className="font-display text-base font-bold text-blue-800">⌨️ Raccourcis clavier</div>
            <div className="font-body text-[11px] text-slate-500 mt-0.5">
              Actifs hors champs de saisie
            </div>
          </div>
          <button
            onClick={() => setShowHelp(false)}
            className="text-slate-400 hover:text-slate-600 bg-transparent border-none cursor-pointer text-xl">
            ×
          </button>
        </div>
        <div className="px-6 py-4 max-h-[60vh] overflow-y-auto">
          <div className="space-y-2">
            {SHORTCUTS.map((s) => (
              <div key={s.action} className="flex items-center justify-between py-1.5">
                <span className="font-body text-sm text-slate-700">{s.label}</span>
                <kbd className="font-mono text-[11px] font-semibold text-blue-800 bg-gray-100 px-2.5 py-1 rounded-md border border-gray-200">
                  {s.key}
                </kbd>
              </div>
            ))}
          </div>
        </div>
        <div className="px-6 py-3 bg-blue-50/40 border-t border-blue-500/8">
          <div className="font-body text-[11px] text-slate-500">
            💡 Appuyez sur <kbd className="font-mono bg-white px-1.5 py-0.5 rounded border border-gray-200">?</kbd> à tout moment pour afficher cette aide.
          </div>
        </div>
      </div>
    </div>
  );
}
