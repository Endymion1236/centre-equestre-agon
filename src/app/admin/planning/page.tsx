"use client";
import { useState, useEffect, useMemo } from "react";
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, getDoc, query, where, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAgentContext } from "@/hooks/useAgentContext";
import {
  findStageCreneaux, countExistingStageInscriptions, computeStageReductions,
  enrollChildInCreneau, createReservation, removeChildFromCreneau, deleteReservations,
  findLinkedPayment, computeTropPercu, createAvoir, duplicateWeekCreneaux, fmtDate as fmtDateSvc,
} from "@/lib/planning-services";
import { Card, Badge } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { emailTemplates } from "@/lib/email-templates";
import { generateOrderId } from "@/lib/utils";
import { Plus, ChevronLeft, ChevronRight, X, Check, Calendar, Loader2, Trash2, Users, CalendarDays, Briefcase, Bell, Mail, Sparkles, Printer, Settings } from "lucide-react";
import type { Activity, Family } from "@/types";
import { Creneau, EnrolledChild, typeColors, dayNames, dayNamesFull, payModes, getWeekDates, fmtDate, fmtDateFR, fmtMonthFR } from "./types";
import EnrollPanel from "./EnrollPanel";
import PeriodGenerator from "./PeriodGenerator";
import SimpleCreneauForm from "./SimpleCreneauForm";
import RdvModal, { RDV_CATEGORIES, type RdvForm } from "./RdvModal";
import DeleteCreneauModal from "./DeleteCreneauModal";
import EditCreneauModal, { type EditForm } from "./EditCreneauModal";
import MonthView from "./MonthView";
import TimelineView from "./TimelineView";
import WeekView from "./WeekView";

