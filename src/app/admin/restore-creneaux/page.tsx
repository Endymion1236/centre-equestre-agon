"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/lib/auth-context";
import { Loader2, RotateCcw, AlertTriangle, CheckCircle2 } from "lucide-react";

/**
 * Restauration de créneaux supprimés par erreur, depuis une sauvegarde.
 * Tout se passe côté serveur : rien à télécharger, utilisable au téléphone.
 */
export default function RestoreCreneauxPage() {
  const { isAdmin, user } = useAuth();
  const [sauvegardes, setSauvegardes] = useState<string[]>([]);
  const [date, setDate] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [titre, setTitre] = useState("");
  const [apercu, setApercu] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [resultat, setResultat] = useState<any>(null);

  const appel = useCallback(async (url: string, init?: RequestInit) => {
    const token = await user!.getIdToken(true);
    const res = await fetch(url, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init?.headers || {}) },
    });
    return res.json();
  }, [user]);

  useEffect(() => {
    if (!isAdmin || !user) return;
    appel("/api/admin/restore-creneaux").then(d => {
      setSauvegardes(d.sauvegardes || []);
      if (d.sauvegardes?.[0]) setDate(d.sauvegardes[0]);
    });
  }, [isAdmin, user, appel]);

  const previsualiser = async () => {
    if (!date || !from || !to) return;
    setBusy(true); setResultat(null);
    setApercu(await appel(
      `/api/admin/restore-creneaux?date=${date}&from=${from}&to=${to}&titre=${encodeURIComponent(titre)}`
    ));
    setBusy(false);
  };

  const restaurer = async () => {
    if (!apercu?.nb) return;
    if (!confirm(`Restaurer ${apercu.nb} créneau(x) ?\n\nSeuls les créneaux absents seront recréés.`)) return;
    setBusy(true);
    setResultat(await appel("/api/admin/restore-creneaux", {
      method: "POST",
      body: JSON.stringify({ date, from, to, titre, confirm: "RESTAURER" }),
    }));
    setApercu(null);
    setBusy(false);
  };

  if (!isAdmin) return <div className="p-6 font-body text-slate-600">Accès réservé aux administrateurs.</div>;

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto">
      <h1 className="font-display text-2xl font-bold text-slate-800">Restaurer des créneaux</h1>
      <p className="font-body text-sm text-slate-600 mt-1">
        Récupère des créneaux supprimés par erreur depuis une sauvegarde. Seuls les
        créneaux <strong>absents</strong> sont recréés — la comparaison porte sur la
        date, l&apos;intitulé et l&apos;horaire, donc un créneau que vous avez déjà
        recréé à la main ne sera pas proposé en double.
      </p>

      <div className="mt-5 rounded-xl border border-slate-200 bg-white p-4 space-y-3">
        <div>
          <label className="font-body text-xs font-semibold text-slate-600">Sauvegarde</label>
          <select value={date} onChange={e => { setDate(e.target.value); setApercu(null); }}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-body text-sm">
            {sauvegardes.length === 0 && <option value="">Aucune sauvegarde trouvée</option>}
            {sauvegardes.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          <p className="mt-1 font-body text-[11px] text-slate-400">
            Choisissez une sauvegarde antérieure à la suppression.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="font-body text-xs font-semibold text-slate-600">Du</label>
            <input type="date" value={from} onChange={e => { setFrom(e.target.value); setApercu(null); }}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-body text-sm" />
          </div>
          <div>
            <label className="font-body text-xs font-semibold text-slate-600">Au</label>
            <input type="date" value={to} onChange={e => { setTo(e.target.value); setApercu(null); }}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-body text-sm" />
          </div>
        </div>

        <div>
          <label className="font-body text-xs font-semibold text-slate-600">
            Filtrer par intitulé (recommandé)
          </label>
          <input value={titre} onChange={e => { setTitre(e.target.value); setApercu(null); }}
            placeholder="ex. galop d'argent"
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-body text-sm" />
          <p className="mt-1 font-body text-[11px] text-slate-400">
            Laissez vide pour tout voir. Cibler un stage évite de restaurer par erreur
            des créneaux qui n'ont jamais disparu.
          </p>
        </div>

        <button onClick={previsualiser} disabled={busy || !date || !from || !to}
          className="inline-flex items-center gap-2 rounded-xl bg-slate-800 px-4 py-2.5 font-body text-sm font-semibold text-white border-none cursor-pointer disabled:opacity-50">
          {busy ? <Loader2 size={15} className="animate-spin" /> : <RotateCcw size={15} />}
          Voir ce qui manque
        </button>
      </div>

      {apercu?.error && (
        <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 font-body text-sm text-rose-800">
          {apercu.error}
        </div>
      )}

      {apercu && !apercu.error && (
        apercu.nb === 0 ? (
          <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 font-body text-sm text-emerald-800 flex items-center gap-2">
            <CheckCircle2 size={16} /> Aucun créneau manquant sur cette période.
          </div>
        ) : (
          <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4">
            <div className="font-body text-sm font-bold text-amber-900 flex items-center gap-2">
              <AlertTriangle size={16} /> {apercu.nb} créneau(x) manquant(s)
            </div>
            <div className="mt-2 max-h-72 overflow-y-auto space-y-1">
              {apercu.creneaux.map((c: any) => (
                <div key={c.id} className="rounded-md bg-white border border-amber-200 px-2.5 py-1.5 font-body text-xs text-slate-700">
                  <span className="font-semibold">{c.activityTitle}</span> · {c.date} · {c.startTime}–{c.endTime}
                  {c.monitor && <span className="text-slate-400"> · {c.monitor}</span>}
                  {c.nbInscrits > 0 && <span className="ml-1 font-semibold text-amber-700">· {c.nbInscrits} inscrit(s)</span>}
                </div>
              ))}
            </div>
            <button onClick={restaurer} disabled={busy}
              className="mt-3 inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 font-body text-sm font-bold text-white border-none cursor-pointer disabled:opacity-50">
              {busy ? <Loader2 size={15} className="animate-spin" /> : <RotateCcw size={15} />}
              Restaurer ces {apercu.nb} créneau(x)
            </button>
          </div>
        )
      )}

      {resultat && (
        <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 font-body text-sm text-emerald-800">
          {resultat.error || `${resultat.restaures}/${resultat.total} créneau(x) restauré(s).`}
          {resultat.echecs?.length > 0 && (
            <div className="mt-3 space-y-1.5">
              <div className="font-semibold text-slate-700">
                Pourquoi les autres n&apos;ont pas été restaurés :
              </div>
              {resultat.echecs.map((e: any) => (
                <div key={e.id} className="rounded-md bg-white border border-slate-200 px-2.5 py-1.5 text-xs text-slate-700">
                  <div className="font-semibold">{e.sauvegarde.activityTitle} · {e.sauvegarde.date}</div>
                  <div className="text-slate-500">{e.raison}</div>
                  {e.actuel && (
                    <div className="mt-0.5 text-slate-500">
                      Aujourd&apos;hui : {e.actuel.activityTitle} · {e.actuel.date} · {e.actuel.startTime}
                      {e.actuel.status && ` · ${e.actuel.status}`}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
