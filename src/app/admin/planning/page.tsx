"use client";
/**
 * src/app/admin/planning/page.tsx
 *
 * Le planning admin : l'écran depuis lequel Nicolas crée ses créneaux, les
 * modifie, les duplique, les supprime, et inscrit ou désinscrit les cavaliers.
 *
 * Ce fichier est désormais l'ORCHESTRATEUR et rien d'autre : il tient l'état
 * (période affichée, créneau sélectionné, formulaires ouverts), charge les
 * données, et assemble les vues. Tout ce qui décide, calcule ou écrit vit à
 * côté, dans des modules qu'on peut lire seuls :
 *
 *  - planning-enroll.ts / planning-unenroll.ts : inscription et
 *    désinscription — les deux seules opérations qui créent ou rendent de
 *    l'argent (paiements, encaissements, avoirs, rattrapages) ;
 *  - planning-creneaux.ts : création, édition, duplication et suppression des
 *    créneaux, avec leurs garde-fous ;
 *  - planning-emails.ts, planning-notifications.ts : ce qui part vers les
 *    familles et vers l'équipe ;
 *  - planning-impression.ts, planning-ia.ts : export PDF et analyse IA ;
 *  - WeekView / TimelineView / MonthView / DayView / BarreActionsPlanning /
 *    PanneauIA / EnrollPanel : l'affichage.
 */
