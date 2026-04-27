"use client";
import { useEffect, useState } from "react";
import { getMareesForDate, getMareeIntensity, type Maree } from "@/lib/marees";

interface Props {
  date: string; // "YYYY-MM-DD"
}

const intensityColors: Record<string, { bg: string; text: string; label: string }> = {
  "morte-eau":     { bg: "bg-slate-100",  text: "text-slate-600",   label: "Morte-eau" },
  "moyenne":       { bg: "bg-blue-50",    text: "text-blue-700",    label: "Marée moyenne" },
  "vive-eau":      { bg: "bg-amber-50",   text: "text-amber-700",   label: "Vive-eau" },
  "grande-maree":  { bg: "bg-red-50",     text: "text-red-700",     label: "Grande marée" },
};

export default function MareesBandeau({ date }: Props) {
  const [marees, setMarees] = useState<Maree[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getMareesForDate(date).then(data => {
      if (!cancelled) {
        setMarees(data);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [date]);

  if (loading) return null; // pas de spinner, transparent au chargement

  if (!marees || marees.length === 0) {
    // Aucune donnée pour ce jour : pas de bandeau, mais on propose d'aller
    // voir sur le SHOM
    return (
      <div className="flex items-center justify-between gap-2 mb-3 px-3 py-2 rounded-xl bg-slate-50 border border-slate-200">
        <div className="font-body text-xs text-slate-500">
          🌊 Marées non saisies pour ce jour
        </div>
        <a
          href={`https://maree.shom.fr/harbor/POINTE_D_AGON/hlt/0?date=${date}`}
          target="_blank" rel="noopener noreferrer"
          className="font-body text-xs font-semibold text-blue-600 hover:text-blue-700 no-underline">
          Voir sur SHOM →
        </a>
      </div>
    );
  }

  // On prend le coef max du jour pour la pastille intensité
  const coefMax = Math.max(...marees.filter(m => m.coef).map(m => m.coef!), 0);
  const intensity = getMareeIntensity(coefMax) || "moyenne";
  const intensityColor = intensityColors[intensity];

  return (
    <div className="flex flex-wrap items-center gap-2 mb-3 px-3 py-2 rounded-xl bg-gradient-to-r from-blue-50 to-cyan-50 border border-blue-100">
      <div className="flex items-center gap-1.5 font-body text-xs font-semibold text-blue-800">
        <span className="text-base">🌊</span>
        <span>Marées</span>
      </div>

      <div className="flex flex-wrap items-center gap-2 flex-1">
        {marees.map((m, i) => (
          <div key={i}
            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-mono ${
              m.type === "PM"
                ? "bg-white/70 border border-blue-200 text-blue-900"
                : "bg-white/40 border border-slate-200 text-slate-600"
            }`}
            title={m.type === "PM" ? "Pleine mer" : "Basse mer"}>
            <span className="font-semibold">{m.type}</span>
            <span>{m.time.replace(":", "h")}</span>
            <span className="text-slate-500">·</span>
            <span>{m.height.toFixed(2).replace(".", ",")}m</span>
            {m.coef && (
              <>
                <span className="text-slate-500">·</span>
                <span className="font-semibold">coef {m.coef}</span>
              </>
            )}
          </div>
        ))}
      </div>

      {coefMax > 0 && (
        <div className={`px-2 py-0.5 rounded-md text-[10px] font-semibold ${intensityColor.bg} ${intensityColor.text}`}>
          {intensityColor.label}
        </div>
      )}
    </div>
  );
}
