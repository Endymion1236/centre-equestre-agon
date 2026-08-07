"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/lib/auth-context";
import {
  AlertTriangle, CheckCircle2, Loader2, RefreshCw, ChevronLeft, ChevronRight, Users, Clock, User,
} from "lucide-react";

interface Jour {
  id: string;
  date: string;
  jourFr: string;
  startTime: string;
  endTime: string;
  monitor: string;
  maxPlaces: number | null;
  nbInscrits: number;
  allowDayBooking: boolean;
  priceTTC: number | null;
  priceTTCDay: number | null;
  stageGroupId: string | null;
  activityId: string | null;
}
interface Groupe { stageGroupId: string | null; label: string; jours: Jour[]; }
interface Famille {
  cle: string;
  activityTitle: string;
  activityType: string;
  startTime: string;
  endTime: string;
  nbJours: number;
  nbGroupes: number;
  fragmente: boolean;
  aDesJoursSansGroupe: boolean;
  groupes: Groupe[];
}

/** Couleurs par groupe (A, B, C…) pour repérer la coupure d'un coup d'œil. */
const GRP_CLS = [
  "bg-emerald-100 text-emerald-800 border-emerald-300",
  "bg-rose-100 text-rose-800 border-rose-300",
  "bg-amber-100 text-amber-800 border-amber-300",
  "bg-sky-100 text-sky-800 border-sky-300",
  "bg-violet-100 text-violet-800 border-violet-300",
];

