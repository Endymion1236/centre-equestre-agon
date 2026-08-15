"use client";
/**
 * src/app/admin/forfaits/FormulaireCreation.tsx
 *
 * Le formulaire « Nouvelle inscription annuelle » : choix de la famille et du
 * cavalier, fréquence hebdomadaire, sélection des créneaux, licence FFE,
 * adhésion, échéancier, et le total TTC qui en découle.
 *
 * Pourquoi séparé : c'est un écran de saisie complet, avec ses onze champs et
 * son propre chiffrage, qui ne partage rien avec la liste des forfaits en
 * dessous — sauf les données déjà chargées, reçues en props.
 *
 * Attention : le composant reste MONTÉ quand le formulaire est replié
 * (`visible={false}` renvoie null après les hooks). C'est volontaire : la
 * saisie en cours doit survivre à une fermeture accidentale du panneau, comme
 * c'était le cas quand cet état vivait dans la page.
 */

import { useState, useMemo } from "react";
import { Card } from "@/components/ui";
import { Loader2, Search, X, Check } from "lucide-react";
import type { Family } from "@/types";
import { LICENCE_FFE_MOINS18, LICENCE_FFE_PLUS18, ADHESION_PRICE } from "./constantes";
import { construitCreneauxHebdo, filtreCreneauxHebdo, filtreFamilles, calculeTarifsInscription } from "./calculs";
import { creerForfaitAnnuel } from "./actions";
import type { Creneau, Forfait, RegleReductionFamille } from "./types";

interface Props {
  visible: boolean;
  onClose: () => void;
  onCreated: () => void;
  families: (Family & { firestoreId: string })[];
  forfaits: Forfait[];
  creneaux: Creneau[];
  familyDiscountRules: RegleReductionFamille[];
}

export default function FormulaireCreation({ visible, onClose, onCreated, families, forfaits, creneaux, familyDiscountRules }: Props) {
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

  // ── Weekly slots from creneaux ──
  const weeklySlots = useMemo(() => construitCreneauxHebdo(creneaux), [creneaux]);

  // ── Filtered slots for search ──
  const filteredSlots = useMemo(() => filtreCreneauxHebdo(weeklySlots, slotSearch), [weeklySlots, slotSearch]);

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
  const filteredFamilies = useMemo(() => filtreFamilles(families, familySearch), [families, familySearch]);

  const fam = families.find(f => f.firestoreId === selFamily);
  const children = fam?.children || [];

  // ── Prices ──
  const {
    slotsPrices, childRank, familyDiscountPercent, familyDiscountAmount,
    licencePrice, adhesionPrice, grandTotal,
  } = calculeTarifsInscription({
    selectedSlotsData, forfaits, selFamily, selChild, familyDiscountRules,
    licenceFFE, licenceType, adhesion,
  });

  // ── Create forfait + batch enroll ──
  const handleCreate = async () => {
    if (!selFamily || !selChild || !slotsComplete || !fam) return;
    setCreating(true);
    const child = children.find((c: any) => c.id === selChild);
    const childName = (child as any)?.firstName || "—";

    try {
      const nbSeances = await creerForfaitAnnuel({
        selFamily, selChild, childName, fam, creneaux, selectedSlotsData, slotsPrices,
        frequence, licenceFFE, licenceType, adhesion, payPlan,
        licencePrice, adhesionPrice, grandTotal, childRank, familyDiscountPercent, familyDiscountAmount,
      });

      // Reset form
      setSelFamily(""); setSelChild(""); setSelectedSlots([]);
      setFrequence("1x"); setSlotSearch(""); setFamilySearch("");
      onClose();
      onCreated();
      alert(`✅ ${childName} inscrit(e) à ${selectedSlotsData.length} créneau(x) — ${nbSeances} séances sur la saison.`);
    } catch (e: any) {
      console.error(e);
      alert("Erreur lors de la création du forfait.");
    }
    setCreating(false);
  };

  const inp = "w-full px-3 py-2.5 rounded-lg border border-blue-500/8 font-body text-sm bg-cream focus:border-blue-500 focus:outline-none";

  if (!visible) return null;

  return (
    <Card padding="md" className="mb-6 border-blue-500/15">
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-body text-base font-semibold text-blue-800">Nouvelle inscription annuelle</h3>
        <button onClick={onClose} className="text-gray-400 bg-transparent border-none cursor-pointer"><X size={18} /></button>
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
  );
}
