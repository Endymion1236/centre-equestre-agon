"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useAuth } from "@/lib/auth-context";
import { UserMinus, Mail, Phone, Award, Wallet, Star, AlertTriangle, Clock, Loader2 } from "lucide-react";

interface Cavalier {
  childId: string; childName: string; familyId: string; familyName: string;
  statut: string; email: string; phone: string; moniteurs: string[];
  galop: string; anciennete: number; avoirEur: number; fidelite: number;
}
interface Data {
  saison: number; prochaine: number; rentree: string; today: string; apresRentree: boolean;
  totalN: number; reinscrits: number; nonReinscritsCount: number; partisCount: number;
  retentionPct: number | null; nonReinscrits: Cavalier[]; partis: Cavalier[];
}

const STATUT_BADGE: Record<string, { label: string; cls: string; icon: any }> = {
  pas_encore: { label: "Pas encore réinscrit", cls: "bg-slate-100 text-slate-600", icon: Clock },
  a_risque: { label: "À risque", cls: "bg-rose-100 text-rose-700", icon: AlertTriangle },
  parti: { label: "Parti en cours", cls: "bg-amber-100 text-amber-700", icon: UserMinus },
};

function CavalierRow({ c }: { c: Cavalier }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
      <div className="min-w-[160px]">
        <div className="font-body font-semibold text-slate-800">{c.childName || "—"}</div>
        <div className="font-body text-xs text-slate-400">{c.familyName}</div>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-body text-xs text-slate-600">
        {c.galop && <span className="inline-flex items-center gap-1"><Award size={12} className="text-slate-400" />{c.galop}</span>}
        <span>{c.anciennete} saison{c.anciennete > 1 ? "s" : ""}</span>
        {c.avoirEur > 0 && <span className="inline-flex items-center gap-1 text-emerald-700"><Wallet size={12} />{c.avoirEur.toFixed(2)} €</span>}
        {c.fidelite > 0 && <span className="inline-flex items-center gap-1 text-amber-600"><Star size={12} />{c.fidelite} pts</span>}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 ml-auto font-body text-xs">
        {c.email && <a href={`mailto:${c.email}`} className="inline-flex items-center gap-1 text-blue-600 hover:underline"><Mail size={12} />{c.email}</a>}
        {c.phone && <a href={`tel:${c.phone}`} className="inline-flex items-center gap-1 text-slate-500"><Phone size={12} />{c.phone}</a>}
      </div>
    </div>
  );
}

