"use client";

// ═══════════════════════════════════════════════════════════════════
// src/components/admin/GlobalSearch.tsx
// ───────────────────────────────────────────────────────────────────
// Command palette style : Cmd/Ctrl+K (ou /) pour ouvrir, puis on tape.
//
// Cherche dans :
//   - Familles & cavaliers (par nom/prénom/email)
//   - Équidés (par nom)
//   - Paiements (par famille, activité, montant)
//   - Activités / stages
//
// Filtres intelligents détectés dans la requête :
//   - "impayé" ou "impaye" → filtre status: pending/partial
//   - "impayé 60" → + montant restant dû >= 60€
//   - Préfixes explicites : "p:xxx" (paiement), "c:xxx" (cavalier),
//     "e:xxx" (équidé), "f:xxx" (famille)
// ═══════════════════════════════════════════════════════════════════

import { useState, useEffect, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Search, X, Users, User, Heart, CreditCard, Calendar, Loader2, Command } from "lucide-react";

type SearchResult = {
  id: string;
  type: "family" | "child" | "horse" | "payment" | "activity";
  title: string;
  subtitle?: string;
  badge?: string;
  badgeColor?: string;
  url: string;
  score: number; // pertinence (plus élevé = plus pertinent)
};

// ─── Helpers ────────────────────────────────────────────────────────
const normalize = (s: string) =>
  (s || "")
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // retire les accents
    .trim();

/** Score de correspondance entre query et texte cible. */
function matchScore(query: string, target: string): number {
  if (!query || !target) return 0;
  const q = normalize(query);
  const t = normalize(target);
  if (!t) return 0;
  if (t === q) return 100;
  if (t.startsWith(q)) return 80;
  if (t.includes(" " + q)) return 60;
  if (t.includes(q)) return 40;
  // Match sur initiales des mots (ex: "lj" → "Léa Jourdan")
  const words = t.split(/\s+/);
  const initials = words.map((w) => w[0]).join("");
  if (initials.startsWith(q)) return 30;
  return 0;
}

// Détection des filtres spéciaux dans la query
function parseQuery(raw: string): { text: string; filters: Record<string, any> } {
  const filters: Record<string, any> = {};
  let text = raw;

  // Détection "impayé" + montant optionnel
  const impayeMatch = raw.toLowerCase().match(/\bimpaye?s?\b(?:\s+(\d+))?/i);
  if (impayeMatch) {
    filters.impaye = true;
    if (impayeMatch[1]) filters.amountMin = parseInt(impayeMatch[1]);
    text = text.replace(impayeMatch[0], "").trim();
  }

  // Préfixes explicites
  const prefixMatch = raw.match(/^(p|c|e|f):\s*(.*)/i);
  if (prefixMatch) {
    const map: Record<string, string> = { p: "payment", c: "child", e: "horse", f: "family" };
    filters.type = map[prefixMatch[1].toLowerCase()];
    text = prefixMatch[2].trim();
  }

  return { text, filters };
}

