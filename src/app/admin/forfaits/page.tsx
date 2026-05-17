"use client";
import { useAgentContext } from "@/hooks/useAgentContext";

import { useState, useEffect, useMemo } from "react";
import { collection, getDocs, addDoc, updateDoc, doc, getDoc, query, where, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Card, Badge } from "@/components/ui";
import {
  Loader2, Search, Users, Calendar, ChevronDown, ChevronUp, Pause, Play, XCircle, CreditCard, TrendingUp, UserMinus, Plus, X, Check, AlertTriangle, RefreshCw,
} from "lucide-react";
import type { Family } from "@/types";
import { authFetch } from "@/lib/auth-fetch";
import { compareCreneauxByDow } from "@/lib/creneau-sort";

interface Forfait {
  id: string;
  familyId: string;
  familyName: string;
  childId: string;
  childName: string;
  slotKey: string;
  activityTitle: string;
  dayLabel: string;
  startTime: string;
  endTime: string;
  totalSessions: number;
  attendedSessions: number;
  licenceFFE: boolean;
  licenceType: string;
  adhesion: boolean;
  forfaitPriceTTC: number;
  totalPaidTTC: number;
  paymentPlan: string;
  status: "active" | "actif" | "suspended" | "completed" | "cancelled";
  createdAt: any;
}

interface Payment {
  id: string;
  familyId: string;
  totalTTC: number;
  paidAmount: number;
  status: string;
  items: any[];
  date: any;
}

interface Creneau {
  id: string;
  activityId: string;
  activityTitle: string;
  activityType: string;
  date: string;
  startTime: string;
  endTime: string;
  monitor: string;
  maxPlaces: number;
  enrolled: any[];
  priceTTC?: number;
  priceHT?: number;
  tvaTaux?: number;
}

interface WeeklySlot {
  key: string;
  activityId: string;
  activityTitle: string;
  dayOfWeek: number;
  dayLabel: string;
  startTime: string;
  endTime: string;
  monitor: string;
  maxPlaces: number;
  totalSessions: number;
  avgEnrolled: number;
  spotsAvailable: number;
  creneauIds: string[];
  priceTTC: number;
}

const dayLabels = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];

const statusConfig: Record<string, { label: string; color: "green" | "orange" | "gray" | "red" }> = {
  active: { label: "Actif", color: "green" },
  actif: { label: "Actif", color: "green" },
  suspended: { label: "Suspendu", color: "orange" },
  completed: { label: "Terminé", color: "gray" },
  cancelled: { label: "Résilié", color: "red" },
};

const LICENCE_FFE_MOINS18 = 25;
const LICENCE_FFE_PLUS18 = 36;
const ADHESION_PRICE = 60;

