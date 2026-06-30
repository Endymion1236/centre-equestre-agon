"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/lib/auth-context";
import { Users, Phone, Mail, Baby, Type, Loader2, X, RefreshCw } from "lucide-react";

interface FamInfo {
  id: string; parentName: string; parentEmail: string; parentPhone: string;
  children: { name: string; birthDate: string }[]; createdAt: any;
}
interface Paire { score: number; motifs: string[]; a: FamInfo; b: FamInfo; }

const MOTIF: Record<string, { label: string; icon: any; cls: string }> = {
  phone: { label: "Même téléphone", icon: Phone, cls: "bg-emerald-100 text-emerald-700" },
  enfant: { label: "Enfant commun", icon: Baby, cls: "bg-emerald-100 text-emerald-700" },
  nom: { label: "Même nom", icon: Type, cls: "bg-amber-100 text-amber-700" },
};

function FamCard({ f }: { f: FamInfo }) {
  return (
    <div className="flex-1 min-w-0">
      <div className="font-body font-semibold text-slate-800 truncate">{f.parentName || "— sans nom —"}</div>
      <div className="font-body text-xs text-slate-500 flex flex-col gap-0.5 mt-1">
        {f.parentEmail && <span className="inline-flex items-center gap-1 truncate"><Mail size={11} className="shrink-0" />{f.parentEmail}</span>}
        {f.parentPhone && <span className="inline-flex items-center gap-1"><Phone size={11} />{f.parentPhone}</span>}
        {f.children.length > 0 && (
          <span className="inline-flex items-start gap-1"><Baby size={11} className="mt-0.5 shrink-0" />
            <span>{f.children.map(c => `${c.name}${c.birthDate ? ` (${c.birthDate})` : ""}`).join(", ")}</span>
          </span>
        )}
      </div>
    </div>
  );
}

