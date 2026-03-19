"use client";

import { useState, useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import { Card, Badge, Button } from "@/components/ui";
import { Check, ChevronRight, AlertTriangle, Calculator, CreditCard } from "lucide-react";
import {
  SCHOOL_HOLIDAYS_2025_2026,
  SEASON_2025_2026,
  ANNUAL_PREREQUISITES,
  countSessionsInPeriod,
  calculateProrata,
} from "@/lib/forfaits";

const dayNames = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];

// Available weekly slots (to be replaced with real data from Firestore later)
const availableSlots = [
  { id: "mer-10", day: 2, dayLabel: "Mercredi", time: "10h00-11h00", monitor: "Emmeline", spotsLeft: 3, level: "Débutant" },
  { id: "mer-11", day: 2, dayLabel: "Mercredi", time: "11h15-12h15", monitor: "Emmeline", spotsLeft: 5, level: "Intermédiaire" },
  { id: "mer-14", day: 2, dayLabel: "Mercredi", time: "14h00-15h00", monitor: "Emmeline", spotsLeft: 2, level: "Confirmé" },
  { id: "sam-10", day: 5, dayLabel: "Samedi", time: "10h00-11h00", monitor: "Emmeline", spotsLeft: 4, level: "Débutant" },
  { id: "sam-11", day: 5, dayLabel: "Samedi", time: "11h15-12h15", monitor: "Emmeline", spotsLeft: 6, level: "Intermédiaire" },
  { id: "sam-14", day: 5, dayLabel: "Samedi", time: "14h00-15h00", monitor: "Nicolas", spotsLeft: 3, level: "Confirmé" },
];

const forfaits = [
  { id: "loisir", label: "Forfait Loisir", coursPerWeek: 1, annualPriceTTC: 650, description: "1 cours par semaine" },
  { id: "compet", label: "Forfait Compétition", coursPerWeek: 2, annualPriceTTC: 1100, description: "2 cours par semaine + entraînement compétition" },
];