export default function ForfaitsPage() {
  const { setAgentContext } = useAgentContext("forfaits");

  useEffect(() => {
    setAgentContext({ module_actif: "forfaits", description: "forfaits annuels actifs" });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [forfaits, setForfaits] = useState<Forfait[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [families, setFamilies] = useState<(Family & { firestoreId: string })[]>([]);
  const [creneaux, setCreneaux] = useState<Creneau[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [unenrolling, setUnenrolling] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  // ── Create form state ──
  const [selFamily, setSelFamily] = useState("");
  const [familySearch, setFamilySearch] = useState("");
  const [selChild, setSelChild] = useState("");
  const [frequence, setFrequence] = useState<"1x" | "2x" | "3x">("1x");
  const [selectedSlots, setSelectedSlots] = useState<string[]>([]);
  const [slotSearch, setSlotSearch] = useState("");
  const [licenceFFE, setLicenceFFE] = useState(true);
  const [licenceType, setLicenceType] = useState<"moins18" | "plus18">("moins18");
  const [adhesion, setAdhesion] = useState(true);
  const [payPlan, setPayPlan] = useState<"1x" | "3x" | "10x">("1x");
  const [creating, setCreating] = useState(false);
  const [slotChange, setSlotChange] = useState<{ forfait: Forfait; newSlotSearch: string; oldSlot?: { dayOfWeek: number; startTime: string; activityTitle: string } } | null>(null);
  const [slotChanging, setSlotChanging] = useState(false);

  // Réductions famille (chargées depuis settings/degressivite)
  const [familyDiscountRules, setFamilyDiscountRules] = useState<{ nth: number; discount: number }[]>([]);

  const fetchData = async () => {
    try {
      const [fSnap, pSnap, famSnap, cSnap, degSnap] = await Promise.all([
        getDocs(collection(db, "forfaits")),
        getDocs(collection(db, "payments")),
        getDocs(collection(db, "families")),
        getDocs(query(collection(db, "creneaux"), where("activityType", "==", "cours"))),
        getDoc(doc(db, "settings", "degressivite")),
      ]);
      setForfaits(fSnap.docs.map(d => ({ id: d.id, ...d.data() })) as Forfait[]);
      setPayments(pSnap.docs.map(d => ({ id: d.id, ...d.data() })) as Payment[]);
      setFamilies(famSnap.docs.map(d => ({ firestoreId: d.id, ...d.data() })) as any);
      const today = new Date().toISOString().split("T")[0];
      setCreneaux(
        (cSnap.docs.map(d => ({ id: d.id, ...d.data() })) as Creneau[])
          .filter(c => c.date >= today)
      );
      if (degSnap.exists() && degSnap.data().familyDiscount) {
        setFamilyDiscountRules(degSnap.data().familyDiscount);
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  // ── Weekly slots from creneaux ──
  const weeklySlots = useMemo(() => {
    const map: Record<string, WeeklySlot> = {};
    for (const c of creneaux) {
      const d = new Date(c.date);
      const dow = (d.getDay() + 6) % 7;
      const key = `${c.activityId}-${dow}-${c.startTime}`;
      if (!map[key]) {
        map[key] = {
          key, activityId: c.activityId, activityTitle: c.activityTitle,
          dayOfWeek: dow, dayLabel: dayLabels[dow],
          startTime: c.startTime, endTime: c.endTime,
          monitor: c.monitor, maxPlaces: c.maxPlaces,
          totalSessions: 0, avgEnrolled: 0, spotsAvailable: 0, creneauIds: [],
          priceTTC: c.priceTTC || ((c.priceHT || 0) * (1 + (c.tvaTaux || 5.5) / 100)),
        };
      }
      map[key].totalSessions++;
      map[key].creneauIds.push(c.id);
      const enrolled = c.enrolled?.length || 0;
      map[key].avgEnrolled = Math.max(map[key].avgEnrolled, enrolled);
    }
    for (const slot of Object.values(map)) {
      slot.spotsAvailable = slot.maxPlaces - slot.avgEnrolled;
    }
    return Object.values(map).sort(compareCreneauxByDow);
  }, [creneaux]);

  // ── Filtered slots for search ──
  const filteredSlots = useMemo(() => {
    if (!slotSearch.trim()) return weeklySlots;
    const q = slotSearch.toLowerCase();
    return weeklySlots.filter(s =>
      s.activityTitle.toLowerCase().includes(q) ||
      s.dayLabel.toLowerCase().includes(q) ||
      s.startTime.includes(q) ||
      s.monitor.toLowerCase().includes(q)
    );
  }, [weeklySlots, slotSearch]);

  const selectedSlotsData = weeklySlots.filter(s => selectedSlots.includes(s.key));
  const requiredSlots = frequence === "3x" ? 3 : frequence === "2x" ? 2 : 1;
  const slotsComplete = selectedSlots.length === requiredSlots;

  // ── Toggle slot ──
  const toggleSlot = (key: string) => {
    setSelectedSlots(prev => {
      if (prev.includes(key)) return prev.filter(k => k !== key);
      if (frequence === "1x") return [key];
      if (prev.length >= requiredSlots) return prev;
      return [...prev, key];
    });
  };

  // ── Family search ──
  const filteredFamilies = useMemo(() => {
    if (!familySearch.trim()) return families;
    const q = familySearch.toLowerCase();
    return families.filter(f =>
      f.parentName?.toLowerCase().includes(q) ||
      f.parentEmail?.toLowerCase().includes(q) ||
      (f.children || []).some((c: any) => c.firstName?.toLowerCase().includes(q))
    );
  }, [families, familySearch]);

  const fam = families.find(f => f.firestoreId === selFamily);
  const children = fam?.children || [];

  // ── Prices ──
  const slotsPrices = selectedSlotsData.map(slot => {
    const price = slot.priceTTC || 0;
    const forfaitPrice = price > 100 ? price : price * slot.totalSessions;
    return { slot, forfaitPrice, sessions: slot.totalSessions };
  });
  const totalForfaitBrut = slotsPrices.reduce((sum, s) => sum + s.forfaitPrice, 0);

  // ── Réduction famille : compter les autres enfants de la même famille déjà inscrits ──
  const existingChildIds = selFamily
    ? [...new Set(forfaits.filter(f => f.familyId === selFamily && (f.status === "active" || f.status === "actif") && f.childId !== selChild).map(f => f.childId))]
    : [];
  const childRank = existingChildIds.length + 1; // 1er enfant = rang 1, 2ème = rang 2, etc.
  const familyRule = familyDiscountRules.find(r => r.nth === childRank);
  const familyDiscountPercent = familyRule?.discount || 0;
  const familyDiscountAmount = familyDiscountPercent > 0 ? Math.round(totalForfaitBrut * familyDiscountPercent / 100 * 100) / 100 : 0;
  const totalForfait = totalForfaitBrut - familyDiscountAmount;

  const licencePrice = licenceFFE ? (licenceType === "moins18" ? LICENCE_FFE_MOINS18 : LICENCE_FFE_PLUS18) : 0;
  const adhesionPrice = adhesion ? ADHESION_PRICE : 0;
  const grandTotal = totalForfait + licencePrice + adhesionPrice;

  // ── Create forfait + batch enroll ──
  const handleCreate = async () => {
    if (!selFamily || !selChild || !slotsComplete || !fam) return;
    setCreating(true);
    const child = children.find((c: any) => c.id === selChild);
    const childName = (child as any)?.firstName || "—";

    try {
      // 1. Batch enroll child in all creneaux for selected slots
      const allCreneauIds = selectedSlotsData.flatMap(s => s.creneauIds);
      // Précalcul des forfaitIds par slotKey (rempli après la création des forfaits)
      // En attendant, on marque l'enrolled avec paymentSource pour que la
      // désinscription d'UN créneau crée un rattrapage et non un avoir.
      for (const creneauId of allCreneauIds) {
        const creneau = creneaux.find(c => c.id === creneauId);
        if (!creneau) continue;
        if ((creneau.enrolled || []).some((e: any) => e.childId === selChild)) continue;
        const newEnrolled = [...(creneau.enrolled || []), {
          childId: selChild,
          childName,
          familyId: selFamily,
          familyName: fam.parentName || "—",
          enrolledAt: new Date().toISOString(),
          // Marqueur : inscription couverte par un forfait annuel.
          // handleUnenroll utilise ce flag pour ne PAS créer d'avoir
          // mais un simple rattrapage. forfaitId reste null ici car le
          // forfait est créé juste après ; la détection par activité +
          // jour + heure prendra le relais si besoin.
          paymentSource: "forfait",
          forfaitId: null,
        }];
        await updateDoc(doc(db, "creneaux", creneauId), {
          enrolled: newEnrolled,
          enrolledCount: newEnrolled.length,
        });
      }

      // 2. Create forfait document(s)
      // Saison FFE de la création : aujourd'hui → si mois >= sept, Y, sinon Y-1.
      // Sert au filtrage rangEnfantFamille pour ne pas mélanger les saisons.
      const _now = new Date();
      const _seasonStartYear = _now.getMonth() >= 8 ? _now.getFullYear() : _now.getFullYear() - 1;
      for (const sp of slotsPrices) {
        await addDoc(collection(db, "forfaits"), {
          familyId: selFamily,
          familyName: fam.parentName || "—",
          childId: selChild,
          childName,
          slotKey: `${sp.slot.activityTitle} — ${sp.slot.dayLabel} ${sp.slot.startTime}`,
          activityTitle: sp.slot.activityTitle,
          dayLabel: sp.slot.dayLabel,
          startTime: sp.slot.startTime,
          endTime: sp.slot.endTime,
          totalSessions: sp.sessions,
          attendedSessions: 0,
          licenceFFE,
          licenceType,
          adhesion,
          forfaitPriceTTC: sp.forfaitPrice,
          totalPaidTTC: 0,
          paymentPlan: payPlan,
          status: "active",
          frequence,
          creneauIds: sp.slot.creneauIds,
          seasonStartYear: _seasonStartYear,
          createdAt: serverTimestamp(),
        });
      }

      // 3. Create reservation records
      for (const sp of slotsPrices) {
        await addDoc(collection(db, "reservations"), {
          familyId: selFamily,
          familyName: fam.parentName || "—",
          childId: selChild,
          childName,
          activityTitle: sp.slot.activityTitle,
          activityType: "cours",
          type: "annual",
          forfaitType: frequence,
          slotKey: sp.slot.key,
          dayOfWeek: sp.slot.dayOfWeek,
          dayLabel: sp.slot.dayLabel,
          startTime: sp.slot.startTime,
          endTime: sp.slot.endTime,
          totalSessions: sp.sessions,
          creneauIds: sp.slot.creneauIds,
          status: "confirmed",
          createdAt: serverTimestamp(),
        });
      }

      // 4. Create payment record
      await addDoc(collection(db, "payments"), {
        familyId: selFamily,
        familyName: fam.parentName || "—",
        childId: selChild,
        childName,
        type: "inscription_annuelle",
        forfaitType: frequence,
        items: [
          ...(licenceFFE ? [{ activityTitle: `Licence FFE (${licenceType === "moins18" ? "-18" : "+18"})`, priceTTC: licencePrice }] : []),
          ...(adhesion ? [{ activityTitle: "Adhésion annuelle", priceTTC: adhesionPrice }] : []),
          ...slotsPrices.map(sp => ({
            activityTitle: `Forfait ${sp.slot.activityTitle} — ${sp.slot.dayLabel} ${sp.slot.startTime}`,
            priceTTC: sp.forfaitPrice,
          })),
          ...(familyDiscountAmount > 0 ? [{ activityTitle: `Réduction famille (${childRank}ème enfant, -${familyDiscountPercent}%)`, priceTTC: -familyDiscountAmount }] : []),
        ],
        totalTTC: grandTotal,
        paidAmount: 0,
        paymentMode: "pending",
        paymentRef: payPlan !== "1x" ? payPlan : "",
        status: "pending",
        date: serverTimestamp(),
      });

      // Reset form
      setSelFamily(""); setSelChild(""); setSelectedSlots([]);
      setFrequence("1x"); setSlotSearch(""); setFamilySearch("");
      setShowCreate(false);
      fetchData();
      alert(`✅ ${childName} inscrit(e) à ${selectedSlotsData.length} créneau(x) — ${allCreneauIds.length} séances sur la saison.`);
    } catch (e: any) {
      console.error(e);
      alert("Erreur lors de la création du forfait.");
    }
    setCreating(false);
  };

  // ── Existing logic ──
  const activeCount = forfaits.filter(f => f.status === "active" || f.status === "actif").length;
  const suspendedCount = forfaits.filter(f => f.status === "suspended").length;
  const totalCA = forfaits.filter(f => f.status !== "cancelled").reduce((s, f) => s + (f.forfaitPriceTTC || 0), 0);
  const totalPaid = forfaits.reduce((s, f) => s + (f.totalPaidTTC || 0), 0);
  const totalDue = totalCA - totalPaid;

  const getPaidForForfait = (f: Forfait) => {
    const related = payments.filter(p =>
      p.familyId === f.familyId &&
      (p.status === "paid" || p.status === "sepa_scheduled") &&
      (p.items || []).some((i: any) => i.activityTitle?.includes("Forfait") && i.activityTitle?.includes(f.activityTitle || ""))
    );
    return related.reduce((s, p) => s + (p.paidAmount || (p.status === "paid" ? p.totalTTC : 0) || 0), 0);
  };

  const filtered = useMemo(() => {
    let result = [...forfaits];
    if (filterStatus !== "all") result = result.filter(f => f.status === filterStatus || (filterStatus === "active" && f.status === "actif"));
    if (search) {
      const terms = search.toLowerCase().trim().split(/\s+/);
      result = result.filter(f => {
        const searchable = [f.familyName || "", f.childName || "", f.activityTitle || "", f.slotKey || ""].join(" ").toLowerCase();
        return terms.every(t => searchable.includes(t));
      });
    }
    return result.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
  }, [forfaits, filterStatus, search]);

  const handleStatusChange = async (id: string, newStatus: string) => {
    setSaving(true);
    try {
      await updateDoc(doc(db, "forfaits", id), { status: newStatus, updatedAt: serverTimestamp() });
      fetchData();
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  const handleUnenrollAll = async (f: Forfait) => {
    if (!confirm(`Désinscrire ${f.childName} de TOUS les cours annuels futurs ?\n\nCela le retirera de toutes les séances à venir et annulera les échéances non réglées.`)) return;
    setUnenrolling(f.id);
    try {
      const res = await authFetch("/api/admin/unenroll-annual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ childId: f.childId, childName: f.childName, familyId: f.familyId }),
      });
      const data = await res.json();
      if (data.success) {
        alert(`✅ ${data.message}`);
        await updateDoc(doc(db, "forfaits", f.id), { status: "cancelled", updatedAt: serverTimestamp() });
        fetchData();
      } else {
        alert(`❌ Erreur : ${data.error}`);
      }
    } catch (e: any) {
      console.error(e);
      alert("Erreur lors de la désinscription.");
    }
    setUnenrolling(null);
  };

  // ── Helper : derive les "slots hebdo" reels d'un forfait depuis Firestore ──
  // Un forfait stocke seulement son créneau principal (slotKey). Si l'enfant
  // est inscrit en 2x ou 3x par semaine, les autres créneaux ne sont pas
  // visibles dans le doc forfait — ils sont identifiables par enrolled[].
  // paymentSource === 'forfait' sur les créneaux futurs de la saison.
  // Cette fonction agrège les inscriptions et regroupe par slot hebdo unique.
  const detectActualSlots = (f: Forfait): { key: string; dayLabel: string; startTime: string; endTime: string; activityTitle: string; count: number; isPrincipal: boolean }[] => {
    const today = new Date().toISOString().split("T")[0];
    // Saison du forfait : on prend seasonStartYear si présent, sinon fallback createdAt
    let seasonEnd = "";
    if ((f as any).seasonStartYear) {
      seasonEnd = `${(f as any).seasonStartYear + 1}-06-30`;
    } else {
      // Fallback : juin de l'annee en cours ou suivante selon le mois
      const now = new Date();
      seasonEnd = `${now.getMonth() >= 8 ? now.getFullYear() + 1 : now.getFullYear()}-06-30`;
    }

    const slotMap = new Map<string, { key: string; dayLabel: string; startTime: string; endTime: string; activityTitle: string; count: number; isPrincipal: boolean }>();
    const dayNames = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];

    for (const c of creneaux) {
      const cAny = c as any;
      if (cAny.date < today || cAny.date > seasonEnd) continue;
      const enrolled = cAny.enrolled || [];
      const isEnrolled = enrolled.some((e: any) =>
        e.childId === f.childId && e.paymentSource === "forfait"
      );
      if (!isEnrolled) continue;

      const dow = new Date(cAny.date + "T12:00:00").getDay();
      const dayLabel = dayNames[dow];
      const key = `${dow}-${cAny.startTime}-${cAny.activityTitle}`;
      const isPrincipal = f.startTime === cAny.startTime && f.activityTitle === cAny.activityTitle;
      const existing = slotMap.get(key);
      if (existing) {
        existing.count++;
      } else {
        slotMap.set(key, { key, dayLabel, startTime: cAny.startTime, endTime: cAny.endTime, activityTitle: cAny.activityTitle, count: 1, isPrincipal });
      }
    }
    // Tri par jour de semaine
    return Array.from(slotMap.values()).sort((a, b) => {
      const dayA = dayNames.indexOf(a.dayLabel);
      const dayB = dayNames.indexOf(b.dayLabel);
      if (dayA !== dayB) return dayA - dayB;
      return a.startTime.localeCompare(b.startTime);
    });
  };

  // Retirer UN seul créneau hebdo (les futurs cours du même jour+heure+activité
  // jusqu'a la fin de saison), sans toucher au forfait ni au paiement.
  const handleRemoveSlot = async (f: Forfait, slot: { key: string; dayLabel: string; startTime: string; activityTitle: string }) => {
    if (!confirm(`Retirer ${f.childName} du créneau ${slot.dayLabel} ${slot.startTime} (${slot.activityTitle}) ?\n\nLes autres créneaux du forfait restent inchangés.\nAucun avoir n'est créé (suppression simple).`)) return;
    setSlotChanging(true);
    try {
      const today = new Date().toISOString().split("T")[0];
      const seasonEnd = (f as any).seasonStartYear
        ? `${(f as any).seasonStartYear + 1}-06-30`
        : `${new Date().getMonth() >= 8 ? new Date().getFullYear() + 1 : new Date().getFullYear()}-06-30`;
      const dayNames = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
      const slotDow = dayNames.indexOf(slot.dayLabel);

      let removed = 0;
      for (const c of creneaux) {
        const cAny = c as any;
        if (cAny.date < today || cAny.date > seasonEnd) continue;
        if (cAny.status === "closed") continue;
        const dow = new Date(cAny.date + "T12:00:00").getDay();
        if (dow !== slotDow) continue;
        if (cAny.startTime !== slot.startTime) continue;
        if (cAny.activityTitle !== slot.activityTitle) continue;
        const enrolled = cAny.enrolled || [];
        if (!enrolled.some((e: any) => e.childId === f.childId)) continue;
        const newEnrolled = enrolled.filter((e: any) => e.childId !== f.childId);
        await updateDoc(doc(db, "creneaux", cAny.id), { enrolled: newEnrolled, enrolledCount: newEnrolled.length });
        removed++;
      }
      alert(`✅ ${f.childName} retiré(e) de ${removed} séance(s) sur ${slot.dayLabel} ${slot.startTime}`);
      await fetchData();
    } catch (e: any) {
      console.error(e);
      alert(`Erreur: ${e.message || e}`);
    }
    setSlotChanging(false);
  };

  const handleSlotChange = async (forfait: Forfait, newSlot: WeeklySlot, oldSlot?: { dayOfWeek: number; startTime: string; activityTitle: string }) => {
    // Si oldSlot est fourni, on ne change QUE ce créneau précis.
    // Sinon (comportement legacy), on remplace TOUS les créneaux du forfait
    // par le nouveau (cas forfait 1x/sem qui change de jour).
    const confirmMsg = oldSlot
      ? `Changer UN créneau du forfait de ${forfait.childName} ?\n\n❌ Ancien : ${["dimanche","lundi","mardi","mercredi","jeudi","vendredi","samedi"][oldSlot.dayOfWeek]} ${oldSlot.startTime} — ${oldSlot.activityTitle}\n✅ Nouveau : ${newSlot.activityTitle} — ${newSlot.dayLabel} ${newSlot.startTime}\n\nLes autres créneaux du forfait restent inchangés.\nLes paiements ne sont PAS modifiés.`
      : `Changer le créneau de ${forfait.childName} ?\n\n❌ Ancien : ${forfait.slotKey}\n✅ Nouveau : ${newSlot.activityTitle} — ${newSlot.dayLabel} ${newSlot.startTime}\n\nLes paiements ne sont PAS modifiés.`;
    if (!confirm(confirmMsg)) return;
    setSlotChanging(true);
    try {
      // 1. Désinscrire de tous les créneaux futurs NON-CLÔTURÉS de la SAISON DU FORFAIT
      // Si oldSlot fourni : on filtre AUSSI par jour+heure+activite pour ne
      // toucher qu'au créneau précis qu'on change.
      const today = new Date().toISOString().split("T")[0];
      // ── Borne fin de saison : depend du forfait, pas d'aujourd'hui ─────
      // Le forfait stocke seasonStartYear (annee de debut de saison FFE).
      // La saison va de 1er sept Y au 30 juin Y+1.
      // Si seasonStartYear absent (forfaits anciens), fallback sur aujourd'hui :
      //   - mois >= sept → Y/Y+1, fin = juin Y+1
      //   - mois < sept → Y-1/Y, fin = juin Y
      let _seasonEndYear: number;
      if ((forfait as any).seasonStartYear) {
        _seasonEndYear = (forfait as any).seasonStartYear + 1;
      } else {
        const _todayDate = new Date();
        const _todayMonth = _todayDate.getMonth();
        const _todayYear = _todayDate.getFullYear();
        _seasonEndYear = _todayMonth >= 8 ? _todayYear + 1 : _todayYear;
      }
      const _seasonEndStr = `${_seasonEndYear}-06-30`;

      const futureSnap = await getDocs(query(
        collection(db, "creneaux"),
        where("date", ">=", today),
        where("date", "<=", _seasonEndStr),
      ));
      let removed = 0;
      let skippedClosed = 0;
      for (const d of futureSnap.docs) {
        const data = d.data();
        // Ignorer les créneaux clôturés (l'historique reste intact)
        if (data.status === "closed") {
          const hasChildClosed = (data.enrolled || []).some((e: any) => e.childId === forfait.childId);
          if (hasChildClosed) skippedClosed++;
          continue;
        }
        // Si oldSlot fourni : ne toucher QUE les créneaux qui correspondent
        // au slot precis qu'on change (même jour, même heure, même activite).
        // Sans oldSlot : on touche tous les créneaux ou l'enfant est inscrit
        // (comportement legacy pour les forfaits 1x/sem qui changent de jour).
        if (oldSlot) {
          const dow = new Date(data.date + "T12:00:00").getDay();
          if (dow !== oldSlot.dayOfWeek) continue;
          if (data.startTime !== oldSlot.startTime) continue;
          if (data.activityTitle !== oldSlot.activityTitle) continue;
        }
        const enrolled = data.enrolled || [];
        const hasChild = enrolled.some((e: any) => e.childId === forfait.childId);
        if (hasChild && data.activityType !== "stage" && data.activityType !== "stage_journee") {
          const newEnrolled = enrolled.filter((e: any) => e.childId !== forfait.childId);
          await updateDoc(doc(db, "creneaux", d.id), { enrolled: newEnrolled, enrolledCount: newEnrolled.length });
          removed++;
        }
      }
      console.log(`📋 Désinscrit de ${removed} créneaux (${skippedClosed} clôturés préservés, borne ${_seasonEndStr}${oldSlot ? ", slot précis" : ", tous slots"})`);

      // 2. Inscrire dans les nouveaux créneaux (tous les futurs du même jour+heure+activité)
      // Match plus tolérant que l'exact match du titre, pour gérer :
      //  - les renommages d'activités entre saisons (ex: "Galop 3-5" → "Galop 3-5 ados")
      //  - les accents et casse différents
      // Stratégie : activityId identique OU titre normalisé identique.
      // Normalisation : lowercase + suppression des accents + trim + espaces multiples.
      const normalize = (s: string) =>
        (s || "")
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "") // accents
          .replace(/\s+/g, " ")
          .trim();
      const newSlotTitleNorm = normalize(newSlot.activityTitle);

      // ── Borne de fin de saison ─────────────────────────────────────
      // On reutilise la même borne que pour la phase de desinscription
      // (calculee plus haut, _seasonEndStr). Le but : que le transfert reste
      // dans la SAISON DU FORFAIT, et n'aille pas deborder sur saison
      // suivante (qui sera une nouvelle inscription a part).
      const seasonEndStr = _seasonEndStr;

      let added = 0;
      let skippedFull = 0;
      let skippedOffSeason = 0;
      for (const d of futureSnap.docs) {
        const data = d.data();
        if (data.status === "closed") continue; // pas de réinscription sur clôturé
        // Borne fin de saison : ignorer tout créneau au-delà du 30 juin
        if (data.date > seasonEndStr) {
          // On ne compte que ceux qui matchent par ailleurs (sinon le compteur
          // exploserait avec tous les créneaux de la prochaine saison).
          const matchAct = (data.activityId && newSlot.activityId && data.activityId === newSlot.activityId)
            || normalize(data.activityTitle) === newSlotTitleNorm;
          if (matchAct && data.startTime === newSlot.startTime
              && new Date(data.date + "T12:00:00").getDay() === newSlot.dayOfWeek) {
            skippedOffSeason++;
          }
          continue;
        }
        // Match : activityId identique OU titre normalisé identique
        const matchByActivityId = data.activityId && newSlot.activityId && data.activityId === newSlot.activityId;
        const matchByTitle = normalize(data.activityTitle) === newSlotTitleNorm;
        if (
          (matchByActivityId || matchByTitle) &&
          data.startTime === newSlot.startTime &&
          new Date(data.date + "T12:00:00").getDay() === newSlot.dayOfWeek &&
          data.date >= today
        ) {
          const enrolled = data.enrolled || [];
          // Vérifier la capacité du créneau (ne pas surcharger un cours plein)
          if (enrolled.length >= (data.maxPlaces || 99)) {
            skippedFull++;
            continue;
          }
          if (!enrolled.some((e: any) => e.childId === forfait.childId)) {
            enrolled.push({
              childId: forfait.childId, childName: forfait.childName,
              familyId: forfait.familyId, familyName: forfait.familyName,
              enrolledAt: new Date().toISOString(),
              // Marquage forfait pour visibilité (badge vert émeraude au lieu de gris)
              paymentSource: "forfait",
              forfaitId: forfait.id,
            });
            await updateDoc(doc(db, "creneaux", d.id), { enrolled, enrolledCount: enrolled.length });
            added++;
          }
        }
      }
      console.log(`📋 Inscrit dans ${added} nouveaux créneaux (borne saison ${seasonEndStr})${skippedFull > 0 ? ` (${skippedFull} pleins ignorés)` : ""}${skippedOffSeason > 0 ? ` (${skippedOffSeason} hors saison ignorés)` : ""}`);

      // 3. Mettre à jour le forfait
      const newSlotKey = `${newSlot.activityTitle} — ${newSlot.dayLabel} ${newSlot.startTime}`;
      await updateDoc(doc(db, "forfaits", forfait.id), {
        slotKey: newSlotKey,
        activityTitle: newSlot.activityTitle,
        dayLabel: newSlot.dayLabel,
        startTime: newSlot.startTime,
        endTime: newSlot.endTime,
        updatedAt: serverTimestamp(),
      });

      const parts = [
        `✅ Créneau modifié !`,
        ``,
        `${forfait.childName} est maintenant inscrit(e) en ${newSlot.activityTitle} — ${newSlot.dayLabel} ${newSlot.startTime}`,
        ``,
        `${removed} ancien(s) créneau(x) retiré(s)`,
        `${added} nouveau(x) créneau(x) ajouté(s)`,
      ];
      if (skippedClosed > 0) parts.push(`${skippedClosed} créneau(x) clôturé(s) préservé(s) (historique intact)`);
      if (skippedFull > 0) parts.push(`⚠️ ${skippedFull} créneau(x) ignoré(s) car COMPLET(S)`);
      parts.push(``, `Paiements inchangés.`);
      alert(parts.join("\n"));
      setSlotChange(null);
      fetchData();
    } catch (e: any) {
      console.error(e);
      alert("Erreur : " + e.message);
    }
    setSlotChanging(false);
  };

  const formatDate = (d: any) => {
    if (!d) return "—";
    const date = d.toDate ? d.toDate() : new Date(d.seconds ? d.seconds * 1000 : d);
    return date.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
  };

  const inp = "w-full px-3 py-2.5 rounded-lg border border-blue-500/8 font-body text-sm bg-cream focus:border-blue-500 focus:outline-none";

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-blue-500" /></div>;

  return (
    <>
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-blue-800">Forfaits annuels</h1>
          <p className="font-body text-xs text-slate-500">Inscriptions à l&apos;année avec choix des créneaux</p>
        </div>
        <button onClick={() => setShowCreate(!showCreate)}
          className="flex items-center gap-2 font-body text-sm font-semibold text-white bg-blue-500 px-5 py-2.5 rounded-lg border-none cursor-pointer hover:bg-blue-400">
          <Plus size={16} /> Nouveau forfait
        </button>
      </div>

      {/* ═══ Create Form ═══ */}
      {showCreate && (
        <Card padding="md" className="mb-6 border-blue-500/15">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-body text-base font-semibold text-blue-800">Nouvelle inscription annuelle</h3>
            <button onClick={() => setShowCreate(false)} className="text-gray-400 bg-transparent border-none cursor-pointer"><X size={18} /></button>
          </div>

          <div className="flex flex-col gap-4">
            {/* Family search */}
            <div>
              <label className="font-body text-xs font-semibold text-blue-800 block mb-1">Famille</label>
              <div className="relative mb-2">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" />
                <input value={familySearch} onChange={e => setFamilySearch(e.target.value)} placeholder="Rechercher famille..." className={`${inp} !pl-9`} />
              </div>
              <select value={selFamily} onChange={e => { setSelFamily(e.target.value); setSelChild(""); }} className={inp}>
                <option value="">Choisir une famille...</option>
                {filteredFamilies.map(f => {
                  const names = (f.children || []).map((c: any) => c.firstName).join(", ");
                  return <option key={f.firestoreId} value={f.firestoreId}>{f.parentName} {names ? `(${names})` : ""}</option>;
                })}
              </select>
            </div>

            {/* Child selection */}
            {fam && children.length > 0 && (
              <div>
                <label className="font-body text-xs font-semibold text-blue-800 block mb-1">Cavalier</label>
                <div className="flex flex-wrap gap-2">
                  {children.map((c: any) => (
                    <button key={c.id} onClick={() => setSelChild(c.id)}
                      className={`px-4 py-2.5 rounded-lg border font-body text-sm cursor-pointer transition-all ${
                        selChild === c.id ? "bg-blue-500 text-white border-blue-500" : "bg-white text-gray-600 border-gray-200 hover:border-blue-300"
                      }`}>
                      🧒 {c.firstName}
                      {c.birthDate && <span className="text-xs opacity-70 ml-1">({Math.floor((Date.now() - new Date(c.birthDate).getTime()) / 31557600000)} ans)</span>}
                    </button>
                  ))}
                </div>
                {selChild && familyDiscountPercent > 0 && (
                  <div className="mt-2 px-3 py-1.5 bg-green-50 border border-green-200 rounded-lg font-body text-xs text-green-700">
                    👨‍👩‍👧‍👦 {childRank}ème enfant de la famille → réduction de {familyDiscountPercent}% sur le forfait
                  </div>
                )}
              </div>
            )}

            {/* Fréquence */}
            <div>
              <label className="font-body text-xs font-semibold text-blue-800 block mb-2">Fréquence hebdomadaire</label>
              <div className="flex gap-3">
                {([
                  { id: "1x" as const, label: "1×/sem", desc: "Loisir" },
                  { id: "2x" as const, label: "2×/sem", desc: "Compétition" },
                  { id: "3x" as const, label: "3×/sem", desc: "Intensif" },
                ] as const).map(f => (
                  <button key={f.id} onClick={() => { setFrequence(f.id); setSelectedSlots([]); }}
                    className={`flex-1 py-3 rounded-xl border font-body text-sm font-semibold cursor-pointer text-center transition-all ${
                      frequence === f.id ? "border-green-500 bg-green-50 text-green-700" : "border-gray-200 bg-white text-gray-500"
                    }`}>
                    {f.label}
                    <div className="font-body text-[10px] font-normal text-gray-400">{f.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Slot selection */}
            <div>
              <label className="font-body text-xs font-semibold text-blue-800 block mb-1">
                {requiredSlots > 1 ? `Créneaux (${selectedSlots.length}/${requiredSlots})` : "Créneau hebdomadaire"}
              </label>
              <div className="relative mb-2">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" />
                <input value={slotSearch} onChange={e => setSlotSearch(e.target.value)} placeholder="Rechercher cours, jour, horaire..." className={`${inp} !pl-9`} />
              </div>

              {/* Selected slots badges */}
              {selectedSlotsData.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-2">
                  {selectedSlotsData.map((s, i) => (
                    <span key={s.key} className="inline-flex items-center gap-1.5 bg-blue-50 border border-blue-200 text-blue-700 px-3 py-1.5 rounded-lg font-body text-xs">
                      <span className="font-semibold">Créneau {i + 1}:</span> {s.activityTitle} — {s.dayLabel} {s.startTime}
                      <button onClick={() => setSelectedSlots(prev => prev.filter(k => k !== s.key))} className="text-blue-400 hover:text-red-500 bg-transparent border-none cursor-pointer ml-1"><X size={12} /></button>
                    </span>
                  ))}
                </div>
              )}

              <div className="max-h-48 overflow-auto flex flex-col gap-1.5 border border-gray-100 rounded-xl p-2">
                {filteredSlots.length === 0 ? (
                  <p className="font-body text-xs text-gray-400 text-center py-3">
                    {slotSearch ? `Aucun créneau pour « ${slotSearch} »` : "Aucun cours programmé"}
                  </p>
                ) : filteredSlots.map(slot => {
                  const isSelected = selectedSlots.includes(slot.key);
                  const isFull = slot.spotsAvailable <= 0;
                  const isDisabled = isFull || (!isSelected && selectedSlots.length >= requiredSlots);

                  return (
                    <button key={slot.key} onClick={() => !isDisabled && toggleSlot(slot.key)}
                      className={`flex items-center justify-between px-3 py-2.5 rounded-lg border text-left text-xs transition-all ${
                        isSelected ? "border-blue-500 bg-blue-50 cursor-pointer" :
                        isDisabled ? "border-gray-100 bg-gray-50 cursor-not-allowed opacity-40" :
                        "border-gray-200 bg-white hover:border-blue-300 cursor-pointer"
                      }`}>
                      <div>
                        <span className="font-body font-semibold text-blue-800">{slot.activityTitle}</span>
                        <span className="text-gray-400 ml-2">{slot.dayLabel} {slot.startTime}–{slot.endTime} · {slot.monitor}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`font-semibold ${slot.spotsAvailable > 2 ? "text-green-600" : slot.spotsAvailable > 0 ? "text-orange-500" : "text-red-500"}`}>
                          {slot.spotsAvailable > 0 ? `${slot.spotsAvailable}p` : "⛔"}
                        </span>
                        {isSelected && <Check size={14} className="text-blue-500" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Licence + Adhésion */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="flex items-center gap-2 font-body text-xs cursor-pointer mb-2">
                  <input type="checkbox" checked={adhesion} onChange={e => setAdhesion(e.target.checked)} className="accent-green-500 w-4 h-4" />
                  <span className="font-semibold text-blue-800">Adhésion annuelle</span>
                  <span className="text-blue-500 font-semibold ml-auto">{ADHESION_PRICE}€</span>
                </label>
              </div>
              <div>
                <label className="flex items-center gap-2 font-body text-xs cursor-pointer mb-2">
                  <input type="checkbox" checked={licenceFFE} onChange={e => setLicenceFFE(e.target.checked)} className="accent-green-500 w-4 h-4" />
                  <span className="font-semibold text-blue-800">Licence FFE</span>
                </label>
                {licenceFFE && (
                  <div className="flex gap-2">
                    <button onClick={() => setLicenceType("moins18")}
                      className={`flex-1 py-2 rounded-lg border font-body text-xs font-semibold cursor-pointer ${
                        licenceType === "moins18" ? "bg-green-500 text-white border-green-500" : "bg-white text-gray-500 border-gray-200"
                      }`}>
                      -18 ans ({LICENCE_FFE_MOINS18}€)
                    </button>
                    <button onClick={() => setLicenceType("plus18")}
                      className={`flex-1 py-2 rounded-lg border font-body text-xs font-semibold cursor-pointer ${
                        licenceType === "plus18" ? "bg-blue-500 text-white border-blue-500" : "bg-white text-gray-500 border-gray-200"
                      }`}>
                      +18 ans ({LICENCE_FFE_PLUS18}€)
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Payment plan */}
            <div>
              <label className="font-body text-xs font-semibold text-blue-800 block mb-2">Mode de paiement</label>
              <div className="flex gap-3">
                {(["1x", "3x", "10x"] as const).map(p => (
                  <button key={p} onClick={() => setPayPlan(p)}
                    className={`flex-1 py-2.5 rounded-lg border font-body text-sm font-medium cursor-pointer ${
                      payPlan === p ? "border-blue-500 bg-blue-50 text-blue-500 font-semibold" : "border-gray-200 bg-white text-gray-500"
                    }`}>
                    {p === "1x" ? "1 fois" : p === "3x" ? `3×${(grandTotal / 3).toFixed(0)}€` : `10×${(grandTotal / 10).toFixed(0)}€`}
                  </button>
                ))}
              </div>
            </div>

            {/* Total + Submit */}
            <div className="bg-blue-50 rounded-xl p-4 flex justify-between items-center">
              <div>
                <div className="font-body text-xs text-gray-500">Total TTC</div>
                <div className="font-body text-2xl font-bold text-blue-500">{grandTotal.toFixed(2)}€</div>
                <div className="font-body text-[10px] text-gray-400">
                  {slotsPrices.map(sp => `${sp.slot.dayLabel} ${sp.slot.startTime} (${sp.sessions} séances)`).join(" + ")}
                  {licenceFFE ? ` + Licence ${licencePrice}€` : ""}
                  {adhesion ? ` + Adhésion ${adhesionPrice}€` : ""}
                  {familyDiscountAmount > 0 ? ` − Réduction famille ${familyDiscountPercent}%` : ""}
                </div>
                {familyDiscountAmount > 0 && (
                  <div className="font-body text-xs text-green-600 font-semibold mt-1">
                    👨‍👩‍👧‍👦 {childRank}ème enfant : −{familyDiscountAmount.toFixed(2)}€ sur le forfait
                  </div>
                )}
              </div>
              <button onClick={handleCreate} disabled={!selFamily || !selChild || !slotsComplete || creating}
                className={`px-6 py-3 rounded-xl font-body text-sm font-semibold border-none cursor-pointer ${
                  !selFamily || !selChild || !slotsComplete || creating ? "bg-gray-200 text-gray-400" : "bg-blue-500 text-white hover:bg-blue-400"
                }`}>
                {creating ? <><Loader2 size={14} className="inline animate-spin mr-1" /> Inscription...</> : `Inscrire${slotsComplete ? ` (${selectedSlotsData.flatMap(s => s.creneauIds).length} séances)` : ""}`}
              </button>
            </div>
          </div>
        </Card>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-6">
        <Card padding="sm" className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center"><Users size={18} className="text-green-600" /></div>
          <div><div className="font-body text-xl font-bold text-green-600">{activeCount}</div><div className="font-body text-xs text-slate-500">forfaits actifs</div></div>
        </Card>
        <Card padding="sm" className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center"><TrendingUp size={18} className="text-blue-500" /></div>
          <div><div className="font-body text-xl font-bold text-blue-500">{totalCA.toFixed(0)}€</div><div className="font-body text-xs text-slate-500">CA forfaits</div></div>
        </Card>
        <Card padding="sm" className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center"><CreditCard size={18} className="text-green-600" /></div>
          <div><div className="font-body text-xl font-bold text-green-600">{totalPaid.toFixed(0)}€</div><div className="font-body text-xs text-slate-500">encaissé</div></div>
        </Card>
        <Card padding="sm" className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl ${totalDue > 0 ? "bg-red-50" : "bg-gray-50"} flex items-center justify-center`}>
            <CreditCard size={18} className={totalDue > 0 ? "text-red-500" : "text-slate-500"} />
          </div>
          <div><div className={`font-body text-xl font-bold ${totalDue > 0 ? "text-red-500" : "text-slate-500"}`}>{totalDue.toFixed(0)}€</div><div className="font-body text-xs text-slate-500">reste à encaisser</div></div>
        </Card>
      </div>

      {/* Filtres */}
      <div className="flex flex-wrap gap-3 mb-5 items-center">
        <div className="flex gap-1.5">
          {[
            { id: "all", label: `Tous (${forfaits.length})` },
            { id: "active", label: `Actifs (${activeCount})` },
            { id: "suspended", label: `Suspendus (${suspendedCount})` },
            { id: "completed", label: "Terminés" },
            { id: "cancelled", label: "Résiliés" },
          ].map(f => (
            <button key={f.id} onClick={() => setFilterStatus(f.id)}
              className={`font-body text-xs px-3 py-1.5 rounded-lg border-none cursor-pointer transition-all ${
                filterStatus === f.id ? "bg-blue-500 text-white" : "bg-white text-slate-600 border border-gray-200"
              }`}>
              {f.label}
            </button>
          ))}
        </div>
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input data-testid="forfait-search" placeholder="Rechercher cavalier, famille, activité..." value={search} onChange={e => setSearch(e.target.value)}
            className="w-full font-body text-xs border border-gray-200 rounded-lg pl-9 pr-3 py-2 bg-white focus:outline-none focus:border-blue-400" />
        </div>
      </div>

      {/* Liste */}
      {filtered.length === 0 ? (
        <Card padding="lg" className="text-center">
          <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto mb-3"><Calendar size={28} className="text-blue-300" /></div>
          <p className="font-body text-sm text-slate-600">
            {forfaits.length === 0 ? "Aucun forfait. Cliquez sur « Nouveau forfait » pour inscrire un cavalier." : "Aucun forfait correspondant aux filtres."}
          </p>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map(f => {
            const isExp = expanded === f.id;
            const sc = statusConfig[f.status] || statusConfig.active;
            const paid = getPaidForForfait(f);
            const pctPaid = f.forfaitPriceTTC > 0 ? Math.min(100, Math.round((paid / f.forfaitPriceTTC) * 100)) : 0;
            const pctSessions = (f.totalSessions || 35) > 0 ? Math.round(((f.attendedSessions || 0) / (f.totalSessions || 35)) * 100) : 0;
            const installment = f.paymentPlan === "3x" ? f.forfaitPriceTTC / 3 : f.paymentPlan === "10x" ? f.forfaitPriceTTC / 10 : f.forfaitPriceTTC;

            return (
              <Card key={f.id} padding="md">
                <div className="flex items-center justify-between cursor-pointer" onClick={() => setExpanded(isExp ? null : f.id)}>
                  <div className="flex items-center gap-4">
                    <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${f.status === "active" ? "bg-green-50" : f.status === "suspended" ? "bg-orange-50" : "bg-gray-50"}`}>
                      <Calendar size={18} className={f.status === "active" ? "text-green-600" : f.status === "suspended" ? "text-orange-500" : "text-slate-500"} />
                    </div>
                    <div>
                      <div className="font-body text-sm font-semibold text-blue-800">
                        {f.childName} <span className="text-slate-500 font-normal">— {f.familyName}</span>
                      </div>
                      <div className="font-body text-xs text-slate-500">
                        {f.slotKey || f.activityTitle || "—"} · Créé le {formatDate(f.createdAt)}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <div className="font-body text-base font-bold text-blue-500">{(f.forfaitPriceTTC || 0).toFixed(0)}€</div>
                      <div className="font-body text-[10px] text-slate-500">{f.paymentPlan || "1x"}</div>
                    </div>
                    <Badge color={sc.color}>{sc.label}</Badge>
                    {isExp ? <ChevronUp size={16} className="text-slate-500" /> : <ChevronDown size={16} className="text-slate-500" />}
                  </div>
                </div>

                {isExp && (
                  <div className="mt-4 pt-4 border-t border-blue-500/8 space-y-4">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div><div className="font-body text-[10px] text-slate-500 uppercase">Activité</div><div className="font-body text-sm text-blue-800">{f.activityTitle || "—"}</div></div>
                      <div><div className="font-body text-[10px] text-slate-500 uppercase">Créneau</div><div className="font-body text-sm text-blue-800">{f.dayLabel || "—"} {f.startTime}–{f.endTime}</div></div>
                      <div><div className="font-body text-[10px] text-slate-500 uppercase">Adhésion</div><div className="font-body text-sm text-blue-800">{f.adhesion ? "Oui" : "Non"}</div></div>
                      <div><div className="font-body text-[10px] text-slate-500 uppercase">Licence FFE</div><div className="font-body text-sm text-blue-800">{f.licenceFFE ? `Oui (${f.licenceType === "moins18" ? "-18" : "+18"})` : "Non"}</div></div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <div className="flex justify-between mb-1">
                          <span className="font-body text-[10px] text-slate-500 uppercase">Paiement</span>
                          <span className="font-body text-xs font-semibold text-blue-500">{paid.toFixed(0)}€ / {(f.forfaitPriceTTC || 0).toFixed(0)}€</span>
                        </div>
                        <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${pctPaid >= 100 ? "bg-green-500" : pctPaid > 50 ? "bg-blue-400" : "bg-orange-400"}`} style={{ width: `${pctPaid}%` }} />
                        </div>
                        <div className="font-body text-[10px] text-slate-500 mt-0.5">
                          {f.paymentPlan === "1x" ? "Paiement unique" : `${f.paymentPlan} · ${installment.toFixed(0)}€/échéance`}
                        </div>
                      </div>
                      <div>
                        <div className="flex justify-between mb-1">
                          <span className="font-body text-[10px] text-slate-500 uppercase">Séances</span>
                          <span className="font-body text-xs font-semibold text-blue-500">{f.attendedSessions || 0} / {f.totalSessions || 35}</span>
                        </div>
                        <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full rounded-full bg-blue-400" style={{ width: `${pctSessions}%` }} />
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 pt-2">
                      {(() => {
                        const slots = detectActualSlots(f);
                        if (slots.length === 0) return null;
                        return (
                          <div className="w-full mb-2 bg-blue-50/50 border border-blue-200 rounded-lg p-3">
                            <div className="font-body text-[10px] uppercase text-slate-600 font-semibold mb-2">
                              Créneaux réels ({slots.length}{slots.length > 1 ? " — forfait multi-jours" : ""})
                            </div>
                            <div className="flex flex-col gap-1.5">
                              {slots.map(slot => (
                                <div key={slot.key} className="flex items-center justify-between gap-2 bg-white rounded px-2 py-1.5 border border-gray-100">
                                  <div className="flex items-center gap-2 flex-1 min-w-0">
                                    {slot.isPrincipal && (
                                      <span className="font-body text-[9px] font-bold uppercase text-blue-500 bg-blue-100 px-1.5 py-0.5 rounded shrink-0">Principal</span>
                                    )}
                                    <span className="font-body text-xs text-blue-800 truncate">
                                      <span className="capitalize">{slot.dayLabel}</span> {slot.startTime}–{slot.endTime} · {slot.activityTitle}
                                    </span>
                                    <span className="font-body text-[10px] text-slate-400 shrink-0">{slot.count} séances</span>
                                  </div>
                                  <div className="flex gap-1 shrink-0">
                                    <button
                                      onClick={() => {
                                        const dayNames = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
                                        const dow = dayNames.indexOf(slot.dayLabel);
                                        setSlotChange({
                                          forfait: f,
                                          newSlotSearch: "",
                                          oldSlot: {
                                            dayOfWeek: dow,
                                            startTime: slot.startTime,
                                            activityTitle: slot.activityTitle,
                                          },
                                        });
                                      }}
                                      disabled={slotChanging || saving}
                                      title="Changer ce créneau pour un autre"
                                      className="font-body text-[10px] text-blue-500 bg-blue-50 hover:bg-blue-100 px-2 py-1 rounded border-none cursor-pointer">
                                      Changer
                                    </button>
                                    {slots.length > 1 && (
                                      <button
                                        onClick={() => handleRemoveSlot(f, slot)}
                                        disabled={slotChanging || saving}
                                        title={slot.isPrincipal ? "Retirer le créneau principal (le forfait restera mais sans créneau principal)" : "Retirer ce créneau"}
                                        className="font-body text-[10px] text-red-500 bg-red-50 hover:bg-red-100 px-2 py-1 rounded border-none cursor-pointer">
                                        Retirer
                                      </button>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                            {slots.length > 1 && (
                              <p className="font-body text-[10px] text-slate-500 italic mt-2">
                                💡 Les boutons "Changer de créneau" et "Désinscrire" en dessous agissent globalement sur tout le forfait. Pour modifier un seul créneau, utilisez les boutons ci-dessus.
                              </p>
                            )}
                          </div>
                        );
                      })()}
                      {(f.status === "active" || f.status === "actif") && (
                        <button onClick={() => handleStatusChange(f.id, "suspended")} disabled={saving}
                          className="flex items-center gap-1.5 font-body text-xs text-orange-500 bg-orange-50 px-3 py-1.5 rounded-lg border-none cursor-pointer hover:bg-orange-100">
                          <Pause size={12} /> Suspendre
                        </button>
                      )}
                      {f.status === "suspended" && (
                        <button onClick={() => handleStatusChange(f.id, "active")} disabled={saving}
                          className="flex items-center gap-1.5 font-body text-xs text-green-600 bg-green-50 px-3 py-1.5 rounded-lg border-none cursor-pointer hover:bg-green-100">
                          <Play size={12} /> Réactiver
                        </button>
                      )}
                      {(f.status === "active" || f.status === "actif" || f.status === "suspended") && (
                        <button onClick={() => { if (confirm(`Résilier le forfait de ${f.childName} ?`)) handleStatusChange(f.id, "cancelled"); }} disabled={saving}
                          className="flex items-center gap-1.5 font-body text-xs text-red-500 bg-red-50 px-3 py-1.5 rounded-lg border-none cursor-pointer hover:bg-red-100">
                          <XCircle size={12} /> Résilier
                        </button>
                      )}
                      {(f.status === "active" || f.status === "actif" || f.status === "suspended") && (
                        <button onClick={() => setSlotChange({ forfait: f, newSlotSearch: "" })} disabled={saving}
                          className="flex items-center gap-1.5 font-body text-xs text-blue-500 bg-blue-50 px-3 py-1.5 rounded-lg border-none cursor-pointer hover:bg-blue-100">
                          <RefreshCw size={12} /> Changer de créneau
                        </button>
                      )}
                      {(f.status === "active" || f.status === "actif" || f.status === "suspended") && (
                        <button onClick={() => handleUnenrollAll(f)} disabled={unenrolling === f.id || saving}
                          className="flex items-center gap-1.5 font-body text-xs text-white bg-red-500 px-3 py-1.5 rounded-lg border-none cursor-pointer hover:bg-red-600 disabled:opacity-50">
                          {unenrolling === f.id ? <Loader2 size={12} className="animate-spin" /> : <UserMinus size={12} />}
                          {unenrolling === f.id ? "Désinscription..." : "Désinscrire de tous les cours"}
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>

      {/* ── Modal changement de créneau ── */}
      {slotChange && (() => {
        const f = slotChange.forfait;
        const today = new Date().toISOString().split("T")[0];
        // Construire les slots uniques depuis les créneaux futurs
        const futureCreneaux = creneaux.filter(c => c.date >= today && c.activityType !== "stage" && c.activityType !== "stage_journee");
        const slotsMap = new Map<string, WeeklySlot>();
        for (const c of futureCreneaux) {
          const dow = new Date(c.date + "T12:00:00").getDay();
          const key = `${dow}-${c.startTime}-${c.activityTitle}`;
          if (!slotsMap.has(key)) {
            slotsMap.set(key, {
              key, activityId: c.activityId, activityTitle: c.activityTitle,
              dayOfWeek: dow, dayLabel: dayLabels[(dow + 6) % 7],
              startTime: c.startTime, endTime: c.endTime, monitor: c.monitor,
              maxPlaces: c.maxPlaces, totalSessions: 1, avgEnrolled: (c.enrolled || []).length,
              spotsAvailable: c.maxPlaces - (c.enrolled || []).length,
              creneauIds: [c.id], priceTTC: c.priceTTC || 0,
            });
          } else {
            const s = slotsMap.get(key)!;
            s.totalSessions++;
            s.creneauIds.push(c.id);
          }
        }
        // Exclure le créneau actuel du forfait
        const currentDow = dayLabels.indexOf(f.dayLabel);
        const currentKey = `${(currentDow + 1) % 7}-${f.startTime}-${f.activityTitle}`;
        const availableSlots = [...slotsMap.values()].filter(s => {
          const isCurrent = s.activityTitle === f.activityTitle && s.dayLabel === f.dayLabel && s.startTime === f.startTime;
          if (isCurrent) return false;
          if (!slotChange.newSlotSearch.trim()) return true;
          const q = slotChange.newSlotSearch.toLowerCase();
          return s.activityTitle.toLowerCase().includes(q) || s.dayLabel.toLowerCase().includes(q) || s.startTime.includes(q) || s.monitor.toLowerCase().includes(q);
        }).sort(compareCreneauxByDow);

        return (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4" onClick={() => !slotChanging && setSlotChange(null)}>
            <div className="bg-white rounded-2xl w-full sm:max-w-lg max-h-[85vh] overflow-auto shadow-2xl" onClick={e => e.stopPropagation()}>
              <div className="p-5 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <h2 className="font-display text-lg font-bold text-blue-800">Changer de créneau</h2>
                  <p className="font-body text-xs text-slate-500">{f.childName} — actuellement : {f.slotKey}</p>
                </div>
                <button onClick={() => setSlotChange(null)} className="text-slate-400 bg-transparent border-none cursor-pointer"><X size={20}/></button>
              </div>
              <div className="p-5">
                <div className="mb-3">
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input value={slotChange.newSlotSearch} onChange={e => setSlotChange({ ...slotChange, newSlotSearch: e.target.value })}
                      placeholder="Rechercher cours, jour, horaire..."
                      className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-blue-500/8 font-body text-sm bg-cream focus:border-blue-500 focus:outline-none" />
                  </div>
                </div>
                <div className="flex flex-col gap-2 max-h-[50vh] overflow-auto">
                  {availableSlots.length === 0 && <p className="font-body text-sm text-slate-500 text-center py-4">Aucun créneau disponible</p>}
                  {availableSlots.map(s => (
                    <button key={s.key} onClick={() => handleSlotChange(f, s, slotChange?.oldSlot)} disabled={slotChanging}
                      className="flex items-center justify-between p-3 rounded-xl border border-gray-200 bg-white hover:bg-blue-50 hover:border-blue-300 cursor-pointer text-left disabled:opacity-50">
                      <div>
                        <div className="font-body text-sm font-semibold text-blue-800">{s.activityTitle}</div>
                        <div className="font-body text-xs text-slate-500">{s.dayLabel} {s.startTime}–{s.endTime} · {s.monitor}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-body text-xs font-semibold text-green-600">{s.totalSessions} séances</div>
                        <div className="font-body text-[10px] text-slate-400">{s.spotsAvailable > 0 ? `${s.spotsAvailable} place${s.spotsAvailable > 1 ? "s" : ""}` : "Complet"}</div>
                      </div>
                    </button>
                  ))}
                </div>
                {slotChanging && <div className="flex items-center justify-center py-4"><Loader2 className="w-6 h-6 animate-spin text-blue-500" /><span className="font-body text-sm text-slate-500 ml-2">Changement en cours...</span></div>}
              </div>
            </div>
          </div>
        );
      })()}
    </>
  );
}
