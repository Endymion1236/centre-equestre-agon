"use client";

import { useState, useEffect, useMemo } from "react";
import { collection, getDocs, query, where, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { Card, Badge, Button } from "@/components/ui";
import { Check, ChevronRight, AlertTriangle, Calculator, CreditCard, Loader2, Calendar } from "lucide-react";

interface Creneau {
  id: string; activityId: string; activityTitle: string; activityType: string;
  date: string; startTime: string; endTime: string; monitor: string;
  maxPlaces: number; enrolled: any[]; priceTTC?: number;
}
interface WeeklySlot {
  key: string; activityId: string; activityTitle: string; dayOfWeek: number;
  dayLabel: string; startTime: string; endTime: string; monitor: string;
  maxPlaces: number; totalSessions: number; avgEnrolled: number;
  spotsAvailable: number; creneauIds: string[];
}

const dayLabels = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
const LICENCE_FFE = { label: "Licence FFE", price: 25, description: "Obligatoire pour pratiquer en club" };
const ADHESION = { label: "Adhésion au club", price: 50, description: "Cotisation annuelle" };

export default function InscriptionAnnuellePage() {
  const { user, family } = useAuth();
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
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

  useEffect(() => {
    const fetchCreneaux = async () => {
      try {
        const today = new Date().toISOString().split("T")[0];
        const snap = await getDocs(query(collection(db, "creneaux"), where("activityType", "==", "cours"), where("date", ">=", today)));
        setCreneaux(snap.docs.map(d => ({ id: d.id, ...d.data() })) as Creneau[]);
      } catch {
        try {
          const snap = await getDocs(collection(db, "creneaux"));
          const today = new Date().toISOString().split("T")[0];
          setCreneaux((snap.docs.map(d => ({ id: d.id, ...d.data() })) as Creneau[]).filter(c => c.activityType === "cours" && c.date >= today));
        } catch (e) { console.error(e); }
      }
      setLoading(false);
    };
    fetchCreneaux();
  }, []);

  const weeklySlots = useMemo(() => {
    const map: Record<string, WeeklySlot> = {};
    for (const c of creneaux) {
      const d = new Date(c.date + "T12:00:00");
      const dow = (d.getDay() + 6) % 7;
      const key = `${c.activityId}-${dow}-${c.startTime}`;
      if (!map[key]) map[key] = {
        key, activityId: c.activityId, activityTitle: c.activityTitle,
        dayOfWeek: dow, dayLabel: dayLabels[dow], startTime: c.startTime, endTime: c.endTime,
        monitor: c.monitor, maxPlaces: c.maxPlaces, totalSessions: 0, avgEnrolled: 0,
        spotsAvailable: 0, creneauIds: [],
      };
      map[key].totalSessions++;
      map[key].creneauIds.push(c.id);
      map[key].avgEnrolled = Math.max(map[key].avgEnrolled, c.enrolled?.length || 0);
    }
    for (const slot of Object.values(map)) slot.spotsAvailable = slot.maxPlaces - slot.avgEnrolled;
    return Object.values(map).sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.startTime.localeCompare(b.startTime));
  }, [creneaux]);

  const selectedSlotData = weeklySlots.find(s => s.key === selectedSlot);
  const perSessionTTC = selectedSlotData ? (creneaux.find(c => c.activityId === selectedSlotData.activityId)?.priceTTC || 0) : 0;
  const annualPriceTTC = perSessionTTC > 0 ? perSessionTTC * (selectedSlotData?.totalSessions || 0) : 0;
  const forfaitPrice = perSessionTTC > 100 ? perSessionTTC : annualPriceTTC;
  const totalPrerequisites = (licenceOK ? LICENCE_FFE.price : 0) + (adhesionOK ? ADHESION.price : 0);
  const grandTotal = mode === "annuel" ? totalPrerequisites + forfaitPrice : totalPrerequisites + perSessionTTC;

  // Calcul mensualités
  const nbEcheances = paymentPlan === "10x" ? 10 : paymentPlan === "3x" ? 3 : 1;
  const montantEcheance = nbEcheances > 1 ? Math.round(grandTotal / nbEcheances * 100) / 100 : grandTotal;
  const premierPaiement = montantEcheance; // Premier versement immédiat

  const steps = [
    { num: 1, label: "Cavalier" },
    { num: 2, label: "Prérequis" },
    { num: 3, label: "Créneau" },
    { num: 4, label: "Paiement" },
  ];

  const handlePay = async () => {
    if (!user || !family || !selectedSlotData) return;
    setPaying(true);
    try {
      const childObj = children.find((c: any) => c.id === selectedChild) as any;
      const childName = childObj?.firstName || "Cavalier";
      const slotLabel = `${selectedSlotData.activityTitle} — ${selectedSlotData.dayLabel} ${selectedSlotData.startTime}–${selectedSlotData.endTime}`;

      // Items du paiement
      const items = [
        ...(licenceOK ? [{ activityTitle: LICENCE_FFE.label, childId: selectedChild, childName, activityType: "prerequis", priceHT: LICENCE_FFE.price / 1.2, tva: 20, priceTTC: LICENCE_FFE.price }] : []),
        ...(adhesionOK ? [{ activityTitle: ADHESION.label, childId: selectedChild, childName, activityType: "prerequis", priceHT: ADHESION.price / 1.055, tva: 5.5, priceTTC: ADHESION.price }] : []),
        { activityTitle: slotLabel, childId: selectedChild, childName, activityType: "cours", priceHT: forfaitPrice / 1.055, tva: 5.5, priceTTC: mode === "annuel" ? forfaitPrice : perSessionTTC, creneauId: selectedSlotData.creneauIds[0] || "" },
      ];

      // Créer les échéances dans Firestore
      const echeances = nbEcheances > 1 ? Array.from({ length: nbEcheances }, (_, i) => {
        const d = new Date();
        d.setMonth(d.getMonth() + i);
        return { numero: i + 1, montant: montantEcheance, date: d.toISOString().split("T")[0], status: i === 0 ? "pending" : "scheduled" };
      }) : [];

      // Inscrire dans le créneau
      for (const cid of selectedSlotData.creneauIds.slice(0, 1)) {
        const cSnap = creneaux.find(c => c.id === cid);
        if (cSnap) {
          const { updateDoc, doc, arrayUnion } = await import("firebase/firestore");
          await updateDoc(doc(db, "creneaux", cid), {
            enrolled: arrayUnion({ childId: selectedChild, childName, familyId: user.uid, familyName: family.parentName, enrolledAt: new Date().toISOString() }),
            enrolledCount: (cSnap.enrolled?.length || 0) + 1,
          });
        }
      }

      // Créer le paiement
      const payRef = await addDoc(collection(db, "payments"), {
        familyId: user.uid, familyEmail: family.parentEmail || user.email,
        familyName: family.parentName, items, totalTTC: grandTotal,
        paymentMode: "", paymentRef: "", status: "pending", paidAmount: 0,
        source: "client", type: mode === "annuel" ? "annuel" : "ponctuel",
        echeancesTotal: nbEcheances, echeances,
        skipPayment: mode === "annuel" && nbEcheances === 1 ? false : undefined,
        date: serverTimestamp(),
      });

      // Stripe checkout — abonnement ou paiement unique
      try {
        const res = await fetch("/api/stripe/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            familyId: user.uid,
            familyEmail: family.parentEmail || user.email,
            familyName: family.parentName,
            paymentId: payRef.id,
            // Mensualités → mode subscription Stripe
            ...(nbEcheances > 1 ? {
              subscription: true,
              nbEcheances,
              montantEcheance,
            } : {}),
            items: [{
              name: nbEcheances > 1
                ? `Mensualité ${slotLabel} (${nbEcheances}×)`
                : slotLabel,
              description: nbEcheances > 1
                ? `${nbEcheances} prélèvements mensuels de ${montantEcheance.toFixed(2)}€ — Total ${grandTotal.toFixed(2)}€`
                : `${selectedSlotData.totalSessions} séances`,
              priceInCents: Math.round(premierPaiement * 100),
              quantity: 1,
            }],
          }),
        });
        const data = await res.json();
        if (data.url) { window.location.href = data.url; return; }
      } catch (e) { console.error("Stripe error:", e); }

      // Fallback sans Stripe
      alert("Inscription enregistrée ! Le paiement sera traité séparément.");
    } catch (e) { console.error(e); alert("Erreur. Veuillez réessayer."); }
    setPaying(false);
  };

  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-blue-800 mb-2">Inscription annuelle</h1>
      <p className="font-body text-sm text-slate-600 mb-6">Forfait saison, licence et adhésion.</p>

      {/* Étapes */}
      <div className="flex gap-2 mb-8">
        {steps.map(s => (
          <div key={s.num} className="flex-1">
            <div className={`h-1.5 rounded-full mb-2 ${step >= s.num ? "bg-blue-500" : "bg-gray-300"}`} />
            <span className="font-body text-xs" style={{color: step >= s.num ? "#2563eb" : "#475569", fontWeight: step >= s.num ? 600 : 400}}>{s.num}. {s.label}</span>
          </div>
        ))}
      </div>

      {loading ? <div className="text-center py-16"><Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto" /></div> : <>

        {/* ── Step 1 : Cavalier ── */}
        {step === 1 && (
          <Card padding="md">
            <h2 className="font-body text-base font-semibold text-blue-800 mb-4">Choisir le cavalier</h2>
            {children.length === 0 ? (
              <div className="text-center py-8">
                <AlertTriangle className="w-8 h-8 text-orange-400 mx-auto mb-3" />
                <p className="font-body text-sm text-slate-600 mb-3">Ajoutez d&apos;abord vos enfants dans votre profil.</p>
                <a href="/espace-cavalier/profil" className="font-body text-sm font-semibold text-blue-500 no-underline">Compléter le profil →</a>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {children.map((c: any) => (
                  <button key={c.id} onClick={() => setSelectedChild(c.id)}
                    className={`flex items-center justify-between px-5 py-4 rounded-xl border text-left cursor-pointer transition-all ${selectedChild === c.id ? "border-blue-500 bg-blue-50" : "border-gray-200 bg-white hover:border-blue-200"}`}>
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">🧒</span>
                      <div>
                        <div className="font-body text-base font-semibold text-blue-800">{c.firstName}</div>
                        <div className="font-body text-xs" style={{color:"#475569"}}>{c.galopLevel && c.galopLevel !== "—" ? `Galop ${c.galopLevel}` : "Débutant"}</div>
                      </div>
                    </div>
                    {selectedChild === c.id && <Check size={20} className="text-blue-500" />}
                  </button>
                ))}
                <button onClick={() => selectedChild && setStep(2)} disabled={!selectedChild}
                  className={`mt-3 w-full py-3 rounded-xl font-body text-sm font-semibold border-none cursor-pointer ${selectedChild ? "bg-blue-500 text-white" : "bg-gray-200 text-slate-600"}`}>
                  Continuer <ChevronRight size={16} className="inline ml-1" />
                </button>
              </div>
            )}
          </Card>
        )}

        {/* ── Step 2 : Prérequis ── */}
        {step === 2 && (
          <Card padding="md">
            <h2 className="font-body text-base font-semibold text-blue-800 mb-1">Prérequis obligatoires</h2>
            <p className="font-body text-xs mb-4" style={{color:"#475569"}}>Cochez ce que vous avez déjà. Sinon, nous les ajoutons à votre inscription.</p>
            <div className="flex flex-col gap-3 mb-5">
              {[
                { id: "licence", label: LICENCE_FFE.label, desc: LICENCE_FFE.description, price: LICENCE_FFE.price, checked: licenceOK, set: setLicenceOK },
                { id: "adhesion", label: ADHESION.label, desc: ADHESION.description, price: ADHESION.price, checked: adhesionOK, set: setAdhesionOK },
              ].map(item => (
                <div key={item.id} className={`flex items-center gap-4 px-4 py-3.5 rounded-xl border cursor-pointer transition-all ${item.checked ? "border-green-300 bg-green-50" : "border-gray-200 bg-white"}`}
                  onClick={() => item.set(!item.checked)}>
                  <div className={`w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 ${item.checked ? "bg-green-500" : "border-2 border-gray-300"}`}>
                    {item.checked && <Check size={12} className="text-white" />}
                  </div>
                  <div className="flex-1">
                    <div className="font-body text-sm font-semibold text-blue-800">{item.label}</div>
                    <div className="font-body text-xs" style={{color:"#475569"}}>{item.desc}</div>
                  </div>
                  <div className={`font-body text-sm font-bold ${item.checked ? "text-slate-600 line-through" : "text-blue-500"}`}>
                    {item.checked ? "Déjà ✓" : `+${item.price}€`}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-3">
              <button onClick={() => setStep(1)} className="px-6 py-3 rounded-xl font-body text-sm text-slate-600 bg-white border border-gray-200 cursor-pointer">Retour</button>
              <button onClick={() => setStep(3)} className="flex-1 py-3 rounded-xl font-body text-sm font-semibold bg-blue-500 text-white border-none cursor-pointer">
                Continuer <ChevronRight size={16} className="inline ml-1" />
              </button>
            </div>
          </Card>
        )}

        {/* ── Step 3 : Créneau ── */}
        {step === 3 && (
          <Card padding="md">
            <h2 className="font-body text-base font-semibold text-blue-800 mb-4">Choisir un créneau</h2>
            {weeklySlots.length === 0 ? (
              <p className="font-body text-sm text-slate-600 text-center py-8">Aucun créneau disponible pour le moment.</p>
            ) : (
              <div className="flex flex-col gap-2 mb-5">
                {weeklySlots.map(slot => {
                  const spots = slot.spotsAvailable;
                  const priceTTC = creneaux.find(c => c.activityId === slot.activityId)?.priceTTC || 0;
                  const annualPrice = priceTTC > 100 ? priceTTC : priceTTC * slot.totalSessions;
                  return (
                    <button key={slot.key} onClick={() => setSelectedSlot(slot.key)} disabled={spots <= 0}
                      className={`flex items-center justify-between px-4 py-3.5 rounded-xl border text-left cursor-pointer transition-all ${selectedSlot === slot.key ? "border-blue-500 bg-blue-50" : spots > 0 ? "border-gray-200 bg-white hover:border-blue-200" : "border-gray-100 bg-gray-50 opacity-50 cursor-not-allowed"}`}>
                      <div>
                        <div className="font-body text-sm font-semibold text-blue-800">{slot.activityTitle}</div>
                        <div className="font-body text-xs text-slate-600">{slot.dayLabel} · {slot.startTime}–{slot.endTime} · {slot.monitor}</div>
                        <div className="font-body text-xs" style={{color:"#475569"}}>{slot.totalSessions} séances dans l&apos;année</div>
                      </div>
                      <div className="text-right ml-3 flex-shrink-0">
                        <div className="font-body text-base font-bold text-blue-500">{mode === "annuel" ? `${annualPrice.toFixed(0)}€` : `${priceTTC.toFixed(0)}€`}</div>
                        <Badge color={spots > 2 ? "green" : spots > 0 ? "orange" : "red"}>{spots > 0 ? `${spots} pl.` : "Complet"}</Badge>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
            <div className="flex gap-3">
              <button onClick={() => setStep(2)} className="px-6 py-3 rounded-xl font-body text-sm text-slate-600 bg-white border border-gray-200 cursor-pointer">Retour</button>
              <button onClick={() => setStep(4)} disabled={!selectedSlot}
                className={`flex-1 py-3 rounded-xl font-body text-sm font-semibold border-none cursor-pointer ${selectedSlot ? "bg-blue-500 text-white" : "bg-gray-200 text-slate-600"}`}>
                Continuer <ChevronRight size={16} className="inline ml-1" />
              </button>
            </div>
          </Card>
        )}

        {/* ── Step 4 : Paiement ── */}
        {step === 4 && selectedSlotData && (
          <Card padding="md">
            <h2 className="font-body text-base font-semibold text-blue-800 mb-4">Récapitulatif & paiement</h2>
            <div className="flex flex-col gap-2 mb-5">
              <div className="flex justify-between py-2 border-b border-blue-500/8">
                <span className="font-body text-sm text-slate-600">Cavalier</span>
                <span className="font-body text-sm font-semibold text-blue-800">🧒 {(child as any)?.firstName}</span>
              </div>
              {!licenceOK && (
                <div className="flex justify-between py-2 border-b border-blue-500/8">
                  <span className="font-body text-sm text-slate-600">{LICENCE_FFE.label}</span>
                  <span className="font-body text-sm font-semibold text-blue-500">{LICENCE_FFE.price}€</span>
                </div>
              )}
              {!adhesionOK && (
                <div className="flex justify-between py-2 border-b border-blue-500/8">
                  <span className="font-body text-sm text-slate-600">{ADHESION.label}</span>
                  <span className="font-body text-sm font-semibold text-blue-500">{ADHESION.price}€</span>
                </div>
              )}
              <div className="flex justify-between py-2 border-b border-blue-500/8">
                <div>
                  <span className="font-body text-sm text-slate-600">{mode === "annuel" ? "Forfait annuel" : "Séance ponctuelle"}</span>
                  <div className="font-body text-xs text-slate-600">{selectedSlotData.activityTitle} — {selectedSlotData.dayLabel} {selectedSlotData.startTime}–{selectedSlotData.endTime}</div>
                  {mode === "annuel" && <div className="font-body text-xs text-blue-500">{selectedSlotData.totalSessions} séances</div>}
                </div>
                <span className="font-body text-sm font-semibold text-blue-500">{(mode === "annuel" ? forfaitPrice : perSessionTTC).toFixed(2)}€</span>
              </div>
              <div className="flex justify-between py-3">
                <span className="font-body text-base font-bold text-blue-800">Total TTC</span>
                <span className="font-body text-2xl font-bold text-blue-500">{grandTotal.toFixed(2)}€</span>
              </div>
            </div>

            {/* ── Choix mensualités ── */}
            {mode === "annuel" && grandTotal > 100 && (
              <div className="mb-5">
                <div className="font-body text-sm font-semibold text-blue-800 mb-3">Mode de paiement</div>
                <div className="flex flex-col gap-2">
                  {([
                    { id: "1x", label: "Paiement comptant", detail: `${grandTotal.toFixed(2)}€ aujourd'hui`, color: "border-blue-500 bg-blue-50 text-blue-800" },
                    { id: "3x", label: "Paiement en 3 fois", detail: `3 × ${(grandTotal / 3).toFixed(2)}€ — 1 par trimestre`, color: "border-orange-400 bg-orange-50 text-orange-800" },
                    { id: "10x", label: "Paiement mensuel (10×)", detail: `10 × ${(grandTotal / 10).toFixed(2)}€ — 1 par mois`, color: "border-green-500 bg-green-50 text-green-800" },
                  ] as const).map(opt => (
                    <button key={opt.id} onClick={() => setPaymentPlan(opt.id)}
                      className={`flex items-center justify-between px-4 py-3 rounded-xl border cursor-pointer text-left transition-all ${paymentPlan === opt.id ? opt.color : "border-gray-200 bg-white text-slate-600"}`}>
                      <div>
                        <div className="font-body text-sm font-semibold">{opt.label}</div>
                        <div className="font-body text-xs opacity-70">{opt.detail}</div>
                      </div>
                      {paymentPlan === opt.id && <Check size={18} className="flex-shrink-0 ml-2" />}
                    </button>
                  ))}
                </div>

                {paymentPlan !== "1x" && (
                  <div className="mt-3 bg-blue-50 rounded-xl p-3">
                    <div className="font-body text-xs font-semibold text-blue-800 mb-1">Votre échéancier :</div>
                    <div className="flex flex-col gap-1">
                      {Array.from({ length: nbEcheances }, (_, i) => {
                        const d = new Date(); d.setMonth(d.getMonth() + i);
                        return (
                          <div key={i} className="flex justify-between font-body text-xs text-blue-700">
                            <span>{i === 0 ? "Aujourd'hui" : d.toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}</span>
                            <span className="font-semibold">{montantEcheance.toFixed(2)}€</span>
                          </div>
                        );
                      })}
                    </div>
                    <p className="font-body text-[10px] text-slate-600 mt-2">Les prochaines échéances seront prélevées automatiquement par email de paiement.</p>
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-3">
              <button onClick={() => setStep(3)} className="px-6 py-3 rounded-xl font-body text-sm text-slate-600 bg-white border border-gray-200 cursor-pointer">Retour</button>
              <button onClick={handlePay} disabled={paying}
                className={`flex-1 py-4 rounded-xl font-body text-base font-semibold border-none cursor-pointer flex items-center justify-center gap-2 ${paying ? "bg-gray-200 text-slate-600" : "bg-gold-400 text-blue-800 hover:bg-gold-300"}`}>
                {paying ? <Loader2 size={18} className="animate-spin" /> : <CreditCard size={18} />}
                {paying ? "Redirection..." : paymentPlan === "1x" ? `Payer ${grandTotal.toFixed(2)}€` : `Payer 1ère échéance ${montantEcheance.toFixed(2)}€`}
              </button>
            </div>
            <p className="font-body text-[10px] text-slate-600 text-center mt-2">Paiement sécurisé par Stripe</p>
          </Card>
        )}
      </>}
    </div>
  );
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