/** Lundi de la semaine d'une date, en local (l'input date est en local). */
function lundiDe(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function decalerSemaine(dateStr: string, nbSemaines: number): string {
  const d = new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() + nbSemaines * 7);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function jolieDate(dateStr: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
  const [, m, j] = dateStr.split("-");
  return `${j}/${m}`;
}

export default function DiagStagesPage() {
  const { isAdmin, user } = useAuth();
  const [date, setDate] = useState(() => lundiDe(new Date().toISOString().split("T")[0]));
  const [data, setData] = useState<{
    projectId: string; lundi: string; dimanche: string;
    nb_familles: number; nb_fragmentes: number; familles: Famille[];
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (d: string) => {
    if (!user) return;
    setLoading(true); setError("");
    try {
      const token = await user.getIdToken(true);
      const res = await fetch(`/api/admin/diag-stages-groupes?date=${d}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Erreur");
      setData(json);
    } catch (e: any) {
      setError(e?.message || String(e));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { if (isAdmin && user) load(date); }, [isAdmin, user, date, load]);

  if (!isAdmin) {
    return <div className="p-6 font-body text-slate-600">Accès réservé aux administrateurs.</div>;
  }

  const changerSemaine = (n: number) => setDate(prev => decalerSemaine(prev, n));

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      <h1 className="font-display text-2xl font-bold text-slate-800">Diagnostic des stages</h1>
      <p className="font-body text-sm text-slate-600 mt-1">
        Vérifie que tous les jours d&apos;un même stage sont bien rattachés au même groupe.
        Un stage « fragmenté » est vu comme plusieurs stages distincts par l&apos;application :
        les modales ne proposent qu&apos;une partie des jours et les inscriptions
        « semaine complète » sont incomplètes.
        <br />
        <span className="text-slate-500">Lecture seule — cette page ne modifie rien.</span>
      </p>

      {/* Sélecteur de semaine */}
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <button onClick={() => changerSemaine(-1)}
          className="p-2 rounded-lg border border-slate-300 hover:bg-slate-50" title="Semaine précédente">
          <ChevronLeft size={16} />
        </button>
        <input type="date" value={date} onChange={e => setDate(lundiDe(e.target.value))}
          className="font-body px-3 py-2 rounded-lg border border-slate-300 text-sm" />
        <button onClick={() => changerSemaine(1)}
          className="p-2 rounded-lg border border-slate-300 hover:bg-slate-50" title="Semaine suivante">
          <ChevronRight size={16} />
        </button>
        <button onClick={() => load(date)} disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 hover:bg-slate-50 font-body text-sm disabled:opacity-50">
          {loading ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
          Actualiser
        </button>
        {data && (
          <span className="font-body text-sm text-slate-500 ml-auto">
            {jolieDate(data.lundi)} → {jolieDate(data.dimanche)} · base <code className="text-xs">{data.projectId}</code>
          </span>
        )}
      </div>

      {error && (
        <div className="mt-4 p-3 rounded-lg bg-rose-50 border border-rose-200 font-body text-sm text-rose-700">
          {error}
        </div>
      )}

      {loading && !data && (
        <div className="mt-8 flex items-center gap-2 font-body text-slate-500">
          <Loader2 size={16} className="animate-spin" /> Analyse de la semaine…
        </div>
      )}

      {data && (
        <>
          {/* Bandeau récap */}
          <div className={`mt-5 p-4 rounded-xl border font-body ${
            data.nb_fragmentes > 0
              ? "bg-rose-50 border-rose-200 text-rose-800"
              : "bg-emerald-50 border-emerald-200 text-emerald-800"
          }`}>
            <div className="flex items-start gap-2">
              {data.nb_fragmentes > 0
                ? <AlertTriangle size={18} className="mt-0.5 shrink-0" />
                : <CheckCircle2 size={18} className="mt-0.5 shrink-0" />}
              <div>
                <div className="font-semibold">
                  {data.nb_familles === 0
                    ? "Aucun stage cette semaine"
                    : data.nb_fragmentes > 0
                      ? `${data.nb_fragmentes} stage${data.nb_fragmentes > 1 ? "s" : ""} fragmenté${data.nb_fragmentes > 1 ? "s" : ""} sur ${data.nb_familles}`
                      : `Les ${data.nb_familles} stage${data.nb_familles > 1 ? "s" : ""} de la semaine sont corrects`}
                </div>
                {data.nb_fragmentes > 0 && (
                  <div className="text-sm mt-1">
                    Les jours marqués d&apos;une lettre différente ne se « voient » pas entre eux.
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Liste des stages */}
          <div className="mt-4 space-y-3">
            {data.familles.map(fam => (
              <div key={fam.cle}
                className={`rounded-xl border p-4 ${
                  fam.fragmente ? "border-rose-300 bg-rose-50/40" : "border-slate-200 bg-white"
                }`}>
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="font-display font-bold text-slate-800">{fam.activityTitle}</span>
                  <span className="font-body text-xs text-slate-500 inline-flex items-center gap-1">
                    <Clock size={12} /> {fam.startTime}→{fam.endTime}
                  </span>
                  <span className="font-body text-xs text-slate-400">{fam.activityType}</span>
                  <span className={`ml-auto font-body text-xs font-semibold px-2 py-0.5 rounded-full ${
                    fam.fragmente ? "bg-rose-200 text-rose-800" : "bg-emerald-100 text-emerald-700"
                  }`}>
                    {fam.nbJours} jour{fam.nbJours > 1 ? "s" : ""} ·{" "}
                    {fam.fragmente ? `${fam.nbGroupes} groupes ⚠` : "1 groupe"}
                  </span>
                </div>

                {fam.aDesJoursSansGroupe && (
                  <div className="mt-2 font-body text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
                    Au moins un jour n&apos;a aucun <code>stageGroupId</code> (créneau ancien ou créé à l&apos;unité).
                  </div>
                )}

                <div className="mt-3 space-y-2">
                  {fam.groupes.map((g, gi) => (
                    <div key={g.stageGroupId || `sans-${gi}`}
                      className={`rounded-lg border p-2.5 ${fam.fragmente ? GRP_CLS[gi % GRP_CLS.length] : "bg-slate-50 border-slate-200"}`}>
                      <div className="font-body text-xs font-semibold mb-1.5">
                        {fam.fragmente ? `Groupe ${g.label} · ` : ""}
                        {g.stageGroupId
                          ? <code className="text-[11px] opacity-70">{g.stageGroupId}</code>
                          : <span className="italic">sans identifiant de stage</span>}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {g.jours.map(j => (
                          <div key={j.id}
                            className="rounded-md bg-white/70 border border-current/20 px-2 py-1 font-body text-xs">
                            <div className="font-semibold capitalize">
                              {j.jourFr} {jolieDate(j.date)}
                            </div>
                            <div className="opacity-75 flex flex-col gap-0.5 mt-0.5">
                              <span className="inline-flex items-center gap-1">
                                <Clock size={10} />{j.startTime}→{j.endTime}
                              </span>
                              <span className="inline-flex items-center gap-1">
                                <User size={10} />{j.monitor}
                              </span>
                              <span className="inline-flex items-center gap-1">
                                <Users size={10} />{j.nbInscrits}/{j.maxPlaces ?? "?"}
                              </span>
                              <span>
                                {j.priceTTC != null ? `${j.priceTTC} €` : "— €"}
                                {j.allowDayBooking ? ` · jour ${j.priceTTCDay ?? 0} €` : " · pas de jour"}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
