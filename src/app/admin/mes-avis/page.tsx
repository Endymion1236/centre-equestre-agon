"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { Star, Loader2, MessageCircle } from "lucide-react";

interface Avis {
  id: string;
  childFirstName: string;
  stageLabel: string;
  globalNote: number | null;
  maNote: number | null;
  commentaire: string;
  motAdmin: string;
  createdAt: string | null;
}

function Etoiles({ n, size = 15 }: { n: number; size?: number }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <Star key={i} size={size}
          className={i <= n ? "fill-amber-400 text-amber-400" : "text-slate-300"} />
      ))}
    </span>
  );
}

export default function MesAvisPage() {
  const { user } = useAuth();
  const [data, setData] = useState<{
    moniteur: string | null; moyenne: number | null; nbNotes: number; avis: Avis[]; vueAdmin?: boolean;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const token = await user.getIdToken(true);
        const res = await fetch("/api/moniteur/mes-avis", {
          headers: { Authorization: `Bearer ${token}` },
        });
        setData(await res.json());
      } catch { /* rien */ }
      setLoading(false);
    })();
  }, [user]);

  if (loading) {
    return (
      <div className="p-6 flex items-center gap-2 font-body text-slate-500">
        <Loader2 size={16} className="animate-spin" /> Chargement…
      </div>
    );
  }

  const avis = data?.avis || [];

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto">
      <h1 className="font-display text-2xl font-bold text-slate-800">Mes avis</h1>
      <p className="font-body text-sm text-slate-600 mt-1">
        Les retours des familles sur les séances que tu as encadrées, partagés par Nicolas.
      </p>

      {data?.vueAdmin && (
        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 font-body text-sm text-slate-600">
          Vue administrateur : tous les avis partagés sont listés ici. Une monitrice
          ne verra que ceux qui la citent.
        </div>
      )}

      {data?.moyenne != null && (
        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 flex flex-wrap items-center gap-3">
          <Etoiles n={Math.round(data.moyenne)} size={18} />
          <span className="font-display text-xl font-bold text-amber-900">{data.moyenne}/5</span>
          <span className="font-body text-sm text-amber-800">
            sur {data.nbNotes} avis
          </span>
        </div>
      )}

      {avis.length === 0 ? (
        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6 text-center">
          <MessageCircle size={28} className="mx-auto text-slate-300" />
          <p className="font-body text-sm text-slate-500 mt-2">
            Aucun avis partagé pour le moment.
          </p>
        </div>
      ) : (
        <div className="mt-5 space-y-3">
          {avis.map(a => (
            <div key={a.id} className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-body font-semibold text-slate-800">
                  {a.childFirstName || "Un cavalier"}
                </span>
                <span className="font-body text-xs text-slate-400">{a.stageLabel}</span>
                {a.maNote != null && (
                  <span className="ml-auto inline-flex items-center gap-1.5">
                    <Etoiles n={a.maNote} />
                    <span className="font-body text-xs text-slate-500">pour toi</span>
                  </span>
                )}
              </div>

              {a.commentaire && (
                <p className="mt-2 font-body text-sm text-slate-700 italic">
                  « {a.commentaire} »
                </p>
              )}

              {a.motAdmin && (
                <div className="mt-3 rounded-lg bg-blue-50 border border-blue-200 px-3 py-2">
                  <div className="font-body text-[11px] font-semibold text-blue-700 mb-0.5">
                    Mot de Nicolas
                  </div>
                  <p className="font-body text-sm text-blue-900">{a.motAdmin}</p>
                </div>
              )}

              {a.createdAt && (
                <div className="mt-2 font-body text-[11px] text-slate-400">
                  {new Date(a.createdAt).toLocaleDateString("fr-FR", {
                    day: "numeric", month: "long", year: "numeric",
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
