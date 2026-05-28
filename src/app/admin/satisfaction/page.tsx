"use client";

// ─────────────────────────────────────────────────────────────────────────
//  Page admin : Satisfaction
// ─────────────────────────────────────────────────────────────────────────
// Affiche tous les avis de satisfaction laisses par les familles depuis
// l'espace cavalier (collection 'avis-satisfaction'). Note moyenne globale,
// moyenne par aspect, filtres par activite et par note, liste detaillee.

import { useEffect, useState, useMemo } from "react";
import { collection, getDocs, query, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { Star, MessageSquare, TrendingUp, Filter } from "lucide-react";

const ASPECTS = [
  { id: "moniteur", label: "Moniteur / encadrement" },
  { id: "poneys", label: "Poneys & chevaux" },
  { id: "infrastructures", label: "Infrastructures" },
  { id: "ambiance", label: "Ambiance générale" },
];

interface Avis {
  id: string;
  familyName?: string;
  activityTitle?: string;
  globalNote: number;
  aspects?: Record<string, number>;
  commentaire?: string;
  createdAt?: any;
}

function Stars({ n, size = 14 }: { n: number; size?: number }) {
  return (
    <span className="inline-flex">
      {[1, 2, 3, 4, 5].map(i => (
        <Star
          key={i}
          size={size}
          className={i <= n ? "fill-amber-400 text-amber-400" : "fill-none text-slate-300"}
        />
      ))}
    </span>
  );
}

export default function SatisfactionPage() {
  const { isAdmin } = useAuth();
  const [avis, setAvis] = useState<Avis[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterActivite, setFilterActivite] = useState<string>("");
  const [filterNote, setFilterNote] = useState<number>(0);

  useEffect(() => {
    if (!isAdmin) return;
    (async () => {
      try {
        let snap;
        try {
          snap = await getDocs(query(collection(db, "avis-satisfaction"), orderBy("createdAt", "desc")));
        } catch {
          // Fallback sans orderBy si index manquant
          snap = await getDocs(collection(db, "avis-satisfaction"));
        }
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as Avis));
        list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        setAvis(list);
      } catch (e) {
        console.error("Chargement avis:", e);
      } finally {
        setLoading(false);
      }
    })();
  }, [isAdmin]);

  // Liste des activites distinctes pour le filtre
  const activites = useMemo(() => {
    const set = new Set<string>();
    avis.forEach(a => a.activityTitle && set.add(a.activityTitle));
    return Array.from(set).sort();
  }, [avis]);

  // Avis filtres
  const filtered = useMemo(() => {
    return avis.filter(a =>
      (!filterActivite || a.activityTitle === filterActivite) &&
      (!filterNote || a.globalNote === filterNote)
    );
  }, [avis, filterActivite, filterNote]);

  // Stats sur les avis filtres
  const stats = useMemo(() => {
    if (filtered.length === 0) return null;
    const moyenne = filtered.reduce((s, a) => s + (a.globalNote || 0), 0) / filtered.length;
    const parAspect: Record<string, { sum: number; count: number }> = {};
    filtered.forEach(a => {
      if (a.aspects) {
        for (const [k, v] of Object.entries(a.aspects)) {
          if (!parAspect[k]) parAspect[k] = { sum: 0, count: 0 };
          parAspect[k].sum += Number(v) || 0;
          parAspect[k].count += 1;
        }
      }
    });
    // Distribution des notes 1-5
    const distrib = [1, 2, 3, 4, 5].map(n => ({
      note: n,
      count: filtered.filter(a => a.globalNote === n).length,
    }));
    return { moyenne, parAspect, distrib, total: filtered.length };
  }, [filtered]);

  if (!isAdmin) {
    return (
      <div className="p-8">
        <h1 className="font-display text-2xl">Accès refusé</h1>
        <p className="font-body text-slate-600 mt-2">Cette page est réservée aux administrateurs.</p>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 mb-1 flex items-center gap-2">
          <MessageSquare className="text-amber-500" /> Satisfaction
        </h1>
        <p className="font-body text-sm text-slate-600">
          Avis laissés par les familles depuis leur espace cavalier.
        </p>
      </div>

      {loading ? (
        <div className="text-center py-12">
          <div className="inline-block w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : avis.length === 0 ? (
        <div className="text-center py-12 font-body text-slate-500">
          Aucun avis pour le moment.
        </div>
      ) : (
        <>
          {/* Stats globales */}
          {stats && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-center">
                <div className="font-body text-xs text-amber-700 uppercase tracking-wider mb-1">Note moyenne</div>
                <div className="font-display text-3xl font-bold text-amber-600">{stats.moyenne.toFixed(1)}<span className="text-lg text-amber-400">/5</span></div>
                <div className="mt-1"><Stars n={Math.round(stats.moyenne)} size={16} /></div>
              </div>
              <div className="bg-white border border-slate-200 rounded-2xl p-4 text-center">
                <div className="font-body text-xs text-slate-500 uppercase tracking-wider mb-1">Nombre d'avis</div>
                <div className="font-display text-3xl font-bold text-slate-800">{stats.total}</div>
              </div>
              <div className="bg-white border border-slate-200 rounded-2xl p-4">
                <div className="font-body text-xs text-slate-500 uppercase tracking-wider mb-2">Répartition</div>
                {stats.distrib.slice().reverse().map(d => (
                  <div key={d.note} className="flex items-center gap-2 mb-0.5">
                    <span className="font-body text-[10px] text-slate-400 w-3">{d.note}</span>
                    <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-amber-400 rounded-full" style={{ width: stats.total ? `${(d.count / stats.total) * 100}%` : "0%" }} />
                    </div>
                    <span className="font-body text-[10px] text-slate-400 w-4 text-right">{d.count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Moyennes par aspect */}
          {stats && Object.keys(stats.parAspect).length > 0 && (
            <div className="bg-white border border-slate-200 rounded-2xl p-4 mb-6">
              <div className="font-body text-xs text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-1">
                <TrendingUp size={12} /> Détail par aspect
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {ASPECTS.map(asp => {
                  const data = stats.parAspect[asp.id];
                  if (!data) return null;
                  const moy = data.sum / data.count;
                  return (
                    <div key={asp.id} className="flex items-center justify-between gap-2">
                      <span className="font-body text-sm text-slate-700">{asp.label}</span>
                      <span className="flex items-center gap-2">
                        <Stars n={Math.round(moy)} />
                        <span className="font-body text-xs font-semibold text-slate-500">{moy.toFixed(1)}</span>
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Filtres */}
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <Filter size={14} className="text-slate-400" />
            <select
              value={filterActivite}
              onChange={e => setFilterActivite(e.target.value)}
              className="px-3 py-2 rounded-xl border border-slate-200 font-body text-sm bg-white"
            >
              <option value="">Toutes les activités</option>
              {activites.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
            <select
              value={filterNote}
              onChange={e => setFilterNote(Number(e.target.value))}
              className="px-3 py-2 rounded-xl border border-slate-200 font-body text-sm bg-white"
            >
              <option value={0}>Toutes les notes</option>
              {[5, 4, 3, 2, 1].map(n => <option key={n} value={n}>{n} étoile{n > 1 ? "s" : ""}</option>)}
            </select>
            {(filterActivite || filterNote > 0) && (
              <button
                onClick={() => { setFilterActivite(""); setFilterNote(0); }}
                className="font-body text-xs text-blue-500 bg-transparent border-none cursor-pointer hover:underline"
              >
                Réinitialiser
              </button>
            )}
          </div>

          {/* Liste des avis */}
          <div className="space-y-3">
            {filtered.map(a => {
              const date = a.createdAt?.seconds ? new Date(a.createdAt.seconds * 1000) : null;
              return (
                <div key={a.id} className="bg-white border border-slate-200 rounded-2xl p-4">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div>
                      <div className="font-body font-semibold text-slate-900">{a.familyName || "Famille"}</div>
                      <div className="font-body text-xs text-slate-400">
                        {a.activityTitle || "Général"}
                        {date && ` · ${date.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}`}
                      </div>
                    </div>
                    <Stars n={a.globalNote} size={16} />
                  </div>
                  {a.commentaire && (
                    <p className="font-body text-sm text-slate-700 italic bg-slate-50 rounded-lg p-3 mt-2">
                      « {a.commentaire} »
                    </p>
                  )}
                  {a.aspects && Object.keys(a.aspects).length > 0 && (
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
                      {ASPECTS.map(asp => {
                        const v = a.aspects?.[asp.id];
                        if (!v) return null;
                        return (
                          <span key={asp.id} className="font-body text-[11px] text-slate-500">
                            {asp.label} : <span className="text-amber-500">{"★".repeat(v)}</span>
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
            {filtered.length === 0 && (
              <div className="text-center py-8 font-body text-slate-400">
                Aucun avis ne correspond aux filtres.
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