export default function InscriptionAnnuellePage() {
  const { family } = useAuth();
  const [step, setStep] = useState(1);
  const [selectedChild, setSelectedChild] = useState("");
  const [licenceOK, setLicenceOK] = useState(false);
  const [adhesionOK, setAdhesionOK] = useState(false);
  const [selectedForfait, setSelectedForfait] = useState("");
  const [selectedSlots, setSelectedSlots] = useState<string[]>([]);
  const [paymentPlan, setPaymentPlan] = useState<"1x" | "3x" | "10x">("1x");

  const children = family?.children || [];
  const child = children.find((c: any) => c.id === selectedChild);
  const forfait = forfaits.find((f) => f.id === selectedForfait);

  // Calculate prorata
  const today = new Date().toISOString().split("T")[0];
  const isProrata = today > SEASON_2025_2026.start;

  const prorata = useMemo(() => {
    if (!forfait || selectedSlots.length === 0) return null;
    const slot = availableSlots.find((s) => s.id === selectedSlots[0]);
    if (!slot) return null;
    return calculateProrata(
      today,
      SEASON_2025_2026.end,
      slot.day,
      SCHOOL_HOLIDAYS_2025_2026,
      forfait.annualPriceTTC
    );
  }, [forfait, selectedSlots, today]);

  const totalPrerequisites = ANNUAL_PREREQUISITES.licenceFFE.price + ANNUAL_PREREQUISITES.adhesion.price;
  const forfaitPrice = prorata?.priceTTC || forfait?.annualPriceTTC || 0;
  const grandTotal = totalPrerequisites + forfaitPrice;

  const steps = [
    { num: 1, label: "Cavalier" },
    { num: 2, label: "Prérequis" },
    { num: 3, label: "Créneau" },
    { num: 4, label: "Récapitulatif" },
  ];

  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-blue-800 mb-2">Inscription annuelle</h1>
      <p className="font-body text-sm text-gray-400 mb-6">Inscrivez votre enfant aux cours réguliers pour la saison {SEASON_2025_2026.label}.</p>

      {/* Step indicator */}
      <div className="flex gap-2 mb-8">
        {steps.map((s) => (
          <div key={s.num} className="flex-1">
            <div className={`h-1.5 rounded-full mb-2 ${step >= s.num ? "bg-blue-500" : "bg-gray-200"}`} />
            <span className={`font-body text-xs ${step >= s.num ? "text-blue-500 font-semibold" : "text-gray-400"}`}>
              {s.num}. {s.label}
            </span>
          </div>
        ))}
      </div>

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
                      <div className="font-body text-xs text-gray-400">
                        {c.galopLevel && c.galopLevel !== "—" ? `Galop ${c.galopLevel}` : "Débutant"}
                      </div>
                    </div>
                  </div>
                  {selectedChild === c.id && <Check size={20} className="text-blue-500" />}
                </button>
              ))}
              <button onClick={() => selectedChild && setStep(2)} disabled={!selectedChild}
                className={`mt-3 w-full py-3 rounded-xl font-body text-sm font-semibold border-none cursor-pointer
                  ${selectedChild ? "bg-blue-500 text-white hover:bg-blue-400" : "bg-gray-200 text-gray-400"}`}>
                Continuer <ChevronRight size={16} className="inline ml-1" />
              </button>
            </div>
          )}
        </Card>
      )}

      {/* ─── Step 2: Prerequisites ─── */}
      {step === 2 && (
        <Card padding="md">
          <h2 className="font-body text-base font-semibold text-blue-800 mb-2">Prérequis obligatoires</h2>
          <p className="font-body text-xs text-gray-400 mb-4">Ces éléments sont obligatoires pour pratiquer en club.</p>

          <div className="flex flex-col gap-3 mb-6">
            {/* Licence FFE */}
            <label className={`flex items-center justify-between px-5 py-4 rounded-xl border cursor-pointer transition-all ${licenceOK ? "border-green-500 bg-green-50" : "border-gray-200 bg-white"}`}>
              <div className="flex items-center gap-3">
                <input type="checkbox" checked={licenceOK} onChange={(e) => setLicenceOK(e.target.checked)} className="accent-green-500 w-5 h-5" />
                <div>
                  <div className="font-body text-sm font-semibold text-blue-800">{ANNUAL_PREREQUISITES.licenceFFE.label}</div>
                  <div className="font-body text-xs text-gray-400">{ANNUAL_PREREQUISITES.licenceFFE.description}</div>
                </div>
              </div>
              <span className="font-body text-base font-bold text-blue-500">{ANNUAL_PREREQUISITES.licenceFFE.price}€</span>
            </label>

            {/* Adhésion */}
            <label className={`flex items-center justify-between px-5 py-4 rounded-xl border cursor-pointer transition-all ${adhesionOK ? "border-green-500 bg-green-50" : "border-gray-200 bg-white"}`}>
              <div className="flex items-center gap-3">
                <input type="checkbox" checked={adhesionOK} onChange={(e) => setAdhesionOK(e.target.checked)} className="accent-green-500 w-5 h-5" />
                <div>
                  <div className="font-body text-sm font-semibold text-blue-800">{ANNUAL_PREREQUISITES.adhesion.label}</div>
                  <div className="font-body text-xs text-gray-400">{ANNUAL_PREREQUISITES.adhesion.description}</div>
                </div>
              </div>
              <span className="font-body text-base font-bold text-blue-500">{ANNUAL_PREREQUISITES.adhesion.price}€</span>
            </label>
          </div>

          <div className="flex gap-3">
            <button onClick={() => setStep(1)} className="px-6 py-3 rounded-xl font-body text-sm font-medium text-gray-500 bg-white border border-gray-200 cursor-pointer">Retour</button>
            <button onClick={() => setStep(3)} disabled={!licenceOK || !adhesionOK}
              className={`flex-1 py-3 rounded-xl font-body text-sm font-semibold border-none cursor-pointer
                ${licenceOK && adhesionOK ? "bg-blue-500 text-white hover:bg-blue-400" : "bg-gray-200 text-gray-400"}`}>
              Continuer <ChevronRight size={16} className="inline ml-1" />
            </button>
          </div>
        </Card>
      )}

      {/* ─── Step 3: Choose slot + forfait ─── */}
      {step === 3 && (
        <div className="flex flex-col gap-5">
          {/* Forfait choice */}
          <Card padding="md">
            <h2 className="font-body text-base font-semibold text-blue-800 mb-4">Choisir le forfait</h2>
            <div className="flex gap-4">
              {forfaits.map((f) => (
                <button key={f.id} onClick={() => { setSelectedForfait(f.id); setSelectedSlots([]); }}
                  className={`flex-1 p-5 rounded-xl border text-center cursor-pointer transition-all
                    ${selectedForfait === f.id ? "border-blue-500 bg-blue-50" : "border-gray-200 bg-white"}`}>
                  <div className="font-body text-lg font-bold text-blue-800">{f.label}</div>
                  <div className="font-body text-xs text-gray-400 mb-2">{f.description}</div>
                  <div className="font-body text-2xl font-bold text-blue-500">{f.annualPriceTTC}€</div>
                  <div className="font-body text-[10px] text-gray-400">/ saison complète</div>
                </button>
              ))}
            </div>
          </Card>

          {/* Slot choice */}
          {selectedForfait && (
            <Card padding="md">
              <h2 className="font-body text-base font-semibold text-blue-800 mb-2">
                Choisir {forfait?.coursPerWeek === 1 ? "votre créneau" : "vos 2 créneaux"} hebdomadaire{forfait?.coursPerWeek === 2 ? "s" : ""}
              </h2>
              <p className="font-body text-xs text-gray-400 mb-4">Période scolaire uniquement (hors vacances).</p>
              <div className="flex flex-col gap-2">
                {availableSlots.map((slot) => {
                  const selected = selectedSlots.includes(slot.id);
                  const maxSlots = forfait?.coursPerWeek || 1;
                  const canSelect = selected || selectedSlots.length < maxSlots;
                  return (
                    <button key={slot.id}
                      onClick={() => {
                        if (selected) setSelectedSlots(selectedSlots.filter((s) => s !== slot.id));
                        else if (canSelect) setSelectedSlots([...selectedSlots, slot.id]);
                      }}
                      disabled={!canSelect && !selected}
                      className={`flex items-center justify-between px-5 py-3 rounded-xl border text-left cursor-pointer transition-all
                        ${selected ? "border-blue-500 bg-blue-50" : canSelect ? "border-gray-200 bg-white hover:border-blue-200" : "border-gray-100 bg-gray-50 opacity-50"}`}>
                      <div className="flex items-center gap-4">
                        <div className="w-12 text-center">
                          <div className="font-body text-sm font-bold text-blue-800">{slot.dayLabel.slice(0, 3)}</div>
                        </div>
                        <div>
                          <div className="font-body text-sm font-semibold text-blue-800">{slot.dayLabel} {slot.time}</div>
                          <div className="font-body text-xs text-gray-400">{slot.monitor} · {slot.level}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge color={slot.spotsLeft > 2 ? "green" : slot.spotsLeft > 0 ? "orange" : "red"}>
                          {slot.spotsLeft} place{slot.spotsLeft > 1 ? "s" : ""}
                        </Badge>
                        {selected && <Check size={18} className="text-blue-500" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            </Card>
          )}

          <div className="flex gap-3">
            <button onClick={() => setStep(2)} className="px-6 py-3 rounded-xl font-body text-sm font-medium text-gray-500 bg-white border border-gray-200 cursor-pointer">Retour</button>
            <button onClick={() => setStep(4)} disabled={selectedSlots.length !== (forfait?.coursPerWeek || 1)}
              className={`flex-1 py-3 rounded-xl font-body text-sm font-semibold border-none cursor-pointer
                ${selectedSlots.length === (forfait?.coursPerWeek || 1) ? "bg-blue-500 text-white hover:bg-blue-400" : "bg-gray-200 text-gray-400"}`}>
              Continuer <ChevronRight size={16} className="inline ml-1" />
            </button>
          </div>
        </div>
      )}

      {/* ─── Step 4: Summary ─── */}
      {step === 4 && (
        <div className="flex flex-col gap-5">
          <Card padding="md">
            <h2 className="font-body text-base font-semibold text-blue-800 mb-4">Récapitulatif de l&apos;inscription</h2>

            <div className="flex flex-col gap-3 mb-5">
              {/* Child */}
              <div className="flex justify-between py-2 border-b border-blue-500/8">
                <span className="font-body text-sm text-gray-500">Cavalier</span>
                <span className="font-body text-sm font-semibold text-blue-800">🧒 {(child as any)?.firstName}</span>
              </div>

              {/* Licence */}
              <div className="flex justify-between py-2 border-b border-blue-500/8">
                <span className="font-body text-sm text-gray-500">{ANNUAL_PREREQUISITES.licenceFFE.label}</span>
                <span className="font-body text-sm font-semibold text-blue-500">{ANNUAL_PREREQUISITES.licenceFFE.price}€</span>
              </div>

              {/* Adhésion */}
              <div className="flex justify-between py-2 border-b border-blue-500/8">
                <span className="font-body text-sm text-gray-500">{ANNUAL_PREREQUISITES.adhesion.label}</span>
                <span className="font-body text-sm font-semibold text-blue-500">{ANNUAL_PREREQUISITES.adhesion.price}€</span>
              </div>

              {/* Forfait */}
              <div className="flex justify-between py-2 border-b border-blue-500/8">
                <div>
                  <span className="font-body text-sm text-gray-500">{forfait?.label}</span>
                  <div className="font-body text-xs text-gray-400">
                    {selectedSlots.map((s) => availableSlots.find((a) => a.id === s)?.dayLabel + " " + availableSlots.find((a) => a.id === s)?.time).join(" + ")}
                  </div>
                </div>
                <span className="font-body text-sm font-semibold text-blue-500">{forfaitPrice.toFixed(2)}€</span>
              </div>

              {/* Prorata info */}
              {isProrata && prorata && (
                <div className="bg-gold-50 rounded-lg p-3 border border-gold-400/15">
                  <div className="flex items-center gap-2 mb-1">
                    <Calculator size={14} className="text-gold-500" />
                    <span className="font-body text-xs font-semibold text-blue-800">Calcul au prorata</span>
                  </div>
                  <div className="font-body text-xs text-gray-500">
                    Arrivée en cours de saison : {prorata.sessions} séances restantes sur {prorata.totalSessions} totales
                    ({prorata.perSessionTTC}€/séance × {prorata.sessions} = {prorata.priceTTC}€ au lieu de {forfait?.annualPriceTTC}€)
                  </div>
                </div>
              )}

              {/* Total */}
              <div className="flex justify-between py-3 border-t-2 border-blue-500/8">
                <span className="font-body text-base font-bold text-blue-800">Total TTC</span>
                <span className="font-body text-2xl font-bold text-blue-500">{grandTotal.toFixed(2)}€</span>
              </div>
            </div>

            {/* Payment plan */}
            <div className="mb-5">
              <div className="font-body text-sm font-semibold text-blue-800 mb-3">Mode de paiement</div>
              <div className="flex gap-3">
                {([["1x", `${grandTotal.toFixed(0)}€ en 1 fois`], ["3x", `3 × ${(grandTotal / 3).toFixed(0)}€`], ["10x", `10 × ${(grandTotal / 10).toFixed(0)}€`]] as const).map(([id, label]) => (
                  <button key={id} onClick={() => setPaymentPlan(id)}
                    className={`flex-1 py-3 rounded-xl border font-body text-sm font-medium cursor-pointer transition-all text-center
                      ${paymentPlan === id ? "border-blue-500 bg-blue-50 text-blue-500 font-semibold" : "border-gray-200 bg-white text-gray-500"}`}>
                    {label}
                  </button>
                ))}
              </div>
              {paymentPlan !== "1x" && (
                <p className="font-body text-xs text-gray-400 mt-2">
                  Prélèvement SEPA ou CB automatique chaque mois. Sans frais.
                </p>
              )}
            </div>

            <div className="flex gap-3">
              <button onClick={() => setStep(3)} className="px-6 py-3 rounded-xl font-body text-sm font-medium text-gray-500 bg-white border border-gray-200 cursor-pointer">Retour</button>
              <button className="flex-1 py-4 rounded-xl font-body text-base font-semibold text-blue-800 bg-gold-400 border-none cursor-pointer hover:bg-gold-300 flex items-center justify-center gap-2">
                <CreditCard size={18} /> Payer {grandTotal.toFixed(2)}€ {paymentPlan !== "1x" ? `en ${paymentPlan}` : ""}
              </button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
