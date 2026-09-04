"use client";
import { useState, useEffect, useMemo } from "react";
import { toLocalDateString } from "@/lib/date-local";
import { estPerimee } from "@/lib/waitlist-cleanup";
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, where, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAgentContext } from "@/hooks/useAgentContext";
import { duplicateWeekCreneaux } from "@/lib/planning-services";
import { Card, Badge } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { dateSaisieComplete } from "@/lib/date-saisie";
import {
  fetchVacationPeriods,
  fetchDiscountSettings,
  type VacationPeriod,
  type DiscountSettings,
} from "@/lib/discounts";
import { Plus, ChevronLeft, ChevronRight, X, Check, Calendar, Loader2, Trash2, CalendarDays, Briefcase, Sparkles, Printer, Settings, MoreHorizontal, Copy } from "lucide-react";
import type { Activity, Family } from "@/types";
import { Creneau, EnrolledChild, typeColors, getWeekDates, fmtDate, fmtDateFR, fmtMonthFR, compareCreneaux, statutPaiementCavalier, sameStage, ageCavalier } from "./types";
import { libellePrixCreneau } from "@/lib/tarif-forfaitaire";
import EnrollPanel from "./EnrollPanel";
import { inscrireCavalier, desinscrireCavalier, type ContexteInscription } from "./inscription-actions";
import PeriodGenerator from "./PeriodGenerator";
import SimpleCreneauForm from "./SimpleCreneauForm";
import RdvModal, { RDV_CATEGORIES } from "./RdvModal";
import DeleteCreneauModal from "./DeleteCreneauModal";
import EditCreneauModal from "./EditCreneauModal";
import DuplicateCreneauModal from "./DuplicateCreneauModal";
import MareesBandeau from "@/components/MareesBandeau";
import MonthView from "./MonthView";
import TimelineView from "./TimelineView";
import WeekView from "./WeekView";
import { authFetch } from "@/lib/auth-fetch";

// Calcule l'âge "X ans" à partir d'une date de naissance (string, Date ou Timestamp Firestore).
// Identique au helper de EnrollPanel pour un affichage cohérent.


type PlanningChangeNotification = {
  action: "created" | "updated" | "deleted" | "duplicated";
  activityTitle?: string;
  date?: string;
  startTime?: string;
  endTime?: string;
  previousStartTime?: string;
  previousEndTime?: string;
  monitor?: string;
  count?: number;
};