export default function PlanningPage() {
  const { toast } = useToast();
  const { setAgentContext } = useAgentContext("planning");
  const [weekOffset, setWeekOffset] = useState(0); const [dayOffset, setDayOffset] = useState(0);
  const [monthOffset, setMonthOffset] = useState(0);
  const [viewMode, setViewMode] = useState<"week"|"day"|"month"|"timeline">("week");
  const [creneaux, setCreneaux] = useState<(Creneau & { id: string })[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [families, setFamilies] = useState<(Family & { firestoreId: string })[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [allCartes, setAllCartes] = useState<any[]>([]);
  const [allForfaits, setAllForfaits] = useState<any[]>([]);

  // ── IA Planning ───────────────────────────────────────────────────────────
  const [iaLoading, setIaLoading] = useState(false);
  const [iaSuggestions, setIaSuggestions] = useState<string | null>(null);
  const [iaStats, setIaStats] = useState<any>(null);
  const [showIaPanel, setShowIaPanel] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showSimple, setShowSimple] = useState(false); const [showGenerator, setShowGenerator] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string|undefined>();
  const [selectedCreneau, setSelectedCreneau] = useState<(Creneau & { id: string })|null>(null);
  const [editCreneau, setEditCreneau] = useState<(Creneau & { id: string })|null>(null);
  const [editForm, setEditForm] = useState<any>({});
  const [editSaving, setEditSaving] = useState(false);
  const [editApplyAll, setEditApplyAll] = useState(false);
  const [showDuplicate, setShowDuplicate] = useState(false); const [dupWeeks, setDupWeeks] = useState(1); const [duplicating, setDuplicating] = useState(false);

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
      existingCreneaux = snap.docs.map(d => d.data());
    }
    let created = 0, skipped = 0;
    for (const c of nc) {
      const isDuplicate = existingCreneaux.some(ex =>
        ex.date === c.date && ex.startTime === c.startTime && ex.activityTitle === c.activityTitle
      );
      if (isDuplicate) { skipped++; continue; }
      await addDoc(collection(db, "creneaux"), { ...c, createdAt: serverTimestamp() });
      created++;
    }
    setShowSimple(false); setShowGenerator(false);
    toast(`${created} créneau${created > 1 ? "x" : ""} créé${created > 1 ? "s" : ""}${skipped > 0 ? ` (${skipped} doublon${skipped > 1 ? "s" : ""})` : ""}`, "success");
    fetchData();
  };
  const [deleteCreneau, setDeleteCreneau] = useState<(Creneau & { id: string }) | null>(null);
  const [deleteDeleting, setDeleteDeleting] = useState(false);
  const [deleteCount, setDeleteCount] = useState(0);
  const [deleteWeekCount, setDeleteWeekCount] = useState(0); // créneaux du même stage cette semaine

  const handleDelete = (id: string) => {
    const c = creneaux.find(x => x.id === id);
    if (c) openDelete(c);
  };

  const isStageType = (c: any) => c.activityType === "stage" || c.activityType === "stage_journee";

  const openDelete = async (c: Creneau & { id: string }) => {
    setDeleteCreneau(c);
    setDeleteDeleting(false);
    setDeleteWeekCount(0);
    try {
      // Similaires sur toute l'année (même titre + même heure + même jour semaine)
      const dow = new Date(c.date).getDay();
      const snap = await getDocs(query(
        collection(db, "creneaux"),
        where("activityTitle", "==", c.activityTitle),
        where("startTime", "==", c.startTime),
      ));
      setDeleteCount(snap.docs.filter(d => new Date((d.data() as any).date).getDay() === dow).length);

      // Pour les stages : compter les créneaux du même stage cette semaine
      if (isStageType(c)) {
        const cDate = new Date(c.date);
        const dow0 = (cDate.getDay() + 6) % 7; // lundi = 0
        const mon = new Date(cDate); mon.setDate(cDate.getDate() - dow0);
        const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
        const monStr = fmtDate(mon); const sunStr = fmtDate(sun);
        const snapWeek = await getDocs(query(
          collection(db, "creneaux"),
          where("activityTitle", "==", c.activityTitle),
          where("date", ">=", monStr),
          where("date", "<=", sunStr),
        ));
        setDeleteWeekCount(snapWeek.docs.length);
      }
    } catch { setDeleteCount(1); }
  };

  const openEdit = (c: Creneau & { id: string }) => {
    setEditCreneau(c);
    setEditForm({ activityTitle: c.activityTitle, monitor: c.monitor || "", startTime: c.startTime, endTime: c.endTime, maxPlaces: c.maxPlaces, priceTTC: (c as any).priceTTC || 0, color: (c as any).color || "" });
    setEditApplyAll(false);
  };

  const confirmDelete = async (mode: "single" | "similar" | "week") => {
    if (!deleteCreneau) return;
    setDeleteDeleting(true);
    try {
      if (mode === "week") {
        // Supprimer tous les créneaux du même stage cette semaine
        const cDate = new Date(deleteCreneau.date);
        const dow0 = (cDate.getDay() + 6) % 7;
        const mon = new Date(cDate); mon.setDate(cDate.getDate() - dow0);
        const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
        const snap = await getDocs(query(
          collection(db, "creneaux"),
          where("activityTitle", "==", deleteCreneau.activityTitle),
          where("date", ">=", fmtDate(mon)),
          where("date", "<=", fmtDate(sun)),
        ));
        for (const t of snap.docs) await deleteDoc(doc(db, "creneaux", t.id));
        toast(`🗑️ Stage supprimé (${snap.docs.length} créneaux)`, "success");
      } else if (mode === "similar") {
        const dow = new Date(deleteCreneau.date).getDay();
        const snap = await getDocs(query(
          collection(db, "creneaux"),
          where("activityTitle", "==", deleteCreneau.activityTitle),
          where("startTime", "==", deleteCreneau.startTime),
        ));
        const targets = snap.docs.filter(d => new Date((d.data() as any).date).getDay() === dow);
        for (const t of targets) await deleteDoc(doc(db, "creneaux", t.id));
        toast(`🗑️ ${targets.length} créneaux supprimés`, "success");
      } else {
        await deleteDoc(doc(db, "creneaux", deleteCreneau.id));
        toast("🗑️ Créneau supprimé", "success");
      }
      setDeleteCreneau(null);
      fetchData();
    } catch (e) { console.error(e); }
    setDeleteDeleting(false);
  };
  const handleDuplicateWeek = async () => { if (creneaux.length===0) return; setDuplicating(true); const { count, skipped } = await duplicateWeekCreneaux(creneaux, dupWeeks); setDuplicating(false);setShowDuplicate(false);toast(`${count} créneau${count>1?"x":""} créé${count>1?"s":""}${skipped > 0 ? ` (${skipped} doublon${skipped>1?"s":""})` : ""}`, "success");fetchData(); };


  const handleEditSave = async () => {
    if (!editCreneau) return;
    setEditSaving(true);
    try {
      const update: any = {
        activityTitle: editForm.activityTitle,
        monitor: editForm.monitor,
        startTime: editForm.startTime,
        endTime: editForm.endTime,
        maxPlaces: parseInt(editForm.maxPlaces) || editCreneau.maxPlaces,
        priceTTC: parseFloat(editForm.priceTTC) || 0,
        updatedAt: serverTimestamp(),
      };
      if (editForm.color) update.color = editForm.color;

      if (editApplyAll) {
        // Appliquer à tous les créneaux du même titre + même jour de semaine
        const dow = new Date(editCreneau.date).getDay();
        const targets = creneaux.filter(c =>
          c.activityTitle === editCreneau.activityTitle &&
          new Date(c.date).getDay() === dow &&
          c.startTime === editCreneau.startTime
        );
        for (const t of targets) {
          await updateDoc(doc(db, "creneaux", t.id), update);
        }
        toast(`✅ ${targets.length} créneaux mis à jour`, "success");
      } else {
        await updateDoc(doc(db, "creneaux", editCreneau.id), update);
        toast("✅ Créneau mis à jour", "success");
      }
      setEditCreneau(null);
      await fetchData();
    } catch (e) { console.error(e); toast("Erreur", "error"); }
    setEditSaving(false);
  };

  const exportPDF = () => {
    const visibleCreneaux = viewMode === "day" ? dayCreneaux : creneaux;
    const titre = viewMode === "day"
      ? `Planning du ${currentDay.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}`
      : viewMode === "week"
      ? `Planning semaine du ${weekDates[0].toLocaleDateString("fr-FR", { day: "numeric", month: "long" })} au ${weekDates[6].toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}`
      : `Planning ${currentDay.toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}`;
    const lignes = [...visibleCreneaux]
      .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime))
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
      const res = await fetch("/api/ia", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ type:"suggestions_planning", creneaux:payload, periode:periodeLabel, viewMode }) });
      const data = await res.json();
      if (data.success) { setIaSuggestions(data.suggestions); setIaStats(data.stats); }
      else setIaSuggestions(`Erreur : ${data.error}`);
    } catch(e: any) { setIaSuggestions(`Erreur : ${e.message}`); }
    setIaLoading(false);
  };
  const refreshCreneaux = async () => { const s=viewMode==="day"?fmtDate(currentDay):fmtDate(weekDates[0]); const e=viewMode==="day"?fmtDate(currentDay):fmtDate(weekDates[6]); const snap=await getDocs(query(collection(db,"creneaux"),where("date",">=",s),where("date","<=",e))); const fresh=snap.docs.map(d=>({id:d.id,...d.data()})) as (Creneau&{id:string})[]; setCreneaux(fresh); return fresh; };

  const handleEnroll = async (cid: string, child: EnrolledChild, payMode?: string, options?: { skipPayment?: boolean; skipEmail?: boolean }) => {
    const enrolled = await enrollChildInCreneau(cid, child);
    if (!enrolled) return;

    // Variables de rollback — capturées au fur et à mesure pour être disponibles dans le catch
    let usedCardId: string | null = null;
    let reservationCreated = false;

    try {
      const snap = await getDoc(doc(db, "creneaux", cid));
      if (!snap.exists()) return;
      const c = { id: snap.id, ...snap.data() } as any;
      await createReservation(child, c);
      reservationCreated = true;

      // skipPayment = true pour les inscriptions stage multi-jours
      const priceTTC = c.priceTTC || (c.priceHT || 0) * (1 + (c.tvaTaux || 5.5) / 100);
      if (!options?.skipPayment && priceTTC > 0) {

      // ─── LOGIQUE CARTE : noter paymentSource=card si carte compatible, sans débiter ───
      // Le débit réel se fait au montoir lors de la clôture (confirmation de présence)
      const isCoursType = ["cours", "cours_collectif", "cours_particulier"].includes(c.activityType);
      const isBaladeType = ["balade", "promenade", "ponyride"].includes(c.activityType);
      if (isCoursType || isBaladeType) {
        try {
          // Forfait actif sur le MÊME créneau précis → pas de carte
          // On calcule le slotKey du créneau courant pour comparer
          const currentSlotKey = `${c.activityTitle} — ${new Date(c.date).toLocaleDateString("fr-FR", { weekday: "long" })} ${c.startTime}`;
          const forfaitSnap = await getDocs(query(
            collection(db, "forfaits"),
            where("childId", "==", child.childId),
            where("status", "==", "actif")
          ));
          const hasForfaitActif = forfaitSnap.docs.some(d => {
            const fd = d.data();
            const forfaitType = fd.activityType || "cours";
            // Vérification 1 : type compatible
            const typeMatch =
              forfaitType === "all" ||
              (forfaitType === "cours" && isCoursType) ||
              (forfaitType === "balade" && isBaladeType);
            if (!typeMatch) return false;
            // Vérification 2 : même créneau précis via slotKey
            // Si le forfait a un slotKey, il doit correspondre au créneau courant
            if (fd.slotKey && fd.slotKey !== currentSlotKey) return false;
            return true;
          });
          if (!hasForfaitActif) {
            // Chercher carte individuelle OU carte familiale
            const [cartesIndivSnap, cartesFamSnap] = await Promise.all([
              getDocs(query(collection(db, "cartes"), where("childId", "==", child.childId), where("status", "==", "active"))),
              getDocs(query(collection(db, "cartes"), where("familyId", "==", child.familyId), where("familiale", "==", true), where("status", "==", "active"))),
            ]);
            const allCartesDocs = [...cartesIndivSnap.docs, ...cartesFamSnap.docs];
            const carteActive = allCartesDocs.find(d => {
              const data = d.data();
              if ((data.remainingSessions || 0) <= 0) return false;
              if (data.dateFin && new Date(data.dateFin) < new Date()) return false;
              const cardType = data.activityType || "cours";
              if (cardType === "cours" && isCoursType) return true;
              if (cardType === "balade" && isBaladeType) return true;
              return false;
            });
            if (carteActive) {
              usedCardId = null; // Pas de débit à l'inscription — le montoir s'en charge
              // Marquer paymentSource=card pour que le montoir sache quoi faire
              const creneauRef2 = doc(db, "creneaux", cid);
              const cSnap2 = await getDoc(creneauRef2);
              if (cSnap2.exists()) {
                const enrolled2 = cSnap2.data().enrolled || [];
                const updatedEnrolled = enrolled2.map((e: any) =>
                  e.childId === child.childId ? { ...e, paymentSource: "card", cardId: carteActive.id } : e
                );
                await updateDoc(creneauRef2, { enrolled: updatedEnrolled });
              }
              return; // Pas de payment pending — le débit se fait à la présence confirmée
            }
          }
        } catch (e) { console.error("Erreur vérification carte:", e); }
      }
      // ─── FIN LOGIQUE CARTE ───
      const priceHT = priceTTC / (1 + (c.tvaTaux || 5.5) / 100);
      const isPaid = !!payMode;
      const newItem = { activityTitle: c.activityTitle, childId: child.childId, childName: child.childName, creneauId: cid, activityType: c.activityType, date: c.date, startTime: c.startTime, endTime: c.endTime, priceHT: Math.round(priceHT * 100) / 100, tva: c.tvaTaux || 5.5, priceTTC: Math.round(priceTTC * 100) / 100 };

      let payRefId = "";

      if (isPaid) {
        // Encaissement immédiat → toujours créer un payment séparé (pas de fusion)
        const payRef = await addDoc(collection(db, "payments"), { orderId: generateOrderId(),
          familyId: child.familyId, familyName: child.familyName,
          items: [newItem],
          totalTTC: Math.round(priceTTC * 100) / 100,
          paymentMode: payMode || "",
          paymentRef: "",
          status: "paid",
          paidAmount: Math.round(priceTTC * 100) / 100,
          date: serverTimestamp(),
        });
        payRefId = payRef.id;
        await addDoc(collection(db, "encaissements"), {
          paymentId: payRefId, familyId: child.familyId, familyName: child.familyName,
          montant: Math.round(priceTTC * 100) / 100, mode: payMode,
          modeLabel: payMode === "cb_terminal" ? "CB (terminal)" : payMode === "especes" ? "Espèces" : payMode === "cheque" ? "Chèque" : payMode || "",
          ref: "", activityTitle: `${c.activityTitle} — ${child.childName}`,
          date: serverTimestamp(),
        });
      } else {
        // Paiement en attente → fusionner dans la commande ouverte la plus récente
        const existingSnap = await getDocs(query(collection(db, "payments"), where("familyId", "==", child.familyId), where("status", "==", "pending")));
        // Prendre la plus récente par date — EXCLURE les échéances de forfait
        const pendingDocs = existingSnap.docs
          .filter(d => !(d.data().echeancesTotal > 1))
          .sort((a, b) => {
            const da = a.data().date?.seconds || 0;
            const db2 = b.data().date?.seconds || 0;
            return db2 - da;
          });
        if (pendingDocs.length > 1) {
          console.warn(`⚠️ ${pendingDocs.length} commandes pending pour famille ${child.familyId} — fusion dans la plus récente`);
        }
        const openOrder = pendingDocs.length > 0 ? pendingDocs[0] : null;

        if (openOrder) {
          const existData = openOrder.data();
          const mergedItems = [...(existData.items || []), newItem];
          const mergedTotal = Math.round(mergedItems.reduce((s: number, i: any) => s + (i.priceTTC || 0), 0) * 100) / 100;
          await updateDoc(doc(db, "payments", openOrder.id), {
            items: mergedItems,
            totalTTC: mergedTotal,
            updatedAt: serverTimestamp(),
          });
          payRefId = openOrder.id;
        } else {
          const payRef = await addDoc(collection(db, "payments"), { orderId: generateOrderId(),
            familyId: child.familyId, familyName: child.familyName,
            items: [newItem],
            totalTTC: Math.round(priceTTC * 100) / 100,
            paymentMode: "",
            paymentRef: "",
            status: "pending",
            paidAmount: 0,
            date: serverTimestamp(),
          });
          payRefId = payRef.id;
        }
      }
    }
    // Email confirmation cours (skip pour les stages multi-jours — email envoyé séparément)
    if (!options?.skipEmail) {
      const fam = families.find(f => f.firestoreId === child.familyId);
      if (fam?.parentEmail && c.activityType !== "stage" && c.activityType !== "stage_journee") {
      try {
        const emailData = emailTemplates.confirmationCours({
          parentName: fam.parentName || "", childName: child.childName,
          coursTitle: c.activityTitle,
          date: new Date(c.date).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }),
          horaire: `${c.startTime}–${c.endTime}`, prix: priceTTC,
        });
        fetch("/api/send-email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to: fam.parentEmail, ...emailData }) }).catch(e => console.warn("Email:", e));
      } catch (e) { console.error("Email confirmation cours:", e); }
      }
    }
    const fresh = await refreshCreneaux(); const upd = fresh.find(x => x.id === cid); if (upd) setSelectedCreneau(upd);
    } catch (error) {
      console.error("Erreur handleEnroll, rollback:", error);
      try {
        // 1. Retirer l'enfant du créneau
        await removeChildFromCreneau(cid, child.childId);
        // 2. Supprimer la réservation si elle a été créée
        if (reservationCreated) await deleteReservations(cid, child.childId);
        // 3. Re-créditer la carte si elle a été débitée — usedCardId capturé AVANT le débit
        if (usedCardId) {
          const carteRef = doc(db, "cartes", usedCardId);
          const carteSnap = await getDoc(carteRef);
          if (carteSnap.exists()) {
            const cd = carteSnap.data();
            await updateDoc(carteRef, {
              remainingSessions: (cd.remainingSessions || 0) + 1,
              usedSessions: Math.max(0, (cd.usedSessions || 0) - 1),
              status: "active",
              updatedAt: serverTimestamp(),
            });
          }
        }
      } catch (e2) { console.error("Rollback partiel échoué:", e2); }
      toast("Erreur lors de l'inscription. L'opération a été annulée.", "error");
    }
  };

  const handleUnenroll = async (cid: string, childId: string) => {
    const cSnap = await getDoc(doc(db, "creneaux", cid));
    if (!cSnap.exists()) return;
    const c = { id: cSnap.id, ...cSnap.data() } as any;
    const isStageType = c.activityType === "stage" || c.activityType === "stage_journee";
    const child = (c.enrolled || []).find((e: any) => e.childId === childId);
    if (!child) return;

    // Trouver les créneaux à déinscrire (stage = tous les jours)
    let creneauxIds = [cid];
    if (isStageType) {
      const stageCreneaux = await findStageCreneaux(c.activityTitle, c.date);
      creneauxIds = stageCreneaux.map((sc: any) => sc.id);
    }

    const nbJours = creneauxIds.length;
    const msg = isStageType
      ? `Désinscrire ${child.childName} du stage "${c.activityTitle}" (${nbJours} jour${nbJours > 1 ? "s" : ""}) ?\n\nSi un paiement a été encaissé, un avoir sera créé automatiquement.`
      : `Désinscrire ${child.childName} de "${c.activityTitle}" le ${new Date(c.date).toLocaleDateString("fr-FR")} ?\n\nSi un paiement a été encaissé, un avoir sera créé automatiquement.`;
    if (!confirm(msg)) return;

    // 1. Retirer l'enfant de tous les créneaux + réservations
    for (const crId of creneauxIds) {
      await removeChildFromCreneau(crId, childId);
      await deleteReservations(crId, childId);
    }

    // 2. Si payé par carte → recréditer la carte
    if (child.paymentSource === "card" && child.cardId) {
      try {
        const carteRef = doc(db, "cartes", child.cardId);
        const carteSnap = await getDoc(carteRef);
        if (carteSnap.exists()) {
          const carteData = carteSnap.data();
          const newHistory = [...(carteData.history || []), {
            date: new Date().toISOString(),
            activityTitle: `Recrédit — ${c.activityTitle}`,
            childName: child.childName,
            creneauId: cid,
            credit: true,
          }];
          await updateDoc(carteRef, {
            remainingSessions: (carteData.remainingSessions || 0) + 1,
            usedSessions: Math.max(0, (carteData.usedSessions || 0) - 1),
            history: newHistory,
            status: "active",
            updatedAt: serverTimestamp(),
          });
        }
      } catch (e) { console.error("Erreur recrédit carte:", e); }
      await fetchData();
      return;
    }

    // 3. Gestion financière (paiement classique)
    try {
      const linked = await findLinkedPayment(child.familyId, childId, c.activityTitle);
      if (linked) {
        const { paymentDoc, paymentData, matchItem } = linked;
        const montantAvoir = matchItem.priceTTC || 0;
        const newItems = (paymentData.items || []).filter((i: any) => i !== matchItem);
        const newTotal = newItems.reduce((s: number, i: any) => s + (i.priceTTC || 0), 0);

        if (newItems.length === 0) {
          await updateDoc(doc(db, "payments", paymentDoc.id), {
            status: "cancelled", cancelledAt: serverTimestamp(),
            cancelReason: `Désinscription ${child.childName}`, updatedAt: serverTimestamp(),
          });
        } else {
          const newPaid = Math.min(paymentData.paidAmount || 0, newTotal);
          await updateDoc(doc(db, "payments", paymentDoc.id), {
            items: newItems, totalTTC: Math.round(newTotal * 100) / 100,
            paidAmount: Math.round(newPaid * 100) / 100,
            status: newPaid >= newTotal ? "paid" : newPaid > 0 ? "partial" : "pending",
            updatedAt: serverTimestamp(),
          });
        }

        // Avoir si trop-perçu
        if (montantAvoir > 0) {
          const tropPercu = await computeTropPercu(paymentDoc.id, newTotal);
          if (tropPercu > 0) {
            const avoirMontant = Math.min(tropPercu, montantAvoir);
            const ref = await createAvoir(child.familyId, child.familyName, avoirMontant,
              `Désinscription ${child.childName} — ${c.activityTitle}`, paymentDoc.id, "desinscription");
            toast(`${child.childName} désinscrit(e)${isStageType ? ` (${nbJours} jours)` : ""} — Avoir : ${avoirMontant.toFixed(2)}€`, "success");
            // Email notification avoir
            const fam2 = families.find(f => f.firestoreId === child.familyId);
            if (fam2?.parentEmail) {
              try {
                const emailData = emailTemplates.desinscriptionAvoir({
                  parentName: fam2.parentName || "", childName: child.childName,
                  activite: c.activityTitle, montantAvoir: avoirMontant, refAvoir: ref,
                });
                fetch("/api/send-email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to: fam2.parentEmail, ...emailData }) }).catch(e => console.warn("Email avoir:", e));
              } catch (e) { console.error("Email avoir:", e); }
            }
          } else {
            toast(`${child.childName} désinscrit(e)${isStageType ? ` (${nbJours} jours)` : ""} — Paiement ajusté`, "success");
          }
        } else {
          toast(`${child.childName} désinscrit(e)${isStageType ? ` (${nbJours} jours)` : ""}`, "success");
        }
      } else {
        toast(`${child.childName} désinscrit(e)${isStageType ? ` (${nbJours} jours)` : ""}`, "success");
      }

      // ── Nettoyage : annuler tous les paiements pending orphelins ──────────
      // (cas où l'enfant a été inscrit/désinscrit plusieurs fois)
      try {
        const allPaysSnap = await getDocs(query(
          collection(db, "payments"),
          where("familyId", "==", child.familyId),
          where("status", "==", "pending"),
        ));
        for (const pd of allPaysSnap.docs) {
          const pdata = pd.data();
          // Si ce paiement pending concerne cet enfant + cette activité
          const hasItem = (pdata.items || []).some((i: any) =>
            i.childId === childId &&
            (i.activityTitle?.includes(c.activityTitle) || c.activityTitle.includes(i.activityTitle || ""))
          );
          if (hasItem && pd.id !== linked?.paymentDoc?.id) {
            await updateDoc(doc(db, "payments", pd.id), {
              status: "cancelled", cancelledAt: serverTimestamp(),
              cancelReason: `Nettoyage désinscription ${child.childName}`, updatedAt: serverTimestamp(),
            });
          }
        }
      } catch (e) { console.error("Nettoyage paiements orphelins:", e); }
    } catch (e) {
      console.error("Erreur gestion paiement/avoir:", e);
      toast(`${child.childName} désinscrit(e) — erreur ajustement paiement`, "warning");
    }

    // ── Waitlist automatique : notifier le premier en attente si place libérée ──
    try {
      const freshCSnap = await getDoc(doc(db, "creneaux", cid));
      if (freshCSnap.exists()) {
        const freshC = freshCSnap.data() as any;
        const placesLibres = (freshC.maxPlaces || 0) - (freshC.enrolledCount || (freshC.enrolled || []).length);
        if (placesLibres > 0) {
          const waitSnap = await getDocs(query(
            collection(db, "waitlist"),
            where("creneauId", "==", cid),
            where("status", "==", "waiting"),
          ));
          const waiting = waitSnap.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .sort((a: any, b: any) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
          if (waiting.length > 0) {
            const first = waiting[0] as any;
            fetch("/api/send-email", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                to: first.familyEmail,
                subject: `🎉 Une place s'est libérée — ${c.activityTitle}`,
                html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;">
                  <p>Bonjour <strong>${first.familyName}</strong>,</p>
                  <p>Une place s'est libérée pour <strong>${first.childName}</strong> dans :</p>
                  <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;margin:16px 0;">
                    <p style="margin:0;color:#166534;font-weight:600;">${c.activityTitle}</p>
                    <p style="margin:8px 0 0;color:#555;font-size:13px;">📅 ${new Date(c.date).toLocaleDateString("fr-FR", { weekday:"long", day:"numeric", month:"long" })} — ${c.startTime}–${c.endTime}</p>
                  </div>
                  <p>Connectez-vous à votre espace famille pour confirmer sous <strong>24h</strong>.</p>
                  <p style="color:#666;font-size:12px;">À bientôt au centre équestre !</p>
                </div>`,
              }),
            }).catch(() => {});
            await updateDoc(doc(db, "waitlist", first.id), { status: "notified", notifiedAt: new Date().toISOString() });
            toast(`🔔 ${first.childName} (liste d'attente) notifié(e) — place libérée`, "success");
          }
        }
      }
    } catch (e) { console.error("Erreur waitlist auto:", e); }

    const fresh = await refreshCreneaux();
    const upd = fresh.find(x => x.id === cid);
    if (upd) setSelectedCreneau(upd);
  };

  const isToday = (d: Date) => fmtDate(d) === fmtDate(new Date());
  const dayCreneaux = creneaux.filter(c => c.date === fmtDate(currentDay)).sort((a,b) => a.startTime.localeCompare(b.startTime));

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-6">
        <h1 className="font-display text-2xl font-bold text-blue-800">Planning</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex bg-sand rounded-lg p-0.5">{(["month","week","timeline","day"] as const).map(v=><button key={v} onClick={()=>setViewMode(v)} className={`px-3 sm:px-4 py-2 rounded-md font-body text-xs font-semibold cursor-pointer border-none ${viewMode===v?"bg-white text-blue-500 shadow-sm":"text-slate-600 bg-transparent"}`}>{v==="week"?"Semaine":v==="day"?"Jour":v==="timeline"?"Timeline":"Mois"}</button>)}</div>
          <button onClick={()=>{setShowSimple(true);setShowGenerator(false);setSelectedDate(viewMode==="day"?fmtDate(currentDay):undefined);}} className="flex items-center gap-1.5 font-body text-xs sm:text-sm font-semibold text-white bg-blue-500 px-3 py-2 rounded-lg border-none cursor-pointer hover:bg-blue-400"><Plus size={14}/>Créneau</button>
          <button onClick={()=>setShowRdvForm(true)} className="flex items-center gap-1.5 font-body text-xs sm:text-sm font-semibold text-orange-700 bg-orange-50 px-3 py-2 rounded-lg border-none cursor-pointer hover:bg-orange-100"><Briefcase size={14}/>RDV Pro</button>
          <button onClick={()=>{setShowGenerator(true);setShowSimple(false);}} className="flex items-center gap-1.5 font-body text-xs sm:text-sm font-semibold text-blue-800 bg-gold-400 px-3 py-2 rounded-lg border-none cursor-pointer hover:bg-gold-300"><Calendar size={14}/>Périodes</button>
          {(viewMode==="week"||viewMode==="timeline")&&creneaux.length>0&&<button onClick={()=>setShowDuplicate(!showDuplicate)} className="font-body text-xs sm:text-sm font-semibold text-blue-500 bg-blue-50 px-3 py-2 rounded-lg border-none cursor-pointer">Dupliquer</button>}
          <button onClick={exportPDF} disabled={(viewMode==="day"?dayCreneaux:creneaux).length===0}
            className="flex items-center gap-1.5 font-body text-xs sm:text-sm font-semibold text-slate-600 bg-gray-100 px-3 py-2 rounded-lg border-none cursor-pointer hover:bg-gray-200 disabled:opacity-40">
            <Printer size={14}/> PDF
          </button>
          <button onClick={analyserPlanning} disabled={iaLoading || (viewMode==="day"?dayCreneaux:creneaux).length===0}
            className="flex items-center gap-1.5 font-body text-xs sm:text-sm font-semibold text-white px-3 py-2 rounded-lg border-none cursor-pointer disabled:opacity-40"
            style={{ background: "linear-gradient(135deg,#7c3aed,#2050A0)" }}>
            {iaLoading ? <Loader2 size={14} className="animate-spin"/> : <Sparkles size={14}/>}
            {iaLoading ? "Analyse..." : "IA"}
          </button>
        </div>
      </div>

      {showSimple && <SimpleCreneauForm activities={activities} onSave={handleCreate} onCancel={()=>setShowSimple(false)} defaultDate={selectedDate}/>}
      {showGenerator && <PeriodGenerator activities={activities} onGenerate={handleCreate} onCancel={()=>setShowGenerator(false)}/>}
      {showDuplicate && <Card padding="md" className="mb-6 border-gold-400/20 bg-gold-50"><div className="flex justify-between items-center mb-3"><h3 className="font-body text-base font-semibold text-blue-800">📋 Dupliquer semaine</h3><button onClick={()=>setShowDuplicate(false)} className="text-slate-600 bg-transparent border-none cursor-pointer"><X size={18}/></button></div><div className="flex items-center gap-4 mb-3"><label className="font-body text-sm text-blue-800">Semaines:</label><input type="number" min={1} max={20} value={dupWeeks} onChange={e=>setDupWeeks(parseInt(e.target.value)||1)} className="w-20 px-3 py-2 rounded-lg border border-blue-500/8 font-body text-sm bg-white text-center"/></div><button onClick={handleDuplicateWeek} disabled={duplicating} className={`flex items-center gap-2 px-6 py-2.5 rounded-lg font-body text-sm font-semibold border-none cursor-pointer ${duplicating?"bg-gray-200 text-slate-600":"bg-gold-400 text-blue-800"}`}>{duplicating?<Loader2 size={16} className="animate-spin"/>:<Check size={16}/>} Dupliquer</button></Card>}

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
            <button onClick={() => { setShowIaPanel(false); setIaSuggestions(null); setIaStats(null); }}
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
          <button onClick={()=>setDayOffset(d=>d-1)} className="flex items-center gap-1 font-body text-sm text-slate-600 bg-white px-4 py-2 rounded-lg border border-gray-200 cursor-pointer"><ChevronLeft size={16}/>Veille</button>
          <div className="flex flex-col items-center gap-1">
            <div className="font-display text-lg font-bold text-blue-800 capitalize">{currentDay.toLocaleDateString("fr-FR",{weekday:"long",day:"numeric",month:"long",year:"numeric"})}</div>
            <div className="font-body text-xs text-slate-600">{dayCreneaux.length} créneau{dayCreneaux.length>1?"x":""}</div>
            <input type="date" title="Aller à cette date"
              className="font-body text-xs px-2 py-1 rounded-lg border border-gray-200 bg-white cursor-pointer focus:border-blue-400 focus:outline-none text-slate-500"
              onChange={e => {
                if (!e.target.value) return;
                const [py2, pm2, pd2] = e.target.value.split("-").map(Number);
                const picked = new Date(py2, pm2 - 1, pd2);
                const today = new Date(); today.setHours(0,0,0,0);
                setDayOffset(Math.round((picked.getTime() - today.getTime()) / 86400000));
                e.target.value = "";
              }}/>
          </div>
          <div className="flex gap-2"><button onClick={()=>setDayOffset(0)} className="font-body text-sm text-blue-500 bg-blue-50 px-4 py-2 rounded-lg border-none cursor-pointer">Auj.</button><button onClick={()=>setDayOffset(d=>d+1)} className="flex items-center gap-1 font-body text-sm text-slate-600 bg-white px-4 py-2 rounded-lg border border-gray-200 cursor-pointer">Lendemain<ChevronRight size={16}/></button></div>
        </div>
        {loading?<div className="text-center py-16"><Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto"/></div>:
        dayCreneaux.length===0?<Card padding="lg" className="text-center"><div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto mb-3"><CalendarDays size={28} className="text-blue-300" /></div><p className="font-body text-sm text-slate-600">Aucun créneau.</p></Card>:
        <div className="flex flex-col gap-3">{dayCreneaux.map(c=>{const en=c.enrolled||[];const fill=c.maxPlaces>0?en.length/c.maxPlaces:0;const col=(c as any).color||typeColors[c.activityType]||"#666";const ttc=(c as any).priceTTC||(c.priceHT||0)*(1+(c.tvaTaux||5.5)/100);return(
          <Card key={c.id} padding="md" className="cursor-pointer hover:shadow-lg" hover>
            <div onClick={()=>setSelectedCreneau(c)}>
              <div className="flex items-start justify-between mb-3"><div className="flex items-center gap-4"><div className="w-14 text-center"><div className="font-body text-lg font-bold" style={{color:col}}>{c.startTime}</div><div className="font-body text-[10px] text-slate-600">{c.endTime}</div></div><div style={{borderLeftWidth:3,borderLeftColor:col,paddingLeft:12}}><div className="font-body text-base font-semibold text-blue-800">{c.activityTitle}</div><div className="font-body text-xs text-slate-600">{c.monitor} · {c.maxPlaces} pl.{ttc>0?` · ${ttc.toFixed(0)}€`:""}</div></div></div><div className="flex items-center gap-2">{(()=>{const unpaid=en.filter((e:any)=>{const isCard=e.paymentSource==="card";const hp=isCard||payments.some((p:any)=>p.familyId===e.familyId&&p.status==="paid"&&(p.items||[]).some((i:any)=>i.childId===e.childId));const hpend=!hp&&!isCard&&payments.some((p:any)=>p.familyId===e.familyId&&(p.status==="pending"||p.status==="partial")&&(p.items||[]).some((i:any)=>i.childId===e.childId));return!hp&&!hpend&&!isCard;}).length;return unpaid>0?<span className="font-body text-xs font-semibold text-red-500 bg-red-50 px-2 py-1 rounded-lg">⚠️ {unpaid} impayé{unpaid>1?"s":""}</span>:null;})()}<Badge color={fill>=1?"red":fill>=0.7?"orange":"green"}>{en.length}/{c.maxPlaces}</Badge><button onClick={e=>{e.stopPropagation();setEditCreneau(c);setEditForm({activityTitle:c.activityTitle,monitor:c.monitor||"",startTime:c.startTime,endTime:c.endTime,maxPlaces:c.maxPlaces,priceTTC:(c as any).priceTTC||0,color:(c as any).color||""});setEditApplyAll(false);}} className="text-blue-400 hover:text-blue-600 bg-blue-50 hover:bg-blue-100 w-8 h-8 rounded-lg border-none cursor-pointer flex items-center justify-center"><Settings size={15}/></button><button onClick={e=>{e.stopPropagation();openDelete(c);}} className="text-slate-400 hover:text-red-500 bg-transparent border-none cursor-pointer"><Trash2 size={16}/></button></div></div>
              {en.length>0&&<div className="ml-[68px] flex flex-wrap gap-2">{en.map((e:any)=>{
                const isCard = e.paymentSource === "card";
                const hasPaid = isCard || payments.some((p: any) => p.familyId === e.familyId && p.status === "paid" && (p.items||[]).some((i:any) => i.childId === e.childId && (i.creneauId === c.id || i.activityTitle === c.activityTitle)));
                const hasPending = !hasPaid && !isCard && payments.some((p: any) => p.familyId === e.familyId && (p.status === "pending" || p.status === "partial") && (p.items||[]).some((i:any) => i.childId === e.childId));
                const statusColor = isCard ? "#2050A0" : hasPaid ? "#16a34a" : hasPending ? "#d97706" : "#9ca3af";
                const statusBg   = isCard ? "#EDF2FA"  : hasPaid ? "#f0fdf4"  : hasPending ? "#fffbeb"  : "#f3f4f6";
                const statusIcon = isCard ? "🎟️" : hasPaid ? "✓" : hasPending ? "…" : "—";
                const statusLabel = isCard ? "carte" : hasPaid ? "réglé" : hasPending ? "en attente" : "non réglé";
                return <span key={e.childId} className="font-body text-xs px-2.5 py-1.5 rounded-full flex items-center gap-1.5 border"
                  style={{ background: statusBg, borderColor: statusColor+"33", color: "#0C1A2E" }}>
                  <span className="text-[11px]">{statusIcon}</span>
                  <span className="font-semibold">{e.childName}</span>
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

      {selectedCreneau&&<EnrollPanel creneau={selectedCreneau as any} families={families} allCreneaux={creneaux} payments={payments} allCartes={allCartes} allForfaits={allForfaits} onClose={()=>{setSelectedCreneau(null);fetchData();}} onEnroll={handleEnroll} onUnenroll={handleUnenroll}/>}

      {/* ── Modal suppression créneau ── */}
      {deleteCreneau && (
        <DeleteCreneauModal
          creneau={deleteCreneau}
          deleting={deleteDeleting}
          deleteCount={deleteCount}
          deleteWeekCount={deleteWeekCount}
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
          saving={editSaving}
          applyAll={editApplyAll}
          onFormChange={setEditForm}
          onApplyAllChange={setEditApplyAll}
          onClose={() => setEditCreneau(null)}
          onSave={handleEditSave}
        />
      )}
    </div>
  );
}
