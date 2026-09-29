"use client";

/**
 * Admin › Veille du club — le passage du matin, à la demande.
 *
 * La même liste que l'email de 7 h 30 (lib/veille-club) : ce qui risque de
 * se perdre (argent, planning, cartes et forfaits, communication,
 * obligations). Lecture seule : chaque point mène à l'écran où agir.
 */

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { authFetch } from "@/lib/auth-fetch";
import { Loader2, RefreshCw, ExternalLink, CheckCircle2, Eye } from "lucide-react";
import { LIBELLES_NIVEAU, type NiveauVeille, type PointVeille } from "@/lib/veille-club";

const COULEURS: Record<NiveauVeille, { bord: string; texte: string; fond: string }> = {
  rouge: { bord: "border-red-300", texte: "text-red-700", fond: "bg-red-50" },
  orange: { bord: "border-orange-300", texte: "text-orange-700", fond: "bg-orange-50" },
  jaune: { bord: "border-amber-300", texte: "text-amber-700", fond: "bg-amber-50" },
  bleu: { bord: "border-blue-300", texte: "text-blue-700", fond: "bg-blue-50" },
  gris: { bord: "border-slate-300", texte: "text-slate-700", fond: "bg-slate-50" },
};

function CartePoint({ p }: { p: PointVeille }) {
  const [tout, setTout] = useState(false);
  const c = COULEURS[p.niveau];
  const lignes = tout ? p.lignes : p.lignes.slice(0, 8);
  return (
    <div className={`rounded-xl border-l-4 ${c.bord} ${c.fond} px-4 py-3 mb-2`}>
      <div className="flex items-start justify-between gap-3">
        <div className={`font-body text-sm font-semibold ${c.texte}`}>
          {p.numero}. {p.titre} <span className="font-normal text-slate-500">({p.nb})</span>
        </div>
        <a href={p.lien} className="shrink-0 inline-flex items-center gap-1 font-body text-[11px] font-semibold text-blue-700 bg-white px-2 py-1 rounded-md no-underline hover:bg-blue-50 border border-blue-100">
          <ExternalLink size={11} /> Ouvrir
        </a>
      </div>
      <ul className="mt-1.5 pl-4 list-disc font-body text-xs text-slate-700">
        {lignes.map((l, i) => <li key={i}>{l}</li>)}
      </ul>
      {p.lignes.length > 8 && (
        <button type="button" onClick={() => setTout(v => !v)} className="mt-1 font-body text-[11px] text-slate-500 bg-transparent border-none cursor-pointer p-0 underline">
          {tout ? "Réduire" : `Voir les ${p.lignes.length - 8} autres`}
        </button>
      )}
    </div>
  );
}

export default function VeillePage() {
  const { isAdmin, user } = useAuth();
  const [points, setPoints] = useState<PointVeille[] | null>(null);
  const [analyseLe, setAnalyseLe] = useState("");
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState("");

  const analyser = useCallback(async () => {
    if (!user) return;
    setChargement(true); setErreur("");
    try {
      const res = await authFetch("/api/admin/veille");
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Analyse impossible");
      setPoints(json.points || []);
      setAnalyseLe(json.analyseLe || "");
    } catch (e: any) {
      setErreur(e?.message || String(e));
    }
    setChargement(false);
  }, [user]);

  useEffect(() => { if (isAdmin && user) analyser(); }, [isAdmin, user, analyser]);

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
        <h1 className="font-display text-2xl font-bold text-blue-800 flex items-center gap-2"><Eye size={22} /> Veille du club</h1>
        <button type="button" onClick={analyser} disabled={chargement}
          className="inline-flex items-center gap-1.5 font-body text-xs font-semibold text-blue-700 bg-blue-50 px-3 py-2 rounded-lg border-none cursor-pointer hover:bg-blue-100 disabled:opacity-50">
          {chargement ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Relancer
        </button>
      </div>
      <p className="font-body text-sm text-slate-500 mb-5">
        Ce qui mérite un coup d&apos;œil, en un seul endroit. La même liste vous arrive par email chaque matin à 7 h 30, s&apos;il y a quelque chose.
        Rien n&apos;est modifié ici : chaque point ouvre l&apos;écran où agir.
        {analyseLe && <> Analyse du {new Date(analyseLe).toLocaleString("fr-FR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}.</>}
      </p>

      {erreur && <p className="font-body text-sm text-red-600 mb-4">{erreur}</p>}
      {chargement && !points && <div className="text-center py-16"><Loader2 className="w-7 h-7 animate-spin text-blue-500 mx-auto" /></div>}

      {points && points.length === 0 && !chargement && (
        <div className="rounded-xl bg-green-50 border border-green-200 px-4 py-6 text-center font-body text-sm text-green-800 flex items-center justify-center gap-2">
          <CheckCircle2 size={18} /> Rien à signaler ce matin.
        </div>
      )}

      {points && points.length > 0 && (Object.keys(LIBELLES_NIVEAU) as NiveauVeille[]).map(niveau => {
        const pts = points.filter(p => p.niveau === niveau);
        if (!pts.length) return null;
        return (
          <section key={niveau} className="mb-5">
            <h2 className={`font-body text-xs font-bold uppercase tracking-wider mb-2 ${COULEURS[niveau].texte}`}>{LIBELLES_NIVEAU[niveau]}</h2>
            {pts.map(p => <CartePoint key={p.code} p={p} />)}
          </section>
        );
      })}
    </div>
  );
}