export default function DoublonsPage() {
  const { isAdmin, user } = useAuth();
  const [paires, setPaires] = useState<Paire[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [mergePair, setMergePair] = useState<Paire | null>(null);
  const [keepId, setKeepId] = useState("");
  const [preview, setPreview] = useState<any>(null);
  const [merging, setMerging] = useState(false);
  const [mergeErr, setMergeErr] = useState("");

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true); setError("");
    try {
      const token = await user.getIdToken(true);
      const res = await fetch("/api/admin/doublons", { headers: { Authorization: `Bearer ${token}` } });
      const d = await res.json();
      if (!res.ok) throw new Error(d?.error || "Erreur");
      setPaires(d.paires || []); setTotal(d.total || 0);
    } catch (e: any) { setError(e?.message || String(e)); } finally { setLoading(false); }
  }, [user]);

  useEffect(() => { if (isAdmin && user) load(); }, [isAdmin, user, load]);

  const openMerge = (p: Paire) => { setMergePair(p); setKeepId(p.a.id); setPreview(null); setMergeErr(""); };
  const mergeId = mergePair ? (keepId === mergePair.a.id ? mergePair.b.id : mergePair.a.id) : "";

  const callMerge = async (dryRun: boolean) => {
    if (!user || !mergePair) return;
    setMerging(true); setMergeErr("");
    try {
      const token = await user.getIdToken(true);
      const res = await fetch("/api/admin/doublons-merge", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ keepId, mergeId, dryRun, confirm: !dryRun }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d?.error || "Erreur");
      if (dryRun) { setPreview(d.apercu); }
      else {
        const pid = [mergePair.a.id, mergePair.b.id].sort().join("__");
        setPaires(prev => prev.filter(p => [p.a.id, p.b.id].sort().join("__") !== pid));
        setMergePair(null); setPreview(null);
        load();
      }
    } catch (e: any) { setMergeErr(e?.message || String(e)); } finally { setMerging(false); }
  };

  const ignorer = async (a: string, b: string) => {
    if (!user) return;
    const pairId = [a, b].sort().join("__");
    setPaires(prev => prev.filter(p => [p.a.id, p.b.id].sort().join("__") !== pairId));
    try {
      const token = await user.getIdToken(true);
      await fetch("/api/admin/doublons-ignore", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ pairId }) });
    } catch { /* la liste est déjà filtrée localement */ }
  };

  if (!isAdmin) return <div className="p-8"><h1 className="font-display text-2xl">Accès refusé</h1></div>;

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto">
      <div className="flex items-start justify-between gap-3 mb-5">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 mb-1 flex items-center gap-2">
            <Users className="text-amber-500" /> Doublons potentiels
          </h1>
          <p className="font-body text-sm text-slate-600">
            Comptes susceptibles d'être la même famille (souvent après inscription en ligne avec une autre adresse). Vérifie, puis ignore les faux positifs.
          </p>
        </div>
        <button onClick={load} disabled={loading} className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white font-body text-xs font-semibold text-slate-600 disabled:opacity-50">
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Rescanner
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12"><Loader2 className="animate-spin text-slate-400 inline" size={28} /></div>
      ) : error ? (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 font-body text-sm text-rose-700">{error}</div>
      ) : paires.length === 0 ? (
        <div className="text-center py-10 font-body text-slate-400">Aucun doublon potentiel détecté 🎉<div className="text-xs mt-1">{total} familles analysées</div></div>
      ) : (
        <div className="space-y-3">
          <div className="font-body text-xs text-slate-400">{paires.length} paire{paires.length > 1 ? "s" : ""} à vérifier · {total} familles analysées</div>
          {paires.map((p, i) => (
            <div key={i} className="bg-white border border-slate-200 rounded-2xl p-4">
              <div className="flex flex-wrap gap-1.5 mb-3">
                {p.motifs.map(m => { const o = MOTIF[m]; const I = o?.icon; return o ? (
                  <span key={m} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${o.cls}`}><I size={11} />{o.label}</span>
                ) : null; })}
              </div>
              <div className="flex items-stretch gap-3">
                <FamCard f={p.a} />
                <div className="w-px bg-slate-200" />
                <FamCard f={p.b} />
              </div>
              <div className="flex items-center justify-end gap-2 mt-3 pt-3 border-t border-slate-100">
                <button onClick={() => ignorer(p.a.id, p.b.id)} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 bg-white font-body text-xs font-semibold text-slate-500 hover:bg-slate-50">
                  <X size={12} /> Pas un doublon
                </button>
                <button onClick={() => openMerge(p)} className="px-3 py-1.5 rounded-lg bg-blue-600 text-white font-body text-xs font-semibold hover:bg-blue-500">
                  Fusionner…
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modale de fusion */}
      {mergePair && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => !merging && setMergePair(null)}>
          <div className="bg-white rounded-2xl max-w-lg w-full p-5 max-h-[90vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-display text-lg font-bold text-slate-900">Fusionner les comptes</h2>
              <button onClick={() => setMergePair(null)} disabled={merging} className="text-slate-400"><X size={18} /></button>
            </div>
            <p className="font-body text-xs text-slate-500 mb-3">
              Choisis le <strong>compte à conserver</strong>. Les enfants, forfaits, avoirs, fidélité, devis, réservations et l'historique de paiement de l'autre compte y seront rattachés. Les encaissements (immuables) ne sont pas modifiés. Le compte absorbé est masqué (réversible).
            </p>
            <div className="space-y-2 mb-3">
              {[mergePair.a, mergePair.b].map(f => (
                <label key={f.id} className={`flex items-start gap-2 p-3 rounded-xl border cursor-pointer ${keepId === f.id ? "border-blue-400 bg-blue-50/50" : "border-slate-200"}`}>
                  <input type="radio" name="keep" checked={keepId === f.id} onChange={() => { setKeepId(f.id); setPreview(null); }} className="mt-1" />
                  <div className="min-w-0">
                    <div className="font-body text-sm font-semibold text-slate-800">{f.parentName || "—"} <span className="text-[10px] font-normal text-blue-600">{keepId === f.id ? "· conservé" : "· absorbé"}</span></div>
                    <div className="font-body text-xs text-slate-500 truncate">{f.parentEmail}{f.parentPhone ? ` · ${f.parentPhone}` : ""}</div>
                    {f.children.length > 0 && <div className="font-body text-[11px] text-slate-400 truncate">{f.children.map(c => c.name).join(", ")}</div>}
                  </div>
                </label>
              ))}
            </div>

            {preview && (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 mb-3 font-body text-xs text-slate-600">
                <div className="font-semibold text-slate-700 mb-1">Ce qui sera déplacé vers « {preview.keep.name} » :</div>
                <div className="flex flex-wrap gap-x-4 gap-y-0.5">
                  <span>{preview.enfantsAjoutes} enfant(s)</span>
                  {Object.entries(preview.reassign).map(([k, v]: any) => v > 0 && <span key={k}>{v} {k}</span>)}
                  {preview.creneauxTouches > 0 && <span>{preview.creneauxTouches} créneau(x)</span>}
                </div>
              </div>
            )}
            {mergeErr && <div className="bg-rose-50 border border-rose-200 rounded-lg p-2 font-body text-xs text-rose-700 mb-3">{mergeErr}</div>}

            <div className="flex items-center justify-end gap-2">
              <button onClick={() => callMerge(true)} disabled={merging} className="px-3 py-2 rounded-lg border border-slate-300 bg-white font-body text-xs font-semibold text-slate-700 disabled:opacity-50">
                {merging && !preview ? <Loader2 size={13} className="animate-spin inline" /> : "Prévisualiser"}
              </button>
              <button onClick={() => callMerge(false)} disabled={merging || !preview} title={!preview ? "Prévisualise d'abord" : ""} className="px-3 py-2 rounded-lg bg-blue-600 text-white font-body text-xs font-semibold disabled:opacity-40">
                {merging && preview ? <Loader2 size={13} className="animate-spin inline" /> : "Fusionner définitivement"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