export default function GlobalSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<{
    families: any[];
    equides: any[];
    payments: any[];
    activities: any[];
  } | null>(null);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // ─── Raccourci clavier : Cmd/Ctrl+K ou / pour ouvrir ───
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen(true);
        return;
      }
      // "/" uniquement si on n'est pas dans un input/textarea
      if (e.key === "/" && !open) {
        const target = e.target as HTMLElement;
        const tag = target.tagName?.toLowerCase();
        const editable = target.isContentEditable;
        if (tag === "input" || tag === "textarea" || editable) return;
        e.preventDefault();
        setOpen(true);
        return;
      }
      if (e.key === "Escape" && open) {
        setOpen(false);
      }
    };
    // Event custom pour permettre à d'autres composants d'ouvrir la recherche
    const openHandler = () => setOpen(true);
    document.addEventListener("keydown", handler);
    window.addEventListener("open-global-search", openHandler);
    return () => {
      document.removeEventListener("keydown", handler);
      window.removeEventListener("open-global-search", openHandler);
    };
  }, [open]);

  // ─── Chargement des données (une fois à l'ouverture, puis cache) ───
  useEffect(() => {
    if (!open || data) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      // Chaque fetch est isolé : si une collection est inaccessible
      // (ex: moniteur qui n'a pas accès à payments), les autres continuent.
      const safeLoad = async (name: string): Promise<any[]> => {
        try {
          const snap = await getDocs(collection(db, name));
          return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        } catch (e) {
          console.warn(`[GlobalSearch] ${name} inaccessible:`, e);
          return [];
        }
      };
      const [families, equides, payments, activities] = await Promise.all([
        safeLoad("families"),
        safeLoad("equides"),
        safeLoad("payments"),
        safeLoad("activities"),
      ]);
      if (cancelled) return;
      setData({ families, equides, payments, activities });
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [open, data]);

  // ─── Focus auto sur l'input à l'ouverture ───
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  // ─── Calcul des résultats (mémoïsé) ───
  const results = useMemo<SearchResult[]>(() => {
    if (!data) return [];
    const { text, filters } = parseQuery(query);
    const hasText = text.length > 0;
    const out: SearchResult[] = [];

    // ─── Familles & cavaliers ───
    if (!filters.type || filters.type === "family" || filters.type === "child") {
      for (const fam of data.families) {
        // Score famille (parent)
        const famFields = [fam.parentName, fam.parentEmail, fam.parentPhone].filter(Boolean).join(" ");
        const famScore = hasText ? matchScore(text, famFields) : 0;
        if (famScore > 0) {
          out.push({
            id: fam.id,
            type: "family",
            title: fam.parentName || "—",
            subtitle: [fam.parentEmail, fam.parentPhone].filter(Boolean).join(" · "),
            badge: `${(fam.children || []).length} cavalier${(fam.children || []).length > 1 ? "s" : ""}`,
            badgeColor: "bg-blue-50 text-blue-500",
            url: `/admin/cavaliers?id=${fam.id}`,
            score: famScore,
          });
        }
        // Score enfants
        for (const child of (fam.children || [])) {
          const fullName = [child.firstName, child.lastName].filter(Boolean).join(" ");
          const childFields = [fullName, child.firstName, child.lastName].filter(Boolean).join(" ");
          const childScore = hasText ? matchScore(text, childFields) : 0;
          if (childScore > 0) {
            out.push({
              id: `${fam.id}_${child.id}`,
              type: "child",
              title: fullName || child.firstName || "—",
              subtitle: `Famille ${fam.parentName || "—"}${child.galopLevel && child.galopLevel !== "—" ? ` · Galop ${child.galopLevel}` : ""}`,
              badge: child.galopLevel && child.galopLevel !== "—" ? `Galop ${child.galopLevel}` : "Débutant",
              badgeColor: "bg-green-50 text-green-600",
              url: `/admin/cavaliers?id=${fam.id}&child=${child.id}`,
              score: childScore + 5, // léger boost : un cavalier est souvent ce qu'on cherche
            });
          }
        }
      }
    }

    // ─── Équidés ───
    if (!filters.type || filters.type === "horse") {
      for (const eq of data.equides) {
        const score = hasText ? matchScore(text, eq.nom || eq.name || "") : 0;
        if (score > 0) {
          out.push({
            id: eq.id,
            type: "horse",
            title: eq.nom || eq.name || "—",
            subtitle: [eq.race, eq.age ? `${eq.age} ans` : null, eq.robe].filter(Boolean).join(" · "),
            badge: eq.type === "poney" ? "Poney" : eq.type === "cheval" ? "Cheval" : "Équidé",
            badgeColor: "bg-amber-50 text-amber-700",
            url: `/admin/cavalerie?id=${eq.id}`,
            score,
          });
        }
      }
    }

    // ─── Paiements ───
    if (!filters.type || filters.type === "payment" || filters.impaye) {
      for (const pay of data.payments) {
        // Filtre impayé
        if (filters.impaye) {
          const isUnpaid = pay.status === "pending" || pay.status === "partial";
          if (!isUnpaid) continue;
          const due = (pay.totalTTC || 0) - (pay.paidAmount || 0);
          if (filters.amountMin && due < filters.amountMin) continue;
        }

        // Score texte
        const payFields = [
          pay.familyName,
          (pay.items || []).map((i: any) => i.activityTitle).join(" "),
          (pay.items || []).map((i: any) => i.childName).join(" "),
          pay.invoiceNumber,
        ].filter(Boolean).join(" ");

        let score = 0;
        if (hasText) {
          score = matchScore(text, payFields);
          if (score === 0) continue;
        } else if (filters.impaye) {
          // Pas de texte, juste filtre impayé → tous passent
          score = 50;
        } else {
          continue;
        }

        const due = (pay.totalTTC || 0) - (pay.paidAmount || 0);
        const isUnpaid = pay.status === "pending" || pay.status === "partial";
        out.push({
          id: pay.id,
          type: "payment",
          title: `${pay.familyName || "—"}${pay.invoiceNumber ? ` · ${pay.invoiceNumber}` : ""}`,
          subtitle: (pay.items || []).slice(0, 2).map((i: any) => i.activityTitle).join(", "),
          badge: isUnpaid ? `${due.toFixed(0)}€ dû` : `${(pay.totalTTC || 0).toFixed(0)}€ payé`,
          badgeColor: isUnpaid ? "bg-red-50 text-red-500" : "bg-green-50 text-green-600",
          url: `/admin/paiements${isUnpaid ? "?tab=impayes" : "?tab=historique"}`,
          score,
        });
      }
    }

    // ─── Activités ───
    if (!filters.type && hasText) {
      for (const act of data.activities) {
        const score = matchScore(text, act.title || "");
        if (score > 0) {
          out.push({
            id: act.id,
            type: "activity",
            title: act.title || "—",
            subtitle: [act.schedule, act.priceTTC ? `${act.priceTTC}€` : null].filter(Boolean).join(" · "),
            badge: act.type || "Activité",
            badgeColor: "bg-purple-50 text-purple-600",
            url: `/admin/activites?id=${act.id}`,
            score: score - 5, // les activités sont un peu moins prioritaires
          });
        }
      }
    }

    // Tri par score décroissant + limit
    return out.sort((a, b) => b.score - a.score).slice(0, 40);
  }, [query, data]);

  // Reset de l'index sélectionné quand les résultats changent
  useEffect(() => {
    setSelectedIdx(0);
  }, [query]);

  // ─── Navigation clavier : flèches + Entrée ───
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIdx((i) => Math.min(i + 1, results.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIdx((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter" && results[selectedIdx]) {
        e.preventDefault();
        go(results[selectedIdx]);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, results, selectedIdx]);

  const go = (r: SearchResult) => {
    router.push(r.url);
    setOpen(false);
    setQuery("");
  };

  // ─── Groupement par type pour l'affichage ───
  const grouped = useMemo(() => {
    const groups: Record<string, SearchResult[]> = {};
    for (const r of results) {
      if (!groups[r.type]) groups[r.type] = [];
      groups[r.type].push(r);
    }
    return groups;
  }, [results]);

  const typeLabels: Record<string, { label: string; icon: any }> = {
    child: { label: "Cavaliers", icon: User },
    family: { label: "Familles", icon: Users },
    horse: { label: "Équidés", icon: Heart },
    payment: { label: "Paiements", icon: CreditCard },
    activity: { label: "Activités", icon: Calendar },
  };

  if (!open) return null;

  return (
    <div
      data-global-search-open="true"
      className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm flex items-start justify-center pt-[8vh] px-4"
      onClick={() => setOpen(false)}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[80vh]"
        onClick={(e) => e.stopPropagation()}>
        {/* Barre de recherche */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
          <Search size={18} className="text-slate-400 flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Chercher cavalier, famille, équidé, impayé, stage…"
            className="flex-1 bg-transparent border-none outline-none font-body text-base text-blue-800 placeholder:text-slate-400"
          />
          {loading && <Loader2 size={16} className="animate-spin text-blue-500 flex-shrink-0" />}
          <button
            onClick={() => setOpen(false)}
            className="text-slate-400 hover:text-slate-600 bg-transparent border-none cursor-pointer">
            <X size={18} />
          </button>
        </div>

        {/* Astuce filtres */}
        {!query && (
          <div className="px-5 py-3 bg-blue-50/50 border-b border-blue-500/8">
            <div className="font-body text-[11px] text-slate-600">
              💡 Astuces :{" "}
              <span className="font-mono font-semibold text-blue-800">impayé</span> pour voir les impayés,{" "}
              <span className="font-mono font-semibold text-blue-800">impayé 60</span> pour les impayés ≥60€,{" "}
              <span className="font-mono font-semibold text-blue-800">c:léa</span> pour chercher uniquement dans les cavaliers.
            </div>
          </div>
        )}

        {/* Résultats */}
        <div className="overflow-y-auto flex-1">
          {query && results.length === 0 && !loading && (
            <div className="px-5 py-12 text-center">
              <div className="font-body text-sm text-slate-500">Aucun résultat pour « {query} »</div>
            </div>
          )}

          {Object.entries(grouped).map(([type, items]) => {
            const cfg = typeLabels[type];
            if (!cfg) return null;
            const Icon = cfg.icon;
            return (
              <div key={type}>
                <div className="px-5 pt-3 pb-1.5 font-body text-[10px] font-bold text-slate-400 uppercase tracking-[0.8px] flex items-center gap-2">
                  <Icon size={10} /> {cfg.label} <span className="text-slate-300">({items.length})</span>
                </div>
                {items.map((r) => {
                  const globalIdx = results.indexOf(r);
                  const isSelected = globalIdx === selectedIdx;
                  return (
                    <button
                      key={`${r.type}-${r.id}`}
                      onClick={() => go(r)}
                      onMouseEnter={() => setSelectedIdx(globalIdx)}
                      className={`w-full text-left px-5 py-2.5 border-none cursor-pointer flex items-center gap-3 transition-colors ${
                        isSelected ? "bg-blue-50" : "bg-transparent hover:bg-gray-50"
                      }`}>
                      <div className="flex-1 min-w-0">
                        <div className="font-body text-sm font-semibold text-blue-800 truncate">{r.title}</div>
                        {r.subtitle && (
                          <div className="font-body text-[11px] text-slate-500 truncate">{r.subtitle}</div>
                        )}
                      </div>
                      {r.badge && (
                        <span className={`font-body text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${r.badgeColor}`}>
                          {r.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* Footer : indicateurs clavier */}
        <div className="px-5 py-2.5 border-t border-gray-100 flex items-center justify-between font-body text-[11px] text-slate-400">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded bg-gray-100 font-mono text-[10px]">↑↓</kbd> naviguer
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded bg-gray-100 font-mono text-[10px]">↵</kbd> ouvrir
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded bg-gray-100 font-mono text-[10px]">esc</kbd> fermer
            </span>
          </div>
          {results.length > 0 && (
            <span>{results.length} résultat{results.length > 1 ? "s" : ""}</span>
          )}
        </div>
      </div>
    </div>
  );
}
