/**
 * src/app/admin/planning/planning-ia.ts
 *
 * Analyse IA du planning affiché : envoie le remplissage de chaque créneau à
 * /api/ia et rend les suggestions telles quelles.
 *
 * Pourquoi à part : c'est un appel réseau optionnel, purement consultatif. Il
 * ne modifie AUCUNE donnée — ni créneau, ni inscription, ni paiement. Le
 * sortir de la page rend cette innocuité évidente, et évite qu'on lui ajoute
 * un jour, par commodité, une écriture au passage.
 */

"use client";

import { Creneau, fmtDateFR, fmtMonthFR } from "./types";
import { authFetch } from "@/lib/auth-fetch";

export async function analyserPlanningIA(params: {
  viewMode: "week" | "day" | "month" | "timeline";
  creneaux: (Creneau & { id: string })[];
  dayCreneaux: (Creneau & { id: string })[];
  currentDay: Date;
  currentMonth: Date;
  weekDates: Date[];
  setIaLoading: (v: boolean) => void;
  setIaSuggestions: (v: string | null) => void;
  setIaStats: (v: any) => void;
  setShowIaPanel: (v: boolean) => void;
}): Promise<void> {
  const { viewMode, creneaux, dayCreneaux, currentDay, currentMonth, weekDates,
    setIaLoading, setIaSuggestions, setIaStats, setShowIaPanel } = params;
  const visibleCreneaux = viewMode === "day" ? dayCreneaux : creneaux;
  if (visibleCreneaux.length === 0) return;
  setIaLoading(true); setIaSuggestions(null); setShowIaPanel(true);
  try {
    const periodeLabel = viewMode === "day"
      ? `Journée du ${currentDay.toLocaleDateString("fr-FR", { weekday:"long", day:"numeric", month:"long" })}`
      : viewMode === "month" ? fmtMonthFR(currentMonth)
      : `Semaine du ${fmtDateFR(weekDates[0])} au ${fmtDateFR(weekDates[6])}`;
    const payload = visibleCreneaux.map(c => ({ id: c.id||"", activityTitle: c.activityTitle, activityType: c.activityType, date: c.date, startTime: c.startTime, endTime: c.endTime, monitor: c.monitor, maxPlaces: c.maxPlaces, enrolled: (c.enrolled||[]).length, fill: c.maxPlaces>0?(c.enrolled||[]).length/c.maxPlaces:0, status: c.status }));
    const res = await authFetch("/api/ia", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ type:"suggestions_planning", creneaux:payload, periode:periodeLabel, viewMode }) });
    const data = await res.json();
    if (data.success) { setIaSuggestions(data.suggestions); setIaStats(data.stats); }
    else setIaSuggestions(`Erreur : ${data.error}`);
  } catch(e: any) { setIaSuggestions(`Erreur : ${e.message}`); }
  setIaLoading(false);
}