import { useState, useEffect, useMemo } from "react";
import { collection, getDocs, addDoc, deleteDoc, doc, query, where, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAgentContext } from "@/hooks/useAgentContext";
import { duplicateWeekCreneaux } from "@/lib/planning-services";
import { Card } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import {
  fetchVacationPeriods,
  fetchDiscountSettings,
  type VacationPeriod,
  type DiscountSettings,
} from "@/lib/discounts";
import { X, Check, Loader2 } from "lucide-react";
import type { Activity, Family } from "@/types";
import { Creneau, EnrolledChild, getWeekDates, fmtDate, compareCreneaux } from "./types";
import EnrollPanel from "./EnrollPanel";
import PeriodGenerator from "./PeriodGenerator";
import SimpleCreneauForm from "./SimpleCreneauForm";
import RdvModal, { RDV_CATEGORIES } from "./RdvModal";
import DeleteCreneauModal from "./DeleteCreneauModal";
import EditCreneauModal from "./EditCreneauModal";
import DuplicateCreneauModal from "./DuplicateCreneauModal";
import MonthView from "./MonthView";
import TimelineView from "./TimelineView";
import WeekView from "./WeekView";
import BarreActionsPlanning from "./BarreActionsPlanning";
import PanneauIA from "./PanneauIA";
import DayView from "./DayView";
import { notifyPlanningChange } from "./planning-notifications";
import {
  estTypeStage,
  creerCreneaux,
  messageCreationCreneaux,
  chargerComptagesSuppression,
  supprimerCreneaux,
  chargerJoursDuStage,
  enregistrerModificationCreneau,
  dupliquerCreneauSurDates,
  compterListesAttente,
} from "./planning-creneaux";
import { notifierFamillesInscrites } from "./planning-emails";
import { exporterPlanningPDF } from "./planning-impression";
import { analyserPlanningIA } from "./planning-ia";
import { inscrireCavalier } from "./planning-enroll";
import { desinscrireCavalier } from "./planning-unenroll";
export default function PlanningPage() {
  const { toast } = useToast();
  const { setAgentContext } = useAgentContext("planning");
  const [weekOffset, setWeekOffset] = useState(0); const [dayOffset, setDayOffset] = useState(0);
  const [monthOffset, setMonthOffset] = useState(0);
  const [viewMode, setViewMode] = useState<"week"|"day"|"month"|"timeline">("week");
  const [creneaux, setCreneaux] = useState<(Creneau & { id: string })[]>([]);
  // Nombre d'enfants en liste d'attente, par creneau. Charge en UNE requete
  // pour toute la periode affichee plutot qu'une par carte.
  const [waitCounts, setWaitCounts] = useState<Record<string, number>>({});
  const [activities, setActivities] = useState<Activity[]>([]);
  const [families, setFamilies] = useState<(Family & { firestoreId: string })[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [allCartes, setAllCartes] = useState<any[]>([]);
  const [allForfaits, setAllForfaits] = useState<any[]>([]);
  const [vacationPeriods, setVacationPeriods] = useState<VacationPeriod[]>([]);
  const [discountSettings, setDiscountSettings] = useState<DiscountSettings>({
    familyDiscount: [],
    multiStageDiscount: [],
  });

  // ── IA Planning ───────────────────────────────────────────────────────────
  const [iaLoading, setIaLoading] = useState(false);
  const [iaSuggestions, setIaSuggestions] = useState<string | null>(null);
  const [iaStats, setIaStats] = useState<any>(null);
  const [showIaPanel, setShowIaPanel] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showSimple, setShowSimple] = useState(false); const [showGenerator, setShowGenerator] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string|undefined>();
  const [selectedCreneau, setSelectedCreneau] = useState<(Creneau & { id: string })|null>(null);

  // ── Synchro selectedCreneau avec la liste rechargée ─────────────────
  // Quand handleEnroll/handleUnenroll appelle fetchData(), la liste
  // `creneaux` est mise à jour mais `selectedCreneau` (utilisé par
  // EnrollPanel) garde sa copie obsolète → l'UI affichait les anciennes
  // données jusqu'à fermer/rouvrir le panel. Ce useEffect remplace la
  // copie à chaque fois qu'on détecte un changement sur le même id.
  useEffect(() => {
    if (!selectedCreneau) return;
    const fresh = creneaux.find(c => c.id === selectedCreneau.id);
    if (!fresh) return;
    // Comparaison sommaire (longueur d'enrolled + count) pour éviter
    // un setState à chaque render. Un changement de ces deux valeurs
    // couvre 99% des cas d'inscription/désinscription.
    const dirty =
      (fresh.enrolled?.length || 0) !== (selectedCreneau.enrolled?.length || 0) ||
      (fresh.enrolledCount || 0) !== (selectedCreneau.enrolledCount || 0);
    if (dirty) setSelectedCreneau(fresh as any);
  }, [creneaux, selectedCreneau]);
  const [editCreneau, setEditCreneau] = useState<(Creneau & { id: string })|null>(null);
  const [editForm, setEditForm] = useState<any>({});
  const [editSaving, setEditSaving] = useState(false);
  const [editApplyAll, setEditApplyAll] = useState(false);
  const [editApplyStage, setEditApplyStage] = useState(false);
  const [editStageDays, setEditStageDays] = useState<{ id: string; date: string }[]>([]);
  const [editSelectedDayIds, setEditSelectedDayIds] = useState<string[]>([]);
  const [showDuplicate, setShowDuplicate] = useState(false); const [dupWeeks, setDupWeeks] = useState(1); const [duplicating, setDuplicating] = useState(false);
  // ─── Menus déroulants barre d'actions (moderne) ───
  const [menuAddOpen, setMenuAddOpen] = useState(false);
  const [menuMoreOpen, setMenuMoreOpen] = useState(false);
  useEffect(() => {
    if (!menuAddOpen && !menuMoreOpen) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-menu='add']") && !target.closest("[data-menu='more']")) {
        setMenuAddOpen(false);
        setMenuMoreOpen(false);
      }
    };
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [menuAddOpen, menuMoreOpen]);
  // Raccourci clavier global : 'N' ouvre le menu "+ Ajouter"
  useEffect(() => {
    const openAddMenu = () => setMenuAddOpen(true);
    window.addEventListener("planning:open-add-menu", openAddMenu);
    return () => window.removeEventListener("planning:open-add-menu", openAddMenu);
  }, []);
  const [duplicateCreneau, setDuplicateCreneau] = useState<(Creneau & { id: string })|null>(null);

  // ─── RDV Pro ───
  const [rdvPros, setRdvPros] = useState<any[]>([]);
  const [showRdvForm, setShowRdvForm] = useState(false);
  const [rdvForm, setRdvForm] = useState({ title: "", date: "", startTime: "09:00", endTime: "10:00", category: "veterinaire", notes: "", reminderEmail: "", reminderDays: 1 });

  const weekDates = useMemo(() => getWeekDates(weekOffset), [weekOffset]);
  const currentDay = useMemo(() => { const d = new Date(); d.setDate(d.getDate() + dayOffset); return d; }, [dayOffset]);

  // ─── Mois courant ───
  const currentMonth = useMemo(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + monthOffset);
    return d;
  }, [monthOffset]);

  const monthDays = useMemo(() => {
    const y = currentMonth.getFullYear(), m = currentMonth.getMonth();
    const first = new Date(y, m, 1);
    const last = new Date(y, m + 1, 0);
    const startDay = (first.getDay() + 6) % 7; // lundi = 0
    const days: (Date | null)[] = [];
    for (let i = 0; i < startDay; i++) days.push(null);
    for (let d = 1; d <= last.getDate(); d++) days.push(new Date(y, m, d));
    while (days.length % 7 !== 0) days.push(null);
    return days;
  }, [currentMonth]);

  const fetchData = async () => {
    try {
      const [aS, fS, pS, cartesS, forfaitsS] = await Promise.all([getDocs(collection(db, "activities")), getDocs(collection(db, "families")), getDocs(collection(db, "payments")), getDocs(collection(db, "cartes")), getDocs(query(collection(db, "forfaits"), where("status", "==", "actif")))]);
      setActivities(aS.docs.map(d => ({ id: d.id, ...d.data() })) as Activity[]);
      setFamilies(fS.docs.map(d => ({ firestoreId: d.id, ...d.data() })) as any);
      setPayments(pS.docs.map(d => ({ id: d.id, ...d.data() })));
      setAllCartes(cartesS.docs.map(d => ({ id: d.id, ...d.data() })));
      setAllForfaits(forfaitsS.docs.map(d => ({ id: d.id, ...d.data() })));

      // Charger périodes de vacances + barèmes de réduction (une fois par fetch)
      try {
        const [periods, settings] = await Promise.all([
          fetchVacationPeriods(),
          fetchDiscountSettings(),
        ]);
        setVacationPeriods(periods);
        setDiscountSettings(settings);
      } catch (e) { console.error("[planning] chargement discounts failed:", e); }

      let s: string, e: string;
      if (viewMode === "day") { s = fmtDate(currentDay); e = s; }
      else if (viewMode === "month") {
        const y = currentMonth.getFullYear(), m = currentMonth.getMonth();
        s = fmtDate(new Date(y, m, 1));
        e = fmtDate(new Date(y, m + 1, 0));
      } else { s = fmtDate(weekDates[0]); e = fmtDate(weekDates[6]); }

      const cS = await getDocs(query(collection(db, "creneaux"), where("date", ">=", s), where("date", "<=", e)));
      const creneauxData = cS.docs.map(d => ({ id: d.id, ...d.data() })) as any;
      setCreneaux(creneauxData);

      // Enrichir le contexte de l'agent avec les données du planning
      const todayStr = fmtDate(new Date());
      setAgentContext({
        vue_planning: viewMode,
        creneaux_visibles: creneauxData.slice(0, 30).map((c: any) => ({
          id: c.id,
          titre: c.activityTitle,
          type: c.activityType,
          date: c.date,
          heure: `${c.startTime}-${c.endTime}`,
          inscrits: c.enrolledCount || 0,
          places: c.maxPlaces || 0,
          statut: c.status || "planned",
        })),
        creneaux_aujourd_hui: creneauxData
          .filter((c: any) => c.date === todayStr)
          .map((c: any) => `${c.activityTitle} ${c.startTime} (${c.enrolledCount||0}/${c.maxPlaces})`),
        activites_disponibles: aS.docs.map(d => ({ id: d.id, titre: (d.data() as any).title, type: (d.data() as any).type, prix: (d.data() as any).priceTTC })).slice(0, 20),
      });

      // RDV Pro
      try {
        const rS = await getDocs(collection(db, "rdv_pro"));
        setRdvPros(rS.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch { setRdvPros([]); }
    } catch(e) { console.error(e); }
    setLoading(false);
  };
  useEffect(() => { setLoading(true); fetchData(); }, [weekOffset, dayOffset, monthOffset, viewMode]);

  // Arrivée depuis le montoir avec ?date=YYYY-MM-DD → se caler sur ce jour, vue Jour.
  useEffect(() => {
    const d = new URLSearchParams(window.location.search).get("date");
    if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const off = Math.round((new Date(d + "T00:00:00").getTime() - today.getTime()) / 86400000);
      if (!isNaN(off)) { setDayOffset(off); setViewMode("day"); }
    }
  }, []);

  // ─── Créer RDV Pro ───
  const handleCreateRdv = async () => {
    if (!rdvForm.title || !rdvForm.date) return;
    try {
      await addDoc(collection(db, "rdv_pro"), {
        ...rdvForm,
        reminderDays: parseInt(String(rdvForm.reminderDays)) || 1,
        reminderSent: false,
        createdAt: serverTimestamp(),
      });
      setShowRdvForm(false);
      setRdvForm({ title: "", date: "", startTime: "09:00", endTime: "10:00", category: "veterinaire", notes: "", reminderEmail: "", reminderDays: 1 });
      fetchData();
    } catch (e) { console.error(e); }
  };

  const handleDeleteRdv = async (id: string) => {
    if (!confirm("Supprimer ce RDV ?")) return;
    await deleteDoc(doc(db, "rdv_pro", id));
    fetchData();
  };

  // rdvCategories importé depuis RdvModal.tsx (RDV_CATEGORIES)
  const rdvCategories = RDV_CATEGORIES;

  const handleCreate = async (nc: Partial<Creneau>[]) => {
    const { created, skipped, rattaches, firstCreated } = await creerCreneaux(nc, activities);
    setShowSimple(false); setShowGenerator(false);
    toast(messageCreationCreneaux(created, rattaches, skipped), "success");
    if (created > 0 && firstCreated) {
      await notifyPlanningChange({
        action: "created",
        activityTitle: firstCreated.activityTitle,
        date: firstCreated.date,
        startTime: firstCreated.startTime,
        endTime: firstCreated.endTime,
        monitor: firstCreated.monitor,
        count: created,
      });
    }
    fetchData();
  };
  const [deleteCreneau, setDeleteCreneau] = useState<(Creneau & { id: string }) | null>(null);
  const [deleteDeleting, setDeleteDeleting] = useState(false);
  const [deleteCount, setDeleteCount] = useState(0);
  const [deleteWeekCount, setDeleteWeekCount] = useState(0); // créneaux du même stage cette semaine
  const [deleteSerieCount, setDeleteSerieCount] = useState(0); // occurrences proches d'une activité non-stage

  const handleDelete = (id: string) => {
    const c = creneaux.find(x => x.id === id);
    if (c) openDelete(c);
  };

  const openDelete = async (c: Creneau & { id: string }) => {
    setDeleteCreneau(c);
    setDeleteDeleting(false);
    setDeleteWeekCount(0);
    setDeleteSerieCount(0);
    const { similaires, stage, serie } = await chargerComptagesSuppression(c);
    setDeleteCount(similaires);
    setDeleteSerieCount(serie);
    setDeleteWeekCount(stage);
  };

  const openEdit = (c: Creneau & { id: string }) => {
    setEditCreneau(c);    setEditForm({ date: c.date, activityId: (c as any).activityId || "", activityType: c.activityType, tvaTaux: (c as any).tvaTaux || 5.5, activityTitle: c.activityTitle, monitor: c.monitor || "", startTime: c.startTime, endTime: c.endTime, maxPlaces: c.maxPlaces, priceTTC: (c as any).priceTTC || 0, color: (c as any).color || "", allowDayBooking: (c as any).allowDayBooking || false, priceTTCDay: (c as any).priceTTCDay || "", themeStage: (c as any).themeStage || "" });
    setEditApplyAll(false);
    // Pour un stage multi-jours : appliquer par défaut à tous les jours du stage
    setEditApplyStage(c.activityType === "stage" || c.activityType === "stage_journee");
  };

  // Quand on ouvre l'édition d'un STAGE : charger la liste de ses jours (semaine)
  // pour permettre de choisir précisément les jours à modifier. Par défaut, seul
  // le jour cliqué est coché.
  useEffect(() => {
    const isStage = editCreneau && (editCreneau.activityType === "stage" || editCreneau.activityType === "stage_journee");
    if (!editCreneau || !isStage) { setEditStageDays([]); setEditSelectedDayIds([]); return; }
    let cancelled = false;
    (async () => {
      const days = await chargerJoursDuStage(editCreneau);
      if (cancelled) return;
      setEditStageDays(days);
      setEditSelectedDayIds([editCreneau.id]);
    })();
    return () => { cancelled = true; };
  }, [editCreneau]);

  const confirmDelete = async (mode: "single" | "similar" | "week" | "serie") => {
    if (!deleteCreneau) return;
    setDeleteDeleting(true);
    const issue = await supprimerCreneaux(mode, deleteCreneau, toast);
    if (issue === "supprime") {
      setDeleteCreneau(null);
      fetchData();
    }
    setDeleteDeleting(false);
  };
  const handleDuplicateWeek = async () => {
    if (creneaux.length === 0) return;
    setDuplicating(true);
    const { count, skipped } = await duplicateWeekCreneaux(creneaux, dupWeeks);
    setDuplicating(false);
    setShowDuplicate(false);
    toast(`${count} créneau${count > 1 ? "x" : ""} créé${count > 1 ? "s" : ""}${skipped > 0 ? ` (${skipped} doublon${skipped > 1 ? "s" : ""})` : ""}`, "success");
    if (count > 0) await notifyPlanningChange({ action: "duplicated", count });
    fetchData();
  };

  const [notifyingEnrolled, setNotifyingEnrolled] = useState(false);
  const handleNotifyEnrolled = () => notifierFamillesInscrites({
    editCreneau, editForm, editSelectedDayIds, families, toast, setNotifyingEnrolled,
  });

  const handleEditSave = async () => {
    if (!editCreneau) return;
    setEditSaving(true);
    const ok = await enregistrerModificationCreneau({ editCreneau, editForm, editSelectedDayIds, editApplyAll, toast });
    if (ok) {
      setEditCreneau(null);
      await fetchData();
    }
    setEditSaving(false);
  };

  const handleDuplicateCreneau = async (dates: string[]) => {
    if (!duplicateCreneau) return;
    const src = duplicateCreneau;
    const { created, skipped } = await dupliquerCreneauSurDates(src, dates);
    setDuplicateCreneau(null);
    setEditCreneau(null);
    toast(`✅ ${created} copie${created > 1 ? "s" : ""} créée${created > 1 ? "s" : ""}${skipped > 0 ? ` · ${skipped} doublon${skipped > 1 ? "s" : ""} ignoré${skipped > 1 ? "s" : ""}` : ""}`, "success");
    if (created > 0) {
      await notifyPlanningChange({
        action: "duplicated",
        activityTitle: src.activityTitle,
        date: dates[0],
        startTime: src.startTime,
        endTime: src.endTime,
        monitor: src.monitor,
        count: created,
      });
    }
    await fetchData();
  };

  const exportPDF = () => exporterPlanningPDF({ viewMode, creneaux, dayCreneaux, currentDay, weekDates });

  const analyserPlanning = () => analyserPlanningIA({
    viewMode, creneaux, dayCreneaux, currentDay, currentMonth, weekDates,
    setIaLoading, setIaSuggestions, setIaStats, setShowIaPanel,
  });
  const refreshCreneaux = async () => { const s=viewMode==="day"?fmtDate(currentDay):fmtDate(weekDates[0]); const e=viewMode==="day"?fmtDate(currentDay):fmtDate(weekDates[6]); const snap=await getDocs(query(collection(db,"creneaux"),where("date",">=",s),where("date","<=",e))); const fresh=snap.docs.map(d=>({id:d.id,...d.data()})) as (Creneau&{id:string})[]; setCreneaux(fresh);
    // Le panneau d'inscription recoit `selectedCreneau`, un objet FIGE au
    // moment de l'ouverture : sans cette resynchro, toute modification faite
    // depuis le panneau (surlignage, affectation poney...) partait bien en
    // base mais n'apparaissait jamais a l'ecran tant qu'on ne fermait pas.
    setSelectedCreneau(prev => prev ? (fresh.find(c => c.id === (prev as any).id) as any) || prev : prev);
    return fresh; };

  // Compteurs de liste d'attente pour les creneaux affiches.
  // Une entree « stage » porte creneauIds (tous les jours de la semaine) et
  // une entree « cours » porte creneauId : on alimente les deux.
  useEffect(() => {
    if (creneaux.length === 0) { setWaitCounts({}); return; }
    let annule = false;
    (async () => {
      try {
        const counts = await compterListesAttente(creneaux);
        if (!annule) setWaitCounts(counts);
      } catch (e) {
        console.error("Compteurs liste d'attente :", e);
      }
    })();
    return () => { annule = true; };
  }, [creneaux]);

  // ── Inscription / désinscription ─────────────────────────────────
  // Les deux seules opérations de cette page qui créent ou rendent de
  // l'argent. Elles vivent dans planning-enroll.ts et planning-unenroll.ts,
  // où elles se relisent d'un bloc ; la page ne fait que leur passer ce
  // qu'elles empruntent à son état.
  const handleEnroll = (cid: string, child: EnrolledChild, payMode?: string, options?: { skipPayment?: boolean; skipEmail?: boolean; freeReason?: string; rattrapageId?: string; competitionItems?: any[]; skipRefresh?: boolean }) =>
    inscrireCavalier(cid, child, payMode, options, {
      creneaux, families, discountSettings, vacationPeriods, toast,
      refreshCreneaux, setSelectedCreneau, setAllForfaits,
    });

  const handleUnenroll = (cid: string, childId: string) =>
    desinscrireCavalier(cid, childId, {
      families, allForfaits, toast, fetchData, refreshCreneaux, setSelectedCreneau,
    });

  const isToday = (d: Date) => fmtDate(d) === fmtDate(new Date());
  const dayCreneaux = creneaux.filter(c => c.date === fmtDate(currentDay)).sort(compareCreneaux);

  return (
    <div>
      <BarreActionsPlanning
        viewMode={viewMode}
        setViewMode={setViewMode}
        currentDay={currentDay}
        creneaux={creneaux}
        dayCreneaux={dayCreneaux}
        menuAddOpen={menuAddOpen}
        setMenuAddOpen={setMenuAddOpen}
        menuMoreOpen={menuMoreOpen}
        setMenuMoreOpen={setMenuMoreOpen}
        showDuplicate={showDuplicate}
        setShowDuplicate={setShowDuplicate}
        setShowSimple={setShowSimple}
        setShowGenerator={setShowGenerator}
        setSelectedDate={setSelectedDate}
        setShowRdvForm={setShowRdvForm}
        exportPDF={exportPDF}
        analyserPlanning={analyserPlanning}
        iaLoading={iaLoading}
      />

      {showSimple && <SimpleCreneauForm activities={activities} onSave={handleCreate} onCancel={()=>setShowSimple(false)} defaultDate={selectedDate}/>}
      {showGenerator && <PeriodGenerator activities={activities} onGenerate={handleCreate} onCancel={()=>setShowGenerator(false)}/>}
      {showDuplicate && <Card padding="md" className="mb-6 border-gold-400/20 bg-gold-50"><div className="flex justify-between items-center mb-3"><h3 className="font-body text-base font-semibold text-blue-800">📋 Dupliquer semaine</h3><button onClick={()=>setShowDuplicate(false)} className="text-slate-600 bg-transparent border-none cursor-pointer"><X size={18}/></button></div><div className="flex items-center gap-4 mb-3"><label className="font-body text-sm text-blue-800">Semaines:</label><input type="number" min={1} max={20} value={dupWeeks} onChange={e=>setDupWeeks(parseInt(e.target.value)||1)} className="w-20 px-3 py-2 rounded-lg border border-blue-500/8 font-body text-sm bg-white text-center"/></div><button onClick={handleDuplicateWeek} disabled={duplicating} className={`flex items-center gap-2 px-6 py-2.5 rounded-lg font-body text-sm font-semibold border-none cursor-pointer ${duplicating?"bg-gray-200 text-slate-600":"bg-gold-400 text-blue-800"}`}>{duplicating?<Loader2 size={16} className="animate-spin"/>:<Check size={16}/>} Dupliquer</button></Card>}


      {/* ── Panneau suggestions IA ── */}
      {showIaPanel && (
        <PanneauIA
          iaStats={iaStats}
          iaLoading={iaLoading}
          iaSuggestions={iaSuggestions}
          onClose={() => { setShowIaPanel(false); setIaSuggestions(null); setIaStats(null); }}
        />
      )}

      {viewMode === "week" && (
        <WeekView
          loading={loading}
          weekDates={weekDates}
          creneaux={creneaux}
          payments={payments}
          onPrev={() => setWeekOffset(w => w - 1)}
          onNext={() => setWeekOffset(w => w + 1)}
          onToday={() => setWeekOffset(0)}
          onPickDate={setWeekOffset}
          onSelectCreneau={setSelectedCreneau}
          onOpenDelete={openDelete}
          onOpenEdit={openEdit}
          onAddCreneau={ds => { setSelectedDate(ds); setShowSimple(true); setShowGenerator(false); }}
          onGoToDay={d => { setViewMode("day"); setDayOffset(Math.round((d.getTime() - new Date().getTime()) / 86400000)); }}
        />
      )}

      {/* ═══ VUE TIMELINE (style Celeris) ═══ */}
      {viewMode === "timeline" && (
        <TimelineView
          loading={loading}
          weekDates={weekDates}
          creneaux={creneaux}
          payments={payments}
          onPrev={() => setWeekOffset(w => w - 1)}
          onNext={() => setWeekOffset(w => w + 1)}
          onToday={() => setWeekOffset(0)}
          onSelectCreneau={setSelectedCreneau}
          onAddCreneau={ds => { setSelectedDate(ds); setShowSimple(true); setShowGenerator(false); }}
          onGoToDay={d => { setViewMode("day"); setDayOffset(Math.round((d.getTime() - new Date().getTime()) / 86400000)); }}
        />
      )}

      {viewMode==="day" && (
        <DayView
          loading={loading}
          currentDay={currentDay}
          dayCreneaux={dayCreneaux}
          payments={payments}
          families={families}
          waitCounts={waitCounts}
          setDayOffset={setDayOffset}
          setSelectedCreneau={setSelectedCreneau}
          setEditCreneau={setEditCreneau}
          setEditForm={setEditForm}
          setEditApplyAll={setEditApplyAll}
          openDelete={openDelete}
        />
      )}

      {/* ═══ VUE MENSUELLE ═══ */}
      {viewMode === "month" && (
        <MonthView
          loading={loading}
          currentMonth={currentMonth}
          monthDays={monthDays}
          creneaux={creneaux}
          rdvPros={rdvPros}
          onPrev={() => setMonthOffset(m => m - 1)}
          onNext={() => setMonthOffset(m => m + 1)}
          onToday={() => setMonthOffset(0)}
          onGoToDay={d => { setViewMode("day"); setDayOffset(Math.round((d.getTime() - new Date().setHours(0,0,0,0)) / 86400000)); }}
          onDeleteRdv={handleDeleteRdv}
        />
      )}

      <div className="mt-6 flex gap-4 flex-wrap">
        {[["text-blue-500",(viewMode==="day"?dayCreneaux:creneaux).length,"créneaux"],["text-green-600",(viewMode==="day"?dayCreneaux:creneaux).reduce((s:number,c:any)=>s+(c.enrolled?.length||0),0),"inscrits"],["text-gold-400",(viewMode==="day"?dayCreneaux:creneaux).reduce((s:number,c:any)=>s+c.maxPlaces,0),"places"]].map(([col,val,lab],i)=>(
          <Card key={i} padding="sm" className="flex items-center gap-3"><span className={`font-body text-xl font-bold ${col}`}>{val}</span><span className="font-body text-xs text-slate-600">{lab as string}</span></Card>
        ))}
      </div>

      {/* ═══ MODAL : RDV Pro ═══ */}
      {showRdvForm && (
        <RdvModal
          form={rdvForm}
          onChange={setRdvForm}
          onClose={() => setShowRdvForm(false)}
          onSave={handleCreateRdv}
        />
      )}

      {selectedCreneau&&<EnrollPanel creneau={selectedCreneau as any} families={families} allCreneaux={creneaux} payments={payments} allCartes={allCartes} allForfaits={allForfaits} onClose={()=>{setSelectedCreneau(null);fetchData();}} onEnroll={handleEnroll} onUnenroll={handleUnenroll} onRefresh={async ()=>{await refreshCreneaux(); try { const fs = await getDocs(query(collection(db, "forfaits"), where("status", "==", "actif"))); setAllForfaits(fs.docs.map(d => ({ id: d.id, ...d.data() }))); } catch(e){} }}/>}

      {/* ── Modal suppression créneau ── */}
      {deleteCreneau && (
        <DeleteCreneauModal
          creneau={deleteCreneau}
          deleting={deleteDeleting}
          deleteCount={deleteCount}
          deleteWeekCount={deleteWeekCount}
          deleteSerieCount={deleteSerieCount}
          isStageType={estTypeStage}
          onClose={() => setDeleteCreneau(null)}
          onConfirm={confirmDelete}
        />
      )}

      {/* ── Modal édition créneau ── */}
      {editCreneau && (
        <EditCreneauModal
          creneau={editCreneau}
          form={editForm}
          activities={activities}
          onNotifyEnrolled={handleNotifyEnrolled}
          notifyingEnrolled={notifyingEnrolled}
          saving={editSaving}
          applyAll={editApplyAll}
          applyStage={editApplyStage}
          onApplyStageChange={setEditApplyStage}
          stageDays={editStageDays}
          selectedDayIds={editSelectedDayIds}
          onSelectedDayIdsChange={setEditSelectedDayIds}
          onFormChange={setEditForm}
          onApplyAllChange={setEditApplyAll}
          onClose={() => setEditCreneau(null)}
          onSave={handleEditSave}
          onDuplicate={() => setDuplicateCreneau(editCreneau)}
        />
      )}

      {/* ── Modal duplication créneau ── */}
      {duplicateCreneau && (
        <DuplicateCreneauModal
          creneau={duplicateCreneau}
          onDuplicate={handleDuplicateCreneau}
          onClose={() => setDuplicateCreneau(null)}
        />
      )}
    </div>
  );
}
