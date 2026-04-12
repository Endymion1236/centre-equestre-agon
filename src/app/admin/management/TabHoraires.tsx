"use client";
import { useState, useMemo, useEffect } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { ChevronLeft, ChevronRight, Printer } from "lucide-react";
import type { TachePlanifiee, Salarie, JourSemaine } from "./types";
import { JOURS, JOURS_LABELS, getLundideSemaine, getISOWeek, fmtDuree } from "./types";

interface Props {
  semaine: string;
  setSemaine: (s: string) => void;
  taches: TachePlanifiee[];
  salaries: Salarie[];
}

function heureToMin(h: string) { const [hh, mm] = h.split(":").map(Number); return hh * 60 + mm; }
function minToHeure(m: number) { return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`; }

// Calculer toutes les semaines d'un mois donné
function getWeeksOfMonth(year: number, month: number): string[] {
  const weeks: string[] = [];
  const d = new Date(year, month, 1);
  while (d.getMonth() === month) {
    const iso = getISOWeek(d);
    if (!weeks.includes(iso)) weeks.push(iso);
    d.setDate(d.getDate() + 1);
  }
  return weeks;
}

export default function TabHoraires({ semaine, setSemaine, taches, salaries }: Props) {
  const lundi = getLundideSemaine(semaine);
  const [mois, setMois] = useState(() => lundi.getMonth());
  const [annee, setAnnee] = useState(() => lundi.getFullYear());
  const [allTaches, setAllTaches] = useState<TachePlanifiee[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedSalId, setSelectedSalId] = useState<string>("");

  const activeSals = salaries.filter(s => s.actif);
  const weeksOfMonth = useMemo(() => getWeeksOfMonth(annee, mois), [annee, mois]);

  const moisLabel = new Date(annee, mois, 1).toLocaleDateString("fr-FR", { month: "long", year: "numeric" });

  // Charger toutes les tâches du mois
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const promises = weeksOfMonth.map(w =>
        getDocs(query(collection(db, "taches-planifiees"), where("semaine", "==", w)))
      );
      const snaps = await Promise.all(promises);
      const all: TachePlanifiee[] = [];
      snaps.forEach(snap => snap.docs.forEach(d => all.push({ id: d.id, ...d.data() } as TachePlanifiee)));
      setAllTaches(all);
      setLoading(false);
    };
    load();
  }, [weeksOfMonth]);

  const prevMonth = () => {
    if (mois === 0) { setMois(11); setAnnee(a => a - 1); }
    else setMois(m => m - 1);
  };
  const nextMonth = () => {
    if (mois === 11) { setMois(0); setAnnee(a => a + 1); }
    else setMois(m => m + 1);
  };

  // Générer tous les jours du mois
  const joursduMois = useMemo(() => {
    const days: Date[] = [];
    const d = new Date(annee, mois, 1);
    while (d.getMonth() === mois) {
      days.push(new Date(d));
      d.setDate(d.getDate() + 1);
    }
    return days;
  }, [annee, mois]);

  const handlePrint = () => window.print();

  // Calculer les données pour un salarié
  const buildSalData = (salId: string) => {
    const salTaches = allTaches.filter(t => t.salarieId === salId);
    let totalMois = 0;
    const rows = joursduMois.map(date => {
      const dow = (date.getDay() + 6) % 7; // 0=lundi
      if (dow >= 6) return null; // dimanche
      const jour = JOURS[dow] as JourSemaine;
      const isoWeek = getISOWeek(date);
      const dayTaches = salTaches.filter(t => t.semaine === isoWeek && t.jour === jour && t.categorie !== "pause")
        .sort((a, b) => a.heureDebut.localeCompare(b.heureDebut));

      if (dayTaches.length === 0) {
        return { date, jour, debut: "", fin: "", duree: 0, taches: "", isSamedi: dow === 5 };
      }

      const debut = dayTaches[0].heureDebut;
      const lastT = dayTaches[dayTaches.length - 1];
      const fin = minToHeure(heureToMin(lastT.heureDebut) + lastT.dureeMinutes);
      const duree = dayTaches.reduce((s, t) => s + t.dureeMinutes, 0);
      totalMois += duree;

      return {
        date, jour, debut, fin, duree,
        taches: dayTaches.map(t => t.tacheLabel).join(", "),
        isSamedi: dow === 5,
      };
    }).filter(Boolean) as { date: Date; jour: JourSemaine; debut: string; fin: string; duree: number; taches: string; isSamedi: boolean }[];

    return { rows, totalMois };
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Navigation mois */}
      <div className="flex items-center justify-between no-print">
        <button onClick={prevMonth} className="flex items-center gap-1 font-body text-sm text-slate-600 bg-white px-4 py-2 rounded-lg border border-gray-200 cursor-pointer hover:border-blue-300">
          <ChevronLeft size={16} />Mois préc.
        </button>
        <div className="text-center">
          <div className="font-display text-lg font-bold text-blue-800 capitalize">{moisLabel}</div>
          <div className="font-body text-xs text-slate-400">{weeksOfMonth.length} semaines · {joursduMois.length} jours</div>
        </div>
        <div className="flex gap-2">
          <button onClick={handlePrint}
            className="flex items-center gap-1.5 font-body text-sm text-slate-600 bg-gray-100 px-4 py-2 rounded-lg border-none cursor-pointer hover:bg-gray-200">
            <Printer size={14} /> Imprimer
          </button>
          <button onClick={nextMonth} className="flex items-center gap-1 font-body text-sm text-slate-600 bg-white px-4 py-2 rounded-lg border border-gray-200 cursor-pointer hover:border-blue-300">
            Mois suiv.<ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* Sélecteur salarié (ou tous) */}
      <div className="flex flex-wrap gap-2 no-print">
        <button onClick={() => setSelectedSalId("")}
          className={`px-3 py-1.5 rounded-lg font-body text-xs font-semibold border-none cursor-pointer ${!selectedSalId ? "bg-blue-500 text-white" : "bg-white text-slate-500 border border-gray-200"}`}>
          Tous
        </button>
        {activeSals.map(sal => (
          <button key={sal.id} onClick={() => setSelectedSalId(sal.id)}
            className={`px-3 py-1.5 rounded-lg font-body text-xs font-semibold border-none cursor-pointer flex items-center gap-1.5 ${selectedSalId === sal.id ? "bg-blue-500 text-white" : "bg-white text-slate-500 border border-gray-200"}`}>
            <div className="w-2.5 h-2.5 rounded-full" style={{ background: sal.couleur }} />
            {sal.nom}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-12 font-body text-sm text-slate-400">Chargement du mois…</div>
      ) : (
        (selectedSalId ? activeSals.filter(s => s.id === selectedSalId) : activeSals).map(sal => {
          const { rows, totalMois } = buildSalData(sal.id);
          return (
            <div key={sal.id} className="bg-white rounded-xl border border-gray-100 p-6 print-page">
              {/* En-tête fiche */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, paddingBottom: 12, borderBottom: "2px solid #1e3a5f" }}>
                <div>
                  <div style={{ fontFamily: "sans-serif", fontSize: 20, fontWeight: 800, color: "#1e3a5f" }}>
                    Fiche horaires — {sal.nom}
                  </div>
                  <div style={{ fontFamily: "sans-serif", fontSize: 13, color: "#64748b", marginTop: 2, textTransform: "capitalize" }}>
                    {moisLabel}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontFamily: "sans-serif", fontSize: 11, color: "#64748b" }}>Centre Équestre d'Agon-Coutainville</div>
                  <div style={{ fontFamily: "sans-serif", fontSize: 14, fontWeight: 700, color: "#1e3a5f", marginTop: 4 }}>
                    Total : {fmtDuree(totalMois)}
                  </div>
                </div>
              </div>

              {/* Tableau des jours */}
              <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "sans-serif", fontSize: 11 }}>
                <thead>
                  <tr style={{ background: "#f1f5f9" }}>
                    <th style={{ padding: "6px 8px", textAlign: "left", fontWeight: 700, color: "#475569", borderBottom: "2px solid #e2e8f0", width: "12%" }}>Date</th>
                    <th style={{ padding: "6px 8px", textAlign: "left", fontWeight: 700, color: "#475569", borderBottom: "2px solid #e2e8f0", width: "8%" }}>Jour</th>
                    <th style={{ padding: "6px 8px", textAlign: "center", fontWeight: 700, color: "#475569", borderBottom: "2px solid #e2e8f0", width: "8%" }}>Début</th>
                    <th style={{ padding: "6px 8px", textAlign: "center", fontWeight: 700, color: "#475569", borderBottom: "2px solid #e2e8f0", width: "8%" }}>Fin</th>
                    <th style={{ padding: "6px 8px", textAlign: "center", fontWeight: 700, color: "#475569", borderBottom: "2px solid #e2e8f0", width: "8%" }}>Durée</th>
                    <th style={{ padding: "6px 8px", textAlign: "center", fontWeight: 700, color: "#475569", borderBottom: "2px solid #e2e8f0", width: "12%" }}>Signature</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => {
                    const dateStr = row.date.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
                    const isWeekEnd = row.isSamedi;
                    // Détecter les changements de semaine
                    const prevRow = i > 0 ? rows[i - 1] : null;
                    const newWeek = prevRow && ((row.date.getDay() + 6) % 7) === 0;
                    return (
                      <tr key={i} style={{
                        background: row.duree === 0 ? "#fafafa" : (i % 2 === 0 ? "#fff" : "#fafbff"),
                        borderTop: newWeek ? "2px solid #cbd5e1" : undefined,
                      }}>
                        <td style={{ padding: "5px 8px", borderBottom: "1px solid #eef2f7", fontWeight: 600, color: "#1e293b" }}>{dateStr}</td>
                        <td style={{ padding: "5px 8px", borderBottom: "1px solid #eef2f7", color: isWeekEnd ? "#3b82f6" : "#64748b", fontWeight: isWeekEnd ? 600 : 400, textTransform: "capitalize" }}>
                          {JOURS_LABELS[row.jour].slice(0, 3)}
                        </td>
                        <td style={{ padding: "5px 8px", borderBottom: "1px solid #eef2f7", textAlign: "center", fontWeight: 600, color: row.debut ? "#1e293b" : "#d1d5db" }}>
                          {row.debut || "—"}
                        </td>
                        <td style={{ padding: "5px 8px", borderBottom: "1px solid #eef2f7", textAlign: "center", fontWeight: 600, color: row.fin ? "#1e293b" : "#d1d5db" }}>
                          {row.fin || "—"}
                        </td>
                        <td style={{ padding: "5px 8px", borderBottom: "1px solid #eef2f7", textAlign: "center", fontWeight: 700, color: row.duree > 0 ? "#1e3a5f" : "#d1d5db" }}>
                          {row.duree > 0 ? fmtDuree(row.duree) : "—"}
                        </td>
                        <td style={{ padding: "5px 8px", borderBottom: "1px solid #eef2f7", textAlign: "center" }}>
                          {row.duree > 0 && (
                            <div style={{ borderBottom: "1px solid #cbd5e1", width: "80%", margin: "0 auto", height: 16 }} />
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ background: "#f1f5f9" }}>
                    <td colSpan={4} style={{ padding: "8px", fontWeight: 800, color: "#1e3a5f", textAlign: "right", borderTop: "2px solid #e2e8f0" }}>
                      Total du mois
                    </td>
                    <td style={{ padding: "8px", fontWeight: 800, color: "#1e3a5f", textAlign: "center", borderTop: "2px solid #e2e8f0", fontSize: 13 }}>
                      {fmtDuree(totalMois)}
                    </td>
                    <td colSpan={1} style={{ borderTop: "2px solid #e2e8f0" }}></td>
                  </tr>
                </tfoot>
              </table>

              {/* Zone signatures fin de mois */}
              <div style={{ marginTop: 32, display: "flex", justifyContent: "space-between", gap: 40 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: "sans-serif", fontSize: 11, fontWeight: 700, color: "#475569", marginBottom: 8 }}>
                    Signature du salarié
                  </div>
                  <div style={{ borderBottom: "1px solid #94a3b8", height: 50 }} />
                  <div style={{ fontFamily: "sans-serif", fontSize: 9, color: "#94a3b8", marginTop: 4 }}>
                    {sal.nom} · Date :
                  </div>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: "sans-serif", fontSize: 11, fontWeight: 700, color: "#475569", marginBottom: 8 }}>
                    Signature de l'employeur
                  </div>
                  <div style={{ borderBottom: "1px solid #94a3b8", height: 50 }} />
                  <div style={{ fontFamily: "sans-serif", fontSize: 9, color: "#94a3b8", marginTop: 4 }}>
                    Nicolas Richard · Date :
                  </div>
                </div>
              </div>
            </div>
          );
        })
      )}

      <style>{`
        @media print {
          .no-print, nav, header, [data-sidebar], [data-header] { display: none !important; }
          .print-page { page-break-after: always; border: none !important; padding: 0 !important; box-shadow: none !important; }
          .print-page:last-child { page-break-after: auto; }
          body { background: white !important; }
        }
      `}</style>
    </div>
  );
}
