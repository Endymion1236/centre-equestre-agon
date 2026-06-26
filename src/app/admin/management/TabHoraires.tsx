"use client";
import { useState, useMemo, useEffect, useCallback } from "react";
import { collection, getDocs, query, where, addDoc, deleteDoc, setDoc, updateDoc, doc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { ChevronLeft, ChevronRight, Printer, Plus, Trash2, Calendar, Wallet } from "lucide-react";
import type { TachePlanifiee, Salarie, JourSemaine, Absence, BilanHebdo, TypeAbsence } from "./types";
import { JOURS, JOURS_LABELS, getLundideSemaine, getISOWeek, fmtDuree, LIBELLE_ABSENCE } from "./types";

interface Props {
  semaine: string;
  setSemaine: (s: string) => void;
  taches: TachePlanifiee[];
  salaries: Salarie[];
}

function heureToMin(h: string) { const [hh, mm] = h.split(":").map(Number); return hh * 60 + mm; }
function minToHeure(m: number) { return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`; }
/** Durée signée pour le compteur : +1h30 / −2h00 / 0h00. */
function fmtSigne(min: number) { return `${min < 0 ? "−" : "+"}${fmtDuree(Math.abs(min))}`; }

const contratMinDe = (s: Salarie) => Math.round((s.heuresContratSemaine ?? 35) * 60);
const joursTravDe = (s: Salarie) => s.joursTravailles ?? 5;
/** Valeur par défaut (minutes) d'un jour d'absence pour un salarié. */
const jourMinDe = (s: Salarie) => Math.round(contratMinDe(s) / Math.max(1, joursTravDe(s)));
/** "YYYY-MM-DD" en date locale (les jours du mois sont construits en local). */
const dateISO = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;


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

/**
 * Données d'une ligne de la fiche horaire pour un jour.
 *
 * Les pauses sont marquées **explicitement** (catégorie "pause") par l'admin
 * dans le planning. Elles sont exclues du temps de travail calculé.
 *
 * Si la journée contient au moins une tâche "pause", on coupe l'affichage
 * matin / après-midi autour de la première pause. Sinon, journée continue.
 *
 * Le `duree` ne compte JAMAIS les pauses — c'est la durée réelle travaillée
 * (= amplitude de la journée moins la somme des durées des pauses explicites).
 */
type RowData = {
  date: Date;
  jour: JourSemaine;
  debut: string;        // début matin OU début unique si pas de pause
  fin: string;          // fin matin OU fin unique si pas de pause
  debutAprem: string;   // vide si pas de pause explicite
  finAprem: string;     // vide si pas de pause explicite
  pauseMin: number;     // 0 si pas de pause, sinon somme des pauses en minutes
  duree: number;        // durée travaillée (pauses exclues)
  isSamedi: boolean;
  isoWeek: string;
  absenceLabel?: string; // ex. "Congé payé" si une absence couvre ce jour
  absenceMin?: number;   // durée de l'absence (minutes)
};
type WeekSummary = {
  isoWeek: string;
  travaille: number;   // minutes réellement travaillées
  absMin: number;      // minutes d'absence payée (neutralisent le contrat)
  cible: number;       // contrat − absences
  surplus: number;     // max(0, travaille − cible)
  deficit: number;     // max(0, cible − travaille)
  mode: "paye" | "recup";
  clos: boolean;
  contribution: number; // ce qui irait au compteur : (recup? surplus:0) − deficit
  supPayee: number;     // heures sup payées de la semaine
  aVenir: boolean;      // semaine entièrement future (non comptée au compteur)
};

export default function TabHoraires({ semaine, setSemaine, taches, salaries }: Props) {
  const lundi = getLundideSemaine(semaine);
  const [mois, setMois] = useState(() => lundi.getMonth());
  const [annee, setAnnee] = useState(() => lundi.getFullYear());
  const [allTaches, setAllTaches] = useState<TachePlanifiee[]>([]);
  const [allAbsences, setAllAbsences] = useState<Absence[]>([]);
  const [allBilans, setAllBilans] = useState<BilanHebdo[]>([]);
  const [salEdits, setSalEdits] = useState<Record<string, Partial<Salarie>>>({});
  const [loading, setLoading] = useState(false);
  const [selectedSalId, setSelectedSalId] = useState<string>("");

  // Salarié avec ses éventuelles éditions locales (contrat / compteur) appliquées.
  const salFusion = useCallback((s: Salarie): Salarie => ({ ...s, ...salEdits[s.id] }), [salEdits]);

  const activeSals = salaries.filter(s => s.actif);
  const weeksOfMonth = useMemo(() => getWeeksOfMonth(annee, mois), [annee, mois]);
  const moisLabel = new Date(annee, mois, 1).toLocaleDateString("fr-FR", { month: "long", year: "numeric" });

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const [snaps, absSnap, bilSnap] = await Promise.all([
        Promise.all(weeksOfMonth.map(w => getDocs(query(collection(db, "taches-planifiees"), where("semaine", "==", w))))),
        getDocs(query(collection(db, "absences-management"), where("semaine", "in", weeksOfMonth.slice(0, 10)))),
        getDocs(query(collection(db, "bilans-heures"), where("semaine", "in", weeksOfMonth.slice(0, 10)))),
      ]);
      const all: TachePlanifiee[] = [];
      snaps.forEach(snap => snap.docs.forEach(d => all.push({ id: d.id, ...d.data() } as TachePlanifiee)));
      setAllTaches(all);
      setAllAbsences(absSnap.docs.map(d => ({ id: d.id, ...d.data() } as Absence)));
      setAllBilans(bilSnap.docs.map(d => ({ id: d.id, ...d.data() } as BilanHebdo)));
      setLoading(false);
    };
    load();
  }, [weeksOfMonth]);

  const prevMonth = () => { if (mois === 0) { setMois(11); setAnnee(a => a - 1); } else setMois(m => m - 1); };
  const nextMonth = () => { if (mois === 11) { setMois(0); setAnnee(a => a + 1); } else setMois(m => m + 1); };

  const joursduMois = useMemo(() => {
    const days: Date[] = [];
    const d = new Date(annee, mois, 1);
    while (d.getMonth() === mois) { days.push(new Date(d)); d.setDate(d.getDate() + 1); }
    return days;
  }, [annee, mois]);

  const handlePrint = () => window.print();

  // ── Persistance RH ────────────────────────────────────────────────────────
  const majSalarie = async (salId: string, patch: Partial<Salarie>) => {
    setSalEdits(prev => ({ ...prev, [salId]: { ...prev[salId], ...patch } }));
    try { await updateDoc(doc(db, "salaries-management", salId), { ...patch, updatedAt: serverTimestamp() }); } catch (e) { console.error(e); }
  };

  const ajouterAbsence = async (sal: Salarie, date: string, type: TypeAbsence, dureeMinutes: number) => {
    if (!date) return;
    const semaine = getISOWeek(new Date(date + "T12:00:00"));
    const payload: Omit<Absence, "id"> = { salarieId: sal.id, salarieName: sal.nom, date, semaine, type, dureeMinutes, createdAt: serverTimestamp() };
    const ref = await addDoc(collection(db, "absences-management"), payload);
    setAllAbsences(prev => [...prev, { id: ref.id, ...payload }]);
  };

  const supprimerAbsence = async (absId: string) => {
    await deleteDoc(doc(db, "absences-management", absId));
    setAllAbsences(prev => prev.filter(a => a.id !== absId));
  };

  const setMode = async (salId: string, semaine: string, surplusMode: "paye" | "recup") => {
    const id = `${salId}_${semaine}`;
    const payload: BilanHebdo = { id, salarieId: salId, semaine, surplusMode, clos: false, updatedAt: serverTimestamp() };
    await setDoc(doc(db, "bilans-heures", id), payload, { merge: true });
    setAllBilans(prev => { const o = prev.filter(b => b.id !== id); return [...o, payload]; });
  };

  // Intègre la contribution d'une semaine au compteur du salarié et clôt la semaine.
  const appliquerSemaine = async (sal: Salarie, semaine: string, contributionMin: number) => {
    const courant = salFusion(sal).compteurMinutes ?? 0;
    await majSalarie(sal.id, { compteurMinutes: courant + contributionMin });
    const id = `${sal.id}_${semaine}`;
    const existing = allBilans.find(b => b.id === id);
    const payload: BilanHebdo = { id, salarieId: sal.id, semaine, surplusMode: existing?.surplusMode ?? "paye", clos: true, contributionAppliquee: contributionMin, updatedAt: serverTimestamp() };
    await setDoc(doc(db, "bilans-heures", id), payload, { merge: true });
    setAllBilans(prev => { const o = prev.filter(b => b.id !== id); return [...o, payload]; });
  };

  // Rouvre une semaine close : retranche du compteur ce qui avait été appliqué.
  const decloturerSemaine = async (sal: Salarie, semaine: string) => {
    const id = `${sal.id}_${semaine}`;
    const existing = allBilans.find(b => b.id === id);
    const aRetrancher = existing?.contributionAppliquee ?? 0;
    const courant = salFusion(sal).compteurMinutes ?? 0;
    await majSalarie(sal.id, { compteurMinutes: courant - aRetrancher });
    const payload: BilanHebdo = { id, salarieId: sal.id, semaine, surplusMode: existing?.surplusMode ?? "paye", clos: false, contributionAppliquee: 0, updatedAt: serverTimestamp() };
    await setDoc(doc(db, "bilans-heures", id), payload, { merge: true });
    setAllBilans(prev => { const o = prev.filter(b => b.id !== id); return [...o, payload]; });
  };

  const ajusterCompteur = async (sal: Salarie, deltaMin: number) => {
    const courant = salFusion(sal).compteurMinutes ?? 0;
    await majSalarie(sal.id, { compteurMinutes: courant + deltaMin });
  };

  const buildSalData = (sal: Salarie) => {
    const salId = sal.id;
    const contrat = contratMinDe(sal);
    const salTaches = allTaches.filter(t => t.salarieId === salId);
    let totalMois = 0;

    const rows: RowData[] = [];
    joursduMois.forEach(date => {
      const dow = (date.getDay() + 6) % 7;
      if (dow > 6) return; // skip invalid
      const jour = JOURS[dow] as JourSemaine;
      const isoWeek = getISOWeek(date);

      // Toutes les tâches du jour, triées par heure de début
      const dayTaches = salTaches.filter(t => t.semaine === isoWeek && t.jour === jour)
        .sort((a, b) => a.heureDebut.localeCompare(b.heureDebut));

      // Sépare pauses explicites (catégorie "pause") du travail
      const pauses = dayTaches.filter(t => t.categorie === "pause");
      const travail = dayTaches.filter(t => t.categorie !== "pause");

      // Absence éventuelle couvrant ce jour (congé payé, récup, maladie…)
      const abs = allAbsences.find(a => a.salarieId === salId && a.date === dateISO(date));
      const absX = abs ? { absenceLabel: LIBELLE_ABSENCE[abs.type], absenceMin: abs.dureeMinutes } : {};

      if (travail.length === 0) {
        rows.push({ date, jour, debut: "", fin: "", debutAprem: "", finAprem: "", pauseMin: 0, duree: 0, isSamedi: dow === 5, isoWeek, ...absX });
        return;
      }

      // Amplitude = première tâche de travail → fin de la dernière tâche de travail
      const debut = travail[0].heureDebut;
      const finMinJour = Math.max(...travail.map(t => heureToMin(t.heureDebut) + t.dureeMinutes));
      const fin = minToHeure(finMinJour);
      const amplitudeMin = finMinJour - heureToMin(debut);

      // Somme des durées de TOUTES les pauses explicites
      const pauseMin = pauses.reduce((s, p) => s + p.dureeMinutes, 0);

      // Durée travaillée = amplitude − pauses explicites
      // (les battements courts entre tâches de travail sont comptés en travail)
      const duree = Math.max(0, amplitudeMin - pauseMin);
      totalMois += duree;

      if (pauses.length > 0) {
        // On coupe l'affichage matin/aprem autour de la PREMIÈRE pause de la journée
        const premierePause = pauses[0];
        const finMatin = premierePause.heureDebut;
        const debutAprem = minToHeure(heureToMin(premierePause.heureDebut) + premierePause.dureeMinutes);
        rows.push({
          date, jour, isSamedi: dow === 5, isoWeek,
          debut, fin: finMatin,
          debutAprem, finAprem: fin,
          pauseMin,
          duree,
          ...absX,
        });
      } else {
        // Aucune pause explicite : journée continue
        rows.push({
          date, jour, isSamedi: dow === 5, isoWeek,
          debut, fin,
          debutAprem: "", finAprem: "",
          pauseMin: 0,
          duree,
          ...absX,
        });
      }
    });

    // Heures par semaine
    const weekMap: Record<string, number> = {};
    rows.forEach(r => { weekMap[r.isoWeek] = (weekMap[r.isoWeek] || 0) + r.duree; });

    const debutAujourdhui = new Date(); debutAujourdhui.setHours(0, 0, 0, 0);
    const weekSummaries: WeekSummary[] = weeksOfMonth.map(w => {
      const travaille = weekMap[w] || 0;
      const absMin = allAbsences
        .filter(a => a.salarieId === salId && a.semaine === w && a.type !== "sans_solde")
        .reduce((s, a) => s + (a.dureeMinutes || 0), 0);
      const cible = Math.max(0, contrat - absMin);
      // Déficit : mesuré sur la cible réduite -> un congé protège du déficit.
      // Surplus : mesuré sur le CONTRAT PLEIN à partir des heures réellement
      // travaillées -> un congé ne fabrique jamais d'heures sup.
      const surplus = Math.max(0, travaille - contrat);
      const deficit = Math.max(0, cible - travaille);
      const bilan = allBilans.find(b => b.id === `${salId}_${w}`);
      const mode = bilan?.surplusMode ?? "paye";
      const clos = !!bilan?.clos;
      // Semaine entièrement future (son lundi est après aujourd'hui) : pas encore
      // travaillée, on ne la compte pas en déficit ni au compteur.
      const aVenir = getLundideSemaine(w).getTime() > debutAujourdhui.getTime();
      const contribution = aVenir ? 0 : (mode === "recup" ? surplus : 0) - deficit;
      const supPayee = aVenir ? 0 : (mode === "paye" ? surplus : 0);
      return { isoWeek: w, travaille, absMin, cible, surplus, deficit, mode, clos, contribution, supPayee, aVenir };
    });

    const totalSupPayee = weekSummaries.reduce((s, w) => s + w.supPayee, 0);
    // Compteur : valeur stockée (déjà augmentée des semaines closes) + prévision des
    // semaines non closes et non futures.
    const compteurStocke = sal.compteurMinutes ?? 0;
    const previsionMois = weekSummaries.filter(w => !w.clos && !w.aVenir).reduce((s, w) => s + w.contribution, 0);
    const compteurPrev = compteurStocke + previsionMois;

    return { rows, totalMois, weekSummaries, totalSupPayee, compteurStocke, previsionMois, compteurPrev, contrat };
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

      {/* Sélecteur salarié */}
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
        (selectedSalId ? activeSals.filter(s => s.id === selectedSalId) : activeSals).map(salRaw => {
          const sal = salFusion(salRaw);
          const { rows, totalMois, weekSummaries, totalSupPayee, compteurStocke, previsionMois, compteurPrev, contrat } = buildSalData(sal);
          let lastWeek = "";
          return (
            <div key={sal.id} className="bg-white rounded-xl border border-gray-100 p-4 print-page">
              {/* Panneau RH (non imprimé) : contrat, absences, compteur, mode hebdo */}
              <PanneauRH
                sal={sal}
                weekSummaries={weekSummaries}
                weeksOfMonth={weeksOfMonth}
                compteurStocke={compteurStocke}
                previsionMois={previsionMois}
                compteurPrev={compteurPrev}
                absences={allAbsences.filter(a => a.salarieId === sal.id && weeksOfMonth.includes(a.semaine))}
                onMajSalarie={majSalarie}
                onAjouterAbsence={ajouterAbsence}
                onSupprimerAbsence={supprimerAbsence}
                onSetMode={setMode}
                onAppliquerSemaine={appliquerSemaine}
                onDecloturer={decloturerSemaine}
                onAjusterCompteur={ajusterCompteur}
              />
              {/* Header */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10, paddingBottom: 8, borderBottom: "2px solid #1e3a5f" }}>
                <div>
                  <div style={{ fontFamily: "sans-serif", fontSize: 16, fontWeight: 800, color: "#1e3a5f" }}>
                    Fiche horaires — {sal.nom}
                  </div>
                  <div style={{ fontFamily: "sans-serif", fontSize: 11, color: "#64748b", textTransform: "capitalize" }}>
                    {moisLabel} · contrat {fmtDuree(contrat)}/sem.
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontFamily: "sans-serif", fontSize: 9, color: "#64748b" }}>Centre Équestre d'Agon-Coutainville</div>
                  <div style={{ fontFamily: "sans-serif", fontSize: 12, fontWeight: 700, color: "#1e3a5f", marginTop: 2 }}>
                    Total travaillé : {fmtDuree(totalMois)}
                  </div>
                  {totalSupPayee > 0 && (
                    <div style={{ fontFamily: "sans-serif", fontSize: 11, fontWeight: 700, color: "#dc2626", marginTop: 1 }}>
                      dont {fmtDuree(totalSupPayee)} heures sup. payées
                    </div>
                  )}
                  <div style={{ fontFamily: "sans-serif", fontSize: 10, fontWeight: 700, color: compteurPrev < 0 ? "#dc2626" : "#0f766e", marginTop: 1 }}>
                    Compteur récup. : {fmtSigne(compteurPrev)}
                  </div>
                </div>
              </div>

              {/* Tableau */}
              <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "sans-serif", fontSize: 9 }}>
                <thead>
                  <tr style={{ background: "#f1f5f9" }}>
                    <th style={{ padding: "3px 4px", textAlign: "left", fontWeight: 700, color: "#475569", borderBottom: "2px solid #e2e8f0" }}>Date</th>
                    <th style={{ padding: "3px 4px", textAlign: "left", fontWeight: 700, color: "#475569", borderBottom: "2px solid #e2e8f0" }}>Jour</th>
                    <th style={{ padding: "3px 4px", textAlign: "center", fontWeight: 700, color: "#475569", borderBottom: "2px solid #e2e8f0" }}>Matin début</th>
                    <th style={{ padding: "3px 4px", textAlign: "center", fontWeight: 700, color: "#475569", borderBottom: "2px solid #e2e8f0" }}>Matin fin</th>
                    <th style={{ padding: "3px 4px", textAlign: "center", fontWeight: 700, color: "#475569", borderBottom: "2px solid #e2e8f0" }}>Aprem début</th>
                    <th style={{ padding: "3px 4px", textAlign: "center", fontWeight: 700, color: "#475569", borderBottom: "2px solid #e2e8f0" }}>Aprem fin</th>
                    <th style={{ padding: "3px 4px", textAlign: "center", fontWeight: 700, color: "#475569", borderBottom: "2px solid #e2e8f0" }}>Durée</th>
                    <th style={{ padding: "3px 4px", textAlign: "center", fontWeight: 700, color: "#475569", borderBottom: "2px solid #e2e8f0", width: "15%" }}>Signature</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => {
                    const dateStr = row.date.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
                    const newWeek = row.isoWeek !== lastWeek;
                    // Insert week summary before new week (except first)
                    const weekSummaryRow = newWeek && lastWeek ? weekSummaries.find(w => w.isoWeek === lastWeek) : null;
                    lastWeek = row.isoWeek;

                    return [
                      weekSummaryRow && (
                        <tr key={`ws-${weekSummaryRow.isoWeek}`} style={{ background: "#eef2ff" }}>
                          <td colSpan={6} style={{ padding: "3px 6px", textAlign: "right", fontWeight: 700, color: "#1e3a5f", borderBottom: "2px solid #cbd5e1", fontSize: 9 }}>
                            Sem. {weekSummaryRow.isoWeek.split("-W")[1]}
                          </td>
                          <td style={{ padding: "3px 4px", textAlign: "center", fontWeight: 800, color: "#1e3a5f", borderBottom: "2px solid #cbd5e1", fontSize: 9 }}>
                            {fmtDuree(weekSummaryRow.travaille)}
                            {weekSummaryRow.aVenir ? (
                              <span style={{ color: "#94a3b8", fontSize: 8, marginLeft: 3, fontStyle: "italic" }}>à venir</span>
                            ) : (
                              <>
                                {weekSummaryRow.absMin > 0 && (
                                  <span style={{ color: "#0ea5e9", fontSize: 8, marginLeft: 3 }}>+{fmtDuree(weekSummaryRow.absMin)} abs.</span>
                                )}
                                {weekSummaryRow.surplus > 0 && (
                                  <span style={{ color: weekSummaryRow.mode === "recup" ? "#0f766e" : "#dc2626", fontSize: 8, marginLeft: 3 }}>
                                    +{fmtDuree(weekSummaryRow.surplus)} {weekSummaryRow.mode === "recup" ? "récup" : "sup"}
                                  </span>
                                )}
                                {weekSummaryRow.deficit > 0 && (
                                  <span style={{ color: "#b45309", fontSize: 8, marginLeft: 3 }}>−{fmtDuree(weekSummaryRow.deficit)}</span>
                                )}
                              </>
                            )}
                          </td>
                          <td style={{ borderBottom: "2px solid #cbd5e1" }}></td>
                        </tr>
                      ),
                      <tr key={i} style={{ background: row.duree === 0 ? "#fafafa" : (i % 2 === 0 ? "#fff" : "#fafbff") }}>
                        <td style={{ padding: "2px 4px", borderBottom: "1px solid #eef2f7", fontWeight: 600, color: "#1e293b" }}>{dateStr}</td>
                        <td style={{ padding: "2px 4px", borderBottom: "1px solid #eef2f7", color: row.isSamedi ? "#3b82f6" : "#64748b", textTransform: "capitalize" }}>
                          {JOURS_LABELS[row.jour].slice(0, 3)}
                        </td>
                        {/* Détermination matin / après-midi pour la répartition des cellules.
                            - Si pause explicite : on a directement debut/fin (matin) et debutAprem/finAprem (aprem)
                            - Si pas de pause : on regarde si la plage commence avant 13h
                              → oui = matin uniquement, aprem vide
                              → non = aprem uniquement, matin vide
                            (un salarié qui ne travaille que l'après-midi ne doit pas
                            voir ses heures dans la colonne 'Matin') */}
                        {(() => {
                          let matinDeb = "", matinFin = "", apremDeb = "", apremFin = "";
                          if (row.debut) {
                            if (row.debutAprem) {
                              // Pause explicite → 4 cellules remplies
                              matinDeb = row.debut;
                              matinFin = row.fin;
                              apremDeb = row.debutAprem;
                              apremFin = row.finAprem;
                            } else {
                              // Journée continue, classement selon l'heure de début
                              const debutMin = heureToMin(row.debut);
                              if (debutMin < 13 * 60) {
                                // Commence avant 13h → considéré matin (même si déborde sur l'aprem)
                                matinDeb = row.debut;
                                matinFin = row.fin;
                              } else {
                                // Commence après 13h → uniquement aprem
                                apremDeb = row.debut;
                                apremFin = row.fin;
                              }
                            }
                          }
                          const cellStyle = { padding: "2px 4px", borderBottom: "1px solid #eef2f7", textAlign: "center" as const, fontWeight: 600 };
                          const colorIf = (v: string) => v ? "#1e293b" : "#d1d5db";
                          // Jour d'absence sans travail : libellé sur les 4 colonnes horaires
                          if (row.absenceLabel && row.duree === 0) {
                            return (
                              <td colSpan={4} style={{ ...cellStyle, color: "#0284c7", fontStyle: "italic", background: "#f0f9ff" }}>
                                {row.absenceLabel}{row.absenceMin ? ` · ${fmtDuree(row.absenceMin)}` : ""}
                              </td>
                            );
                          }
                          return <>
                            <td style={{ ...cellStyle, color: colorIf(matinDeb) }}>{matinDeb || "—"}</td>
                            <td style={{ ...cellStyle, color: colorIf(matinFin) }}>{matinFin || "—"}</td>
                            <td style={{ ...cellStyle, color: colorIf(apremDeb) }}>{apremDeb || "—"}</td>
                            <td style={{ ...cellStyle, color: colorIf(apremFin) }}>{apremFin || "—"}</td>
                          </>;
                        })()}
                        {/* Durée + indication pause si présente */}
                        <td style={{ padding: "2px 4px", borderBottom: "1px solid #eef2f7", textAlign: "center", fontWeight: 700, color: row.duree > 0 ? "#1e3a5f" : "#d1d5db", lineHeight: 1.15 }}>
                          {row.duree > 0 ? (
                            <>
                              {fmtDuree(row.duree)}
                              {row.pauseMin > 0 && (
                                <div style={{ fontSize: 7, fontWeight: 500, color: "#94a3b8" }}>pause {fmtDuree(row.pauseMin)}</div>
                              )}
                            </>
                          ) : "—"}
                        </td>
                        <td style={{ padding: "2px 4px", borderBottom: "1px solid #eef2f7" }}>
                          {row.duree > 0 && <div style={{ borderBottom: "1px solid #cbd5e1", width: "80%", margin: "0 auto", height: 12 }} />}
                        </td>
                      </tr>,
                    ];
                  })}
                  {/* Dernière semaine summary */}
                  {(() => {
                    const lastWs = weekSummaries.find(w => w.isoWeek === lastWeek);
                    if (!lastWs) return null;
                    return (
                      <tr style={{ background: "#eef2ff" }}>
                        <td colSpan={6} style={{ padding: "3px 6px", textAlign: "right", fontWeight: 700, color: "#1e3a5f", borderBottom: "2px solid #cbd5e1", fontSize: 9 }}>
                          Sem. {lastWs.isoWeek.split("-W")[1]}
                        </td>
                        <td style={{ padding: "3px 4px", textAlign: "center", fontWeight: 800, color: "#1e3a5f", borderBottom: "2px solid #cbd5e1", fontSize: 9 }}>
                          {fmtDuree(lastWs.travaille)}
                          {lastWs.aVenir ? (
                            <span style={{ color: "#94a3b8", fontSize: 8, marginLeft: 3, fontStyle: "italic" }}>à venir</span>
                          ) : (
                            <>
                              {lastWs.absMin > 0 && <span style={{ color: "#0ea5e9", fontSize: 8, marginLeft: 3 }}>+{fmtDuree(lastWs.absMin)} abs.</span>}
                              {lastWs.surplus > 0 && <span style={{ color: lastWs.mode === "recup" ? "#0f766e" : "#dc2626", fontSize: 8, marginLeft: 3 }}>+{fmtDuree(lastWs.surplus)} {lastWs.mode === "recup" ? "récup" : "sup"}</span>}
                              {lastWs.deficit > 0 && <span style={{ color: "#b45309", fontSize: 8, marginLeft: 3 }}>−{fmtDuree(lastWs.deficit)}</span>}
                            </>
                          )}
                        </td>
                        <td style={{ borderBottom: "2px solid #cbd5e1" }}></td>
                      </tr>
                    );
                  })()}
                </tbody>
                <tfoot>
                  <tr style={{ background: "#f1f5f9" }}>
                    <td colSpan={6} style={{ padding: "4px 6px", fontWeight: 800, color: "#1e3a5f", textAlign: "right", borderTop: "2px solid #e2e8f0", fontSize: 10 }}>
                      Total du mois
                    </td>
                    <td style={{ padding: "4px 4px", fontWeight: 800, color: "#1e3a5f", textAlign: "center", borderTop: "2px solid #e2e8f0", fontSize: 10 }}>
                      {fmtDuree(totalMois)}
                    </td>
                    <td style={{ borderTop: "2px solid #e2e8f0" }}></td>
                  </tr>
                  {totalSupPayee > 0 && (
                    <tr style={{ background: "#fef2f2" }}>
                      <td colSpan={6} style={{ padding: "4px 6px", fontWeight: 800, color: "#dc2626", textAlign: "right", fontSize: 10 }}>
                        Heures supplémentaires payées
                      </td>
                      <td style={{ padding: "4px 4px", fontWeight: 800, color: "#dc2626", textAlign: "center", fontSize: 10 }}>
                        {fmtDuree(totalSupPayee)}
                      </td>
                      <td></td>
                    </tr>
                  )}
                  <tr style={{ background: "#f0fdfa" }}>
                    <td colSpan={6} style={{ padding: "4px 6px", fontWeight: 800, color: compteurPrev < 0 ? "#dc2626" : "#0f766e", textAlign: "right", fontSize: 10 }}>
                      Compteur récupération (cumul)
                    </td>
                    <td style={{ padding: "4px 4px", fontWeight: 800, color: compteurPrev < 0 ? "#dc2626" : "#0f766e", textAlign: "center", fontSize: 10 }}>
                      {fmtSigne(compteurPrev)}
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>

              {/* Signatures */}
              <div style={{ marginTop: 16, display: "flex", justifyContent: "space-between", gap: 30 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: "sans-serif", fontSize: 9, fontWeight: 700, color: "#475569", marginBottom: 6 }}>Signature du salarié</div>
                  <div style={{ borderBottom: "1px solid #94a3b8", height: 30 }} />
                  <div style={{ fontFamily: "sans-serif", fontSize: 8, color: "#94a3b8", marginTop: 3 }}>{sal.nom} · Date :</div>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: "sans-serif", fontSize: 9, fontWeight: 700, color: "#475569", marginBottom: 6 }}>Signature de l'employeur</div>
                  <div style={{ borderBottom: "1px solid #94a3b8", height: 30 }} />
                  <div style={{ fontFamily: "sans-serif", fontSize: 8, color: "#94a3b8", marginTop: 3 }}>Nicolas Richard · Date :</div>
                </div>
              </div>
            </div>
          );
        })
      )}

      <style>{`
        @media print {
          .no-print, nav, header, [data-sidebar], [data-header] { display: none !important; }
          .print-page {
            page-break-after: always;
            page-break-inside: avoid;
            border: none !important;
            padding: 8px !important;
            box-shadow: none !important;
            margin: 0 !important;
          }
          .print-page:last-child { page-break-after: auto; }
          body { background: white !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          @page { size: A4 portrait; margin: 10mm 8mm; }
        }
      `}</style>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Panneau RH (non imprimé) : contrat, compteur de récupération, modes hebdo, absences
// ─────────────────────────────────────────────────────────────────────────────
function PanneauRH({
  sal, weekSummaries, compteurStocke, previsionMois, compteurPrev, absences,
  onMajSalarie, onAjouterAbsence, onSupprimerAbsence, onSetMode, onAppliquerSemaine, onDecloturer, onAjusterCompteur,
}: {
  sal: Salarie;
  weekSummaries: WeekSummary[];
  weeksOfMonth: string[];
  compteurStocke: number; previsionMois: number; compteurPrev: number;
  absences: Absence[];
  onMajSalarie: (salId: string, patch: Partial<Salarie>) => void;
  onAjouterAbsence: (sal: Salarie, date: string, type: TypeAbsence, dureeMin: number) => void;
  onSupprimerAbsence: (absId: string) => void;
  onSetMode: (salId: string, semaine: string, mode: "paye" | "recup") => void;
  onAppliquerSemaine: (sal: Salarie, semaine: string, contributionMin: number) => void;
  onDecloturer: (sal: Salarie, semaine: string) => void;
  onAjusterCompteur: (sal: Salarie, deltaMin: number) => void;
}) {
  const [absDate, setAbsDate] = useState("");
  const [absType, setAbsType] = useState<TypeAbsence>("conge_paye");
  const [absDuree, setAbsDuree] = useState("");
  const jourDefautMin = jourMinDe(sal);
  const inp = "px-2 py-1.5 rounded-md border border-gray-200 font-body text-sm bg-white focus:border-blue-400 focus:outline-none";

  return (
    <div className="no-print mb-4 rounded-xl border border-blue-100 bg-blue-50/40 p-3 flex flex-col gap-3">
      <div className="font-display text-sm font-bold text-blue-900 flex items-center gap-2"><Wallet size={15} /> Suivi RH — {sal.nom}</div>

      {/* Contrat */}
      <div className="flex flex-wrap items-center gap-3">
        <label className="font-body text-xs text-slate-600 flex items-center gap-1">
          Contrat (h/sem.)
          <input type="number" min="0" step="0.5" defaultValue={sal.heuresContratSemaine ?? 35}
            onBlur={e => onMajSalarie(sal.id, { heuresContratSemaine: parseFloat(e.target.value) || 35 })}
            className={`${inp} w-20`} />
        </label>
        <label className="font-body text-xs text-slate-600 flex items-center gap-1">
          Jours/sem.
          <input type="number" min="1" max="7" step="1" defaultValue={sal.joursTravailles ?? 5}
            onBlur={e => onMajSalarie(sal.id, { joursTravailles: parseInt(e.target.value) || 5 })}
            className={`${inp} w-16`} />
        </label>
        <span className="font-body text-[11px] text-slate-400">1 jour d'absence ≈ {fmtDuree(jourDefautMin)}</span>
      </div>

      {/* Compteur */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg bg-white border border-gray-100 px-3 py-2">
        <span className="font-body text-xs text-slate-600">Compteur récup. :</span>
        <span className={`font-body text-sm font-bold ${compteurPrev < 0 ? "text-red-600" : "text-teal-700"}`}>{fmtSigne(compteurPrev)}</span>
        <span className="font-body text-[11px] text-slate-400">(acquis {fmtSigne(compteurStocke)} · prévision mois {fmtSigne(previsionMois)})</span>
        <span className="ml-auto flex items-center gap-1">
          <button onClick={() => onAjusterCompteur(sal, -60)} className="px-2 py-1 rounded bg-gray-100 text-xs font-semibold">−1h</button>
          <button onClick={() => onAjusterCompteur(sal, -30)} className="px-2 py-1 rounded bg-gray-100 text-xs font-semibold">−30</button>
          <button onClick={() => onAjusterCompteur(sal, 30)} className="px-2 py-1 rounded bg-gray-100 text-xs font-semibold">+30</button>
          <button onClick={() => onAjusterCompteur(sal, 60)} className="px-2 py-1 rounded bg-gray-100 text-xs font-semibold">+1h</button>
        </span>
      </div>

      {/* Semaines du mois */}
      {weekSummaries.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {weekSummaries.map(w => (
            <div key={w.isoWeek} className="flex flex-wrap items-center gap-2 text-xs font-body">
              <span className="font-semibold text-slate-700 w-16 shrink-0">Sem. {w.isoWeek.split("-W")[1]}</span>
              <span className="text-slate-500">{fmtDuree(w.travaille)} / cible {fmtDuree(w.cible)}{w.absMin > 0 ? <span className="text-sky-600"> · {fmtDuree(w.absMin)} congé</span> : null}</span>
              {w.aVenir ? (
                <span className="text-slate-400 italic">à venir</span>
              ) : w.surplus === 0 && w.deficit === 0 ? (
                <span className="text-emerald-600">à l'équilibre</span>
              ) : (
                <>
                  {w.surplus > 0 && (
                    <span className="inline-flex rounded-md overflow-hidden border border-gray-200">
                      <button onClick={() => onSetMode(sal.id, w.isoWeek, "paye")} disabled={w.clos}
                        className={`px-2 py-1 ${w.mode === "paye" ? "bg-red-500 text-white" : "bg-white text-slate-500"} disabled:opacity-40`}>sup payée</button>
                      <button onClick={() => onSetMode(sal.id, w.isoWeek, "recup")} disabled={w.clos}
                        className={`px-2 py-1 ${w.mode === "recup" ? "bg-teal-600 text-white" : "bg-white text-slate-500"} disabled:opacity-40`}>récup</button>
                    </span>
                  )}
                  {w.surplus > 0 && <span className={w.mode === "recup" ? "text-teal-700 font-semibold" : "text-red-600 font-semibold"}>+{fmtDuree(w.surplus)}</span>}
                  {w.deficit > 0 && <span className="text-amber-700 font-semibold">−{fmtDuree(w.deficit)} déficit</span>}
                </>
              )}
              {!w.aVenir && (
                w.clos ? (
                  <span className="ml-auto inline-flex items-center gap-2">
                    <span className="text-slate-400">intégré ✓</span>
                    <button onClick={() => onDecloturer(sal, w.isoWeek)}
                      className="px-2 py-1 rounded bg-gray-100 text-slate-600 font-semibold hover:bg-gray-200">Rouvrir</button>
                  </span>
                ) : (
                  <button onClick={() => onAppliquerSemaine(sal, w.isoWeek, w.contribution)}
                    className="ml-auto px-2 py-1 rounded bg-blue-600 text-white font-semibold">
                    Clôturer ({fmtSigne(w.contribution)})
                  </button>
                )
              )}
            </div>
          ))}
        </div>
      )}

      {/* Absences */}
      <div className="flex flex-col gap-2">
        <div className="font-body text-xs font-semibold text-slate-600 flex items-center gap-1"><Calendar size={13} /> Congés / absences du mois</div>
        {absences.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {[...absences].sort((a, b) => a.date.localeCompare(b.date)).map(a => (
              <span key={a.id} className="inline-flex items-center gap-1 rounded-full bg-white border border-gray-200 px-2 py-1 text-[11px] font-body">
                {new Date(a.date + "T12:00:00").toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })} · {LIBELLE_ABSENCE[a.type]} · {fmtDuree(a.dureeMinutes)}
                <button onClick={() => onSupprimerAbsence(a.id)} className="text-slate-300 hover:text-red-500"><Trash2 size={12} /></button>
              </span>
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-end gap-2">
          <input type="date" value={absDate} onChange={e => setAbsDate(e.target.value)} className={`${inp} w-36`} />
          <select value={absType} onChange={e => setAbsType(e.target.value as TypeAbsence)} className={inp}>
            {(Object.keys(LIBELLE_ABSENCE) as TypeAbsence[]).map(t => <option key={t} value={t}>{LIBELLE_ABSENCE[t]}</option>)}
          </select>
          <input type="number" min="0" step="0.5" value={absDuree} onChange={e => setAbsDuree(e.target.value)}
            placeholder={`${(jourDefautMin / 60).toFixed(1)}h`} className={`${inp} w-20`} title="Durée en heures. Laisser vide = une journée." />
          <button
            onClick={() => {
              if (!absDate) return;
              const dureeMin = absDuree ? Math.round(parseFloat(absDuree) * 60) : jourDefautMin;
              onAjouterAbsence(sal, absDate, absType, dureeMin);
              setAbsDate(""); setAbsDuree("");
            }}
            className="px-3 py-1.5 rounded-md bg-blue-600 text-white font-body text-sm font-semibold inline-flex items-center gap-1">
            <Plus size={14} /> Ajouter
          </button>
        </div>
        <div className="font-body text-[11px] text-slate-400">Congé payé / récup / maladie / férié neutralisent le contrat du jour (ni déficit ni heures sup dessus). « Sans solde » ne neutralise pas.</div>
      </div>
    </div>
  );
}
