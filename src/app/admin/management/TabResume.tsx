"use client";
import { useState, useMemo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { TachePlanifiee, Salarie, JourSemaine } from "./types";
import { CATEGORIES, JOURS, JOURS_LABELS, getLundideSemaine, getISOWeek, formatDateCourte, fmtDuree } from "./types";

interface Props {
  semaine: string;
  setSemaine: (s: string) => void;
  taches: TachePlanifiee[];
  salaries: Salarie[];
}

function heureToMin(h: string) { const [hh, mm] = h.split(":").map(Number); return hh * 60 + mm; }
function minToHeure(m: number) { return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`; }

export default function TabResume({ semaine, setSemaine, taches, salaries }: Props) {
  const lundi = getLundideSemaine(semaine);
  const jourDates = JOURS.slice(0, 6).map((j, i) => {
    const d = new Date(lundi); d.setDate(d.getDate() + i);
    return { jour: j as JourSemaine, date: d };
  });

  const prevWeek = () => {
    const d = new Date(lundi); d.setDate(d.getDate() - 7);
    setSemaine(getISOWeek(d));
  };
  const nextWeek = () => {
    const d = new Date(lundi); d.setDate(d.getDate() + 7);
    setSemaine(getISOWeek(d));
  };

  const activeSals = salaries.filter(s => s.actif);

  const getTaskColor = (t: TachePlanifiee) => (t as any).color || CATEGORIES.find(c => c.id === t.categorie)?.color || "#64748b";

  // Charge par salarié par jour
  const chargeData = useMemo(() => {
    const data: Record<string, { total: number; jours: Record<string, number> }> = {};
    for (const sal of activeSals) {
      const jours: Record<string, number> = {};
      let total = 0;
      for (const { jour } of jourDates) {
        const charge = taches
          .filter(t => t.salarieId === sal.id && t.jour === jour && t.categorie !== "pause")
          .reduce((s, t) => s + t.dureeMinutes, 0);
        jours[jour] = charge;
        total += charge;
      }
      data[sal.id] = { total, jours };
    }
    return data;
  }, [taches, activeSals]);

  return (
    <div className="flex flex-col gap-6">
      {/* Navigation semaine */}
      <div className="flex items-center justify-between">
        <button onClick={prevWeek} className="flex items-center gap-1 font-body text-sm text-slate-600 bg-white px-4 py-2 rounded-lg border border-gray-200 cursor-pointer hover:border-blue-300">
          <ChevronLeft size={16} />Préc.
        </button>
        <div className="text-center">
          <div className="font-display text-lg font-bold text-blue-800 capitalize">
            {lundi.toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}
          </div>
          <div className="font-body text-xs text-slate-500">
            Semaine {semaine.split("-W")[1]} · {formatDateCourte(lundi)} → {formatDateCourte(new Date(lundi.getTime() + 5 * 86400000))}
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setSemaine(getISOWeek(new Date()))} className="font-body text-sm text-blue-500 bg-blue-50 px-4 py-2 rounded-lg border-none cursor-pointer hover:bg-blue-100">Auj.</button>
          <button onClick={nextWeek} className="flex items-center gap-1 font-body text-sm text-slate-600 bg-white px-4 py-2 rounded-lg border border-gray-200 cursor-pointer hover:border-blue-300">
            Suiv.<ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* Résumé charge par salarié */}
      <div className="bg-white rounded-xl border border-gray-100 p-5">
        <h3 className="font-body text-sm font-bold text-blue-800 mb-4">Charge hebdomadaire</h3>
        <div className="overflow-x-auto">
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ padding: "6px 8px", textAlign: "left", fontSize: 10, fontWeight: 700, color: "#475569", borderBottom: "2px solid #e2e8f0" }}>Salarié</th>
                {jourDates.map(({ jour }) => (
                  <th key={jour} style={{ padding: "6px 4px", textAlign: "center", fontSize: 10, fontWeight: 700, color: "#475569", borderBottom: "2px solid #e2e8f0" }}>
                    {JOURS_LABELS[jour].slice(0, 3)}
                  </th>
                ))}
                <th style={{ padding: "6px 8px", textAlign: "center", fontSize: 10, fontWeight: 800, color: "#1e3a5f", borderBottom: "2px solid #e2e8f0" }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {activeSals.map((sal, si) => {
                const data = chargeData[sal.id];
                if (!data) return null;
                return (
                  <tr key={sal.id} style={{ background: si % 2 === 0 ? "#fafbff" : "#fff" }}>
                    <td style={{ padding: "6px 8px", borderBottom: "1px solid #eef2f7" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                        <div style={{ width: 8, height: 8, borderRadius: "50%", background: sal.couleur }} />
                        <span style={{ fontFamily: "sans-serif", fontSize: 11, fontWeight: 700, color: "#1e293b" }}>{sal.nom}</span>
                      </div>
                    </td>
                    {jourDates.map(({ jour }) => {
                      const mins = data.jours[jour] || 0;
                      return (
                        <td key={jour} style={{ padding: "6px 4px", textAlign: "center", borderBottom: "1px solid #eef2f7" }}>
                          <span style={{ fontFamily: "sans-serif", fontSize: 11, fontWeight: mins > 0 ? 700 : 400, color: mins > 0 ? "#1e293b" : "#d1d5db" }}>
                            {mins > 0 ? fmtDuree(mins) : "—"}
                          </span>
                        </td>
                      );
                    })}
                    <td style={{ padding: "6px 8px", textAlign: "center", borderBottom: "1px solid #eef2f7" }}>
                      <span style={{ fontFamily: "sans-serif", fontSize: 12, fontWeight: 800, color: "#1e3a5f" }}>
                        {fmtDuree(data.total)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Détail par salarié par jour */}
      {activeSals.map(sal => {
        const salTaches = taches.filter(t => t.salarieId === sal.id).sort((a, b) => {
          const jourDiff = JOURS.indexOf(a.jour) - JOURS.indexOf(b.jour);
          return jourDiff !== 0 ? jourDiff : a.heureDebut.localeCompare(b.heureDebut);
        });
        if (salTaches.length === 0) return null;
        const totalCharge = salTaches.filter(t => t.categorie !== "pause").reduce((s, t) => s + t.dureeMinutes, 0);

        return (
          <div key={sal.id} className="bg-white rounded-xl border border-gray-100 p-5">
            {/* Header salarié */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <div style={{ width: 12, height: 12, borderRadius: "50%", background: sal.couleur }} />
              <span style={{ fontFamily: "sans-serif", fontSize: 14, fontWeight: 800, color: "#1e293b" }}>{sal.nom}</span>
              <span style={{ fontFamily: "sans-serif", fontSize: 12, color: "#94a3b8" }}>— {fmtDuree(totalCharge)} cette semaine</span>
            </div>

            {/* Jours */}
            {jourDates.map(({ jour, date }) => {
              const dayTaches = salTaches.filter(t => t.jour === jour);
              if (dayTaches.length === 0) return null;
              const dayCharge = dayTaches.filter(t => t.categorie !== "pause").reduce((s, t) => s + t.dureeMinutes, 0);
              const firstTask = dayTaches[0];
              const lastTask = dayTaches[dayTaches.length - 1];
              const amplitude = `${firstTask.heureDebut}→${minToHeure(heureToMin(lastTask.heureDebut) + lastTask.dureeMinutes)}`;

              return (
                <div key={jour} style={{ marginBottom: 10, paddingBottom: 10, borderBottom: "1px solid #f1f5f9" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                    <span style={{ fontFamily: "sans-serif", fontSize: 11, fontWeight: 700, color: "#475569", textTransform: "capitalize", minWidth: 70 }}>
                      {JOURS_LABELS[jour].slice(0, 3)} {date.getDate()}
                    </span>
                    <span style={{ fontFamily: "sans-serif", fontSize: 10, color: "#94a3b8" }}>
                      {amplitude} · {fmtDuree(dayCharge)}
                    </span>
                  </div>
                  <div style={{ paddingLeft: 12, display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {dayTaches.map(t => {
                      const color = getTaskColor(t);
                      const cat = CATEGORIES.find(c => c.id === t.categorie);
                      return (
                        <span key={t.id} style={{
                          fontFamily: "sans-serif", fontSize: 9, fontWeight: 600,
                          color: color, background: color + "12",
                          border: `1px solid ${color}25`,
                          padding: "2px 7px", borderRadius: 5,
                          whiteSpace: "nowrap",
                        }}>
                          {cat?.emoji} {t.tacheLabel} <span style={{ fontWeight: 400, color: "#94a3b8" }}>{t.heureDebut}→{minToHeure(heureToMin(t.heureDebut) + t.dureeMinutes)}</span>
                        </span>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}

      {taches.length === 0 && (
        <div className="text-center py-12 bg-white rounded-2xl border border-gray-100">
          <div className="text-4xl mb-3">📋</div>
          <p className="font-body text-sm text-slate-400">Aucune tâche cette semaine.</p>
        </div>
      )}
    </div>
  );
}