async function notifyPlanningChange(payload: PlanningChangeNotification) {
  try {
    const response = await authFetch("/api/planning/notify-staff", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) console.warn("Notification planning refusée :", response.status);
  } catch (error) {
    // La modification du planning reste validée même si le push est indisponible.
    console.warn("Notification planning non envoyée :", error);
  }
}

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
    // Anti-doublon : vérifier si des créneaux identiques existent déjà
    const dates = [...new Set(nc.map(c => c.date))];
    let existingCreneaux: any[] = [];
    if (dates.length > 0) {
      const snap = await getDocs(query(collection(db, "creneaux"), where("date", ">=", dates[0]), where("date", "<=", dates[dates.length - 1])));
      existingCreneaux = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
    }
    let created = 0, skipped = 0, rattaches = 0;
    let firstCreated: Partial<Creneau> | null = null;
    // stageGroupId du lot en cours : tous les jours d'un même stage doivent le
    // partager, y compris ceux qui existaient déjà.
    const groupeDuLot = (nc.find((x: any) => x.stageGroupId) as any)?.stageGroupId || null;

    for (const c of nc) {
      const existant = existingCreneaux.find(ex =>
        ex.date === c.date && ex.startTime === c.startTime && ex.activityTitle === c.activityTitle
      );
      if (existant) {
        // Sauter en silence un jour déjà présent fabriquait des stages à trous :
        // les autres jours recevaient le nouveau stageGroupId, celui-ci gardait
        // l'ancien. L'application y voyait alors DEUX stages distincts — d'où
        // les modales ne proposant qu'une partie des jours et les inscriptions
        // « semaine complète » incomplètes. On le rattache au lot.
        if (groupeDuLot && existant.stageGroupId !== groupeDuLot) {
          try {
            await updateDoc(doc(db, "creneaux", existant.id), { stageGroupId: groupeDuLot });
            rattaches++;
          } catch (e) {
            console.error("[handleCreate] rattachement impossible", existant.id, e);
            skipped++;
          }
        } else {
          skipped++;
        }
        continue;
      }
      // Injecter la couleur de l'activité si elle n'est pas déjà sur le créneau
      const actColor = activities.find(a => a.title === c.activityTitle)?.color;
      const creneauData: any = { ...c, createdAt: serverTimestamp() };
      if (actColor && !creneauData.color) creneauData.color = actColor;
      await addDoc(collection(db, "creneaux"), creneauData);
      if (!firstCreated) firstCreated = c;
      created++;
    }
    setShowSimple(false); setShowGenerator(false);
    toast(
      `${created} créneau${created > 1 ? "x" : ""} créé${created > 1 ? "s" : ""}` +
      `${rattaches > 0 ? ` · ${rattaches} jour${rattaches > 1 ? "s" : ""} existant${rattaches > 1 ? "s" : ""} rattaché${rattaches > 1 ? "s" : ""} au stage` : ""}` +
      `${skipped > 0 ? ` · ${skipped} doublon${skipped > 1 ? "s" : ""} ignoré${skipped > 1 ? "s" : ""}` : ""}`,
      "success"
    );
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

  const isStageType = (c: any) => c.activityType === "stage" || c.activityType === "stage_journee";

  const openDelete = async (c: Creneau & { id: string }) => {
    setDeleteCreneau(c);
    setDeleteDeleting(false);
    setDeleteWeekCount(0);
    setDeleteSerieCount(0);
    try {
      // Similaires sur la SAISON du créneau (même titre + même heure + même
      // jour de semaine + même activité), bornés à la saison sept→août pour ne
      // pas englober les autres saisons (le libellé 'toute l'année' = la saison).
      const dow = new Date(c.date).getDay();
      const cd = new Date(c.date);
      const ssy = cd.getMonth() >= 8 ? cd.getFullYear() : cd.getFullYear() - 1;
      const seasonStart = `${ssy}-09-01`, seasonEnd = `${ssy + 1}-06-30`;
      const snap = await getDocs(query(
        collection(db, "creneaux"),
        where("activityTitle", "==", c.activityTitle),
        where("startTime", "==", c.startTime),
      ));
      setDeleteCount(snap.docs.filter(d => {
        const data = d.data() as any;
        return new Date(data.date).getDay() === dow && data.activityId === (c as any).activityId
          && data.date >= seasonStart && data.date <= seasonEnd;
      }).length);

      // [DIAGNOSTIC] type du créneau cliqué (toujours loggé)

      // Série d'occurrences proches (même titre + même horaire, ±21j, tous
      // jours) — proposé pour TOUT créneau, stage ou non, dès qu'il y a des
      // jours multiples. Couvre les stages mal typés et les réplications.
      {
        const cDate2 = new Date(c.date + "T12:00:00");
        const from2 = new Date(cDate2); from2.setDate(cDate2.getDate() - 21);
        const to2 = new Date(cDate2); to2.setDate(cDate2.getDate() + 21);
        const snapSerie = snap.docs.filter(d => {
          const data = d.data() as any;
          return data.startTime === c.startTime && data.date >= fmtDate(from2) && data.date <= fmtDate(to2);
        });
        setDeleteSerieCount(snapSerie.length);
      }

      // Pour les stages : compter les créneaux du même stage. On réutilise le
      // snap déjà chargé (même titre + même horaire) et on filtre par sameStage,
      // au lieu d'une requête datée séparée qui ratait les bornes à cause du
      // fuseau (new Date(c.date) en UTC) → stageCount tombait à 0 alors que les
      // jours existaient (série les trouvait, pas le bloc stage).
      if (isStageType(c)) {
        const matched = snap.docs.filter(d => sameStage(d.data(), c));
        setDeleteWeekCount(matched.length);
      }
    } catch { setDeleteCount(1); }
  };

  const openEdit = (c: Creneau & { id: string }) => {
    setEditCreneau(c);    setEditForm({ date: c.date, activityId: (c as any).activityId || "", activityType: c.activityType, tvaTaux: (c as any).tvaTaux || 5.5, activityTitle: c.activityTitle, monitor: c.monitor || "", startTime: c.startTime, endTime: c.endTime, maxPlaces: c.maxPlaces, priceTTC: (c as any).priceTTC || 0, color: (c as any).color || "", allowDayBooking: (c as any).allowDayBooking || false, priceTTCDay: (c as any).priceTTCDay || "", themeStage: (c as any).themeStage || "", tarifForfaitaire: !!(c as any).tarifForfaitaire });
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
      try {
        const d = new Date(editCreneau.date + "T12:00:00");
        const mon = new Date(d); mon.setDate(d.getDate() - ((d.getDay() + 6) % 7));
        const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
        const snap = await getDocs(query(
          collection(db, "creneaux"),
          where("date", ">=", fmtDate(mon)),
          where("date", "<=", fmtDate(sun)),
        ));
        const days = snap.docs
          .filter(dd => { const cc: any = dd.data(); return sameStage(cc, editCreneau) && (cc.activityType === "stage" || cc.activityType === "stage_journee"); })
          .map(dd => ({ id: dd.id, date: (dd.data() as any).date as string }))
          .sort((a, b) => a.date.localeCompare(b.date));
        if (cancelled) return;
        setEditStageDays(days);
        setEditSelectedDayIds([editCreneau.id]);
      } catch (e) {
        if (cancelled) return;
        console.warn("[stage days] chargement impossible:", e);
        setEditStageDays([]);
        setEditSelectedDayIds([editCreneau.id]);
      }
    })();
    return () => { cancelled = true; };
  }, [editCreneau]);

  const confirmDelete = async (mode: "single" | "similar" | "week" | "serie") => {
    if (!deleteCreneau) return;
    setDeleteDeleting(true);
    try {
      let deletedCount = 0;
      if (mode === "week") {
        // Supprimer tous les créneaux du même stage (plage large pour couvrir
        // les stages à cheval sur deux semaines — cohérent avec le décompte).
        // Même requête que la lecture (titre + horaire, index simple, pas de
        // date range qui exigeait un index composite absent → la requête
        // plantait et la suppression échouait). Filtre sameStage en mémoire.
        const snap = await getDocs(query(
          collection(db, "creneaux"),
          where("activityTitle", "==", deleteCreneau.activityTitle),
          where("startTime", "==", deleteCreneau.startTime),
        ));
        // Filtre sameStage (stageGroupId prioritaire) : ne supprime QUE ce stage
        const weekTargets = snap.docs.filter(d => sameStage(d.data(), deleteCreneau));

        // Garde-fou : un stage tient en une semaine, donc au plus 7 créneaux.
        // Au-delà, le regroupement a forcément dérapé — mieux vaut s'arrêter
        // et demander confirmation que d'effacer une année de planning.
        if (weekTargets.length > 7) {
          const dates = [...new Set(weekTargets.map(t => (t.data() as any).date))].sort();
          const ok = confirm(
            `⚠️ ATTENTION — ${weekTargets.length} créneaux vont être supprimés.\n\n` +
            `Un stage tient normalement en 5 à 7 jours. Ce nombre indique que des ` +
            `stages d'autres semaines sont concernés.\n\n` +
            `Du ${dates[0]} au ${dates[dates.length - 1]}\n\n` +
            `Confirmer la suppression de TOUS ces créneaux ?`
          );
          if (!ok) {
            setDeleteDeleting(false);
            toast("Suppression annulée", "info");
            return;
          }
        }

        for (const t of weekTargets) await deleteDoc(doc(db, "creneaux", t.id));
        deletedCount = weekTargets.length;
        toast(`🗑️ Stage supprimé (${weekTargets.length} créneaux)`, "success");
      } else if (mode === "similar") {
        const dow = new Date(deleteCreneau.date).getDay();
        const dcd = new Date(deleteCreneau.date);
        const dssy = dcd.getMonth() >= 8 ? dcd.getFullYear() : dcd.getFullYear() - 1;
        const dStart = `${dssy}-09-01`, dEnd = `${dssy + 1}-06-30`;
        const snap = await getDocs(query(
          collection(db, "creneaux"),
          where("activityTitle", "==", deleteCreneau.activityTitle),
          where("startTime", "==", deleteCreneau.startTime),
        ));
        const targets = snap.docs.filter(d => {
          const data = d.data() as any;
          return new Date(data.date).getDay() === dow && data.activityId === (deleteCreneau as any).activityId
            && data.date >= dStart && data.date <= dEnd;
        });
        for (const t of targets) await deleteDoc(doc(db, "creneaux", t.id));
        deletedCount = targets.length;
        toast(`🗑️ ${targets.length} créneaux supprimés`, "success");
      } else if (mode === "serie") {
        // Suppression d'une série d'occurrences proches (non-stage)
        const cDate3 = new Date(deleteCreneau.date);
        const from3 = new Date(cDate3); from3.setDate(cDate3.getDate() - 21);
        const to3 = new Date(cDate3); to3.setDate(cDate3.getDate() + 21);
        const snap = await getDocs(query(
          collection(db, "creneaux"),
          where("activityTitle", "==", deleteCreneau.activityTitle),
          where("startTime", "==", deleteCreneau.startTime),
        ));
        const targets = snap.docs.filter(d => {
          const data = d.data() as any;
          return data.date >= fmtDate(from3) && data.date <= fmtDate(to3);
        });
        for (const t of targets) await deleteDoc(doc(db, "creneaux", t.id));
        deletedCount = targets.length;
        toast(`🗑️ ${targets.length} créneaux supprimés`, "success");
      } else {
        await deleteDoc(doc(db, "creneaux", deleteCreneau.id));
        deletedCount = 1;
        toast("🗑️ Créneau supprimé", "success");
      }
      await notifyPlanningChange({
        action: "deleted",
        activityTitle: deleteCreneau.activityTitle,
        date: deleteCreneau.date,
        startTime: deleteCreneau.startTime,
        endTime: deleteCreneau.endTime,
        monitor: deleteCreneau.monitor,
        count: deletedCount,
      });
      setDeleteCreneau(null);
      fetchData();
    } catch (e) { console.error(e); }
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


  // Prévenir les familles inscrites qu'un créneau change (activité et/ou horaire).
  // Envoie un email récapitulatif (ancien → nouveau) via l'API send-email.
  const [notifyingEnrolled, setNotifyingEnrolled] = useState(false);
  const handleNotifyEnrolled = async () => {
    if (!editCreneau) return;
    const enrolled = ((editCreneau as any).enrolled || []) as any[];
    if (enrolled.length === 0) return;
    const oldTitle = (editCreneau.activityTitle || "").trim();
    const newTitle = (editForm.activityTitle || "").trim();
    const oldHoraire = `${editCreneau.startTime}–${editCreneau.endTime}`;
    const newHoraire = `${editForm.startTime}–${editForm.endTime}`;
    let titleChanged = newTitle !== oldTitle;
    let timeChanged = editForm.startTime !== editCreneau.startTime || editForm.endTime !== editCreneau.endTime;
    let oldHoraireAffiche = oldHoraire;
    // RENOTIFICATION : si le creneau est deja enregistre avec ses nouvelles
    // valeurs, la difference a disparu — cas typique : familles prevenues
    // pendant le mode restreint (emails bloques), a reprevenir apres coup.
    // On demande alors l'ancien horaire a la main plutot que de refuser.
    if (!titleChanged && !timeChanged) {
      const saisie = window.prompt(
        "Aucun changement détecté (créneau déjà enregistré).\n\n" +
        "Pour RENVOYER une notification de changement d'horaire, indiquez " +
        "l'ANCIEN horaire tel que les familles doivent le voir barré " +
        "(ex : 10:00–12:00) — ou Annuler.",
        ""
      );
      if (!saisie || !saisie.trim()) return;
      oldHoraireAffiche = saisie.trim();
      timeChanged = true;
    }
    setNotifyingEnrolled(true);
    try {
      const dateFR = new Date(editCreneau.date).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
      const dateCourt = new Date(editCreneau.date).toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
      const estStage = editCreneau.activityType === "stage" || editCreneau.activityType === "stage_journee";
      // Regroupe par email de famille (un seul email même si plusieurs enfants inscrits)
      const byEmail = new Map<string, { parentName: string; children: string[] }>();
      for (const e of enrolled) {
        const fam = families.find(f => f.firestoreId === e.familyId);
        if (!fam?.parentEmail) continue;
        const entry = byEmail.get(fam.parentEmail) || { parentName: fam.parentName || "", children: [] };
        entry.children.push(e.childName);
        byEmail.set(fam.parentEmail, entry);
      }
      if (byEmail.size === 0) { toast("Aucun email de famille trouvé pour les inscrits", "error"); setNotifyingEnrolled(false); return; }
      const changesHtml = [
        titleChanged ? `<li>Activité : <span style="text-decoration:line-through;color:#94a3b8">${oldTitle}</span> → <strong>${newTitle}</strong></li>` : "",
        timeChanged ? `<li>Horaire : <span style="text-decoration:line-through;color:#94a3b8">${oldHoraireAffiche}</span> → <strong>${newHoraire}</strong></li>` : "",
      ].join("");
      let sent = 0;
      for (const [email, info] of byEmail) {
        const quiEst = info.children.length > 1 ? `sont inscrit·e·s ${info.children.join(", ")}` : `est inscrit·e ${info.children[0]}`;
        const nbJours = editSelectedDayIds.length || 1;
        const joursTxt = estStage ? ` (${nbJours} jour${nbJours > 1 ? "s" : ""} concerné${nbJours > 1 ? "s" : ""})` : "";
        const intro = estStage
          ? `Le stage <strong>${newTitle || oldTitle}</strong> (${dateFR}) a été modifié${joursTxt}, pour ${quiEst} :`
          : `La séance du <strong>${dateFR}</strong> à laquelle ${quiEst} a été modifiée :`;
        const html = `<div style="font-family:sans-serif;font-size:14px;color:#1e293b;line-height:1.5">
          <p>Bonjour${info.parentName ? " " + info.parentName : ""},</p>
          <p>${intro}</p>
          <ul>${changesHtml}</ul>
          <p>Votre réservation reste valable, elle est simplement décalée : rien n'est à refaire de votre côté. Si ce nouvel horaire ne vous convient pas, contactez-nous et nous chercherons ensemble une autre date.</p>
          <p>À bientôt,<br/>Le Centre Équestre d'Agon-Coutainville</p>
        </div>`;
        try {
          await authFetch("/api/send-email", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              to: email,
              subject: estStage ? `Modification de votre stage — ${dateCourt}` : `Modification de votre séance du ${dateCourt}`,
              html,
              context: "admin_creneau_modifie",
              template: "creneauModifie",
              creneauId: editCreneau.id,
            }),
          });
          sent++;
        } catch (e) { console.warn("Email inscrit:", e); }
      }
      toast(`✉️ ${sent} famille${sent > 1 ? "s" : ""} prévenue${sent > 1 ? "s" : ""}`, "success");
    } catch (e) {
      console.error("Notify inscrits:", e);
      toast("Erreur lors de l'envoi", "error");
    }
    setNotifyingEnrolled(false);
  };

  const handleEditSave = async () => {
    if (!editCreneau) return;
    setEditSaving(true);
    try {
      const update: any = {
        activityId: editForm.activityId ?? (editCreneau as any).activityId,
        activityType: editForm.activityType ?? editCreneau.activityType,
        tvaTaux: editForm.tvaTaux ?? (editCreneau as any).tvaTaux ?? 5.5,
        activityTitle: editForm.activityTitle,
        monitor: editForm.monitor,
        // La date n'est écrite que si elle a réellement changé : évite de
        // toucher au champ sur une simple modification d'horaire.
        ...(editForm.date && editForm.date !== editCreneau.date ? { date: editForm.date } : {}),
        startTime: editForm.startTime,
        endTime: editForm.endTime,
        maxPlaces: parseInt(editForm.maxPlaces) || editCreneau.maxPlaces,
        priceTTC: parseFloat(editForm.priceTTC) || 0,
        allowDayBooking: !!editForm.allowDayBooking,
        // Prix de la sortie et non du cavalier (cf. lib/tarif-forfaitaire).
        tarifForfaitaire: !!editForm.tarifForfaitaire,
        priceTTCDay: editForm.allowDayBooking ? (parseFloat(editForm.priceTTCDay as string) || 0) : 0,
        themeStage: editForm.themeStage || null,
        updatedAt: serverTimestamp(),
      };
      if (editForm.color) update.color = editForm.color;

      const isStageType = editCreneau.activityType === "stage" || editCreneau.activityType === "stage_journee";
      let updatedCount = 1;
      if (isStageType) {
        // ── Appliquer aux jours SÉLECTIONNÉS du stage ──
        // L'admin choisit les jours dans la modale ; par défaut = le jour cliqué.
        const dayIds = editSelectedDayIds.length > 0 ? editSelectedDayIds : [editCreneau.id];
        for (const id of dayIds) {
          await updateDoc(doc(db, "creneaux", id), update);
        }
        updatedCount = dayIds.length;
        toast(`✅ Stage mis à jour (${dayIds.length} jour${dayIds.length > 1 ? "s" : ""})`, "success");
      } else if (editApplyAll && !isStageType) {
        // Cours récurrents UNIQUEMENT (jamais les stages : eux passent par la
        // branche stage ci-dessus, bornée à la semaine).
        // Charger TOUS les créneaux futurs depuis Firestore (pas seulement la semaine affichée)
        const today = new Date().toISOString().split("T")[0];
        const allSnap = await getDocs(query(
          collection(db, "creneaux"),
          where("date", ">=", today)
        ));
        const dow = new Date(editCreneau.date + "T12:00:00").getDay();
        const targets = allSnap.docs.filter(d => {
          const c = d.data();
          return c.activityTitle === editCreneau.activityTitle &&
            new Date(c.date + "T12:00:00").getDay() === dow &&
            c.startTime === editCreneau.startTime;
        });
        for (const t of targets) {
          await updateDoc(doc(db, "creneaux", t.id), update);
        }
        updatedCount = targets.length;
        toast(`✅ ${targets.length} créneaux mis à jour`, "success");
      } else {
        await updateDoc(doc(db, "creneaux", editCreneau.id), update);
        toast("✅ Créneau mis à jour", "success");
      }
      await notifyPlanningChange({
        action: "updated",
        activityTitle: editForm.activityTitle,
        date: editCreneau.date,
        startTime: editForm.startTime,
        endTime: editForm.endTime,
        previousStartTime: editCreneau.startTime,
        previousEndTime: editCreneau.endTime,
        monitor: editForm.monitor,
        count: updatedCount,
      });
      setEditCreneau(null);
      await fetchData();
    } catch (e) { console.error(e); toast("Erreur", "error"); }
    setEditSaving(false);
  };

  const handleDuplicateCreneau = async (dates: string[]) => {
    if (!duplicateCreneau) return;
    const src = duplicateCreneau;
    // Vérifier doublons
    const minDate = dates.reduce((a, b) => a < b ? a : b);
    const maxDate = dates.reduce((a, b) => a > b ? a : b);
    const snap = await getDocs(query(
      collection(db, "creneaux"),
      where("date", ">=", minDate),
      where("date", "<=", maxDate)
    ));
    const existing = snap.docs.map(d => d.data());
    let created = 0, skipped = 0;
    for (const d of dates) {
      const isDup = existing.some(ex =>
        ex.date === d && ex.startTime === src.startTime && ex.activityTitle === src.activityTitle
      );
      if (isDup) { skipped++; continue; }
      const { id: _id, ...srcData } = src as any;
      await addDoc(collection(db, "creneaux"), {
        ...srcData,
        date: d,
        enrolled: [],
        enrolledCount: 0,
        status: "planned",
        createdAt: serverTimestamp(),
      });
      created++;
    }
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

  const exportPDF = () => {
    const visibleCreneaux = viewMode === "day" ? dayCreneaux : creneaux;
    const titre = viewMode === "day"
      ? `Planning du ${currentDay.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}`
      : viewMode === "week"
      ? `Planning semaine du ${weekDates[0].toLocaleDateString("fr-FR", { day: "numeric", month: "long" })} au ${weekDates[6].toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}`
      : `Planning ${currentDay.toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}`;
    const lignes = [...visibleCreneaux]
      .sort((a, b) => a.date.localeCompare(b.date) || compareCreneaux(a, b))
      .map(c => `<tr>
        <td>${new Date(c.date).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })}</td>
        <td>${c.startTime}–${c.endTime}</td>
        <td><strong>${c.activityTitle}</strong></td>
        <td>${c.monitor || "—"}</td>
        <td style="text-align:center">${c.enrolledCount||0}/${c.maxPlaces||0}</td>
        <td style="text-align:center;color:${c.status==="closed"?"#16a34a":"#94a3b8"}">${c.status==="closed"?"✓ Clôturé":"—"}</td>
      </tr>`).join("");
    const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>${titre}</title>
      <style>body{font-family:Arial,sans-serif;font-size:12px;margin:20px;color:#1e3a5f;}
      h1{font-size:16px;color:#0C1A2E;margin-bottom:4px;}p{color:#666;font-size:11px;margin-bottom:16px;}
      table{width:100%;border-collapse:collapse;}th{background:#0C1A2E;color:white;padding:8px 10px;text-align:left;font-size:11px;}
      td{padding:7px 10px;border-bottom:1px solid #e2e8f0;}tr:nth-child(even) td{background:#f8fafc;}
      @media print{body{margin:10px;}}</style></head><body>
      <h1>🐴 ${titre}</h1>
      <p>Centre Équestre d'Agon-Coutainville — Imprimé le ${new Date().toLocaleDateString("fr-FR")}</p>
      <table><thead><tr><th>Date</th><th>Horaire</th><th>Activité</th><th>Moniteur</th><th>Inscrits</th><th>Statut</th></tr></thead>
      <tbody>${lignes||"<tr><td colspan='6' style='text-align:center;color:#999'>Aucun créneau</td></tr>"}</tbody></table>
      </body></html>`;
    const w = window.open("","_blank");
    if (w) { w.document.write(html); w.document.close(); setTimeout(() => w.print(), 300); }
  };

  const analyserPlanning = async () => {
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
  };
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
        const snap = await getDocs(query(collection(db, "waitlist"), where("status", "==", "waiting")));
        const ids = new Set(creneaux.map(c => c.id));
        const counts: Record<string, number> = {};
        const aujourdhui = toLocalDateString();
        snap.docs.forEach(d => {
          const w = d.data() as any;
          // Une demande dont la seance est passee n'a plus d'objet : la place
          // ne sera jamais liberee. On cesse de la compter immediatement,
          // sans attendre la purge du cron (qui, elle, supprime vraiment).
          if (estPerimee(w, aujourdhui)) return;
          const cibles: string[] = Array.isArray(w.creneauIds) && w.creneauIds.length
            ? w.creneauIds
            : w.creneauId ? [w.creneauId] : [];
          // Une entree de stage compte sur CHACUN de ses jours affiches.
          cibles.filter(id => ids.has(id)).forEach(id => {
            counts[id] = (counts[id] || 0) + 1;
          });
        });
        if (!annule) setWaitCounts(counts);
      } catch (e) {
        console.error("Compteurs liste d'attente :", e);
      }
    })();
    return () => { annule = true; };
  }, [creneaux]);

  // Inscrire et désinscrire vivent dans inscription-actions : ce ne sont pas
  // des affichages, mais mille lignes qui décident de ce qui est facturé et
  // de ce qui part aux familles.
  const contexteInscription = (): ContexteInscription => ({
    creneaux, families, payments, allForfaits, vacationPeriods, discountSettings,
    refreshCreneaux, fetchData, setAllForfaits, setSelectedCreneau, toast,
  });

  const handleEnroll = (
    cid: string, child: EnrolledChild, payMode?: string,
    options?: Parameters<typeof inscrireCavalier>[4],
  ) => inscrireCavalier(contexteInscription(), cid, child, payMode, options);

  const handleUnenroll = (cid: string, childId: string) =>
    desinscrireCavalier(contexteInscription(), cid, childId);

  const isToday = (d: Date) => fmtDate(d) === fmtDate(new Date());
  const dayCreneaux = creneaux.filter(c => c.date === fmtDate(currentDay)).sort(compareCreneaux);

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-6">
        <div className="flex items-center gap-3">
          <h1 className="font-display text-2xl font-bold text-blue-800">Planning</h1>
          <a href={`/admin/montoir?date=${fmtDate(currentDay)}`}
            className="flex items-center gap-1.5 font-body text-xs font-semibold text-blue-600 bg-blue-50 px-3 py-1.5 rounded-lg no-underline hover:bg-blue-100">
            🐴 Montoir
          </a>
        </div>
        <div className="flex items-center gap-2 flex-wrap">

          {/* ─── Segmented control : Mois / Semaine / Timeline / Jour ─── */}
          <div className="inline-flex bg-blue-500/[0.06] rounded-full p-[3px] gap-0.5">
            {(["month","week","timeline","day"] as const).map(v => (
              <button type="button" key={v} onClick={() => setViewMode(v)}
                className={`px-3 sm:px-4 py-1.5 rounded-full font-body text-xs font-semibold cursor-pointer border-none transition-all whitespace-nowrap ${
                  viewMode === v
                    ? "bg-white text-blue-500 shadow-[0_2px_8px_rgba(32,80,160,0.12)]"
                    : "text-slate-600 bg-transparent hover:text-blue-500"
                }`}>
                {v === "week" ? "Semaine" : v === "day" ? "Jour" : v === "timeline" ? "Timeline" : "Mois"}
              </button>
            ))}
          </div>

          {/* ─── Bouton + Ajouter (principal) avec menu ─── */}
          <div className="relative" data-menu="add">
            <button type="button"
              onClick={(e) => { e.stopPropagation(); setMenuAddOpen(o => !o); setMenuMoreOpen(false); }}
              className="flex items-center gap-1.5 font-body text-xs sm:text-sm font-semibold text-white px-4 py-2 rounded-full border-none cursor-pointer transition-all hover:-translate-y-px active:scale-[0.96]"
              style={{
                background: "linear-gradient(135deg, #2050A0 0%, #1a4590 100%)",
                boxShadow: "0 4px 12px rgba(32, 80, 160, 0.28)",
              }}
              aria-label="Ajouter"
              aria-expanded={menuAddOpen}>
              <Plus size={16} strokeWidth={2.5} />
              <span className="hidden sm:inline">Ajouter</span>
            </button>
            {menuAddOpen && (
              <div className="absolute top-[calc(100%+8px)] right-0 bg-white rounded-2xl shadow-[0_12px_40px_rgba(12,26,46,0.18)] p-2 min-w-[240px] z-50 border border-black/[0.04]">
                <div className="font-body text-[10px] font-bold text-slate-400 uppercase tracking-[0.8px] px-3.5 pt-2 pb-1">Créer</div>
                <button type="button"
                  onClick={() => { setMenuAddOpen(false); setShowSimple(true); setShowGenerator(false); setSelectedDate(viewMode === "day" ? fmtDate(currentDay) : undefined); }}
                  className="w-full text-left px-3.5 py-2.5 rounded-xl bg-transparent border-none cursor-pointer flex items-center gap-3 hover:bg-sand transition-colors">
                  <span className="w-8 h-8 rounded-xl bg-blue-50 text-blue-500 inline-flex items-center justify-center flex-shrink-0">
                    <Calendar size={16} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="font-body text-sm font-medium text-blue-800">Créneau unique</div>
                    <div className="font-body text-[11px] text-slate-400">Un cours, une balade…</div>
                  </div>
                </button>
                <button type="button"
                  onClick={() => { setMenuAddOpen(false); setShowGenerator(true); setShowSimple(false); }}
                  className="w-full text-left px-3.5 py-2.5 rounded-xl bg-transparent border-none cursor-pointer flex items-center gap-3 hover:bg-sand transition-colors">
                  <span className="w-8 h-8 rounded-xl bg-gold-400/20 text-amber-700 inline-flex items-center justify-center flex-shrink-0">
                    <CalendarDays size={16} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="font-body text-sm font-medium text-blue-800">Générateur périodes</div>
                    <div className="font-body text-[11px] text-slate-400">Toute une saison en 1 clic</div>
                  </div>
                </button>
                <button type="button"
                  onClick={() => { setMenuAddOpen(false); setShowRdvForm(true); }}
                  className="w-full text-left px-3.5 py-2.5 rounded-xl bg-transparent border-none cursor-pointer flex items-center gap-3 hover:bg-sand transition-colors">
                  <span className="w-8 h-8 rounded-xl bg-orange-50 text-orange-700 inline-flex items-center justify-center flex-shrink-0">
                    <Briefcase size={16} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="font-body text-sm font-medium text-blue-800">RDV Pro</div>
                    <div className="font-body text-[11px] text-slate-400">Vétérinaire, maréchal…</div>
                  </div>
                </button>
              </div>
            )}
          </div>

          {/* ─── Dupliquer (visible en vue Semaine/Timeline uniquement) ─── */}
          {(viewMode === "week" || viewMode === "timeline") && creneaux.length > 0 && (
            <button type="button"
              onClick={() => setShowDuplicate(!showDuplicate)}
              className="flex items-center gap-1.5 font-body text-xs sm:text-sm font-semibold text-blue-500 bg-blue-500/[0.08] px-4 py-2 rounded-full border-none cursor-pointer transition-all hover:bg-blue-500/[0.14] active:scale-[0.96]">
              <Copy size={14} />
              Dupliquer
            </button>
          )}

          {/* ─── Menu ⋯ (actions secondaires : PDF + IA) ─── */}
          <div className="relative" data-menu="more">
            <button type="button"
              onClick={(e) => { e.stopPropagation(); setMenuMoreOpen(o => !o); setMenuAddOpen(false); }}
              className="w-[38px] h-[38px] rounded-full border-none cursor-pointer flex items-center justify-center bg-gray-100 text-slate-600 transition-all hover:bg-gray-200 hover:text-blue-800 active:scale-[0.96]"
              aria-label="Plus d'actions"
              aria-expanded={menuMoreOpen}>
              <MoreHorizontal size={18} />
            </button>
            {menuMoreOpen && (
              <div className="absolute top-[calc(100%+8px)] right-0 bg-white rounded-2xl shadow-[0_12px_40px_rgba(12,26,46,0.18)] p-2 min-w-[200px] z-50 border border-black/[0.04]">
                <button type="button"
                  onClick={() => { setMenuMoreOpen(false); exportPDF(); }}
                  disabled={(viewMode === "day" ? dayCreneaux : creneaux).length === 0}
                  className="w-full text-left px-3.5 py-2.5 rounded-xl bg-transparent border-none cursor-pointer flex items-center gap-3 hover:bg-sand transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                  <span className="w-8 h-8 rounded-xl bg-gray-100 text-slate-600 inline-flex items-center justify-center flex-shrink-0">
                    <Printer size={16} />
                  </span>
                  <span className="font-body text-sm font-medium text-blue-800">Export PDF</span>
                </button>
                <button type="button"
                  onClick={() => { setMenuMoreOpen(false); analyserPlanning(); }}
                  disabled={iaLoading || (viewMode === "day" ? dayCreneaux : creneaux).length === 0}
                  className="w-full text-left px-3.5 py-2.5 rounded-xl bg-transparent border-none cursor-pointer flex items-center gap-3 hover:bg-sand transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                  <span className="w-8 h-8 rounded-xl inline-flex items-center justify-center flex-shrink-0"
                    style={{ background: "linear-gradient(135deg, #ede9fe 0%, #ddd6fe 100%)", color: "#7c3aed" }}>
                    {iaLoading ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                  </span>
                  <span className="font-body text-sm font-medium text-blue-800">
                    {iaLoading ? "Analyse en cours..." : "Analyse IA"}
                  </span>
                </button>
              </div>
            )}
          </div>

        </div>
      </div>

      {showSimple && <SimpleCreneauForm activities={activities} onSave={handleCreate} onCancel={()=>setShowSimple(false)} defaultDate={selectedDate}/>}
      {showGenerator && <PeriodGenerator activities={activities} onGenerate={handleCreate} onCancel={()=>setShowGenerator(false)}/>}
      {showDuplicate && <Card padding="md" className="mb-6 border-gold-400/20 bg-gold-50"><div className="flex justify-between items-center mb-3"><h3 className="font-body text-base font-semibold text-blue-800">📋 Dupliquer semaine</h3><button type="button" onClick={()=>setShowDuplicate(false)} className="text-slate-600 bg-transparent border-none cursor-pointer"><X size={18}/></button></div><div className="flex items-center gap-4 mb-3"><label className="font-body text-sm text-blue-800">Semaines:</label><input type="number" min={1} max={20} value={dupWeeks} onChange={e=>setDupWeeks(parseInt(e.target.value)||1)} className="w-20 px-3 py-2 rounded-lg border border-blue-500/8 font-body text-sm bg-white text-center"/></div><button type="button" onClick={handleDuplicateWeek} disabled={duplicating} className={`flex items-center gap-2 px-6 py-2.5 rounded-lg font-body text-sm font-semibold border-none cursor-pointer ${duplicating?"bg-gray-200 text-slate-600":"bg-gold-400 text-blue-800"}`}>{duplicating?<Loader2 size={16} className="animate-spin"/>:<Check size={16}/>} Dupliquer</button></Card>}

      {/* ── Panneau suggestions IA ── */}
      {showIaPanel && (
        <div className="mb-6 rounded-2xl border p-5" style={{ borderColor: "#7c3aed33", background: "linear-gradient(135deg,#f5f3ff,#eff6ff)" }}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: "linear-gradient(135deg,#7c3aed,#2050A0)" }}>
                <Sparkles size={15} className="text-white" />
              </div>
              <div>
                <div className="font-body text-sm font-semibold text-blue-800">Analyse IA du planning</div>
                {iaStats && (
                  <div className="font-body text-xs text-slate-600">
                    {iaStats.tauxGlobal}% de remplissage · {iaStats.sousRemplis} sous-remplis · {iaStats.complets} complets · {iaStats.vides} vides
                  </div>
                )}
              </div>
            </div>
            <button type="button" onClick={() => { setShowIaPanel(false); setIaSuggestions(null); setIaStats(null); }}
              className="text-slate-600 bg-transparent border-none cursor-pointer hover:text-gray-600"><X size={16}/></button>
          </div>

          {/* Jauges de remplissage rapides */}
          {iaStats && (
            <div className="grid grid-cols-3 gap-2 mb-4">
              {[
                { label: "Taux global", value: iaStats.tauxGlobal, color: iaStats.tauxGlobal >= 70 ? "#16a34a" : iaStats.tauxGlobal >= 40 ? "#d97706" : "#dc2626" },
                { label: "Sous-remplis", value: iaStats.total > 0 ? Math.round(iaStats.sousRemplis/iaStats.total*100) : 0, color: "#d97706", suffix: ` (${iaStats.sousRemplis})` },
                { label: "Complets", value: iaStats.total > 0 ? Math.round(iaStats.complets/iaStats.total*100) : 0, color: "#16a34a", suffix: ` (${iaStats.complets})` },
              ].map(s => (
                <div key={s.label} className="bg-white rounded-xl p-2.5">
                  <div className="font-body text-xs text-slate-600 mb-1">{s.label}</div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden mb-1">
                    <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, s.value)}%`, background: s.color }} />
                  </div>
                  <div className="font-body text-sm font-bold" style={{ color: s.color }}>{s.value}%{s.suffix || ""}</div>
                </div>
              ))}
            </div>
          )}

          {iaLoading ? (
            <div className="flex items-center gap-2 py-4 justify-center text-purple-600">
              <Loader2 size={16} className="animate-spin" />
              <span className="font-body text-sm">Analyse en cours...</span>
            </div>
          ) : iaSuggestions ? (
            <div className="font-body text-sm text-blue-800 whitespace-pre-wrap leading-relaxed bg-white rounded-xl p-4">
              {iaSuggestions}
            </div>
          ) : null}
        </div>
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

      {viewMode==="day"&&<>
        <div className="flex items-center justify-between mb-5">
          <button type="button" onClick={()=>setDayOffset(d=>d-1)} className="flex items-center gap-1 font-body text-sm text-slate-600 bg-white px-4 py-2 rounded-lg border border-gray-200 cursor-pointer"><ChevronLeft size={16}/>Veille</button>
          <div className="flex flex-col items-center gap-1">
            <div className="font-display text-lg font-bold text-blue-800 capitalize">{currentDay.toLocaleDateString("fr-FR",{weekday:"long",day:"numeric",month:"long",year:"numeric"})}</div>
            <div className="font-body text-xs text-slate-600">{dayCreneaux.length} créneau{dayCreneaux.length>1?"x":""}</div>
            <input type="date" title="Aller à cette date"
              className="font-body text-xs px-2 py-1 rounded-lg border border-gray-200 bg-white cursor-pointer focus:border-blue-400 focus:outline-none text-slate-500"
              onChange={e => {
                // Même règle que la vue Semaine : on n'agit qu'une fois la
                // date complète (cf. lib/date-saisie).
                const picked = dateSaisieComplete(e.target.value);
                if (!picked) return;
                const today = new Date(); today.setHours(0,0,0,0);
                setDayOffset(Math.round((picked.getTime() - today.getTime()) / 86400000));
              }}/>
          </div>
          <div className="flex gap-2"><button type="button" onClick={()=>setDayOffset(0)} className="font-body text-sm text-blue-500 bg-blue-50 px-4 py-2 rounded-lg border-none cursor-pointer">Auj.</button><button type="button" onClick={()=>setDayOffset(d=>d+1)} className="flex items-center gap-1 font-body text-sm text-slate-600 bg-white px-4 py-2 rounded-lg border border-gray-200 cursor-pointer">Lendemain<ChevronRight size={16}/></button></div>
        </div>
        <MareesBandeau date={fmtDate(currentDay)} />
        {loading?<div className="text-center py-16"><Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto"/></div>:
        dayCreneaux.length===0?<Card padding="lg" className="text-center"><div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto mb-3"><CalendarDays size={28} className="text-blue-300" /></div><p className="font-body text-sm text-slate-600">Aucun créneau.</p></Card>:
        <div className="flex flex-col gap-3">{dayCreneaux.map(c=>{const en=c.enrolled||[];const fill=c.maxPlaces>0?en.length/c.maxPlaces:0;const col=(c as any).color||typeColors[c.activityType]||"#666";const ttc=(c as any).priceTTC||(c.priceHT||0)*(1+(c.tvaTaux||5.5)/100);return(
          <Card key={c.id} padding="md" className="cursor-pointer hover:shadow-lg" hover>
            <div onClick={()=>setSelectedCreneau(c)}>
              <div className="flex items-start justify-between mb-3"><div className="flex items-center gap-4"><div className="w-14 text-center"><div className="font-body text-lg font-bold" style={{color:col}}>{c.startTime}</div><div className="font-body text-[10px] text-slate-600">{c.endTime}</div></div><div style={{borderLeftWidth:3,borderLeftColor:col,paddingLeft:12}}><div className="font-body text-base font-semibold text-blue-800">{c.activityTitle}</div><div className="font-body text-xs text-slate-600">{c.monitor} · {c.maxPlaces} pl.{ttc>0?` · ${libellePrixCreneau(c as any)}`:""}{(c as any).allowDayBooking&&<span className="ml-1.5 inline-flex items-center gap-0.5 rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 align-middle" title="Ce jour est réservable à l'unité par les familles">📅 journée{(c as any).priceTTCDay>0?` ${Number((c as any).priceTTCDay).toFixed(0)}€`:""}</span>}</div></div></div><div className="flex items-center gap-2">{(()=>{/* Impayé = rien d'encaissé. Une commande créée, même relancée par lien de paiement, en fait partie tant qu'aucun euro n'est arrivé. */
                const unpaid=en.filter((e:any)=>statutPaiementCavalier(e,payments,c).etat==="impaye").length;return unpaid>0?<span className="font-body text-xs font-semibold text-red-500 bg-red-50 px-2 py-1 rounded-lg">⚠️ {unpaid} impayé{unpaid>1?"s":""}</span>:null;})()}{waitCounts[c.id]>0&&<span className="font-body text-xs font-semibold text-orange-700 bg-orange-50 px-2 py-1 rounded-lg whitespace-nowrap" title="Enfants en liste d'attente sur ce créneau">🔔 {waitCounts[c.id]} en attente</span>}<Badge color={fill>=1?"red":fill>=0.7?"orange":"green"}>{en.length}/{c.maxPlaces}</Badge><button type="button" onClick={e=>{e.stopPropagation();setEditCreneau(c);setEditForm({date:c.date,activityId:(c as any).activityId||"",activityType:c.activityType,tvaTaux:(c as any).tvaTaux||5.5,activityTitle:c.activityTitle,monitor:c.monitor||"",startTime:c.startTime,endTime:c.endTime,maxPlaces:c.maxPlaces,priceTTC:(c as any).priceTTC||0,color:(c as any).color||"",allowDayBooking:(c as any).allowDayBooking||false,priceTTCDay:(c as any).priceTTCDay||"",themeStage:(c as any).themeStage||"",tarifForfaitaire:!!(c as any).tarifForfaitaire});setEditApplyAll(false);}} className="text-blue-400 hover:text-blue-600 bg-blue-50 hover:bg-blue-100 w-8 h-8 rounded-lg border-none cursor-pointer flex items-center justify-center"><Settings size={15}/></button><button type="button" onClick={e=>{e.stopPropagation();openDelete(c);}} className="text-slate-400 hover:text-red-500 bg-transparent border-none cursor-pointer"><Trash2 size={16}/></button></div></div>
              {en.length>0&&<div className="ml-[68px] flex flex-wrap gap-2">{en.map((e:any)=>{
                // Rouge rien reçu, orange partiellement réglé, vert réglé :
                // une seule règle pour les quatre vues (types.ts). Le mode de
                // règlement reste dans le libellé, plus dans la couleur.
                const statut = statutPaiementCavalier(e, payments, c);
                const statusColor = statut.couleur;
                const statusBg = statut.fond;
                const statusIcon = statut.icone;
                const statusLabel = statut.label;
                const age = ageCavalier(e, families).label;
                return <span key={e.childId} title={`${e.childName} · ${statusLabel} — ${statut.detail}`}
                  className="font-body text-xs px-2.5 py-1.5 rounded-full flex items-center gap-1.5 border"
                  style={{ background: statusBg, borderColor: statusColor+"33", color: "#0C1A2E" }}>
                  <span className="text-[11px]">{statusIcon}</span>
                  <span className="font-semibold">{e.childName}</span>
                  {age && <span style={{ color: "#64748b", fontSize: 10 }}>{age}</span>}
                  <span style={{ color: statusColor, fontSize: 10 }}>{statusLabel}</span>
                </span>;
              })}</div>}
            </div>
          </Card>);})}</div>}
      </>}

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
          isStageType={isStageType}
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
