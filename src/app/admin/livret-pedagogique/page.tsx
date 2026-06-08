"use client";
import { useState, useEffect, useMemo } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { authFetch } from "@/lib/auth-fetch";
import { Loader2, FileText, GraduationCap } from "lucide-react";

// Saison équestre par défaut : 1er sept → 30 juin
function defaultSeason() {
  const now = new Date();
  const y = now.getFullYear();
  const startYear = now.getMonth() >= 8 ? y : y - 1; // mois >= septembre (index 8)
  return { start: `${startYear}-09-01`, end: `${startYear + 1}-06-30` };
}

export default function LivretPedagogiquePage() {
  const season = useMemo(defaultSeason, []);
  const [startDate, setStartDate] = useState(season.start);
  const [endDate, setEndDate] = useState(season.end);
  const [creneaux, setCreneaux] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [monitor, setMonitor] = useState("");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");

  // Charge les créneaux de la période pour extraire la liste des moniteurs
  useEffect(() => {
    setLoading(true); setError("");
    getDocs(query(collection(db, "creneaux"), where("date", ">=", startDate), where("date", "<=", endDate)))
      .then(snap => setCreneaux(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
      .catch(e => { console.error(e); setError("Erreur de chargement des séances."); })
      .finally(() => setLoading(false));
  }, [startDate, endDate]);

  const monitors = useMemo(() => {
    const set = new Set<string>();
    creneaux.forEach((c: any) => (c.monitor || "").split(",").map((x: string) => x.trim()).filter(Boolean).forEach((m: string) => set.add(m)));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [creneaux]);

  // Aperçu rapide du nombre de séances pour le moniteur choisi
  const nbSeances = useMemo(() => {
    if (!monitor) return 0;
    const t = monitor.trim().toLowerCase();
    return creneaux.filter((c: any) => (c.monitor || "").split(",").map((x: string) => x.trim().toLowerCase()).includes(t)).length;
  }, [monitor, creneaux]);

  const generate = async () => {
    if (!monitor) return;
    setGenerating(true); setError("");
    try {
      const res = await authFetch("/api/livret-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ monitor, startDate, endDate }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Erreur lors de la génération");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `livret-pedagogique-${monitor.replace(/[^a-zA-Z0-9]+/g, "-")}.pdf`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      console.error("Génération livret:", e);
      setError(e.message || "Erreur lors de la génération du livret.");
    }
    setGenerating(false);
  };

  return (
    <div className="max-w-2xl mx-auto p-6">
      <div className="flex items-center gap-3 mb-1">
        <GraduationCap className="text-blue-600" size={26} />
        <h1 className="font-display text-2xl font-bold text-blue-800">Livret pédagogique</h1>
      </div>
      <p className="font-body text-sm text-slate-500 mb-6">
        Génère un livret PDF récapitulant, pour un moniteur/enseignant sur la saison, ses séances encadrées
        (cavaliers, chevaux), ses préparations de séance, ses notes de fin de séance et les bilans individuels
        des cavaliers présents. Destiné aux dossiers d'examen.
      </p>

      <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="font-body text-xs font-semibold text-slate-600 uppercase tracking-wider">Du</label>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
              className="w-full mt-1 px-3 py-2 rounded-lg border border-gray-200 font-body text-sm focus:outline-none focus:border-blue-400" />
          </div>
          <div>
            <label className="font-body text-xs font-semibold text-slate-600 uppercase tracking-wider">Au</label>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
              className="w-full mt-1 px-3 py-2 rounded-lg border border-gray-200 font-body text-sm focus:outline-none focus:border-blue-400" />
          </div>
        </div>

        <div>
          <label className="font-body text-xs font-semibold text-slate-600 uppercase tracking-wider">Moniteur / enseignant</label>
          {loading ? (
            <div className="flex items-center gap-2 text-slate-400 font-body text-sm mt-2"><Loader2 size={16} className="animate-spin" /> Chargement des séances…</div>
          ) : monitors.length === 0 ? (
            <p className="font-body text-sm text-slate-500 italic mt-2">Aucun moniteur trouvé sur cette période.</p>
          ) : (
            <select value={monitor} onChange={e => setMonitor(e.target.value)}
              className="w-full mt-1 px-3 py-2 rounded-lg border border-gray-200 font-body text-sm bg-white focus:outline-none focus:border-blue-400 cursor-pointer">
              <option value="">— Choisir —</option>
              {monitors.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          )}
          {monitor && <p className="font-body text-xs text-slate-500 mt-1.5">{nbSeances} séance{nbSeances > 1 ? "s" : ""} encadrée{nbSeances > 1 ? "s" : ""} sur la période.</p>}
        </div>

        {error && <p className="font-body text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

        <button onClick={generate} disabled={!monitor || generating}
          className="w-full flex items-center justify-center gap-2 font-body text-sm font-semibold text-white bg-blue-600 px-4 py-3 rounded-xl border-none cursor-pointer hover:bg-blue-500 disabled:opacity-50">
          {generating ? <><Loader2 size={16} className="animate-spin" /> Génération du livret…</> : <><FileText size={16} /> Générer le livret PDF</>}
        </button>
      </div>
    </div>
  );
}
