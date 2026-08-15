"use client";

/**
 * src/app/espace-cavalier/inscription-annuelle/page.tsx
 *
 * Parcours d'inscription à l'année, côté FAMILLES : choix du cavalier,
 * prérequis (licence/adhésion), forfait, créneaux, récapitulatif et paiement.
 *
 * Ce fichier est désormais l'ORCHESTRATEUR : il détient l'état du parcours,
 * charge les données Firestore et distribue le tout aux étapes. Ce qu'il ne
 * fait plus lui-même :
 *  - les prix et leurs entrées (rang, heures déjà prises, prérequis payés)
 *    → ./tarifs.ts, avec src/lib/forfait-pricing.ts pour le calcul central,
 *      celui-là même qu'utilise l'espace admin (même prix des deux côtés) ;
 *  - la reconstitution des cours hebdomadaires → ./creneaux.ts ;
 *  - les écritures Firestore de la validation → ./inscription-actions.ts ;
 *  - l'affichage de chaque étape → ./Etape*.tsx.
 *
 * L'ordre des étapes et les conditions d'affichage restent ici, volontairement
 * : c'est la seule vue d'ensemble du parcours.
 */

import { useState, useEffect, useMemo } from "react";
import { collection, getDocs, doc, getDoc, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { Loader2 } from "lucide-react";
import { todayLocalString } from "@/lib/date-local";
import { useToast } from "@/components/ui/Toast";
import {
  calculerForfaitAnnuel, seasonOf,
  type ForfaitTarifs, type FamilyDiscountRule,
} from "@/lib/forfait-pricing";
import {
  ETAPES_ANNUEL, ETAPES_PONCTUEL, MIN_SEASON_INSCRIPTION,
  TARIFS_DEFAUT, TOTAL_SESSIONS_SAISON_DEFAUT,
} from "./constantes";
import type { Creneau, MoyenPaiement, PanierItem, PaymentPlan } from "./types";
import {
  calculeChildIdsDejaInscrits, calculeFrequenceDejaInscrite, calculePrereqDejaPris,
  calculeRangEnfant, estLicenceMoins18,
} from "./tarifs";
import { construireWeeklySlots, filtrerSlots, slotKeysDuPanierPourEnfant } from "./creneaux";
import { validerPanier } from "./inscription-actions";
import EcranDeclarationEnregistree from "./EcranDeclarationEnregistree";
import EtapeCavalier from "./EtapeCavalier";
import EtapePrerequis from "./EtapePrerequis";
import EtapeForfait from "./EtapeForfait";
import EtapeCreneaux from "./EtapeCreneaux";
import EtapeSeancePonctuelle from "./EtapeSeancePonctuelle";
import EtapeRecapitulatif from "./EtapeRecapitulatif";

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
  const [paymentPlan, setPaymentPlan] = useState<PaymentPlan>("1x");
  // Moyen de paiement choisi par la famille :
  //  - "cb"      : paiement en ligne immédiat via CAWL (place confirmée tout de suite)
  //  - "cheque"  : règlement physique différé → inscription EN ATTENTE de validation admin
  //  - "especes" : idem chèque (réglé au club)
  const [moyenPaiement, setMoyenPaiement] = useState<MoyenPaiement>("cb");
  // Écran de confirmation affiché après une déclaration chèque/espèces.
  const [declaredSuccess, setDeclaredSuccess] = useState<null | { mode: "cheque" | "especes"; total: number; names: string }>(null);
  const [mode, setMode] = useState<"annuel" | "ponctuel">("annuel");
  const [slotSearch, setSlotSearch] = useState("");

  // ── PANIER multi-enfants ── (voir le type PanierItem dans ./types.ts)
  const [panier, setPanier] = useState<PanierItem[]>([]);

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

  // Cours hebdomadaires reconstitués à partir des créneaux datés (./creneaux.ts).
  const weeklySlots = useMemo(() => construireWeeklySlots(creneaux), [creneaux]);

  // Selected slots data
  const selectedSlotsData = weeklySlots.filter(s => selectedSlots.includes(s.key));

  // Slots déjà mis au panier pour l'enfant courant (évite le doublon créneau).
  const childIdInPanierSlots = useMemo(
    () => slotKeysDuPanierPourEnfant(panier, selectedChild),
    [panier, selectedChild]
  );

  // Filtered slots for search (+ blocage saison, + slots déjà pris).
  const filteredSlots = useMemo(
    () => filtrerSlots({ weeklySlots, slotSearch, selectedChild, slotKeysPanier: childIdInPanierSlots, creneaux }),
    [weeklySlots, slotSearch, selectedChild, panier, creneaux]
  );

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
  const firstSlotDate = selectedSlotsData[0]
    ? (creneaux.find(c => c.id === selectedSlotsData[0].creneauIds[0])?.date || todayLocalString())
    : todayLocalString();
  const targetSeason = selectedSlotsData[0] ? seasonOf(firstSlotDate) : MIN_SEASON_INSCRIPTION;
  const rangEnfant = useMemo(
    () => calculeRangEnfant({ familyId: family?.id, allForfaits, panier, selectedChild, targetSeason }),
    [allForfaits, selectedChild, targetSeason, family?.id, panier]
  );

  // Enfants déjà inscrits pour la saison ouverte au self-service.
  const childIdsDejaInscrits = useMemo(
    () => calculeChildIdsDejaInscrits(allForfaits, panier),
    [allForfaits, panier]
  );
  const childDejaInscrit = (id: string) => childIdsDejaInscrits.has(id);

  // Licence / adhésion déjà prises pour l'enfant courant cette saison ?
  const prereqDejaPris = useMemo(
    () => calculePrereqDejaPris({ allForfaits, panier, selectedChild, targetSeason }),
    [allForfaits, panier, selectedChild, targetSeason]
  );

  // Fréquence (cours/semaine) déjà inscrite pour l'enfant cette saison.
  const frequenceDejaInscrite = useMemo(
    () => calculeFrequenceDejaInscrite({ allForfaits, panier, selectedChild, targetSeason }),
    [allForfaits, panier, selectedChild, targetSeason]
  );

  // Nombre d'heures/semaine encore disponibles (plafond 3×/sem cumulé).
  const freqMaxAjoutable = Math.max(0, 3 - frequenceDejaInscrite);

  // ── Séances restantes / total saison pour le prorata ──
  // total saison = sessions du 1er créneau choisi (nb d'occurrences réelles
  // du cours sur la saison). restantes = occurrences à partir d'aujourd'hui.
  const sessionsParCreneau = selectedSlotsData[0]?.totalSessions || totalSessionsSaison1x;

  // ── Calcul du prix via le helper centralisé (= identique à l'admin) ──
  const licenceMoins18 = estLicenceMoins18((child as any)?.birthDate);

  // Facturation effective : si déjà prise cette saison, on ne refacture pas
  // (le prérequis reste rempli, mais coût 0 sur ce 2e forfait).
  const avecLicenceFacturee = licenceOK && !prereqDejaPris.licence;
  const avecAdhesionFacturee = adhesionOK && !prereqDejaPris.adhesion;

  const calcul = useMemo(() => calculerForfaitAnnuel({
    frequence,
    sessionsRestantes: sessionsParCreneau,
    sessionsTotalSaison: sessionsParCreneau, // créneaux de septembre = saison pleine → prorata 100%
    rangEnfant,
    avecAdhesion: avecAdhesionFacturee,
    avecLicence: avecLicenceFacturee,
    licenceMoins18,
    tarifs,
    familyDiscountRules,
    frequenceDejaInscrite,
  }), [frequence, sessionsParCreneau, rangEnfant, avecAdhesionFacturee, avecLicenceFacturee, licenceMoins18, tarifs, familyDiscountRules, frequenceDejaInscrite]);

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

  // Total du panier (toutes les inscriptions cumulées)
  const totalPanier = panier.reduce((s, p) => s + p.totalAnnuel, 0);
  // Total à payer = panier validé + inscription en cours (récap actuel)
  const totalAPayer = totalPanier + grandTotal;

  // Réinitialise le parcours pour inscrire un nouvel enfant (sans toucher au panier)
  const resetParcours = () => {
    setSelectedChild("");
    setSelectedSlots([]);
    setForfaitType("1x");
    setLicenceOK(false);
    setAdhesionOK(false);
    setSlotSearch("");
    setStep(1);
  };

  // Ajoute l'inscription en cours au panier puis réinitialise pour un autre enfant
  const ajouterAuPanier = () => {
    if (!child || selectedSlotsData.length === 0) return;
    const item: PanierItem = {
      childId: selectedChild,
      childName: (child as any).firstName || "—",
      forfaitType,
      frequence,
      slotKeys: selectedSlots,
      creneauIds: selectedSlotsData.flatMap(s => s.creneauIds),
      slotsInfo: selectedSlotsData.map(s => ({
        activityTitle: s.activityTitle, dayLabel: s.dayLabel,
        startTime: s.startTime, endTime: s.endTime,
        totalSessions: s.totalSessions, creneauIds: s.creneauIds,
      })),
      avecAdhesion: avecAdhesionFacturee,
      avecLicence: avecLicenceFacturee,
      licenceMoins18,
      rangEnfant,
      seasonStartYear: targetSeason,
      frequenceDejaInscrite,
      totalAnnuel: grandTotal,
      detailLignes: calcul.detailLignes,
      prixAdhesion: calcul.prixAdhesion,
      prixLicence: calcul.prixLicence,
      prixForfaitNet: calcul.prixForfaitNet,
    };
    setPanier(prev => [...prev, item]);
    resetParcours();
    toast(`${item.childName} ajouté(e) au panier`, "success");
  };

  // Retire un enfant du panier
  const retirerDuPanier = (childId: string) => {
    setPanier(prev => prev.filter(p => p.childId !== childId));
  };

  // Steps for annual mode
  const steps = mode === "annuel" ? ETAPES_ANNUEL : ETAPES_PONCTUEL;

  // ── Valide TOUT le panier (+ l'inscription en cours si complète) ──
  // Crée toutes les inscriptions puis UN SEUL paiement groupé + 1 checkout CAWL
  // (voir ./inscription-actions.ts).
  const handleEnrollAll = async () => {
    if (!user || !family) return;
    // Construire la liste finale : panier + inscription en cours (si valide)
    const items: PanierItem[] = [...panier];
    if (child && selectedSlotsData.length > 0) {
      items.push({
        childId: selectedChild,
        childName: (child as any).firstName || "—",
        forfaitType, frequence,
        slotKeys: selectedSlots,
        creneauIds: selectedSlotsData.flatMap(s => s.creneauIds),
        slotsInfo: selectedSlotsData.map(s => ({
          activityTitle: s.activityTitle, dayLabel: s.dayLabel,
          startTime: s.startTime, endTime: s.endTime,
          totalSessions: s.totalSessions, creneauIds: s.creneauIds,
        })),
        avecAdhesion: avecAdhesionFacturee, avecLicence: avecLicenceFacturee, licenceMoins18,
        rangEnfant,
        seasonStartYear: targetSeason,
        frequenceDejaInscrite,
        totalAnnuel: grandTotal,
        detailLignes: calcul.detailLignes,
        prixAdhesion: calcul.prixAdhesion,
        prixLicence: calcul.prixLicence,
        prixForfaitNet: calcul.prixForfaitNet,
      });
    }
    if (items.length === 0) return;
    await validerPanier({
      items, moyenPaiement, paymentPlan, user, family, creneaux,
      setSubmitting, setDeclaredSuccess, toast,
    });
  };

  if (declaredSuccess) {
    return <EcranDeclarationEnregistree declaredSuccess={declaredSuccess} />;
  }

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
            <EtapeCavalier
              allForfaits={allForfaits}
              enfants={children}
              selectedChild={selectedChild}
              setSelectedChild={setSelectedChild}
              childDejaInscrit={childDejaInscrit}
              mode={mode}
              setStep={setStep}
            />
          )}

          {/* ─── Step 2 (annuel): Prerequisites ─── */}
          {step === 2 && mode === "annuel" && (
            <EtapePrerequis
              prereqDejaPris={prereqDejaPris}
              licenceOK={licenceOK}
              setLicenceOK={setLicenceOK}
              adhesionOK={adhesionOK}
              setAdhesionOK={setAdhesionOK}
              licenceMoins18={licenceMoins18}
              tarifs={tarifs}
              rangEnfant={rangEnfant}
              prixAdhesion={calcul.prixAdhesion}
              setStep={setStep}
            />
          )}

          {/* ─── Step 3 (annuel): Choose forfait type ─── */}
          {step === 3 && mode === "annuel" && (
            <EtapeForfait
              dejaEnQuinzaine={allForfaits.some((f: any) =>
                f.childId === selectedChild
                && f.rythme === "quinzaine"
                && (f.status === "actif" || f.status === "active")
              )}
              frequenceDejaInscrite={frequenceDejaInscrite}
              freqMaxAjoutable={freqMaxAjoutable}
              tarifs={tarifs}
              forfaitType={forfaitType}
              setForfaitType={setForfaitType}
              setSelectedSlots={setSelectedSlots}
              setStep={setStep}
            />
          )}

          {/* ─── Step 4 (annuel): Choose slot(s) ─── */}
          {step === 4 && mode === "annuel" && (
            <EtapeCreneaux
              requiredSlots={requiredSlots}
              selectedSlots={selectedSlots}
              toggleSlot={toggleSlot}
              slotsComplete={slotsComplete}
              forfaitType={forfaitType}
              frequence={frequence}
              frequenceDejaInscrite={frequenceDejaInscrite}
              calcul={calcul}
              slotSearch={slotSearch}
              setSlotSearch={setSlotSearch}
              weeklySlots={weeklySlots}
              filteredSlots={filteredSlots}
              setStep={setStep}
            />
          )}

          {/* ─── Step 2 (ponctuel): Choose single slot ─── */}
          {step === 2 && mode === "ponctuel" && (
            <EtapeSeancePonctuelle
              weeklySlots={weeklySlots}
              selectedSlots={selectedSlots}
              setSelectedSlots={setSelectedSlots}
              setStep={setStep}
            />
          )}

          {/* ─── Step 5 (annuel) / Step 3 (ponctuel): Recap + Payment ─── */}
          {((step === 5 && mode === "annuel") || (step === 3 && mode === "ponctuel")) && (
            <EtapeRecapitulatif
              panier={panier}
              retirerDuPanier={retirerDuPanier}
              totalPanier={totalPanier}
              child={child}
              mode={mode}
              forfaitType={forfaitType}
              calcul={calcul}
              selectedSlotsData={selectedSlotsData}
              slotsPrices={slotsPrices}
              grandTotal={grandTotal}
              totalAPayer={totalAPayer}
              moyenPaiement={moyenPaiement}
              setMoyenPaiement={setMoyenPaiement}
              paymentPlan={paymentPlan}
              setPaymentPlan={setPaymentPlan}
              ajouterAuPanier={ajouterAuPanier}
              handleEnrollAll={handleEnrollAll}
              submitting={submitting}
              slotsComplete={slotsComplete}
              setStep={setStep}
            />
          )}
        </>
      )}
    </div>
  );
}