export default function ReinscriptionsPage() {
  const { isAdmin, user } = useAuth();
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saison, setSaison] = useState<number | "">("");

  const load = useCallback(async (s?: number) => {
    if (!user) return;
    setLoading(true); setError("");
    try {
      const token = await user.getIdToken(true);
      const q = s ? `?saison=${s}` : "";
      const res = await fetch(`/api/admin/reinscriptions${q}`, { headers: { Authorization: `Bearer ${token}` } });
      const d = await res.json();
      if (!res.ok) throw new Error(d?.error || "Erreur");
      setData(d);
      if (saison === "") setSaison(d.saison);
    } catch (e: any) { setError(e?.message || String(e)); } finally { setLoading(false); }
  }, [user, saison]);

  useEffect(() => { if (isAdmin && user) load(); /* eslint-disable-next-line */ }, [isAdmin, user]);

  // Non-réinscrits groupés par moniteur
  const parMoniteur = useMemo(() => {
    const groups = new Map<string, Cavalier[]>();
    (data?.nonReinscrits || []).forEach(c => {
      const key = c.moniteurs[0] || "Sans moniteur identifié";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(c);
    });
    return Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [data]);

  if (!isAdmin) {
    return <div className="p-8"><h1 className="font-display text-2xl">Accès refusé</h1></div>;
  }

  const annees = [];
  const yNow = new Date().getFullYear();
  for (let y = yNow + 1; y >= yNow - 4; y--) annees.push(y);

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto">
      <div className="mb-5">
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 mb-1 flex items-center gap-2">
          <UserMinus className="text-rose-500" /> Réinscriptions
        </h1>
        <p className="font-body text-sm text-slate-600">
          Cavaliers d'une saison qui n'ont pas (encore) repris la saison suivante.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-5">
        <label className="font-body text-sm text-slate-600">Saison de référence :</label>
        <select value={saison} onChange={e => { const s = Number(e.target.value); setSaison(s); load(s); }}
          className="px-3 py-2 rounded-xl border border-slate-200 font-body text-sm bg-white">
          {annees.map(y => <option key={y} value={y}>{y}–{y + 1}</option>)}
        </select>
        {data && <span className="font-body text-xs text-slate-400">→ comparée à {data.prochaine}–{data.prochaine + 1} (rentrée {new Date(data.rentree).toLocaleDateString("fr-FR")})</span>}
      </div>

      {loading ? (
        <div className="text-center py-12"><Loader2 className="animate-spin text-slate-400 inline" size={28} /></div>
      ) : error ? (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 font-body text-sm text-rose-700">{error}</div>
      ) : data && (
        <>
          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 text-center">
              <div className="font-body text-xs text-emerald-700 uppercase tracking-wider mb-1">Rétention</div>
              <div className="font-display text-3xl font-bold text-emerald-600">{data.retentionPct ?? "—"}<span className="text-lg">%</span></div>
              <div className="font-body text-[11px] text-emerald-700/70 mt-1">{data.reinscrits}/{data.totalN} réinscrits</div>
            </div>
            <div className="bg-white border border-slate-200 rounded-2xl p-4 text-center">
              <div className="font-body text-xs text-slate-500 uppercase tracking-wider mb-1">Non réinscrits</div>
              <div className="font-display text-3xl font-bold text-slate-800">{data.nonReinscritsCount}</div>
            </div>
            <div className="bg-white border border-slate-200 rounded-2xl p-4 text-center">
              <div className="font-body text-xs text-slate-500 uppercase tracking-wider mb-1">Partis en cours</div>
              <div className="font-display text-3xl font-bold text-amber-600">{data.partisCount}</div>
            </div>
            <div className="bg-white border border-slate-200 rounded-2xl p-4 text-center">
              <div className="font-body text-xs text-slate-500 uppercase tracking-wider mb-1">Effectif {data.saison}</div>
              <div className="font-display text-3xl font-bold text-slate-800">{data.totalN}</div>
            </div>
          </div>

          {!data.apresRentree && (
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 mb-5 font-body text-xs text-blue-800">
              La rentrée {data.prochaine} n'a pas encore eu lieu ({new Date(data.rentree).toLocaleDateString("fr-FR")}) : les non-réinscrits sont marqués « pas encore » — c'est normal à ce stade. Ils passeront « à risque » après la rentrée.
            </div>
          )}

          {/* Non réinscrits par moniteur */}
          {parMoniteur.length === 0 ? (
            <div className="text-center py-8 font-body text-slate-400">Aucun non-réinscrit 🎉</div>
          ) : (
            <div className="space-y-5 mb-8">
              {parMoniteur.map(([mon, list]) => (
                <div key={mon}>
                  <div className="flex items-center gap-2 mb-2">
                    <h2 className="font-display text-lg font-bold text-slate-800">{mon}</h2>
                    <span className="font-body text-xs text-slate-400">{list.length} cavalier{list.length > 1 ? "s" : ""}</span>
                  </div>
                  <div className="space-y-2">
                    {list.map(c => (
                      <div key={c.childId} className="relative">
                        <div className="absolute -left-2 top-3">
                          {(() => { const b = STATUT_BADGE[c.statut]; const I = b?.icon; return I ? <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${b.cls}`}><I size={10} />{b.label}</span> : null; })()}
                        </div>
                        <div className="pt-5"><CavalierRow c={c} /></div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Partis en cours de saison */}
          {data.partis.length > 0 && (
            <div>
              <h2 className="font-display text-lg font-bold text-amber-700 mb-2 flex items-center gap-2"><UserMinus size={18} /> Partis en cours de saison {data.saison}</h2>
              <p className="font-body text-xs text-slate-500 mb-2">Forfait annulé avant la fin de la saison — signal différent d'une simple non-réinscription.</p>
              <div className="space-y-2">{data.partis.map(c => <CavalierRow key={c.childId} c={c} />)}</div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
