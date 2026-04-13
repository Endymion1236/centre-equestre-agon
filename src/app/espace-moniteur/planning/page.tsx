"use client";
import { useState, useEffect, useMemo } from "react";
import { collection, getDocs, query, where, updateDoc, doc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { ChevronLeft, ChevronRight, Check, Loader2 } from "lucide-react";
import { CATEGORIES, JOURS, JOURS_LABELS, getLundideSemaine, getISOWeek, formatDateCourte, fmtDuree } from "@/app/admin/management/types";
import type { TachePlanifiee, Salarie, JourSemaine } from "@/app/admin/management/types";

function heureToMin(h: string) { const [hh, mm] = h.split(":").map(Number); return hh * 60 + mm; }
function minToHeure(m: number) { return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`; }

export default function EspaceMoniteurPlanning() {
  const { user } = useAuth();
  const [semaine, setSemaine] = useState(() => getISOWeek(new Date()));
  const [taches, setTaches] = useState<TachePlanifiee[]>([]);
  const [salaries, setSalaries] = useState<Salarie[]>([]);
  const [loading, setLoading] = useState(true);
  const [mySalId, setMySalId] = useState<string | null>(null);

  const lundi = getLundideSemaine(semaine);
  const jourDates = JOURS.slice(0, 6).map((j, i) => {
    const d = new Date(lundi); d.setDate(d.getDate() + i);
    return { jour: j as JourSemaine, date: d };
  });

  const prevWeek = () => { const d = new Date(lundi); d.setDate(d.getDate() - 7); setSemaine(getISOWeek(d)); };
  const nextWeek = () => { const d = new Date(lundi); d.setDate(d.getDate() + 7); setSemaine(getISOWeek(d)); };

  // Charger les données
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const [salSnap, tSnap, monSnap] = await Promise.all([
        getDocs(collection(db, "salaries-management")),
        getDocs(query(collection(db, "taches-planifiees"), where("semaine", "==", semaine))),
        getDocs(collection(db, "moniteurs")),
      ]);
      const sals = salSnap.docs.map(d => ({ id: d.id, ...d.data() } as Salarie)).filter(s => s.actif).sort((a, b) => a.nom.localeCompare(b.nom));
      setSalaries(sals);
      setTaches(tSnap.docs.map(d => ({ id: d.id, ...d.data() } as TachePlanifiee)));

      // Identifier le salarié correspondant au moniteur connecté
      if (user) {
        const displayName = user.displayName || "";
        const email = user.email || "";
        // Chercher le moniteur par email
        const mon = monSnap.docs.map(d => d.data() as any).find((m: any) =>
          m.email?.toLowerCase() === email.toLowerCase()
        );
        const monName = mon?.name || displayName;
        const sal = sals.find(s => s.nom.toLowerCase().trim() === monName.toLowerCase().trim());
        setMySalId(sal?.id || null);
      }
      setLoading(false);
    };
    load();
  }, [semaine, user]);

  const toggleDone = async (t: TachePlanifiee) => {
    // Seulement ses propres tâches
    if (t.salarieId !== mySalId) return;
    await updateDoc(doc(db, "taches-planifiees", t.id), { done: !t.done, updatedAt: serverTimestamp() });
    setTaches(prev => prev.map(x => x.id === t.id ? { ...x, done: !x.done } : x));
  };

  const getCat = (cat: string) => CATEGORIES.find(c => c.id === cat);
  const getTaskColor = (t: TachePlanifiee) => (t as any).color || getCat(t.categorie)?.color || "#64748b";

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <h1 className="font-display text-xl font-bold text-blue-800">📋 Planning de l'équipe</h1>

      {/* Navigation semaine */}
      <div className="flex items-center justify-between">
        <button onClick={prevWeek} className="flex items-center gap-1 font-body text-sm text-slate-600 bg-white px-4 py-2 rounded-lg border border-gray-200 cursor-pointer">
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
          <button onClick={() => setSemaine(getISOWeek(new Date()))} className="font-body text-sm text-blue-500 bg-blue-50 px-4 py-2 rounded-lg border-none cursor-pointer">Auj.</button>
          <button onClick={nextWeek} className="flex items-center gap-1 font-body text-sm text-slate-600 bg-white px-4 py-2 rounded-lg border border-gray-200 cursor-pointer">
            Suiv.<ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* Jours cliquables */}
      <div className="grid grid-cols-6 gap-1.5">
        {jourDates.map(({ jour, date }) => {
          const isToday = (() => { const now = new Date(); return date.getDate() === now.getDate() && date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear(); })();
          return (
            <div key={jour} className={`text-center py-2 rounded-lg font-body text-xs font-semibold ${isToday ? "bg-blue-500 text-white" : "bg-sand text-slate-600"}`}>
              {JOURS_LABELS[jour].slice(0, 3)} {date.getDate()}
            </div>
          );
        })}
      </div>

      {/* Planning par salarié */}
      {salaries.map(sal => {
        const isMe = sal.id === mySalId;
        const salTaches = taches.filter(t => t.salarieId === sal.id);
        const totalCharge = salTaches.filter(t => t.categorie !== "pause").reduce((s, t) => s + t.dureeMinutes, 0);
        const doneTaches = salTaches.filter(t => t.done).length;

        return (
          <div key={sal.id} className={`bg-white rounded-xl border p-4 ${isMe ? "border-blue-300 ring-2 ring-blue-100" : "border-gray-100"}`}>
            {/* Header salarié */}
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-full flex items-center justify-center text-white font-body text-xs font-bold" style={{ background: sal.couleur }}>
                {sal.nom.slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1">
                <div className="font-body text-sm font-bold text-blue-800 flex items-center gap-2">
                  {sal.nom}
                  {isMe && <span className="font-body text-[10px] text-blue-500 bg-blue-50 px-2 py-0.5 rounded-full">C'est moi</span>}
                </div>
                <div className="font-body text-xs text-slate-400">
                  {fmtDuree(totalCharge)} · {doneTaches}/{salTaches.length} tâches faites
                </div>
              </div>
            </div>

            {/* Grille jours */}
            <div className="grid grid-cols-6 gap-2">
              {jourDates.map(({ jour }) => {
                const dayTaches = salTaches.filter(t => t.jour === jour).sort((a, b) => a.heureDebut.localeCompare(b.heureDebut));
                return (
                  <div key={jour} className="flex flex-col gap-1">
                    <div className="font-body text-[10px] font-semibold text-slate-400 text-center mb-0.5">
                      {JOURS_LABELS[jour].slice(0, 3)}
                    </div>
                    {dayTaches.length === 0 ? (
                      <div className="font-body text-[10px] text-slate-300 text-center">—</div>
                    ) : dayTaches.map(t => {
                      const color = getTaskColor(t);
                      const cat = getCat(t.categorie);
                      return (
                        <div key={t.id}
                          onClick={() => isMe && toggleDone(t)}
                          style={{
                            padding: "3px 4px", borderRadius: 5,
                            background: t.done ? "#f0fdf4" : color + "12",
                            border: `1px solid ${t.done ? "#bbf7d0" : color + "25"}`,
                            opacity: t.done ? 0.6 : 1,
                            cursor: isMe ? "pointer" : "default",
                          }}
                          title={isMe ? (t.done ? "Marquer comme non fait" : "Marquer comme fait") : ""}>
                          <div style={{ fontFamily: "sans-serif", fontSize: 9, fontWeight: 600, color: t.done ? "#16a34a" : color, textDecoration: t.done ? "line-through" : "none", lineHeight: "1.3", wordBreak: "break-word" }}>
                            {t.done && "✓ "}{t.tacheLabel}
                          </div>
                          <div style={{ fontFamily: "sans-serif", fontSize: 8, color: "#94a3b8" }}>
                            {t.heureDebut}→{minToHeure(heureToMin(t.heureDebut) + t.dureeMinutes)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {taches.length === 0 && (
        <div className="text-center py-12 bg-white rounded-2xl border border-gray-100">
          <div className="text-4xl mb-3">📋</div>
          <p className="font-body text-sm text-slate-400">Aucune tâche planifiée cette semaine.</p>
        </div>
      )}
    </div>
  );
}
