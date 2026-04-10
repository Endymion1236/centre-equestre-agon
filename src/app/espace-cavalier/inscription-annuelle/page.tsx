"use client";

import { useState, useEffect, useMemo } from "react";
import { collection, getDocs, addDoc, updateDoc, doc, query, where, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { Card, Badge } from "@/components/ui";
import { Check, ChevronRight, AlertTriangle, Calculator, CreditCard, Loader2, Calendar, Plus, Search } from "lucide-react";
import { authFetch } from "@/lib/auth-fetch";

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

const LICENCE_FFE = { label: "Licence FFE", price: 25, description: "Obligatoire pour pratiquer en club" };
const ADHESION = { label: "Adhésion au club", price: 50, description: "Cotisation annuelle" };

export default function InscriptionAnnuellePage() {
  const { user, family } = useAuth();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [creneaux, setCreneaux] = useState<Creneau[]>([]);
  const [step, setStep] = useState(1);
  const [selectedChild, setSelectedChild] = useState("");
  const [licenceOK, setLicenceOK] = useState(false);
  const [adhesionOK, setAdhesionOK] = useState(false);
  // Multi-slot selection for 2x/week
  const [selectedSlots, setSelectedSlots] = useState<string[]>([]);
  const [forfaitType, setForfaitType] = useState<"1x" | "2x">("1x");
  const [paymentPlan, setPaymentPlan] = useState<"1x" | "3x" | "10x">("1x");
  const [mode, setMode] = useState<"annuel" | "ponctuel">("annuel");
  const [slotSearch, setSlotSearch] = useState("");

  const children = family?.children || [];
  const child = children.find((c: any) => c.id === selectedChild);

  // Load all "cours" type creneaux from Firestore
  useEffect(() => {
    const fetchCreneaux = async () => {
      try {
        const today = new Date().toISOString().split("T")[0];
        const snap = await getDocs(
          query(collection(db, "creneaux"), where("activityType", "==", "cours"), where("date", ">=", today))
        );
        setCreneaux(snap.docs.map(d => ({ id: d.id, ...d.data() })) as Creneau[]);
      } catch {
        try {
          const snap = await getDocs(collection(db, "creneaux"));
          const today = new Date().toISOString().split("T")[0];
          setCreneaux(
            (snap.docs.map(d => ({ id: d.id, ...d.data() })) as Creneau[])
              .filter(c => c.activityType === "cours" && c.date >= today)
          );
        } catch (e) { console.error(e); }
      }
      setLoading(false);
    };
    fetchCreneaux();
  }, []);

  // Group creneaux into weekly recurring slots
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
    return Object.values(map).sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.startTime.localeCompare(b.startTime));
  }, [creneaux]);

  // Selected slots data
  const selectedSlotsData = weeklySlots.filter(s => selectedSlots.includes(s.key));

  // Filtered slots for search
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

  // How many slots required
  const requiredSlots = forfaitType === "2x" ? 2 : 1;
  const slotsComplete = selectedSlots.length === requiredSlots;

  // Toggle slot selection
  const toggleSlot = (key: string) => {
    setSelectedSlots(prev => {
      if (prev.includes(key)) {
        return prev.filter(k => k !== key);
      }
      // For 1x, replace; for 2x, add if under limit
      if (forfaitType === "1x") return [key];
      if (prev.length >= 2) return prev; // Already have 2
      return [...prev, key];
    });
  };

  // Calculate prices for all selected slots
  const slotsPrices = selectedSlotsData.map(slot => {
    const price = slot.priceTTC || 0;
    // If price > 100 it's likely an annual flat rate; otherwise multiply by sessions
    const forfaitPrice = price > 100 ? price : price * slot.totalSessions;
    return { slot, forfaitPrice, sessions: slot.totalSessions };
  });
  const totalForfait = slotsPrices.reduce((sum, s) => sum + s.forfaitPrice, 0);
  const totalPrerequisites = LICENCE_FFE.price + ADHESION.price;
  const grandTotal = mode === "annuel" ? totalPrerequisites + totalForfait : totalPrerequisites + (slotsPrices[0]?.slot.priceTTC || 0);

  // Steps for annual mode
  const steps = mode === "annuel"
    ? [
        { num: 1, label: "Cavalier" },
        { num: 2, label: "Prérequis" },
        { num: 3, label: "Forfait" },
        { num: 4, label: "Créneaux" },
        { num: 5, label: "Récapitulatif" },
      ]
    : [
        { num: 1, label: "Cavalier" },
        { num: 2, label: "Créneau" },
        { num: 3, label: "Paiement" },
      ];

  // ── Handle enrollment ──
  const handleEnroll = async () => {
    if (!user || !family || !child || selectedSlotsData.length === 0) return;
    setSubmitting(true);
    try {
      // Collect all creneauIds from all selected slots
      const allCreneauIds = selectedSlotsData.flatMap(s => s.creneauIds);

      // Batch enroll child in all creneaux
      for (const creneauId of allCreneauIds) {
        const creneau = creneaux.find(c => c.id === creneauId);
        if (!creneau) continue;
        // Check not already enrolled
        if ((creneau.enrolled || []).some((e: any) => e.childId === selectedChild)) continue;

        const newEnrolled = [...(creneau.enrolled || []), {
          childId: selectedChild,
          childName: (child as any).firstName || "—",
          familyId: user.uid,
          familyName: family.parentName || "—",
          enrolledAt: new Date().toISOString(),
        }];
        await updateDoc(doc(db, "creneaux", creneauId), {
          enrolled: newEnrolled,
          enrolledCount: newEnrolled.length,
        });
      }

      // Create reservation records for tracking
      for (const slotData of selectedSlotsData) {
        await addDoc(collection(db, "reservations"), {
          familyId: user.uid,
          familyName: family.parentName,
          childId: selectedChild,
          childName: (child as any).firstName || "—",
          activityTitle: slotData.activityTitle,
          activityType: "cours",
          type: "annual",
          forfaitType,
          slotKey: slotData.key,
          dayOfWeek: slotData.dayOfWeek,
          dayLabel: slotData.dayLabel,
          startTime: slotData.startTime,
          endTime: slotData.endTime,
          totalSessions: slotData.totalSessions,
          creneauIds: slotData.creneauIds,
          status: "confirmed",
          createdAt: serverTimestamp(),
        });
      }

      // Create payment record
      if (mode === "annuel") {
        await addDoc(collection(db, "paiements"), {
          familyId: user.uid,
          familyName: family.parentName,
          childId: selectedChild,
          childName: (child as any).firstName || "—",
          type: "inscription_annuelle",
          forfaitType,
          label: `Inscription annuelle ${forfaitType === "2x" ? "2×/sem" : "1×/sem"} — ${(child as any).firstName}`,
          items: [
            { label: LICENCE_FFE.label, amount: LICENCE_FFE.price },
            { label: ADHESION.label, amount: ADHESION.price },
            ...slotsPrices.map(sp => ({
              label: `${sp.slot.activityTitle} — ${sp.slot.dayLabel} ${sp.slot.startTime}–${sp.slot.endTime} (${sp.sessions} séances)`,
              amount: sp.forfaitPrice,
            })),
          ],
          totalTTC: grandTotal,
          paymentPlan,
          status: paymentPlan === "1x" ? "pending" : "echeance",        skipPayment: true,
          createdAt: serverTimestamp(),
        });
      }
      try {
        const res = await authFetch("/api/cawl/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            familyId: user.uid,
            familyEmail: family.parentEmail,
            familyName: family.parentName,
            items: [
              { name: LICENCE_FFE.label, description: LICENCE_FFE.description, priceInCents: LICENCE_FFE.price * 100, quantity: 1 },
              { name: ADHESION.label, description: ADHESION.description, priceInCents: ADHESION.price * 100, quantity: 1 },
              ...slotsPrices.map(sp => ({
                name: `Forfait ${sp.slot.activityTitle}`,
                description: `${sp.slot.dayLabel} ${sp.slot.startTime}–${sp.slot.endTime} · ${sp.sessions} séances`,
                priceInCents: Math.round(sp.forfaitPrice * 100),
                quantity: 1,
              })),
            ],
            metadata: {
              type: "inscription_annuelle",
              forfaitType,
              childId: selectedChild,
              childName: (child as any).firstName,
            },
          }),
        });
        const data = await res.json();
        if (data.url) {
          window.location.href = data.url;
          return;
        }
      } catch (cawlErr) {
        console.error("CAWL checkout (non-bloquant):", cawlErr);
      }

      // Fallback: redirect with success
      window.location.href = "/espace-cavalier/reservations?success=true";
    } catch (e) {
      console.error("Erreur inscription:", e);
      alert("Erreur lors de l'inscription. Veuillez réessayer.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-blue-800 mb-2">Inscription aux cours</h1>
      <p className="font-body text-sm text-gray-400 mb-6">Cours réguliers à l&apos;année.</p>

      {/* Step indicator */}
      <div className="flex gap-2 mb-8">
        {steps.map(s => (
          <div key={s.num} className="flex-1">
            <div className={`h-1.5 rounded-full mb-2 ${step >= s.num ? "bg-blue-500" : "bg-gray-200"}`} />
            <span className={`font-body text-xs ${step >= s.num ? "text-blue-500 font-semibold" : "text-gray-400"}`}>{s.num}. {s.label}</span>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-12"><Loader2 size={32} className="animate-spin text-blue-500 mx-auto" /></div>
      ) : (
        <>
          {/* ─── Step 1: Choose child ─── */}
          {step === 1 && (
            <Card padding="md">
              <h2 className="font-body text-base font-semibold text-blue-800 mb-2">Quel cavalier inscrivez-vous ?</h2>
              {children.length === 0 ? (
                <div className="text-center py-8">
                  <span className="text-4xl block mb-3">👨‍👩‍👧‍👦</span>
                  <p className="font-body text-sm text-gray-500 mb-2">Aucun enfant dans votre famille.</p>
                  <a href="/espace-cavalier/profil" className="font-body text-sm text-blue-500 underline">Ajouter un cavalier</a>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {children.map((c: any) => (
                    <button key={c.id} onClick={() => setSelectedChild(c.id)}
                      className={`flex items-center justify-between px-5 py-4 rounded-xl border text-left cursor-pointer transition-all
                        ${selectedChild === c.id ? "border-blue-500 bg-blue-50" : "border-gray-200 bg-white hover:border-gray-300"}`}>
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">🧒</span>
                        <div>
                          <div className="font-body text-sm font-semibold text-blue-800">{c.firstName}</div>
                          <div className="font-body text-xs text-gray-400">
                            {c.birthDate ? `${Math.floor((Date.now() - new Date(c.birthDate).getTime()) / 31557600000)} ans · ` : ""}
                            {c.galopLevel ? `Galop ${c.galopLevel}` : "Débutant"}
                          </div>
                        </div>
                      </div>
                      {selectedChild === c.id && <Check size={20} className="text-blue-500" />}
                    </button>
                  ))}
                  <button onClick={() => selectedChild && setStep(mode === "annuel" ? 2 : 2)} disabled={!selectedChild}
                    className={`mt-3 w-full py-3 rounded-xl font-body text-sm font-semibold border-none cursor-pointer
                      ${selectedChild ? "bg-blue-500 text-white" : "bg-gray-200 text-gray-400"}`}>
                    Continuer <ChevronRight size={16} className="inline ml-1" />
                  </button>
                </div>
              )}
            </Card>
          )}

          {/* ─── Step 2 (annuel): Prerequisites ─── */}
          {step === 2 && mode === "annuel" && (
            <Card padding="md">
              <h2 className="font-body text-base font-semibold text-blue-800 mb-2">Prérequis obligatoires</h2>
              <p className="font-body text-xs text-gray-400 mb-4">Obligatoires pour pratiquer en club.</p>
              <div className="flex flex-col gap-3 mb-6">
                <label className={`flex items-center justify-between px-5 py-4 rounded-xl border cursor-pointer ${licenceOK ? "border-green-500 bg-green-50" : "border-gray-200"}`}>
                  <div className="flex items-center gap-3">
                    <input type="checkbox" checked={licenceOK} onChange={e => setLicenceOK(e.target.checked)} className="accent-green-500 w-5 h-5" />
                    <div><div className="font-body text-sm font-semibold text-blue-800">{LICENCE_FFE.label}</div><div className="font-body text-xs text-gray-400">{LICENCE_FFE.description}</div></div>
                  </div>
                  <span className="font-body text-base font-bold text-blue-500">{LICENCE_FFE.price}€</span>
                </label>
                <label className={`flex items-center justify-between px-5 py-4 rounded-xl border cursor-pointer ${adhesionOK ? "border-green-500 bg-green-50" : "border-gray-200"}`}>
                  <div className="flex items-center gap-3">
                    <input type="checkbox" checked={adhesionOK} onChange={e => setAdhesionOK(e.target.checked)} className="accent-green-500 w-5 h-5" />
                    <div><div className="font-body text-sm font-semibold text-blue-800">{ADHESION.label}</div><div className="font-body text-xs text-gray-400">{ADHESION.description}</div></div>
                  </div>
                  <span className="font-body text-base font-bold text-blue-500">{ADHESION.price}€</span>
                </label>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setStep(1)} className="px-6 py-3 rounded-xl font-body text-sm text-gray-500 bg-white border border-gray-200 cursor-pointer">Retour</button>
                <button onClick={() => setStep(3)} disabled={!licenceOK || !adhesionOK}
                  className={`flex-1 py-3 rounded-xl font-body text-sm font-semibold border-none cursor-pointer ${licenceOK && adhesionOK ? "bg-blue-500 text-white" : "bg-gray-200 text-gray-400"}`}>
                  Continuer <ChevronRight size={16} className="inline ml-1" />
                </button>
              </div>
            </Card>
          )}

          {/* ─── Step 3 (annuel): Choose forfait type ─── */}
          {step === 3 && mode === "annuel" && (
            <Card padding="md">
              <h2 className="font-body text-base font-semibold text-blue-800 mb-2">Type de forfait</h2>
              <p className="font-body text-xs text-gray-400 mb-4">Combien de cours par semaine ?</p>
              <div className="flex gap-3 mb-6">
                <button onClick={() => { setForfaitType("1x"); setSelectedSlots([]); }}
                  className={`flex-1 py-5 rounded-xl border font-body text-sm font-semibold cursor-pointer transition-all text-center
                    ${forfaitType === "1x" ? "border-blue-500 bg-blue-50 text-blue-500" : "border-gray-200 bg-white text-gray-500"}`}>
                  <span className="text-2xl block mb-1">🐴</span>
                  Forfait Loisir
                  <div className="font-body text-xs font-normal text-gray-400 mt-1">1 cours / semaine</div>
                </button>
                <button onClick={() => { setForfaitType("2x"); setSelectedSlots([]); }}
                  className={`flex-1 py-5 rounded-xl border font-body text-sm font-semibold cursor-pointer transition-all text-center
                    ${forfaitType === "2x" ? "border-blue-500 bg-blue-50 text-blue-500" : "border-gray-200 bg-white text-gray-500"}`}>
                  <span className="text-2xl block mb-1">🏇</span>
                  Forfait Compétition
                  <div className="font-body text-xs font-normal text-gray-400 mt-1">2 cours / semaine</div>
                </button>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setStep(2)} className="px-6 py-3 rounded-xl font-body text-sm text-gray-500 bg-white border border-gray-200 cursor-pointer">Retour</button>
                <button onClick={() => setStep(4)}
                  className="flex-1 py-3 rounded-xl font-body text-sm font-semibold border-none cursor-pointer bg-blue-500 text-white">
                  Continuer <ChevronRight size={16} className="inline ml-1" />
                </button>
              </div>
            </Card>
          )}

          {/* ─── Step 4 (annuel): Choose slot(s) ─── */}
          {step === 4 && mode === "annuel" && (
            <Card padding="md">
              <h2 className="font-body text-base font-semibold text-blue-800 mb-2">
                {forfaitType === "2x" ? "Choisir vos 2 créneaux hebdomadaires" : "Choisir votre créneau hebdomadaire"}
              </h2>
              <p className="font-body text-xs text-gray-400 mb-4">
                {forfaitType === "2x"
                  ? "Sélectionnez 2 créneaux sur des jours différents. Ils se répètent chaque semaine."
                  : "Ce cours se répète chaque semaine pendant la saison (hors vacances)."}
              </p>

              {/* Selection counter for 2x */}
              {forfaitType === "2x" && (
                <div className="flex items-center gap-2 mb-4 p-3 bg-blue-50 rounded-xl">
                  <Calculator size={16} className="text-blue-500" />
                  <span className="font-body text-sm text-blue-800">
                    {selectedSlots.length}/2 créneaux sélectionnés
                  </span>
                  {selectedSlots.length === 2 && <Check size={16} className="text-green-500 ml-auto" />}
                </div>
              )}

              {/* Search bar */}
              <div className="relative mb-4">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={slotSearch}
                  onChange={e => setSlotSearch(e.target.value)}
                  placeholder="Rechercher un cours, un jour, un horaire..."
                  className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-gray-200 font-body text-sm bg-white focus:border-blue-500 focus:outline-none"
                />
              </div>

              {weeklySlots.length === 0 ? (
                <div className="text-center py-8">
                  <span className="text-4xl block mb-3">📅</span>
                  <p className="font-body text-sm text-gray-500 mb-2">Aucun cours régulier programmé pour l&apos;instant.</p>
                  <p className="font-body text-xs text-gray-400">L&apos;admin doit d&apos;abord créer des cours via le générateur de périodes dans le back-office.</p>
                </div>
              ) : (
                <div className="flex flex-col gap-2 mb-5">
                  {filteredSlots.length === 0 && slotSearch && (
                    <p className="font-body text-sm text-gray-400 text-center py-4">Aucun créneau ne correspond à « {slotSearch} »</p>
                  )}
                  {filteredSlots.map(slot => {
                    const isSelected = selectedSlots.includes(slot.key);
                    const isFull = slot.spotsAvailable <= 0;
                    const isDisabled = isFull || (!isSelected && selectedSlots.length >= requiredSlots && forfaitType === "2x");

                    return (
                      <button key={slot.key} onClick={() => !isDisabled && toggleSlot(slot.key)}
                        className={`flex items-center justify-between px-5 py-4 rounded-xl border text-left transition-all
                          ${isSelected ? "border-blue-500 bg-blue-50 cursor-pointer" :
                            isDisabled ? "border-gray-100 bg-gray-50 cursor-not-allowed opacity-50" :
                            "border-gray-200 bg-white hover:border-gray-300 cursor-pointer"}`}>
                        <div>
                          <div className="font-body text-sm font-semibold text-blue-800">{slot.activityTitle}</div>
                          <div className="font-body text-xs text-gray-400 mt-0.5">{slot.dayLabel} · {slot.startTime}–{slot.endTime} · {slot.monitor}</div>
                          <div className="font-body text-xs mt-1">
                            <span className={slot.spotsAvailable > 2 ? "text-green-600" : slot.spotsAvailable > 0 ? "text-orange-500" : "text-red-500"}>
                              {slot.spotsAvailable > 0 ? `${slot.spotsAvailable} place${slot.spotsAvailable > 1 ? "s" : ""}` : "COMPLET"}
                            </span>
                            <span className="text-gray-400 ml-2">{slot.totalSessions} séances</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-body text-sm font-semibold text-blue-500">
                            {slot.priceTTC > 100 ? `${slot.priceTTC.toFixed(0)}€` : `${(slot.priceTTC * slot.totalSessions).toFixed(0)}€`}
                          </span>
                          {isSelected && (
                            <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center">
                              <Check size={14} className="text-white" />
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="flex gap-3">
                <button onClick={() => setStep(3)} className="px-6 py-3 rounded-xl font-body text-sm text-gray-500 bg-white border border-gray-200 cursor-pointer">Retour</button>
                <button onClick={() => setStep(5)} disabled={!slotsComplete}
                  className={`flex-1 py-3 rounded-xl font-body text-sm font-semibold border-none cursor-pointer
                    ${slotsComplete ? "bg-blue-500 text-white" : "bg-gray-200 text-gray-400"}`}>
                  Continuer <ChevronRight size={16} className="inline ml-1" />
                </button>
              </div>
            </Card>
          )}

          {/* ─── Step 2 (ponctuel): Choose single slot ─── */}
          {step === 2 && mode === "ponctuel" && (
            <Card padding="md">
              <h2 className="font-body text-base font-semibold text-blue-800 mb-2">Choisir une séance</h2>
              <p className="font-body text-xs text-gray-400 mb-4">Choisissez un créneau pour une séance ponctuelle.</p>
              {weeklySlots.length === 0 ? (
                <div className="text-center py-8">
                  <span className="text-4xl block mb-3">📅</span>
                  <p className="font-body text-sm text-gray-500">Aucun cours programmé.</p>
                </div>
              ) : (
                <div className="flex flex-col gap-2 mb-5">
                  {weeklySlots.map(slot => (
                    <button key={slot.key} onClick={() => setSelectedSlots([slot.key])}
                      className={`flex items-center justify-between px-5 py-4 rounded-xl border text-left cursor-pointer transition-all
                        ${selectedSlots[0] === slot.key ? "border-blue-500 bg-blue-50" :
                          slot.spotsAvailable > 0 ? "border-gray-200 bg-white hover:border-gray-300" : "border-gray-100 bg-gray-50 opacity-50"}`}>
                      <div>
                        <div className="font-body text-sm font-semibold text-blue-800">{slot.activityTitle}</div>
                        <div className="font-body text-xs text-gray-400">{slot.dayLabel} · {slot.startTime}–{slot.endTime}</div>
                      </div>
                      <span className="font-body text-sm font-semibold text-blue-500">{(slot.priceTTC || 0).toFixed(2)}€</span>
                    </button>
                  ))}
                </div>
              )}
              <div className="flex gap-3">
                <button onClick={() => setStep(1)} className="px-6 py-3 rounded-xl font-body text-sm text-gray-500 bg-white border border-gray-200 cursor-pointer">Retour</button>
                <button onClick={() => setStep(3)} disabled={selectedSlots.length === 0}
                  className={`flex-1 py-3 rounded-xl font-body text-sm font-semibold border-none cursor-pointer
                    ${selectedSlots.length > 0 ? "bg-blue-500 text-white" : "bg-gray-200 text-gray-400"}`}>
                  Continuer <ChevronRight size={16} className="inline ml-1" />
                </button>
              </div>
            </Card>
          )}

          {/* ─── Step 5 (annuel) / Step 3 (ponctuel): Recap + Payment ─── */}
          {((step === 5 && mode === "annuel") || (step === 3 && mode === "ponctuel")) && (
            <Card padding="md">
              <h2 className="font-body text-base font-semibold text-blue-800 mb-4">Récapitulatif</h2>

              <div className="bg-blue-50/50 rounded-xl p-4 mb-5 flex flex-col gap-3">
                {/* Child */}
                <div className="flex justify-between">
                  <span className="font-body text-sm text-gray-500">Cavalier</span>
                  <span className="font-body text-sm font-semibold text-blue-800">{child ? (child as any).firstName : "—"}</span>
                </div>

                {/* Forfait type */}
                {mode === "annuel" && (
                  <div className="flex justify-between">
                    <span className="font-body text-sm text-gray-500">Forfait</span>
                    <Badge color="blue">{forfaitType === "2x" ? "Compétition (2×/sem)" : "Loisir (1×/sem)"}</Badge>
                  </div>
                )}

                {/* Prerequisites */}
                {mode === "annuel" && (
                  <>
                    <div className="flex justify-between">
                      <span className="font-body text-sm text-gray-500">{LICENCE_FFE.label}</span>
                      <span className="font-body text-sm text-blue-500">{LICENCE_FFE.price}€</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-body text-sm text-gray-500">{ADHESION.label}</span>
                      <span className="font-body text-sm text-blue-500">{ADHESION.price}€</span>
                    </div>
                  </>
                )}

                {/* Slots */}
                {slotsPrices.map((sp, i) => (
                  <div key={i} className="flex justify-between items-start pt-2 border-t border-blue-500/8">
                    <div>
                      <span className="font-body text-sm font-semibold text-blue-800">
                        {mode === "annuel" ? `Créneau ${i + 1}` : "Séance ponctuelle"}
                      </span>
                      <div className="font-body text-xs text-gray-400">
                        {sp.slot.activityTitle} — {sp.slot.dayLabel} {sp.slot.startTime}–{sp.slot.endTime}
                      </div>
                      {mode === "annuel" && <div className="font-body text-xs text-blue-500">{sp.sessions} séances</div>}
                    </div>
                    <span className="font-body text-sm font-semibold text-blue-500">
                      {mode === "annuel" ? `${sp.forfaitPrice.toFixed(2)}€` : `${sp.slot.priceTTC.toFixed(2)}€`}
                    </span>
                  </div>
                ))}

                {/* Total */}
                <div className="flex justify-between pt-3 border-t-2 border-blue-500/8">
                  <span className="font-body text-base font-bold text-blue-800">Total TTC</span>
                  <span className="font-body text-2xl font-bold text-blue-500">{grandTotal.toFixed(2)}€</span>
                </div>
              </div>

              {/* Payment plan (annual only) */}
              {mode === "annuel" && grandTotal > 100 && (
                <div className="mb-5">
                  <div className="font-body text-sm font-semibold text-blue-800 mb-3">Mode de paiement</div>
                  <div className="flex gap-3">
                    {([["1x", `${grandTotal.toFixed(0)}€ en 1 fois`], ["3x", `3 × ${(grandTotal / 3).toFixed(0)}€`], ["10x", `10 × ${(grandTotal / 10).toFixed(0)}€`]] as const).map(([id, label]) => (
                      <button key={id} onClick={() => setPaymentPlan(id)}
                        className={`flex-1 py-3 rounded-xl border font-body text-sm font-medium cursor-pointer text-center
                          ${paymentPlan === id ? "border-blue-500 bg-blue-50 text-blue-500 font-semibold" : "border-gray-200 bg-white text-gray-500"}`}>
                        {label}
                      </button>
                    ))}
                  </div>
                  {paymentPlan !== "1x" && <p className="font-body text-xs text-gray-400 mt-2">Prélèvement SEPA ou CB automatique. Sans frais.</p>}
                </div>
              )}

              <div className="flex gap-3">
                <button onClick={() => setStep(mode === "annuel" ? 4 : 2)} className="px-6 py-3 rounded-xl font-body text-sm text-gray-500 bg-white border border-gray-200 cursor-pointer">Retour</button>
                <button onClick={handleEnroll} disabled={submitting}
                  className="flex-1 py-4 rounded-xl font-body text-base font-semibold text-blue-800 bg-gold-400 border-none cursor-pointer hover:bg-gold-300 flex items-center justify-center gap-2 disabled:opacity-50">
                  {submitting ? (
                    <><Loader2 size={18} className="animate-spin" /> Inscription en cours...</>
                  ) : (
                    <><CreditCard size={18} /> Payer {grandTotal.toFixed(2)}€ {paymentPlan !== "1x" && mode === "annuel" ? `en ${paymentPlan}` : ""}</>
                  )}
                </button>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
