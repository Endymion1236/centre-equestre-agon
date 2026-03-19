"use client";

import { useState, useEffect, useMemo } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { Card, Badge, Button } from "@/components/ui";
import { Check, ChevronRight, AlertTriangle, Calculator, CreditCard, Loader2, Calendar } from "lucide-react";

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
}

// Group creneaux into weekly slots
interface WeeklySlot {
  key: string; // "cours-debutant-2-10:00" (activityId-day-time)
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
}

const dayLabels = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];

const LICENCE_FFE = { label: "Licence FFE", price: 25, description: "Obligatoire pour pratiquer en club" };
const ADHESION = { label: "Adhésion au club", price: 50, description: "Cotisation annuelle" };

export default function InscriptionAnnuellePage() {
  const { user, family } = useAuth();
  const [loading, setLoading] = useState(true);
  const [creneaux, setCreneaux] = useState<Creneau[]>([]);
  const [step, setStep] = useState(1);
  const [selectedChild, setSelectedChild] = useState("");
  const [licenceOK, setLicenceOK] = useState(false);
  const [adhesionOK, setAdhesionOK] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState("");
  const [paymentPlan, setPaymentPlan] = useState<"1x" | "3x" | "10x">("1x");
  const [mode, setMode] = useState<"annuel" | "ponctuel">("annuel");

  const children = family?.children || [];
  const child = children.find((c: any) => c.id === selectedChild);

  // Load all "cours" type creneaux from Firestore
  useEffect(() => {
    const fetchCreneaux = async () => {
      try {
        // Get all future creneaux of type "cours"
        const today = new Date().toISOString().split("T")[0];
        const snap = await getDocs(
          query(collection(db, "creneaux"), where("activityType", "==", "cours"), where("date", ">=", today))
        );
        setCreneaux(snap.docs.map(d => ({ id: d.id, ...d.data() })) as Creneau[]);
      } catch {
        // Fallback: load all and filter
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
        };
      }
      map[key].totalSessions++;
      map[key].creneauIds.push(c.id);
      const enrolled = c.enrolled?.length || 0;
      map[key].avgEnrolled = Math.max(map[key].avgEnrolled, enrolled);
    }
    // Calculate spots available
    for (const slot of Object.values(map)) {
      slot.spotsAvailable = slot.maxPlaces - slot.avgEnrolled;
    }
    return Object.values(map).sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.startTime.localeCompare(b.startTime));
  }, [creneaux]);

  const selectedSlotData = weeklySlots.find(s => s.key === selectedSlot);

  // Calculate price
  const perSessionTTC = selectedSlotData ? (creneaux.find(c => c.activityId === selectedSlotData.activityId)?.priceTTC || 0) : 0;
  const annualPriceTTC = perSessionTTC > 0 ? perSessionTTC * (selectedSlotData?.totalSessions || 0) : 0;
  // For annual, often a flat rate is cheaper. Use the activity price as annual if it's > 100 (likely annual price)
  const forfaitPrice = perSessionTTC > 100 ? perSessionTTC : annualPriceTTC;
  const totalPrerequisites = LICENCE_FFE.price + ADHESION.price;
  const grandTotal = mode === "annuel" ? totalPrerequisites + forfaitPrice : totalPrerequisites + perSessionTTC;

  const steps = mode === "annuel"
    ? [{ num: 1, label: "Cavalier" }, { num: 2, label: "Prérequis" }, { num: 3, label: "Créneau" }, { num: 4, label: "Récapitulatif" }]
    : [{ num: 1, label: "Cavalier" }, { num: 2, label: "Créneau" }, { num: 3, label: "Paiement" }];

  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-blue-800 mb-2">Inscription aux cours</h1>
      <p className="font-body text-sm text-gray-400 mb-6">Cours réguliers à l&apos;année ou séance ponctuelle.</p>

      {/* Mode toggle */}
      <div className="flex gap-3 mb-6">
        <button onClick={() => { setMode("annuel"); setStep(1); }}
          className={`flex-1 py-4 rounded-xl border font-body text-sm font-semibold cursor-pointer transition-all text-center
            ${mode === "annuel" ? "border-blue-500 bg-blue-50 text-blue-500" : "border-gray-200 bg-white text-gray-500"}`}>
          <Calendar size={18} className="inline mr-2" />Inscription annuelle
          <div className="font-body text-xs font-normal text-gray-400 mt-1">Forfait saison, licence + adhésion</div>
        </button>
        <button onClick={() => { setMode("ponctuel"); setStep(1); }}
          className={`flex-1 py-4 rounded-xl border font-body text-sm font-semibold cursor-pointer transition-all text-center
            ${mode === "ponctuel" ? "border-gold-400 bg-gold-50 text-gold-500" : "border-gray-200 bg-white text-gray-500"}`}>
          🎟️ Séance ponctuelle
          <div className="font-body text-xs font-normal text-gray-400 mt-1">Une séance à la carte, sans engagement</div>
        </button>
      </div>

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
        <div className="text-center py-16"><Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto" /></div>
      ) : (
        <>
          {/* ─── Step 1: Choose child ─── */}
          {step === 1 && (
            <Card padding="md">
              <h2 className="font-body text-base font-semibold text-blue-800 mb-4">Choisir le cavalier</h2>
              {children.length === 0 ? (
                <div className="text-center py-8">
                  <AlertTriangle className="w-8 h-8 text-orange-400 mx-auto mb-3" />
                  <p className="font-body text-sm text-gray-500 mb-3">Ajoutez d&apos;abord vos enfants dans votre profil.</p>
                  <a href="/espace-cavalier/profil" className="font-body text-sm font-semibold text-blue-500 no-underline">Compléter le profil →</a>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {children.map((c: any) => (
                    <button key={c.id} onClick={() => setSelectedChild(c.id)}
                      className={`flex items-center justify-between px-5 py-4 rounded-xl border text-left cursor-pointer transition-all
                        ${selectedChild === c.id ? "border-blue-500 bg-blue-50" : "border-gray-200 bg-white hover:border-blue-200"}`}>
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">🧒</span>
                        <div>
                          <div className="font-body text-base font-semibold text-blue-800">{c.firstName}</div>
                          <div className="font-body text-xs text-gray-400">{c.galopLevel && c.galopLevel !== "—" ? `Galop ${c.galopLevel}` : "Débutant"}</div>
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

          {/* ─── Step 2 (ponctuel) or Step 3 (annuel): Choose slot ─── */}
          {((step === 2 && mode === "ponctuel") || (step === 3 && mode === "annuel")) && (
            <Card padding="md">
              <h2 className="font-body text-base font-semibold text-blue-800 mb-2">
                {mode === "annuel" ? "Choisir votre créneau hebdomadaire" : "Choisir une séance"}
              </h2>
              <p className="font-body text-xs text-gray-400 mb-4">
                {mode === "annuel"
                  ? "Ce cours se répète chaque semaine pendant la saison (hors vacances)."
                  : "Choisissez un créneau pour une séance ponctuelle."}
              </p>

              {weeklySlots.length === 0 ? (
                <div className="text-center py-8">
                  <span className="text-4xl block mb-3">📅</span>
                  <p className="font-body text-sm text-gray-500 mb-2">Aucun cours régulier programmé pour l&apos;instant.</p>
                  <p className="font-body text-xs text-gray-400">L&apos;admin doit d&apos;abord créer des cours via le générateur de périodes dans le back-office.</p>
                </div>
              ) : (
                <div className="flex flex-col gap-2 mb-5">
                  {weeklySlots.map(slot => (
                    <button key={slot.key} onClick={() => setSelectedSlot(slot.key)}
                      className={`flex items-center justify-between px-5 py-4 rounded-xl border text-left cursor-pointer transition-all
                        ${selectedSlot === slot.key ? "border-blue-500 bg-blue-50" : slot.spotsAvailable > 0 ? "border-gray-200 bg-white hover:border-blue-200" : "border-gray-100 bg-gray-50 opacity-50"}`}>
                      <div className="flex items-center gap-4">
                        <div className="w-12 text-center">
                          <div className="font-body text-sm font-bold text-blue-800">{slot.dayLabel.slice(0, 3)}</div>
                        </div>
                        <div>
                          <div className="font-body text-sm font-semibold text-blue-800">{slot.activityTitle}</div>
                          <div className="font-body text-xs text-gray-400">{slot.dayLabel} {slot.startTime}–{slot.endTime} · {slot.monitor}</div>
                          {mode === "annuel" && <div className="font-body text-xs text-blue-500">{slot.totalSessions} séances restantes</div>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge color={slot.spotsAvailable > 2 ? "green" : slot.spotsAvailable > 0 ? "orange" : "red"}>
                          {slot.spotsAvailable > 0 ? `${slot.spotsAvailable} place${slot.spotsAvailable > 1 ? "s" : ""}` : "Complet"}
                        </Badge>
                        {selectedSlot === slot.key && <Check size={18} className="text-blue-500" />}
                      </div>
                    </button>
                  ))}
                </div>
              )}

              <div className="flex gap-3">
                <button onClick={() => setStep(mode === "annuel" ? 2 : 1)} className="px-6 py-3 rounded-xl font-body text-sm text-gray-500 bg-white border border-gray-200 cursor-pointer">Retour</button>
                <button onClick={() => setStep(mode === "annuel" ? 4 : 3)} disabled={!selectedSlot}
                  className={`flex-1 py-3 rounded-xl font-body text-sm font-semibold border-none cursor-pointer ${selectedSlot ? "bg-blue-500 text-white" : "bg-gray-200 text-gray-400"}`}>
                  Continuer <ChevronRight size={16} className="inline ml-1" />
                </button>
              </div>
            </Card>
          )}

          {/* ─── Final step: Summary ─── */}
          {((step === 4 && mode === "annuel") || (step === 3 && mode === "ponctuel")) && selectedSlotData && (
            <Card padding="md">
              <h2 className="font-body text-base font-semibold text-blue-800 mb-4">Récapitulatif</h2>
              <div className="flex flex-col gap-3 mb-5">
                <div className="flex justify-between py-2 border-b border-blue-500/8">
                  <span className="font-body text-sm text-gray-500">Cavalier</span>
                  <span className="font-body text-sm font-semibold text-blue-800">🧒 {(child as any)?.firstName}</span>
                </div>

                {mode === "annuel" && (
                  <>
                    <div className="flex justify-between py-2 border-b border-blue-500/8">
                      <span className="font-body text-sm text-gray-500">{LICENCE_FFE.label}</span>
                      <span className="font-body text-sm font-semibold text-blue-500">{LICENCE_FFE.price}€</span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-blue-500/8">
                      <span className="font-body text-sm text-gray-500">{ADHESION.label}</span>
                      <span className="font-body text-sm font-semibold text-blue-500">{ADHESION.price}€</span>
                    </div>
                  </>
                )}

                <div className="flex justify-between py-2 border-b border-blue-500/8">
                  <div>
                    <span className="font-body text-sm text-gray-500">
                      {mode === "annuel" ? "Forfait annuel" : "Séance ponctuelle"}
                    </span>
                    <div className="font-body text-xs text-gray-400">
                      {selectedSlotData.activityTitle} — {selectedSlotData.dayLabel} {selectedSlotData.startTime}–{selectedSlotData.endTime}
                    </div>
                    {mode === "annuel" && <div className="font-body text-xs text-blue-500">{selectedSlotData.totalSessions} séances</div>}
                  </div>
                  <span className="font-body text-sm font-semibold text-blue-500">
                    {mode === "annuel" ? `${forfaitPrice.toFixed(2)}€` : `${perSessionTTC.toFixed(2)}€`}
                  </span>
                </div>

                <div className="flex justify-between py-3 border-t-2 border-blue-500/8">
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
                <button onClick={() => setStep(mode === "annuel" ? 3 : 2)} className="px-6 py-3 rounded-xl font-body text-sm text-gray-500 bg-white border border-gray-200 cursor-pointer">Retour</button>
                <button className="flex-1 py-4 rounded-xl font-body text-base font-semibold text-blue-800 bg-gold-400 border-none cursor-pointer hover:bg-gold-300 flex items-center justify-center gap-2">
                  <CreditCard size={18} /> Payer {grandTotal.toFixed(2)}€ {paymentPlan !== "1x" && mode === "annuel" ? `en ${paymentPlan}` : ""}
                </button>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
