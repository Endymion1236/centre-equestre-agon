"use client";

import { useState, useEffect, useMemo } from "react";
import { collection, getDocs, addDoc, updateDoc, doc, getDoc, query, where, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { Card, Badge } from "@/components/ui";
import { Check, ChevronRight, AlertTriangle, Calculator, CreditCard, Loader2, Calendar, Plus, Search } from "lucide-react";
import { authFetch } from "@/lib/auth-fetch";
import { compareCreneauxByDow } from "@/lib/creneau-sort";
import { todayLocalString } from "@/lib/date-local";
import { useToast } from "@/components/ui/Toast";
import {
  calculerForfaitAnnuel, seasonOf,
  type ForfaitTarifs, type FamilyDiscountRule,
} from "@/lib/forfait-pricing";

// Saison minimale autorisée pour les inscriptions annuelles en self-service.
// Règle métier : on bloque la saison en cours, on n'ouvre qu'à partir de
// septembre 2026 (saison 2026-2027). À ajuster chaque année si besoin (ou
// à terme : lire depuis settings).
const MIN_SEASON_INSCRIPTION = 2026;

// Tarifs par défaut (fallback si settings/inscription absent). Alignés sur
// EnrollPanel. La source réelle est Firestore settings/inscription.
const TARIFS_DEFAUT: ForfaitTarifs = {
  forfait1x: 650, forfait2x: 1100, forfait3x: 1400,
  adhesion1: 60, adhesion2: 40, adhesion3: 20, adhesion4plus: 0,
  licenceMoins18: 25, licencePlus18: 36,
};
const TOTAL_SESSIONS_SAISON_DEFAUT = 35;

// Calcule l'âge à partir d'une date de naissance, en gérant les formats
// variés (string ISO, Date, Firestore Timestamp {seconds}). Retourne null
// si la date est absente ou invalide (évite l'affichage "NaN ans").
function ageFromBirthDate(birthDate: any): number | null {
  if (!birthDate) return null;
  let d: Date;
  if (typeof birthDate === "string") d = new Date(birthDate);
  else if (birthDate instanceof Date) d = birthDate;
  else if (birthDate?.seconds) d = new Date(birthDate.seconds * 1000);
  else if (birthDate?.toDate) { try { d = birthDate.toDate(); } catch { return null; } }
  else return null;
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age >= 0 && age < 120 ? age : null;
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

export default function InscriptionAnnuellePage() {
  const { user, family } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [creneaux, setCreneaux] = useState<Creneau[]>([]);
  const [step, setStep] = useState(1);
  const [selectedChild, setSelectedChild] = useState("");
  const [licenceOK, setLicenceOK] = useState(false);
  const [adhesionOK, setAdhesionOK] = useState(false);
  // Multi-slot selection for 2x/3x per week
  const [selectedSlots, setSelectedSlots] = useState<string[]>([]);
  const [forfaitType, setForfaitType] = useState<"1x" | "2x" | "3x">("1x");
  const [paymentPlan, setPaymentPlan] = useState<"1x" | "3x" | "10x">("1x");
  const [mode, setMode] = useState<"annuel" | "ponctuel">("annuel");
  const [slotSearch, setSlotSearch] = useState("");

  // Tarifs + règles, chargés depuis Firestore (source de vérité, comme l'admin)
  const [tarifs, setTarifs] = useState<ForfaitTarifs>(TARIFS_DEFAUT);
  const [totalSessionsSaison1x, setTotalSessionsSaison1x] = useState<number>(TOTAL_SESSIONS_SAISON_DEFAUT);
  const [familyDiscountRules, setFamilyDiscountRules] = useState<FamilyDiscountRule[]>([]);
  const [allForfaits, setAllForfaits] = useState<any[]>([]);

  const children = family?.children || [];
  const child = children.find((c: any) => c.id === selectedChild);

  // Load all "cours" type creneaux from Firestore
  useEffect(() => {
    const fetchCreneaux = async () => {
      try {
        const today = todayLocalString();
        const snap = await getDocs(
          query(collection(db, "creneaux"), where("activityType", "==", "cours"), where("date", ">=", today))
        );
        setCreneaux(snap.docs.map(d => ({ id: d.id, ...d.data() })) as Creneau[]);
      } catch {
        try {
          const snap = await getDocs(collection(db, "creneaux"));
          const today = todayLocalString();
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

  // Charger tarifs (settings/inscription), dégressivité famille
  // (settings/degressivite) et forfaits existants (pour le rang enfant).
  // Mêmes sources que l'espace admin → prix identiques garantis.
  useEffect(() => {
    (async () => {
      try {
        const snap = await getDoc(doc(db, "settings", "inscription"));
        if (snap.exists()) {
          const d = snap.data() as any;
          setTarifs({
            forfait1x: d.forfait1x ?? TARIFS_DEFAUT.forfait1x,
            forfait2x: d.forfait2x ?? TARIFS_DEFAUT.forfait2x,
            forfait3x: d.forfait3x ?? TARIFS_DEFAUT.forfait3x,
            adhesion1: d.adhesion1 ?? TARIFS_DEFAUT.adhesion1,
            adhesion2: d.adhesion2 ?? TARIFS_DEFAUT.adhesion2,
            adhesion3: d.adhesion3 ?? TARIFS_DEFAUT.adhesion3,
            adhesion4plus: d.adhesion4plus ?? TARIFS_DEFAUT.adhesion4plus,
            licenceMoins18: d.licenceMoins18 ?? TARIFS_DEFAUT.licenceMoins18,
            licencePlus18: d.licencePlus18 ?? TARIFS_DEFAUT.licencePlus18,
          });
          if (d.totalSessionsSaison) setTotalSessionsSaison1x(d.totalSessionsSaison);
        }
      } catch (e) { console.warn("settings/inscription:", e); }
      try {
        const snap = await getDoc(doc(db, "settings", "degressivite"));
        if (snap.exists() && snap.data().familyDiscount) {
          setFamilyDiscountRules(snap.data().familyDiscount);
        }
      } catch (e) { console.warn("settings/degressivite:", e); }
      try {
        if (family?.id) {
          const snap = await getDocs(query(collection(db, "forfaits"), where("familyId", "==", family.id)));
          setAllForfaits(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        }
      } catch (e) { console.warn("forfaits famille:", e); }
    })();
  }, [family?.id]);

  // Group creneaux into weekly recurring slots.
  // IMPORTANT : la clé inclut la SAISON (seasonOf) pour ne pas fusionner un
  // même cours de deux saisons differentes (ex: Galop d'or mercredi 10h qui
  // existe en 2025-2026 ET 2026-2027). Sans ça, totalSessions cumulait les
  // occurrences des deux saisons -> comptage et prorata faux.
  const weeklySlots = useMemo(() => {
    const map: Record<string, WeeklySlot & { season: number }> = {};
    for (const c of creneaux) {
      const d = new Date(c.date);
      const dow = (d.getDay() + 6) % 7;
      const season = seasonOf(c.date);
      const key = `${c.activityId}-${dow}-${c.startTime}-S${season}`;
      if (!map[key]) {
        map[key] = {
          key, activityId: c.activityId, activityTitle: c.activityTitle,
          dayOfWeek: dow, dayLabel: dayLabels[dow],
          startTime: c.startTime, endTime: c.endTime,
          monitor: c.monitor, maxPlaces: c.maxPlaces,
          totalSessions: 0, avgEnrolled: 0, spotsAvailable: 0, creneauIds: [],
          priceTTC: c.priceTTC || ((c.priceHT || 0) * (1 + (c.tvaTaux || 5.5) / 100)),
          season,
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

  // Selected slots data
  const selectedSlotsData = weeklySlots.filter(s => selectedSlots.includes(s.key));

  // Filtered slots for search.
  // BLOCAGE SAISON (étape 3) : on n'affiche QUE les créneaux dont la saison
  // est >= MIN_SEASON_INSCRIPTION. Les inscriptions annuelles self-service
  // sont fermées pour la saison en cours, ouvertes seulement à partir de
  // septembre 2026. On regarde la date du 1er créneau de chaque slot.
  const filteredSlots = useMemo(() => {
    const autorises = weeklySlots.filter(s => (s as any).season >= MIN_SEASON_INSCRIPTION);
    if (!slotSearch.trim()) return autorises;
    const q = slotSearch.toLowerCase();
    return autorises.filter(s =>
      s.activityTitle.toLowerCase().includes(q) ||
      s.dayLabel.toLowerCase().includes(q) ||
      s.startTime.includes(q) ||
      s.monitor.toLowerCase().includes(q)
    );
  }, [weeklySlots, slotSearch]);

  // How many slots required (1x, 2x ou 3x)
  const requiredSlots = forfaitType === "3x" ? 3 : forfaitType === "2x" ? 2 : 1;
  const slotsComplete = selectedSlots.length === requiredSlots;
  const frequence: 1 | 2 | 3 = forfaitType === "3x" ? 3 : forfaitType === "2x" ? 2 : 1;

  // Toggle slot selection
  const toggleSlot = (key: string) => {
    setSelectedSlots(prev => {
      if (prev.includes(key)) return prev.filter(k => k !== key);
      if (forfaitType === "1x") return [key];
      if (prev.length >= requiredSlots) return prev; // limite atteinte
      return [...prev, key];
    });
  };

  // ── Rang de l'enfant dans la famille pour la saison visée ──
  // (= nb d'autres enfants déjà inscrits en forfait cette saison + 1)
  // Même logique que l'admin (filtrage par saison).
  const firstSlotDate = selectedSlotsData[0]
    ? (creneaux.find(c => c.id === selectedSlotsData[0].creneauIds[0])?.date || todayLocalString())
    : todayLocalString();
  const targetSeason = selectedSlotsData[0] ? seasonOf(firstSlotDate) : MIN_SEASON_INSCRIPTION;
  const rangEnfant = useMemo(() => {
    if (!family?.id) return 1;
    const enfants = new Set<string>();
    allForfaits.forEach((f: any) => {
      if (!f.childId || f.childId === selectedChild) return;
      const fSeason = f.seasonStartYear ?? seasonOf(f.createdAt);
      if (fSeason !== targetSeason) return;
      enfants.add(f.childId);
    });
    return enfants.size + 1;
  }, [allForfaits, selectedChild, targetSeason, family?.id]);

  // ── Séances restantes / total saison pour le prorata ──
  // total saison = sessions du 1er créneau choisi (nb d'occurrences réelles
  // du cours sur la saison). restantes = occurrences à partir d'aujourd'hui.
  const sessionsParCreneau = selectedSlotsData[0]?.totalSessions || totalSessionsSaison1x;

  // ── Calcul du prix via le helper centralisé (= identique à l'admin) ──
  const licenceMoins18 = (() => {
    const a = ageFromBirthDate((child as any)?.birthDate);
    if (a === null) return true; // par défaut -18 (cas le plus courant en club)
    return a < 18;
  })();

  const calcul = useMemo(() => calculerForfaitAnnuel({
    frequence,
    sessionsRestantes: sessionsParCreneau,
    sessionsTotalSaison: sessionsParCreneau, // créneaux de septembre = saison pleine → prorata 100%
    rangEnfant,
    avecAdhesion: adhesionOK,
    avecLicence: licenceOK,
    licenceMoins18,
    tarifs,
    familyDiscountRules,
  }), [frequence, sessionsParCreneau, rangEnfant, adhesionOK, licenceOK, licenceMoins18, tarifs, familyDiscountRules]);

  // Prix par créneau pour la création des items (réparti sur les créneaux)
  const slotsPrices = selectedSlotsData.map(slot => ({
    slot,
    sessions: slot.totalSessions,
    forfaitPrice: Math.round(calcul.prixForfaitNet / Math.max(1, selectedSlotsData.length)),
  }));
  const totalForfait = calcul.prixForfaitNet;
  const grandTotal = mode === "annuel"
    ? calcul.totalAnnuel
    : (calcul.prixAdhesion + calcul.prixLicence + (slotsPrices[0]?.slot.priceTTC || 0));

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
          // Marqueur : inscription couverte par un forfait annuel.
          // Évite qu'une désinscription d'UN créneau crée un avoir
          // alors que le paiement annuel reste valide pour le reste.
          paymentSource: "forfait",
          forfaitId: null,
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
        await addDoc(collection(db, "payments"), {
          familyId: user.uid,
          familyName: family.parentName,
          childId: selectedChild,
          childName: (child as any).firstName || "—",
          type: "inscription_annuelle",
          forfaitType,
          label: `Inscription annuelle ${forfaitType === "3x" ? "3×/sem" : forfaitType === "2x" ? "2×/sem" : "1×/sem"} — ${(child as any).firstName}`,
          items: [
            ...calcul.detailLignes.map(l => ({ label: l.label, amount: l.montantTTC })),
            ...slotsPrices.map(sp => ({
              label: `${sp.slot.activityTitle} — ${sp.slot.dayLabel} ${sp.slot.startTime}–${sp.slot.endTime} (${sp.sessions} séances)`,
              amount: 0, // détail informatif ; le prix forfait est déjà dans detailLignes
            })),
          ],
          totalTTC: grandTotal,
          paidAmount: 0,
          paymentPlan,
          // Toujours créer en "pending" côté client — les règles Firestore
          // durcies n'autorisent pas d'autres status à la création. Le passage
          // en "echeance"/"paid" se fait ensuite via admin ou webhook CAWL.
          status: "pending",
          skipPayment: true,
          source: "client",
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
              ...(calcul.prixAdhesion > 0 ? [{ name: "Adhésion annuelle", description: `Adhésion club (enfant ${rangEnfant})`, priceInCents: Math.round(calcul.prixAdhesion * 100), quantity: 1 }] : []),
              ...(calcul.prixLicence > 0 ? [{ name: "Licence FFE", description: licenceMoins18 ? "-18 ans" : "+18 ans", priceInCents: Math.round(calcul.prixLicence * 100), quantity: 1 }] : []),
              { name: `Forfait ${frequence}×/semaine`, description: `${selectedSlotsData.map(s => `${s.dayLabel} ${s.startTime}`).join(", ")}`, priceInCents: Math.round(calcul.prixForfaitNet * 100), quantity: 1 },
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
      toast("Erreur lors de l'inscription. Veuillez réessayer.", "error");
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
              {/* Bandeau réduction 1ère inscription : visible UNIQUEMENT si la
                  famille n'a aucun forfait existant (vraie première inscription).
                  Réduction non automatique : invite à contacter le club. */}
              {allForfaits.length === 0 && (
                <div className="mb-4 p-4 rounded-xl bg-green-50 border border-green-200">
                  <div className="font-body text-sm font-semibold text-green-800 mb-1">🎁 Première inscription ?</div>
                  <p className="font-body text-xs text-green-700">
                    Une réduction est prévue pour votre première inscription au club.
                    Contactez-nous pour en savoir plus : <a href="mailto:ceagon@orange.fr" className="underline font-semibold">ceagon@orange.fr</a>.
                  </p>
                </div>
              )}
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
                            {(() => {
                              const a = ageFromBirthDate(c.birthDate);
                              return a !== null ? `${a} ans · ` : "";
                            })()}
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
                    <div><div className="font-body text-sm font-semibold text-blue-800">Licence FFE</div><div className="font-body text-xs text-gray-400">Obligatoire pour pratiquer en club ({licenceMoins18 ? "-18 ans" : "+18 ans"})</div></div>
                  </div>
                  <span className="font-body text-base font-bold text-blue-500">{licenceMoins18 ? tarifs.licenceMoins18 : tarifs.licencePlus18}€</span>
                </label>
                <label className={`flex items-center justify-between px-5 py-4 rounded-xl border cursor-pointer ${adhesionOK ? "border-green-500 bg-green-50" : "border-gray-200"}`}>
                  <div className="flex items-center gap-3">
                    <input type="checkbox" checked={adhesionOK} onChange={e => setAdhesionOK(e.target.checked)} className="accent-green-500 w-5 h-5" />
                    <div><div className="font-body text-sm font-semibold text-blue-800">Adhésion au club</div><div className="font-body text-xs text-gray-400">Cotisation annuelle{rangEnfant > 1 ? ` (${rangEnfant}e enfant — tarif réduit)` : ""}</div></div>
                  </div>
                  <span className="font-body text-base font-bold text-blue-500">{calcul.prixAdhesion}€</span>
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
              <div className="grid grid-cols-3 gap-3 mb-6">
                <button onClick={() => { setForfaitType("1x"); setSelectedSlots([]); }}
                  className={`py-5 rounded-xl border font-body text-sm font-semibold cursor-pointer transition-all text-center
                    ${forfaitType === "1x" ? "border-blue-500 bg-blue-50 text-blue-500" : "border-gray-200 bg-white text-gray-500"}`}>
                  <span className="text-2xl block mb-1">🐴</span>
                  1 cours
                  <div className="font-body text-xs font-normal text-gray-400 mt-1">{tarifs.forfait1x}€/an</div>
                </button>
                <button onClick={() => { setForfaitType("2x"); setSelectedSlots([]); }}
                  className={`py-5 rounded-xl border font-body text-sm font-semibold cursor-pointer transition-all text-center
                    ${forfaitType === "2x" ? "border-blue-500 bg-blue-50 text-blue-500" : "border-gray-200 bg-white text-gray-500"}`}>
                  <span className="text-2xl block mb-1">🏇</span>
                  2 cours
                  <div className="font-body text-xs font-normal text-gray-400 mt-1">{tarifs.forfait2x}€/an</div>
                </button>
                <button onClick={() => { setForfaitType("3x"); setSelectedSlots([]); }}
                  className={`py-5 rounded-xl border font-body text-sm font-semibold cursor-pointer transition-all text-center
                    ${forfaitType === "3x" ? "border-blue-500 bg-blue-50 text-blue-500" : "border-gray-200 bg-white text-gray-500"}`}>
                  <span className="text-2xl block mb-1">🏆</span>
                  3 cours
                  <div className="font-body text-xs font-normal text-gray-400 mt-1">{tarifs.forfait3x}€/an</div>
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
                {requiredSlots > 1 ? `Choisir vos ${requiredSlots} créneaux hebdomadaires` : "Choisir votre créneau hebdomadaire"}
              </h2>
              <p className="font-body text-xs text-gray-400 mb-4">
                {requiredSlots > 1
                  ? `Sélectionnez ${requiredSlots} créneaux. Ils se répètent chaque semaine.`
                  : "Ce cours se répète chaque semaine pendant la saison (hors vacances)."}
              </p>

              {/* Selection counter for 2x/3x */}
              {requiredSlots > 1 && (
                <div className="flex items-center gap-2 mb-4 p-3 bg-blue-50 rounded-xl">
                  <Calculator size={16} className="text-blue-500" />
                  <span className="font-body text-sm text-blue-800">
                    {selectedSlots.length}/{requiredSlots} créneaux sélectionnés
                  </span>
                  {selectedSlots.length === requiredSlots && <Check size={16} className="text-green-500 ml-auto" />}
                </div>
              )}

              {/* Rappel du tarif forfait (prix global, pas par créneau) */}
              <div className="mb-4 p-3 bg-amber-50 rounded-xl border border-amber-200">
                <span className="font-body text-sm text-amber-800">
                  💡 Forfait {frequence}×/semaine : <strong>{calcul.prixForfaitAnnuelPlein}€/an</strong>
                  {calcul.familyDiscountAmount > 0 && ` (− ${calcul.familyDiscountAmount.toFixed(0)}€ réduction famille)`}
                  . Le prix ne dépend pas du créneau choisi mais du nombre de cours par semaine.
                </span>
              </div>

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

                {/* Détail tarifaire (issu du calcul centralisé = identique admin) */}
                {mode === "annuel" && calcul.detailLignes.map((l, i) => (
                  <div key={i} className="flex justify-between">
                    <span className="font-body text-sm text-gray-500">{l.label}</span>
                    <span className={`font-body text-sm ${l.montantTTC < 0 ? "text-green-600" : "text-blue-500"}`}>
                      {l.montantTTC < 0 ? "" : ""}{l.montantTTC.toFixed(2)}€
                    </span>
                  </div>
                ))}

                {/* Créneaux choisis (informatif) */}
                {mode === "annuel" && selectedSlotsData.map((s, i) => (
                  <div key={i} className="flex justify-between items-start pt-2 border-t border-blue-500/8">
                    <div>
                      <span className="font-body text-sm font-semibold text-blue-800">Créneau {i + 1}</span>
                      <div className="font-body text-xs text-gray-400">
                        {s.activityTitle} — {s.dayLabel} {s.startTime}–{s.endTime}
                      </div>
                      <div className="font-body text-xs text-blue-500">{s.totalSessions} séances</div>
                    </div>
                  </div>
                ))}

                {/* Mode ponctuel : afficher le créneau unique avec son prix */}
                {mode === "ponctuel" && slotsPrices.map((sp, i) => (
                  <div key={i} className="flex justify-between items-start pt-2 border-t border-blue-500/8">
                    <div>
                      <span className="font-body text-sm font-semibold text-blue-800">Séance ponctuelle</span>
                      <div className="font-body text-xs text-gray-400">
                        {sp.slot.activityTitle} — {sp.slot.dayLabel} {sp.slot.startTime}–{sp.slot.endTime}
                      </div>
                    </div>
                    <span className="font-body text-sm font-semibold text-blue-500">
                      {sp.slot.priceTTC.toFixed(2)}€
                    </span>
                  </div>
                ))}
                {false && slotsPrices.map((sp, i) => (
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
