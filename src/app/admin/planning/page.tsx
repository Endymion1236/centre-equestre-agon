"use client";
import { useState, useEffect, useMemo } from "react";
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, where, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Card, Badge } from "@/components/ui";
import { Plus, ChevronLeft, ChevronRight, X, Check, Loader2, Trash2, Users, UserPlus, Search, CreditCard, Calendar, CalendarDays, Briefcase, Bell, Mail,
} from "lucide-react";
import type { Activity, Family } from "@/types";

interface Creneau { id?: string; activityId: string; activityTitle: string; activityType: string; date: string; startTime: string; endTime: string; monitor: string; maxPlaces: number; enrolledCount: number; enrolled: any[]; status: string; priceHT?: number; priceTTC?: number; tvaTaux?: number; }
interface EnrolledChild { childId: string; childName: string; familyId: string; familyName: string; enrolledAt: string; }
interface Period { startDate: string; endDate: string; }
interface SlotDef { activityId: string; day: number; startTime: string; endTime: string; monitor: string; maxPlaces: number; }

function getWeekDates(offset: number): Date[] { const t = new Date(); const m = new Date(t); m.setDate(t.getDate() - ((t.getDay() + 6) % 7) + offset * 7); return Array.from({ length: 7 }, (_, i) => { const d = new Date(m); d.setDate(m.getDate() + i); return d; }); }
function fmtDate(d: Date) { return d.toISOString().split("T")[0]; }
function fmtDateFR(d: Date) { return d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric" }); }
function fmtMonthFR(d: Date) { return d.toLocaleDateString("fr-FR", { month: "long", year: "numeric" }); }
const dayNames = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const dayNamesFull = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
const typeColors: Record<string, string> = { stage: "#27ae60", stage_journee: "#16a085", balade: "#e67e22", cours: "#2050A0", competition: "#7c3aed", anniversaire: "#D63031", ponyride: "#16a085" };
const payModes = [{ id: "cb_terminal", label: "CB", icon: "💳" }, { id: "cheque", label: "Chèque", icon: "📝" }, { id: "especes", label: "Espèces", icon: "💶" }, { id: "cheque_vacances", label: "Chq.Vac.", icon: "🏖️" }, { id: "pass_sport", label: "Pass'Sport", icon: "🎽" }, { id: "ancv", label: "ANCV", icon: "🎫" }, { id: "carte", label: "Carte", icon: "🎟️" }];

// ─── Enroll Panel ───
function EnrollPanel({ creneau, families, onClose, onEnroll, onUnenroll }: {
  creneau: Creneau & { id: string }; families: (Family & { firestoreId: string })[]; onClose: () => void;
  onEnroll: (id: string, c: EnrolledChild, payMode?: string) => Promise<void>;
  onUnenroll: (id: string, childId: string) => Promise<void>;
}) {
  const [search, setSearch] = useState(""); const [selFam, setSelFam] = useState(""); const [selChild, setSelChild] = useState("");
  const [enrolling, setEnrolling] = useState(false); const [justEnrolled, setJustEnrolled] = useState("");
  const [showPay, setShowPay] = useState(false); const [payMode, setPayMode] = useState("cb_terminal"); const [unenrolling, setUnenrolling] = useState("");
  const [inscriptionMode, setInscriptionMode] = useState<"ponctuel" | "annuel">("ponctuel");
  const [licenceType, setLicenceType] = useState<"moins18" | "plus18">("moins18");
  const [adhesion, setAdhesion] = useState(true);
  const [licence, setLicence] = useState(true);
  const [payPlan, setPayPlan] = useState<"1x" | "3x" | "10x">("1x");

  const enrolled = creneau.enrolled || []; const enrolledIds = enrolled.map((e: any) => e.childId);
  const spots = creneau.maxPlaces - enrolled.length; const color = typeColors[creneau.activityType] || "#666";
  const priceTTC = (creneau as any).priceTTC || (creneau.priceHT || 0) * (1 + (creneau.tvaTaux || 5.5) / 100);
  const filteredFamilies = useMemo(() => { if (!search) return families; const q = search.toLowerCase(); return families.filter(f => f.parentName?.toLowerCase().includes(q) || f.parentEmail?.toLowerCase().includes(q) || (f.children || []).some((c: any) => c.firstName?.toLowerCase().includes(q))); }, [families, search]);
  const fam = families.find(f => f.firestoreId === selFam); const children = fam?.children || [];
  const available = children.filter((c: any) => !enrolledIds.includes(c.id));

  // Calcul forfait annuel avec prorata
  const prixAdhesion = 60;
  const prixLicence = licenceType === "moins18" ? 25 : 36;
  const prixForfaitAnnuel = 650; // Prix plein tarif (35 séances)
  const totalSessionsSaison = 35;
  const dateFinSaison = "2026-06-30"; // TODO: configurable dans paramètres

  // Calculer les séances restantes entre aujourd'hui et le 30 juin
  // pour le jour de la semaine du créneau
  const sessionsRestantes = useMemo(() => {
    const today = new Date();
    const fin = new Date(dateFinSaison);
    const creneauDate = new Date(creneau.date);
    const jourSemaine = creneauDate.getDay(); // 0=dim, 1=lun, ... 6=sam
    let count = 0;
    const cursor = new Date(today);
    // Aller au prochain jour correspondant
    while (cursor.getDay() !== jourSemaine) cursor.setDate(cursor.getDate() + 1);
    // Compter les occurrences jusqu'à fin de saison
    while (cursor <= fin) {
      count++;
      cursor.setDate(cursor.getDate() + 7);
    }
    return count;
  }, [creneau.date]);

  const prorata = sessionsRestantes / totalSessionsSaison;
  const prixForfait = Math.round(prixForfaitAnnuel * prorata);
  const totalAnnuel = (adhesion ? prixAdhesion : 0) + (licence ? prixLicence : 0) + prixForfait;

  const handleEnroll = async () => {
    if (!selChild || !fam) return;
    setEnrolling(true);
    const child = children.find((c: any) => c.id === selChild);
    const childName = (child as any)?.firstName || "—";

    if (inscriptionMode === "annuel") {
      // Inscription annuelle : créer le forfait + inscrire dans le créneau
      try {
        const slotKey = `${creneau.activityTitle} — ${new Date(creneau.date).toLocaleDateString("fr-FR", { weekday: "long" })} ${creneau.startTime}`;
        await addDoc(collection(db, "forfaits"), {
          familyId: fam.firestoreId,
          familyName: fam.parentName || "",
          childId: selChild,
          childName,
          slotKey,
          activityTitle: creneau.activityTitle,
          dayLabel: new Date(creneau.date).toLocaleDateString("fr-FR", { weekday: "long" }),
          startTime: creneau.startTime,
          endTime: creneau.endTime,
          totalSessions: sessionsRestantes,
          totalSessionsSaison,
          attendedSessions: 0,
          licenceFFE: licence,
          licenceType,
          adhesion,
          prixForfaitAnnuel,
          prorata: Math.round(prorata * 100),
          forfaitPriceTTC: totalAnnuel,
          totalPaidTTC: 0,
          paymentPlan: payPlan,
          status: "active",
          createdAt: serverTimestamp(),
        });
        // Créer le paiement en attente pour le forfait
        const items = [];
        if (adhesion) items.push({ activityTitle: "Adhésion annuelle", priceHT: prixAdhesion / 1.055, tva: 5.5, priceTTC: prixAdhesion });
        if (licence) items.push({ activityTitle: `Licence FFE ${licenceType === "moins18" ? "-18ans" : "+18ans"}`, priceHT: prixLicence, tva: 0, priceTTC: prixLicence });
        items.push({ activityTitle: `Forfait ${creneau.activityTitle} (${slotKey})`, priceHT: prixForfait / 1.055, tva: 5.5, priceTTC: prixForfait });
        await addDoc(collection(db, "payments"), {
          familyId: fam.firestoreId,
          familyName: fam.parentName || "",
          items,
          totalTTC: totalAnnuel,
          paymentMode: "",
          paymentRef: "",
          status: "pending",
          paidAmount: 0,
          date: serverTimestamp(),
        });
      } catch (e) { console.error(e); }
    }

    // Dans les 2 cas : inscrire dans le créneau
    await onEnroll(creneau.id!, { childId: selChild, childName, familyId: fam.firestoreId, familyName: fam.parentName || "—", enrolledAt: new Date().toISOString() }, inscriptionMode === "ponctuel" && showPay ? payMode : undefined);
    setJustEnrolled(childName + (inscriptionMode === "annuel" ? " (forfait annuel)" : ""));
    setSelChild(""); setSelFam(""); setSearch(""); setEnrolling(false); setShowPay(false);
    setTimeout(() => setJustEnrolled(""), 4000);
  };

  const handleUnenroll = async (childId: string) => { setUnenrolling(childId); await onUnenroll(creneau.id!, childId); setUnenrolling(""); };

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
        <div className="p-5 border-b border-blue-500/8" style={{ borderLeftWidth: 4, borderLeftColor: color }}>
          <div className="flex justify-between items-start"><div><div className="font-body text-sm font-semibold" style={{ color }}>{creneau.startTime}–{creneau.endTime}</div><h2 className="font-display text-lg font-bold text-blue-800">{creneau.activityTitle}</h2><div className="font-body text-xs text-gray-400 mt-1">{new Date(creneau.date).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })} · {creneau.monitor}{priceTTC > 0 ? ` · ${priceTTC.toFixed(2)}€/séance` : ""}</div></div><button onClick={onClose} className="text-gray-400 hover:text-gray-600 bg-transparent border-none cursor-pointer"><X size={20} /></button></div>
          <div className="flex items-center gap-3 mt-3"><Badge color={spots > 2 ? "green" : spots > 0 ? "orange" : "red"}>{spots > 0 ? `${spots} place${spots > 1 ? "s" : ""}` : "COMPLET"}</Badge><span className="font-body text-xs text-gray-400">{enrolled.length}/{creneau.maxPlaces}</span></div>
        </div>
        <div className="p-5">
          {justEnrolled && <div className="mb-3 p-3 bg-green-50 border border-green-200 rounded-lg font-body text-sm text-green-700"><Check size={16} className="inline mr-1" /> {justEnrolled} inscrit(e) !</div>}
          <h3 className="font-body text-sm font-semibold text-blue-800 mb-3"><Users size={16} className="inline mr-1" />Inscrits ({enrolled.length})</h3>
          {enrolled.length === 0 ? <p className="font-body text-sm text-gray-400 italic mb-4">Aucun</p> :
          <div className="flex flex-col gap-2 mb-4">{enrolled.map((e: any) => (<div key={e.childId} className="flex items-center justify-between bg-sand rounded-lg px-4 py-2.5"><div className="flex items-center gap-3"><div className="w-7 h-7 rounded-lg bg-blue-100 flex items-center justify-center"><Users size={12} className="text-blue-500" /></div><div><div className="font-body text-sm font-semibold text-blue-800">{e.childName}</div><div className="font-body text-xs text-gray-400">{e.familyName}</div></div></div><button onClick={() => handleUnenroll(e.childId)} disabled={unenrolling===e.childId} className="flex items-center gap-1 font-body text-xs text-red-400 hover:text-red-600 bg-transparent border-none cursor-pointer px-2 py-1 rounded hover:bg-red-50">{unenrolling===e.childId ? <Loader2 size={12} className="animate-spin"/> : <Trash2 size={12}/>} Désinscrire</button></div>))}</div>}

          {spots > 0 && (<div className="border-t border-blue-500/8 pt-4"><h3 className="font-body text-sm font-semibold text-blue-800 mb-3"><UserPlus size={16} className="inline mr-1"/>Inscrire</h3><div className="flex flex-col gap-3">
            {/* Recherche famille */}
            <div className="relative"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300"/><input value={search} onChange={e=>{setSearch(e.target.value);setSelFam("");setSelChild("");}} placeholder="Nom parent, prénom enfant, email..." className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-blue-500/8 font-body text-sm bg-cream focus:border-blue-500 focus:outline-none"/></div>
            <select value={selFam} onChange={e=>{setSelFam(e.target.value);setSelChild("");}} className="w-full px-3 py-2.5 rounded-lg border border-blue-500/8 font-body text-sm bg-cream"><option value="">Famille ({filteredFamilies.length})</option>{filteredFamilies.map(f=>{const n=(f.children||[]).map((c:any)=>c.firstName).join(", ");return<option key={f.firestoreId} value={f.firestoreId}>{f.parentName} {n?`(${n})`:""}</option>})}</select>
            {fam&&available.length>0&&<div className="flex flex-wrap gap-2">{available.map((c:any)=><button key={c.id} onClick={()=>setSelChild(c.id)} className={`flex items-center gap-2 px-4 py-2 rounded-lg border font-body text-sm cursor-pointer ${selChild===c.id?"bg-blue-500 text-white border-blue-500":"bg-white text-gray-500 border-gray-200"}`}><Users size={12}/> {c.firstName}</button>)}</div>}

            {/* Choix du mode d'inscription */}
            {selChild && (
              <div className="bg-sand rounded-xl p-4 space-y-3">
                <div className="font-body text-xs font-semibold text-gray-500 uppercase tracking-wider">Type d'inscription</div>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => setInscriptionMode("ponctuel")}
                    className={`p-3 rounded-lg border-2 text-left cursor-pointer transition-all ${inscriptionMode === "ponctuel" ? "border-blue-500 bg-blue-50" : "border-gray-200 bg-white"}`}>
                    <div className="font-body text-sm font-semibold text-blue-800">Séance ponctuelle</div>
                    <div className="font-body text-xs text-gray-400 mt-0.5">Paiement à l'unité ou débit carte</div>
                    {priceTTC > 0 && <div className="font-body text-lg font-bold text-blue-500 mt-1">{priceTTC.toFixed(2)}€</div>}
                  </button>
                  <button onClick={() => setInscriptionMode("annuel")}
                    className={`p-3 rounded-lg border-2 text-left cursor-pointer transition-all ${inscriptionMode === "annuel" ? "border-green-500 bg-green-50" : "border-gray-200 bg-white"}`}>
                    <div className="font-body text-sm font-semibold text-green-700">Forfait à l'année</div>
                    <div className="font-body text-xs text-gray-400 mt-0.5">{sessionsRestantes} séances restantes sur {totalSessionsSaison}</div>
                    <div className="font-body text-lg font-bold text-green-600 mt-1">{totalAnnuel.toFixed(2)}€</div>
                    {prorata < 1 && <div className="font-body text-[10px] text-orange-500 mt-0.5">Prorata : {Math.round(prorata * 100)}% du tarif annuel</div>}
                  </button>
                </div>

                {/* Mode ponctuel */}
                {inscriptionMode === "ponctuel" && priceTTC > 0 && (
                  <div className="bg-white rounded-lg p-3">
                    <label className="flex items-center gap-2 cursor-pointer mb-2">
                      <input type="checkbox" checked={showPay} onChange={e => setShowPay(e.target.checked)} className="accent-blue-500 w-4 h-4"/>
                      <span className="font-body text-sm text-blue-800 font-semibold">Encaisser maintenant ({priceTTC.toFixed(2)}€)</span>
                    </label>
                    {showPay && <div className="flex flex-wrap gap-1.5 mt-2">{payModes.map(m=><button key={m.id} onClick={()=>setPayMode(m.id)} className={`px-3 py-1.5 rounded-lg border font-body text-[11px] font-medium cursor-pointer ${payMode===m.id?"bg-blue-500 text-white border-blue-500":"bg-white text-gray-500 border-gray-200"}`}>{m.icon} {m.label}</button>)}</div>}
                  </div>
                )}

                {/* Mode annuel */}
                {inscriptionMode === "annuel" && (
                  <div className="bg-white rounded-lg p-3 space-y-3">
                    <div className="font-body text-xs font-semibold text-green-600 uppercase tracking-wider">Détail du forfait</div>
                    {/* Adhésion */}
                    <label className="flex items-center justify-between cursor-pointer">
                      <div className="flex items-center gap-2">
                        <input type="checkbox" checked={adhesion} onChange={e => setAdhesion(e.target.checked)} className="accent-green-500 w-4 h-4"/>
                        <span className="font-body text-sm text-blue-800">Adhésion annuelle</span>
                      </div>
                      <span className="font-body text-sm font-semibold text-blue-500">{prixAdhesion}€</span>
                    </label>
                    {/* Licence FFE */}
                    <div>
                      <label className="flex items-center justify-between cursor-pointer">
                        <div className="flex items-center gap-2">
                          <input type="checkbox" checked={licence} onChange={e => setLicence(e.target.checked)} className="accent-green-500 w-4 h-4"/>
                          <span className="font-body text-sm text-blue-800">Licence FFE</span>
                        </div>
                        <span className="font-body text-sm font-semibold text-blue-500">{prixLicence}€</span>
                      </label>
                      {licence && (
                        <div className="flex gap-2 mt-1.5 ml-6">
                          <button onClick={() => setLicenceType("moins18")} className={`px-3 py-1 rounded-lg font-body text-xs cursor-pointer border ${licenceType === "moins18" ? "bg-green-500 text-white border-green-500" : "bg-white text-gray-500 border-gray-200"}`}>-18 ans (25€)</button>
                          <button onClick={() => setLicenceType("plus18")} className={`px-3 py-1 rounded-lg font-body text-xs cursor-pointer border ${licenceType === "plus18" ? "bg-green-500 text-white border-green-500" : "bg-white text-gray-500 border-gray-200"}`}>+18 ans (36€)</button>
                        </div>
                      )}
                    </div>
                    {/* Forfait */}
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="font-body text-sm text-blue-800">Forfait {creneau.activityTitle}</span>
                        <span className="font-body text-sm font-semibold text-blue-500">{prixForfait}€</span>
                      </div>
                      <div className="font-body text-[10px] text-gray-400 mt-0.5">
                        {sessionsRestantes} séances restantes jusqu'au 30 juin
                        {prorata < 1 && <> · {prixForfaitAnnuel}€ × {sessionsRestantes}/{totalSessionsSaison} = {prixForfait}€</>}
                        {prorata >= 1 && <> · Tarif plein (début de saison)</>}
                      </div>
                    </div>
                    {/* Total */}
                    <div className="flex items-center justify-between pt-2 border-t border-gray-200">
                      <span className="font-body text-sm font-bold text-blue-800">Total</span>
                      <span className="font-body text-lg font-bold text-green-600">{totalAnnuel.toFixed(2)}€</span>
                    </div>
                    {/* Plan de paiement */}
                    <div>
                      <div className="font-body text-[10px] text-gray-400 mb-1">Plan de paiement</div>
                      <div className="flex gap-2">
                        {(["1x", "3x", "10x"] as const).map(p => (
                          <button key={p} onClick={() => setPayPlan(p)} className={`flex-1 py-2 rounded-lg font-body text-xs font-semibold cursor-pointer border ${payPlan === p ? "bg-green-500 text-white border-green-500" : "bg-white text-gray-500 border-gray-200"}`}>
                            {p === "1x" ? `1× ${totalAnnuel.toFixed(0)}€` : p === "3x" ? `3× ${(totalAnnuel / 3).toFixed(0)}€` : `10× ${(totalAnnuel / 10).toFixed(0)}€`}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            <button onClick={handleEnroll} disabled={!selChild||enrolling} className={`w-full py-3 rounded-xl font-body text-sm font-semibold border-none cursor-pointer ${!selChild||enrolling?"bg-gray-200 text-gray-400":inscriptionMode==="annuel"?"bg-green-600 text-white hover:bg-green-500":"bg-blue-500 text-white hover:bg-blue-400"}`}>
              {enrolling ? "..." : inscriptionMode === "annuel" ? `Inscrire à l'année (${totalAnnuel.toFixed(2)}€)` : showPay ? `Inscrire + Encaisser` : "Inscrire (ponctuel)"}
            </button>
          </div></div>)}
        </div>
      </div>
    </div>
  );
}

// ─── Period-based Créneau Generator (like Celeris) ───
function PeriodGenerator({ activities, onGenerate, onCancel }: { activities: Activity[]; onGenerate: (creneaux: Partial<Creneau>[]) => Promise<void>; onCancel: () => void; }) {
  const [periods, setPeriods] = useState<Period[]>([
    { startDate: "2025-09-24", endDate: "2025-10-18" },
    { startDate: "2025-11-03", endDate: "2025-12-20" },
    { startDate: "2026-01-06", endDate: "2026-02-14" },
    { startDate: "2026-03-03", endDate: "2026-04-11" },
    { startDate: "2026-04-28", endDate: "2026-06-28" },
  ]);
  const [slots, setSlots] = useState<SlotDef[]>([{ activityId: "", day: 2, startTime: "10:00", endTime: "11:00", monitor: "Emmeline", maxPlaces: 8 }]);
  const [saving, setSaving] = useState(false);

  const addPeriod = () => setPeriods([...periods, { startDate: "", endDate: "" }]);
  const removePeriod = (i: number) => setPeriods(periods.filter((_, j) => j !== i));
  const updatePeriod = (i: number, field: string, val: string) => setPeriods(periods.map((p, j) => j === i ? { ...p, [field]: val } : p));
  const addSlot = () => setSlots([...slots, { activityId: "", day: 2, startTime: "10:00", endTime: "11:00", monitor: "Emmeline", maxPlaces: 8 }]);
  const removeSlot = (i: number) => setSlots(slots.filter((_, j) => j !== i));
  const updateSlot = (i: number, field: string, val: any) => setSlots(slots.map((s, j) => j === i ? { ...s, [field]: val } : s));

  // Generate all dates
  const allCreneaux = useMemo(() => {
    const result: Partial<Creneau>[] = [];
    for (const slot of slots) {
      if (!slot.activityId) continue;
      const act = activities.find(a => a.id === slot.activityId);
      if (!act) continue;
      const actPriceTTC = (act as any).priceTTC || (act.priceHT || 0) * (1 + (act.tvaTaux || 5.5) / 100);
      for (const period of periods) {
        if (!period.startDate || !period.endDate) continue;
        const cur = new Date(period.startDate);
        const end = new Date(period.endDate);
        while (cur <= end) {
          const dow = (cur.getDay() + 6) % 7;
          if (dow === slot.day) {
            result.push({
              activityId: slot.activityId, activityTitle: act.title, activityType: act.type,
              date: fmtDate(cur), startTime: slot.startTime, endTime: slot.endTime,
              monitor: slot.monitor, maxPlaces: slot.maxPlaces, enrolledCount: 0, enrolled: [],
              status: "planned", priceHT: actPriceTTC / (1 + (act.tvaTaux || 5.5) / 100),
              priceTTC: actPriceTTC, tvaTaux: act.tvaTaux || 5.5,
            });
          }
          cur.setDate(cur.getDate() + 1);
        }
      }
    }
    return result;
  }, [slots, periods, activities]);

  const handleGenerate = async () => { setSaving(true); await onGenerate(allCreneaux); setSaving(false); };
  const inp = "px-3 py-2 rounded-lg border border-blue-500/8 font-body text-sm bg-cream focus:border-blue-500 focus:outline-none";

  return (
    <Card padding="md" className="mb-6 border-gold-400/20 bg-gold-50/30">
      <div className="flex justify-between items-center mb-4"><h3 className="font-body text-base font-semibold text-blue-800 flex items-center gap-2"><Calendar size={18}/>Générateur de séances (périodes)</h3><button onClick={onCancel} className="text-gray-400 bg-transparent border-none cursor-pointer"><X size={20}/></button></div>
      <p className="font-body text-xs text-gray-500 mb-4">Comme dans Celeris : définissez les périodes de cours et les plages horaires, tout sera généré automatiquement.</p>
      
      {/* Periods */}
      <div className="mb-5">
        <div className="font-body text-sm font-semibold text-blue-800 mb-2">📅 Périodes de cours</div>
        <div className="flex flex-col gap-2">
          {periods.map((p, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="font-body text-xs text-gray-400 w-6">{i+1}.</span>
              <input type="date" value={p.startDate} onChange={e => updatePeriod(i, "startDate", e.target.value)} className={`${inp} flex-1`}/>
              <span className="font-body text-xs text-gray-400">→</span>
              <input type="date" value={p.endDate} onChange={e => updatePeriod(i, "endDate", e.target.value)} className={`${inp} flex-1`}/>
              <button onClick={() => removePeriod(i)} className="text-red-400 hover:text-red-600 bg-transparent border-none cursor-pointer"><Trash2 size={14}/></button>
            </div>
          ))}
          <button onClick={addPeriod} className="font-body text-xs text-blue-500 bg-transparent border-none cursor-pointer mt-1">+ Ajouter une période</button>
        </div>
      </div>
      
      {/* Slots (activities + day + time) */}
      <div className="mb-5">
        <div className="font-body text-sm font-semibold text-blue-800 mb-2">🕐 Plages de cours</div>
        <div className="flex flex-col gap-3">
          {slots.map((s, i) => (
            <div key={i} className="bg-white rounded-lg p-3 border border-blue-500/8">
              <div className="flex items-center gap-2 mb-2">
                <span className="font-body text-xs font-bold text-gold-500">Cours {i+1}</span>
                {slots.length > 1 && <button onClick={() => removeSlot(i)} className="ml-auto text-red-400 hover:text-red-600 bg-transparent border-none cursor-pointer"><Trash2 size={12}/></button>}
              </div>
              <div className="flex flex-wrap gap-2">
                <select value={s.activityId} onChange={e => updateSlot(i, "activityId", e.target.value)} className={`${inp} flex-1 min-w-[160px]`}>
                  <option value="">Activité...</option>
                  {activities.filter(a => a.active !== false).map((a, idx) => <option key={`${a.id}-${idx}`} value={a.id}>{a.title}</option>)}
                </select>
                <select value={s.day} onChange={e => updateSlot(i, "day", parseInt(e.target.value))} className={`${inp} w-28`}>
                  {dayNamesFull.map((d, j) => <option key={j} value={j}>{d}</option>)}
                </select>
                <input type="time" value={s.startTime} onChange={e => updateSlot(i, "startTime", e.target.value)} className={`${inp} w-24`}/>
                <input type="time" value={s.endTime} onChange={e => updateSlot(i, "endTime", e.target.value)} className={`${inp} w-24`}/>
                <select value={s.monitor} onChange={e => updateSlot(i, "monitor", e.target.value)} className={`${inp} w-28`}>
                  <option>Emmeline</option><option>Nicolas</option>
                </select>
                <input type="number" value={s.maxPlaces} onChange={e => updateSlot(i, "maxPlaces", parseInt(e.target.value))} className={`${inp} w-16`} title="Places"/>
              </div>
            </div>
          ))}
          <button onClick={addSlot} className="font-body text-xs text-blue-500 bg-transparent border-none cursor-pointer">+ Ajouter un cours</button>
        </div>
      </div>
      
      {/* Preview */}
      {allCreneaux.length > 0 && (
        <div className="bg-blue-50 rounded-lg p-3 mb-4">
          <div className="font-body text-sm font-semibold text-blue-800 mb-1">✨ {allCreneaux.length} séances à générer</div>
          <div className="font-body text-xs text-gray-500">
            {slots.filter(s => s.activityId).map((s, i) => {
              const act = activities.find(a => a.id === s.activityId);
              const count = allCreneaux.filter(c => c.activityId === s.activityId && c.startTime === s.startTime).length;
              return <div key={i}>{act?.title} — {dayNamesFull[s.day]} {s.startTime}–{s.endTime} — <strong>{count} séances</strong></div>;
            })}
          </div>
        </div>
      )}
      
      <button onClick={handleGenerate} disabled={allCreneaux.length === 0 || saving}
        className={`w-full py-3 rounded-xl font-body text-sm font-semibold border-none cursor-pointer ${allCreneaux.length === 0 || saving ? "bg-gray-200 text-gray-400" : "bg-blue-500 text-white hover:bg-blue-400"}`}>
        {saving ? <><Loader2 size={16} className="inline animate-spin mr-2"/>Génération...</> : `Générer ${allCreneaux.length} séances`}
      </button>
    </Card>
  );
}

// ─── Simple single créneau form ───
function SimpleCreneauForm({ activities, onSave, onCancel, defaultDate }: { activities: Activity[]; onSave: (c: Partial<Creneau>[]) => Promise<void>; onCancel: () => void; defaultDate?: string; }) {
  const [actId, setActId] = useState(""); const [st, setSt] = useState("10:00"); const [et, setEt] = useState("12:00"); const [mon, setMon] = useState("Emmeline"); const [mp, setMp] = useState(8);
  const [date, setDate] = useState(defaultDate || fmtDate(new Date())); const [saving, setSaving] = useState(false);
  const [multiDay, setMultiDay] = useState(false);
  const [nbDays, setNbDays] = useState(5);
  const [skipWeekend, setSkipWeekend] = useState(true);
  const act = activities.find(a => a.id === actId);
  useEffect(() => { if (act) setMp(act.maxPlaces || 8); }, [actId]);

  const generateDates = (): string[] => {
    if (!multiDay) return [date];
    const dates: string[] = [];
    const start = new Date(date);
    let current = new Date(start);
    while (dates.length < nbDays) {
      const day = current.getDay();
      if (!skipWeekend || (day !== 0 && day !== 6)) {
        dates.push(fmtDate(current));
      }
      current.setDate(current.getDate() + 1);
    }
    return dates;
  };

  const sub = async () => {
    if (!actId || !act) return;
    setSaving(true);
    const ttc = (act as any).priceTTC || (act.priceHT || 0) * (1 + (act.tvaTaux || 5.5) / 100);
    const dates = generateDates();
    const creneaux = dates.map(d => ({
      activityId: actId, activityTitle: act.title, activityType: act.type, date: d,
      startTime: st, endTime: et, monitor: mon, maxPlaces: mp, enrolledCount: 0, enrolled: [],
      status: "planned", priceHT: ttc / (1 + (act.tvaTaux || 5.5) / 100), priceTTC: ttc, tvaTaux: act.tvaTaux || 5.5,
    }));
    await onSave(creneaux);
    setSaving(false);
  };

  const previewDates = multiDay ? generateDates() : [];
  const inp = "w-full px-3 py-2.5 rounded-lg border border-blue-500/8 font-body text-sm bg-cream focus:border-blue-500 focus:outline-none";

  return (
    <Card padding="md" className="mb-6 border-blue-500/15">
      <div className="flex justify-between items-center mb-4"><h3 className="font-body text-base font-semibold text-blue-800">Créer des créneaux</h3><button onClick={onCancel} className="text-gray-400 bg-transparent border-none cursor-pointer"><X size={20}/></button></div>
      <div className="flex flex-col gap-3">
        <select value={actId} onChange={e => setActId(e.target.value)} className={inp}><option value="">Activité...</option>{activities.filter(a => a.active !== false).map((a, i) => <option key={`${a.id}-${i}`} value={a.id}>{a.title}</option>)}</select>

        {/* Mode multi-jours */}
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={multiDay} onChange={e => setMultiDay(e.target.checked)} className="w-4 h-4 accent-blue-500" />
            <span className="font-body text-sm text-gray-600">Stage multi-jours</span>
          </label>
          {multiDay && (
            <>
              <select value={nbDays} onChange={e => setNbDays(parseInt(e.target.value))} className={`${inp} !w-auto`}>
                <option value={2}>2 jours</option>
                <option value={3}>3 jours</option>
                <option value={4}>4 jours</option>
                <option value={5}>5 jours (semaine)</option>
                <option value={10}>10 jours (2 semaines)</option>
              </select>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={skipWeekend} onChange={e => setSkipWeekend(e.target.checked)} className="w-4 h-4 accent-blue-500" />
                <span className="font-body text-xs text-gray-500">Sauter week-end</span>
              </label>
            </>
          )}
        </div>

        <div className="flex gap-2">
          <div className="flex-1">
            <label className="font-body text-[10px] text-gray-400 block mb-1">{multiDay ? "Date de début" : "Date"}</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className={inp}/>
          </div>
          <div className="w-24">
            <label className="font-body text-[10px] text-gray-400 block mb-1">Début</label>
            <input type="time" value={st} onChange={e => setSt(e.target.value)} className={inp}/>
          </div>
          <div className="w-24">
            <label className="font-body text-[10px] text-gray-400 block mb-1">Fin</label>
            <input type="time" value={et} onChange={e => setEt(e.target.value)} className={inp}/>
          </div>
        </div>
        <div className="flex gap-2"><select value={mon} onChange={e => setMon(e.target.value)} className={`${inp} flex-1`}><option>Emmeline</option><option>Nicolas</option></select><input type="number" value={mp} onChange={e => setMp(parseInt(e.target.value))} className={`${inp} w-20`} placeholder="Places"/></div>

        {/* Preview multi-jours */}
        {multiDay && previewDates.length > 0 && (
          <div className="bg-blue-50 rounded-lg p-3">
            <div className="font-body text-xs font-semibold text-blue-800 mb-1">{previewDates.length} créneaux à générer :</div>
            <div className="font-body text-xs text-gray-500">
              {previewDates.map(d => new Date(d).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })).join(" · ")}
            </div>
          </div>
        )}

        <button onClick={sub} disabled={!actId || saving} className={`flex items-center justify-center gap-2 py-2.5 rounded-lg font-body text-sm font-semibold border-none cursor-pointer ${!actId||saving?"bg-gray-200 text-gray-400":"bg-blue-500 text-white hover:bg-blue-400"}`}>
          {saving?<Loader2 size={16} className="animate-spin"/>:<Check size={16}/>}
          {multiDay ? `Créer ${previewDates.length} créneaux` : "Créer"}
        </button>
      </div>
    </Card>
  );
}

// ─── Main Planning ───
export default function PlanningPage() {
  const [weekOffset, setWeekOffset] = useState(0); const [dayOffset, setDayOffset] = useState(0);
  const [monthOffset, setMonthOffset] = useState(0);
  const [viewMode, setViewMode] = useState<"week"|"day"|"month">("week");
  const [creneaux, setCreneaux] = useState<(Creneau & { id: string })[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [families, setFamilies] = useState<(Family & { firestoreId: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSimple, setShowSimple] = useState(false); const [showGenerator, setShowGenerator] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string|undefined>();
  const [selectedCreneau, setSelectedCreneau] = useState<(Creneau & { id: string })|null>(null);
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
      const [aS, fS] = await Promise.all([getDocs(collection(db, "activities")), getDocs(collection(db, "families"))]);
      setActivities(aS.docs.map(d => ({ id: d.id, ...d.data() })) as Activity[]);
      setFamilies(fS.docs.map(d => ({ firestoreId: d.id, ...d.data() })) as any);

      let s: string, e: string;
      if (viewMode === "day") { s = fmtDate(currentDay); e = s; }
      else if (viewMode === "month") {
        const y = currentMonth.getFullYear(), m = currentMonth.getMonth();
        s = fmtDate(new Date(y, m, 1));
        e = fmtDate(new Date(y, m + 1, 0));
      } else { s = fmtDate(weekDates[0]); e = fmtDate(weekDates[6]); }

      const cS = await getDocs(query(collection(db, "creneaux"), where("date", ">=", s), where("date", "<=", e)));
      setCreneaux(cS.docs.map(d => ({ id: d.id, ...d.data() })) as any);

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

  const rdvCategories: Record<string, { label: string; color: string }> = {
    veterinaire: { label: "Vétérinaire", color: "#e74c3c" },
    marechal: { label: "Maréchal-ferrant", color: "#e67e22" },
    dentiste: { label: "Dentiste équin", color: "#9b59b6" },
    osteopathe: { label: "Ostéopathe", color: "#1abc9c" },
    reunion: { label: "Réunion / FFE", color: "#3498db" },
    formation: { label: "Formation", color: "#2ecc71" },
    autre: { label: "Autre", color: "#95a5a6" },
  };

  const handleCreate = async (nc: Partial<Creneau>[]) => { for (const c of nc) await addDoc(collection(db, "creneaux"), { ...c, createdAt: serverTimestamp() }); setShowSimple(false); setShowGenerator(false); alert(`${nc.length} créneau${nc.length>1?"x":""} créé${nc.length>1?"s":""}!`); fetchData(); };
  const handleDelete = async (id: string) => { if (!confirm("Supprimer ?")) return; await deleteDoc(doc(db, "creneaux", id)); fetchData(); };
  const handleDuplicateWeek = async () => { if (creneaux.length===0) return; setDuplicating(true); for (let w=1;w<=dupWeeks;w++){for(const c of creneaux){const d=new Date(c.date);d.setDate(d.getDate()+7*w);await addDoc(collection(db,"creneaux"),{activityId:c.activityId,activityTitle:c.activityTitle,activityType:c.activityType,date:fmtDate(d),startTime:c.startTime,endTime:c.endTime,monitor:c.monitor,maxPlaces:c.maxPlaces,enrolledCount:0,enrolled:[],status:"planned",priceHT:c.priceHT||0,priceTTC:(c as any).priceTTC||0,tvaTaux:c.tvaTaux||5.5,createdAt:serverTimestamp()});}} setDuplicating(false);setShowDuplicate(false);alert(`Dupliqué!`);fetchData(); };

  const refreshCreneaux = async () => { const s=viewMode==="day"?fmtDate(currentDay):fmtDate(weekDates[0]); const e=viewMode==="day"?fmtDate(currentDay):fmtDate(weekDates[6]); const snap=await getDocs(query(collection(db,"creneaux"),where("date",">=",s),where("date","<=",e))); const fresh=snap.docs.map(d=>({id:d.id,...d.data()})) as (Creneau&{id:string})[]; setCreneaux(fresh); return fresh; };

  const handleEnroll = async (cid: string, child: EnrolledChild, payMode?: string) => { const c=creneaux.find(x=>x.id===cid); if(!c) return; const en=[...(c.enrolled||[]),child]; await updateDoc(doc(db,"creneaux",cid),{enrolled:en,enrolledCount:en.length}); const priceTTC=(c as any).priceTTC||(c.priceHT||0)*(1+(c.tvaTaux||5.5)/100); const priceHT=priceTTC/(1+(c.tvaTaux||5.5)/100);
    await addDoc(collection(db,"reservations"),{familyId:child.familyId,familyName:child.familyName,childId:child.childId,childName:child.childName,activityTitle:c.activityTitle,activityType:c.activityType,creneauId:cid,date:c.date,startTime:c.startTime,endTime:c.endTime,priceTTC:Math.round(priceTTC*100)/100,status:"confirmed",source:"admin",createdAt:serverTimestamp()});
    if(payMode&&priceTTC>0){await addDoc(collection(db,"payments"),{familyId:child.familyId,familyName:child.familyName,items:[{activityTitle:c.activityTitle,priceHT:Math.round(priceHT*100)/100,tva:c.tvaTaux||5.5,priceTTC:Math.round(priceTTC*100)/100}],totalTTC:Math.round(priceTTC*100)/100,paymentMode:payMode,paymentRef:"",status:"paid",paidAmount:Math.round(priceTTC*100)/100,date:serverTimestamp()});}
    const fresh=await refreshCreneaux(); const upd=fresh.find(x=>x.id===cid); if(upd)setSelectedCreneau(upd); };

  const handleUnenroll = async (cid: string, childId: string) => { const c=creneaux.find(x=>x.id===cid); if(!c) return; const en=(c.enrolled||[]).filter((e:any)=>e.childId!==childId); await updateDoc(doc(db,"creneaux",cid),{enrolled:en,enrolledCount:en.length});
    try{const rs=await getDocs(query(collection(db,"reservations"),where("creneauId","==",cid),where("childId","==",childId)));for(const d of rs.docs)await deleteDoc(doc(db,"reservations",d.id));}catch(e){console.error(e);}
    const fresh=await refreshCreneaux(); const upd=fresh.find(x=>x.id===cid); if(upd)setSelectedCreneau(upd); };

  const isToday = (d: Date) => fmtDate(d) === fmtDate(new Date());
  const dayCreneaux = creneaux.filter(c => c.date === fmtDate(currentDay)).sort((a,b) => a.startTime.localeCompare(b.startTime));

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="font-display text-2xl font-bold text-blue-800">Planning</h1>
        <div className="flex gap-2">
          <div className="flex bg-sand rounded-lg p-0.5">{(["month","week","day"] as const).map(v=><button key={v} onClick={()=>setViewMode(v)} className={`px-4 py-2 rounded-md font-body text-xs font-semibold cursor-pointer border-none ${viewMode===v?"bg-white text-blue-500 shadow-sm":"text-gray-400 bg-transparent"}`}>{v==="week"?"Semaine":v==="day"?"Jour":"Mois"}</button>)}</div>
          <button onClick={()=>{setShowSimple(true);setShowGenerator(false);setSelectedDate(viewMode==="day"?fmtDate(currentDay):undefined);}} className="flex items-center gap-2 font-body text-sm font-semibold text-white bg-blue-500 px-4 py-2.5 rounded-lg border-none cursor-pointer hover:bg-blue-400"><Plus size={16}/>Créneau</button>
          <button onClick={()=>setShowRdvForm(true)} className="flex items-center gap-2 font-body text-sm font-semibold text-orange-700 bg-orange-50 px-4 py-2.5 rounded-lg border-none cursor-pointer hover:bg-orange-100"><Briefcase size={16}/>RDV Pro</button>
          <button onClick={()=>{setShowGenerator(true);setShowSimple(false);}} className="flex items-center gap-2 font-body text-sm font-semibold text-blue-800 bg-gold-400 px-4 py-2.5 rounded-lg border-none cursor-pointer hover:bg-gold-300"><Calendar size={16}/>Périodes</button>
          {viewMode==="week"&&creneaux.length>0&&<button onClick={()=>setShowDuplicate(!showDuplicate)} className="font-body text-sm font-semibold text-blue-500 bg-blue-50 px-3 py-2.5 rounded-lg border-none cursor-pointer">Dupliquer</button>}
        </div>
      </div>

      {showSimple && <SimpleCreneauForm activities={activities} onSave={handleCreate} onCancel={()=>setShowSimple(false)} defaultDate={selectedDate}/>}
      {showGenerator && <PeriodGenerator activities={activities} onGenerate={handleCreate} onCancel={()=>setShowGenerator(false)}/>}
      {showDuplicate && <Card padding="md" className="mb-6 border-gold-400/20 bg-gold-50"><div className="flex justify-between items-center mb-3"><h3 className="font-body text-base font-semibold text-blue-800">📋 Dupliquer semaine</h3><button onClick={()=>setShowDuplicate(false)} className="text-gray-400 bg-transparent border-none cursor-pointer"><X size={18}/></button></div><div className="flex items-center gap-4 mb-3"><label className="font-body text-sm text-blue-800">Semaines:</label><input type="number" min={1} max={20} value={dupWeeks} onChange={e=>setDupWeeks(parseInt(e.target.value)||1)} className="w-20 px-3 py-2 rounded-lg border border-blue-500/8 font-body text-sm bg-white text-center"/></div><button onClick={handleDuplicateWeek} disabled={duplicating} className={`flex items-center gap-2 px-6 py-2.5 rounded-lg font-body text-sm font-semibold border-none cursor-pointer ${duplicating?"bg-gray-200 text-gray-400":"bg-gold-400 text-blue-800"}`}>{duplicating?<Loader2 size={16} className="animate-spin"/>:<Check size={16}/>} Dupliquer</button></Card>}

      {viewMode==="week"&&<>
        <div className="flex items-center justify-between mb-5">
          <button onClick={()=>setWeekOffset(w=>w-1)} className="flex items-center gap-1 font-body text-sm text-gray-500 bg-white px-4 py-2 rounded-lg border border-gray-200 cursor-pointer"><ChevronLeft size={16}/>Préc.</button>
          <div className="text-center"><div className="font-display text-lg font-bold text-blue-800 capitalize">{fmtMonthFR(weekDates[0])}</div><div className="font-body text-xs text-gray-400">Du {weekDates[0].toLocaleDateString("fr-FR",{day:"numeric",month:"short"})} au {weekDates[6].toLocaleDateString("fr-FR",{day:"numeric",month:"short"})}</div></div>
          <div className="flex gap-2"><button onClick={()=>setWeekOffset(0)} className="font-body text-sm text-blue-500 bg-blue-50 px-4 py-2 rounded-lg border-none cursor-pointer">Auj.</button><button onClick={()=>setWeekOffset(w=>w+1)} className="flex items-center gap-1 font-body text-sm text-gray-500 bg-white px-4 py-2 rounded-lg border border-gray-200 cursor-pointer">Suiv.<ChevronRight size={16}/></button></div>
        </div>
        {loading?<div className="text-center py-16"><Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto"/></div>:
        <div className="grid grid-cols-7 gap-1.5">
          {weekDates.map((d,i)=><div key={i} onClick={()=>{setViewMode("day");setDayOffset(Math.round((d.getTime()-new Date().getTime())/86400000));}} className={`text-center py-2 rounded-lg font-body text-xs font-semibold cursor-pointer hover:ring-2 hover:ring-blue-300 ${isToday(d)?"bg-blue-500 text-white":"bg-sand text-gray-500"}`}>{fmtDateFR(d)}</div>)}
          {weekDates.map((d,i)=>{const ds=fmtDate(d);const dc=creneaux.filter(c=>c.date===ds).sort((a,b)=>a.startTime.localeCompare(b.startTime));return(
            <div key={`c${i}`} className="min-h-[140px] flex flex-col gap-1">
              {dc.map(c=>{const en=c.enrolled||[];const fill=c.maxPlaces>0?en.length/c.maxPlaces:0;const col=typeColors[c.activityType]||"#666";return(
                <div key={c.id} onClick={()=>setSelectedCreneau(c)} className="bg-white rounded-lg p-2 border border-blue-500/8 group relative hover:shadow-md cursor-pointer" style={{borderLeftWidth:3,borderLeftColor:col}}>
                  <div className="font-body text-[11px] font-semibold" style={{color:col}}>{c.startTime}–{c.endTime}</div>
                  <div className="font-body text-xs font-semibold text-blue-800 leading-tight mt-0.5">{c.activityTitle}</div>
                  <div className="font-body text-[10px] text-gray-400 mt-0.5">{c.monitor}</div>
                  <div className="flex items-center gap-1 mt-1"><Users size={10} className="text-gray-400"/><span className={`font-body text-[10px] font-semibold ${fill>=1?"text-red-500":fill>=0.7?"text-orange-500":"text-green-600"}`}>{en.length}/{c.maxPlaces}</span></div>
                  <button onClick={e=>{e.stopPropagation();handleDelete(c.id!);}} className="absolute top-1 right-1 w-5 h-5 rounded bg-red-50 text-red-400 hover:bg-red-100 border-none cursor-pointer opacity-0 group-hover:opacity-100 flex items-center justify-center"><Trash2 size={10}/></button>
                </div>);})}
              <button onClick={()=>{setSelectedDate(ds);setShowSimple(true);setShowGenerator(false);}} className="mt-auto py-2 rounded-lg border border-dashed border-gray-200 text-gray-300 hover:border-blue-300 hover:text-blue-400 bg-transparent cursor-pointer font-body text-lg">+</button>
            </div>);})}
        </div>}
      </>}

      {viewMode==="day"&&<>
        <div className="flex items-center justify-between mb-5">
          <button onClick={()=>setDayOffset(d=>d-1)} className="flex items-center gap-1 font-body text-sm text-gray-500 bg-white px-4 py-2 rounded-lg border border-gray-200 cursor-pointer"><ChevronLeft size={16}/>Veille</button>
          <div className="text-center"><div className="font-display text-lg font-bold text-blue-800 capitalize">{currentDay.toLocaleDateString("fr-FR",{weekday:"long",day:"numeric",month:"long",year:"numeric"})}</div><div className="font-body text-xs text-gray-400">{dayCreneaux.length} créneau{dayCreneaux.length>1?"x":""}</div></div>
          <div className="flex gap-2"><button onClick={()=>setDayOffset(0)} className="font-body text-sm text-blue-500 bg-blue-50 px-4 py-2 rounded-lg border-none cursor-pointer">Auj.</button><button onClick={()=>setDayOffset(d=>d+1)} className="flex items-center gap-1 font-body text-sm text-gray-500 bg-white px-4 py-2 rounded-lg border border-gray-200 cursor-pointer">Lendemain<ChevronRight size={16}/></button></div>
        </div>
        {loading?<div className="text-center py-16"><Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto"/></div>:
        dayCreneaux.length===0?<Card padding="lg" className="text-center"><div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto mb-3"><CalendarDays size={28} className="text-blue-300" /></div><p className="font-body text-sm text-gray-500">Aucun créneau.</p></Card>:
        <div className="flex flex-col gap-3">{dayCreneaux.map(c=>{const en=c.enrolled||[];const fill=c.maxPlaces>0?en.length/c.maxPlaces:0;const col=typeColors[c.activityType]||"#666";const ttc=(c as any).priceTTC||(c.priceHT||0)*(1+(c.tvaTaux||5.5)/100);return(
          <Card key={c.id} padding="md" className="cursor-pointer hover:shadow-lg" hover>
            <div onClick={()=>setSelectedCreneau(c)}>
              <div className="flex items-start justify-between mb-3"><div className="flex items-center gap-4"><div className="w-14 text-center"><div className="font-body text-lg font-bold" style={{color:col}}>{c.startTime}</div><div className="font-body text-[10px] text-gray-400">{c.endTime}</div></div><div style={{borderLeftWidth:3,borderLeftColor:col,paddingLeft:12}}><div className="font-body text-base font-semibold text-blue-800">{c.activityTitle}</div><div className="font-body text-xs text-gray-400">{c.monitor} · {c.maxPlaces} pl.{ttc>0?` · ${ttc.toFixed(0)}€`:""}</div></div></div><div className="flex items-center gap-3"><Badge color={fill>=1?"red":fill>=0.7?"orange":"green"}>{en.length}/{c.maxPlaces}</Badge><button onClick={e=>{e.stopPropagation();handleDelete(c.id!);}} className="text-gray-300 hover:text-red-500 bg-transparent border-none cursor-pointer"><Trash2 size={16}/></button></div></div>
              {en.length>0&&<div className="ml-[68px] flex flex-wrap gap-2">{en.map((e:any)=><span key={e.childId} className="font-body text-xs bg-sand text-blue-800 px-3 py-1 rounded-full">🧒 {e.childName} <span className="text-gray-400">({e.familyName})</span></span>)}</div>}
            </div>
          </Card>);})}</div>}
      </>}

      {/* ═══ VUE MENSUELLE ═══ */}
      {viewMode==="month"&&<>
        <div className="flex items-center justify-between mb-5">
          <button onClick={()=>setMonthOffset(m=>m-1)} className="flex items-center gap-1 font-body text-sm text-gray-500 bg-white px-4 py-2 rounded-lg border border-gray-200 cursor-pointer"><ChevronLeft size={16}/>Préc.</button>
          <div className="text-center"><div className="font-display text-lg font-bold text-blue-800 capitalize">{currentMonth.toLocaleDateString("fr-FR",{month:"long",year:"numeric"})}</div><div className="font-body text-xs text-gray-400">{creneaux.length} créneaux · {rdvPros.filter(r => r.date?.startsWith(currentMonth.toISOString().slice(0,7))).length} RDV pro</div></div>
          <div className="flex gap-2"><button onClick={()=>setMonthOffset(0)} className="font-body text-sm text-blue-500 bg-blue-50 px-4 py-2 rounded-lg border-none cursor-pointer">Auj.</button><button onClick={()=>setMonthOffset(m=>m+1)} className="flex items-center gap-1 font-body text-sm text-gray-500 bg-white px-4 py-2 rounded-lg border border-gray-200 cursor-pointer">Suiv.<ChevronRight size={16}/></button></div>
        </div>
        {loading?<div className="text-center py-16"><Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto"/></div>:
        <div>
          <div className="grid grid-cols-7 gap-1 mb-1">
            {["Lun","Mar","Mer","Jeu","Ven","Sam","Dim"].map(d=><div key={d} className="text-center font-body text-[10px] font-semibold text-gray-400 uppercase py-1">{d}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {monthDays.map((d,i) => {
              if (!d) return <div key={`e${i}`} className="min-h-[90px] bg-gray-50/50 rounded-lg" />;
              const ds = fmtDate(d);
              const today = fmtDate(new Date()) === ds;
              const dc = creneaux.filter(c => c.date === ds);
              const dr = rdvPros.filter(r => r.date === ds);
              const totalInscrits = dc.reduce((s,c) => s + (c.enrolled?.length || 0), 0);
              return (
                <div key={ds} className={`min-h-[90px] rounded-lg p-1.5 cursor-pointer border transition-all hover:shadow-md ${today ? "bg-blue-50 border-blue-300" : "bg-white border-gray-100"}`}
                  onClick={() => { setViewMode("day"); setDayOffset(Math.round((d.getTime()-new Date().setHours(0,0,0,0))/86400000)); }}>
                  <div className={`font-body text-xs font-semibold mb-1 ${today ? "text-blue-500" : d.getDay()===0||d.getDay()===6 ? "text-gray-300" : "text-gray-600"}`}>
                    {d.getDate()}
                  </div>
                  {dc.length > 0 && (
                    <div className="font-body text-[9px] text-blue-500 bg-blue-50 rounded px-1 py-0.5 mb-0.5">
                      {dc.length} cours · {totalInscrits} inscr.
                    </div>
                  )}
                  {dr.map(r => (
                    <div key={r.id} className="font-body text-[9px] rounded px-1 py-0.5 mb-0.5 truncate" style={{ backgroundColor: `${rdvCategories[r.category]?.color || "#95a5a6"}20`, color: rdvCategories[r.category]?.color || "#95a5a6" }}>
                      {r.startTime} {r.title}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>}
      </>}

      {/* RDV Pros du mois (visible en vue mois) */}
      {viewMode === "month" && rdvPros.filter(r => r.date?.startsWith(currentMonth.toISOString().slice(0,7))).length > 0 && (
        <div className="mt-6">
          <h3 className="font-body text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">RDV professionnels du mois</h3>
          <div className="flex flex-col gap-2">
            {rdvPros.filter(r => r.date?.startsWith(currentMonth.toISOString().slice(0,7))).sort((a:any,b:any) => a.date.localeCompare(b.date)).map((r: any) => (
              <Card key={r.id} padding="sm">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: rdvCategories[r.category]?.color || "#95a5a6" }} />
                    <div>
                      <div className="font-body text-sm font-semibold text-blue-800">{r.title}</div>
                      <div className="font-body text-xs text-gray-400">
                        {new Date(r.date).toLocaleDateString("fr-FR",{weekday:"short",day:"numeric",month:"short"})} · {r.startTime}–{r.endTime}
                        {r.notes && ` · ${r.notes}`}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge color="gray">{rdvCategories[r.category]?.label || r.category}</Badge>
                    {r.reminderEmail && <span title={`Rappel ${r.reminderDays}j avant → ${r.reminderEmail}`}><Bell size={12} className="text-orange-400" /></span>}
                    <button onClick={() => handleDeleteRdv(r.id)} className="text-gray-300 hover:text-red-500 bg-transparent border-none cursor-pointer"><Trash2 size={14}/></button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      <div className="mt-6 flex gap-4 flex-wrap">
        {[["text-blue-500",(viewMode==="day"?dayCreneaux:creneaux).length,"créneaux"],["text-green-600",(viewMode==="day"?dayCreneaux:creneaux).reduce((s:number,c:any)=>s+(c.enrolled?.length||0),0),"inscrits"],["text-gold-400",(viewMode==="day"?dayCreneaux:creneaux).reduce((s:number,c:any)=>s+c.maxPlaces,0),"places"]].map(([col,val,lab],i)=>(
          <Card key={i} padding="sm" className="flex items-center gap-3"><span className={`font-body text-xl font-bold ${col}`}>{val}</span><span className="font-body text-xs text-gray-400">{lab as string}</span></Card>
        ))}
      </div>

      {/* ═══ MODAL : RDV Pro ═══ */}
      {showRdvForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center" onClick={() => setShowRdvForm(false)}>
          <div className="bg-white rounded-2xl w-full max-w-md mx-4 shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center p-5 border-b border-gray-100">
              <h2 className="font-display text-lg font-bold text-blue-800">Nouveau RDV professionnel</h2>
              <button onClick={() => setShowRdvForm(false)} className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center cursor-pointer border-none"><X size={16} /></button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="font-body text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1 block">Catégorie</label>
                <select className="w-full font-body text-sm border border-gray-200 rounded-lg px-3 py-2.5 bg-white focus:outline-none focus:border-blue-400" value={rdvForm.category} onChange={e => setRdvForm({...rdvForm, category: e.target.value})}>
                  {Object.entries(rdvCategories).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              <div>
                <label className="font-body text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1 block">Titre *</label>
                <input className="w-full font-body text-sm border border-gray-200 rounded-lg px-3 py-2.5 bg-white focus:outline-none focus:border-blue-400" value={rdvForm.title} onChange={e => setRdvForm({...rdvForm, title: e.target.value})}
                  placeholder="Ex: Vaccins annuels, Parage cavalerie…" />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="font-body text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1 block">Date *</label>
                  <input type="date" className="w-full font-body text-sm border border-gray-200 rounded-lg px-3 py-2.5 bg-white focus:outline-none focus:border-blue-400" value={rdvForm.date} onChange={e => setRdvForm({...rdvForm, date: e.target.value})} />
                </div>
                <div>
                  <label className="font-body text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1 block">Début</label>
                  <input type="time" className="w-full font-body text-sm border border-gray-200 rounded-lg px-3 py-2.5 bg-white focus:outline-none focus:border-blue-400" value={rdvForm.startTime} onChange={e => setRdvForm({...rdvForm, startTime: e.target.value})} />
                </div>
                <div>
                  <label className="font-body text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1 block">Fin</label>
                  <input type="time" className="w-full font-body text-sm border border-gray-200 rounded-lg px-3 py-2.5 bg-white focus:outline-none focus:border-blue-400" value={rdvForm.endTime} onChange={e => setRdvForm({...rdvForm, endTime: e.target.value})} />
                </div>
              </div>
              <div>
                <label className="font-body text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1 block">Notes</label>
                <input className="w-full font-body text-sm border border-gray-200 rounded-lg px-3 py-2.5 bg-white focus:outline-none focus:border-blue-400" value={rdvForm.notes} onChange={e => setRdvForm({...rdvForm, notes: e.target.value})}
                  placeholder="Ex: Dr Martin, lot de 12 poneys…" />
              </div>
              <div className="border-t border-gray-100 pt-3">
                <div className="font-body text-xs font-semibold text-orange-500 uppercase tracking-wider mb-2 flex items-center gap-1"><Bell size={12} /> Rappel email</div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="font-body text-[10px] text-gray-400 block mb-1">Email de rappel</label>
                    <input type="email" className="w-full font-body text-sm border border-gray-200 rounded-lg px-3 py-2.5 bg-white focus:outline-none focus:border-blue-400" value={rdvForm.reminderEmail} onChange={e => setRdvForm({...rdvForm, reminderEmail: e.target.value})}
                      placeholder="ceagon@orange.fr" />
                  </div>
                  <div>
                    <label className="font-body text-[10px] text-gray-400 block mb-1">Combien de jours avant</label>
                    <select className="w-full font-body text-sm border border-gray-200 rounded-lg px-3 py-2.5 bg-white focus:outline-none focus:border-blue-400" value={rdvForm.reminderDays} onChange={e => setRdvForm({...rdvForm, reminderDays: parseInt(e.target.value)})}>
                      <option value={1}>1 jour avant</option>
                      <option value={2}>2 jours avant</option>
                      <option value={3}>3 jours avant</option>
                      <option value={7}>1 semaine avant</option>
                      <option value={14}>2 semaines avant</option>
                    </select>
                  </div>
                </div>
                <p className="font-body text-[10px] text-gray-400 mt-1">Laissez l'email vide pour ne pas envoyer de rappel.</p>
              </div>
            </div>
            <div className="flex justify-end gap-3 p-5 border-t border-gray-100">
              <button onClick={() => setShowRdvForm(false)} className="font-body text-sm text-gray-500 bg-white px-4 py-2.5 rounded-lg border border-gray-200 cursor-pointer">Annuler</button>
              <button onClick={handleCreateRdv} disabled={!rdvForm.title || !rdvForm.date}
                className={`flex items-center gap-2 font-body text-sm font-semibold text-white bg-orange-500 px-5 py-2.5 rounded-lg border-none cursor-pointer hover:bg-orange-600 ${!rdvForm.title || !rdvForm.date ? "opacity-50" : ""}`}>
                <Briefcase size={16} /> Créer le RDV
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedCreneau&&<EnrollPanel creneau={selectedCreneau as any} families={families} onClose={()=>{setSelectedCreneau(null);fetchData();}} onEnroll={handleEnroll} onUnenroll={handleUnenroll}/>}
    </div>
  );
}
