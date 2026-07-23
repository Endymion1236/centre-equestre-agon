"use client";

import { useState, useEffect, useMemo } from "react";
import { collection, getDocs, getDoc, addDoc, updateDoc, doc, query, where, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { Card, Badge } from "@/components/ui";
import { Calendar, Clock, Users, Loader2, ShoppingCart, ChevronLeft, ChevronRight, X, Check, CreditCard, CalendarDays, LayoutList } from "lucide-react";
import TimelineReservation from "./TimelineReservation";
import { useSearchParams } from "next/navigation";
import { authFetch } from "@/lib/auth-fetch";
import { formatStageSchedule } from "@/lib/format-stage";
import { compareCreneauxByDate } from "@/lib/creneau-sort";
import { todayLocalString } from "@/lib/date-local";
import { useToast } from "@/components/ui/Toast";

interface Creneau { id: string; activityId: string; activityTitle: string; activityType: string; date: string; startTime: string; endTime: string; monitor: string; maxPlaces: number; enrolled: any[]; enrolledCount: number; priceHT: number; priceTTC?: number; tvaTaux: number; }

interface CartItem { creneauIds: string[]; activityTitle: string; dates: string; childId: string; childName: string; prixBase: number; remiseEuros: number; rang: number; prixFinal: number; isStage: boolean; }

const typeLabels: Record<string, { label: string; color: string }> = {
  stage: { label: "Stage", color: "#27ae60" }, stage_journee: { label: "Stage", color: "#16a085" },
  balade: { label: "Balade", color: "#e67e22" }, cours: { label: "Cours", color: "#2050A0" },
  competition: { label: "Compet.", color: "#7c3aed" }, anniversaire: { label: "Anniv.", color: "#D63031" },
};

export default function ReserverPage() {
  const { user, family } = useAuth();
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const initialFilter = searchParams.get("filter") || "all";
  const initialDate = searchParams.get("date") || null; // date ISO depuis l'assistant vocal

  const [creneaux, setCreneaux] = useState<Creneau[]>([]);
  const [activities, setActivities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState(initialFilter);
  const [subfilter, setSubfilter] = useState("all"); // sous-catégorie
  const [cart, setCart] = useState<CartItem[]>([]);
  const [showCart, setShowCart] = useState(false);
  const [selectedCreneau, setSelectedCreneau] = useState<Creneau | null>(null);
  const [selectedChildren, setSelectedChildren] = useState<string[]>([]);
  const [paying, setPaying] = useState(false);
  const [depositMode, setDepositMode] = useState<"full" | "deposit">("full");
  // Modal sélection enfant (depuis Timeline)
  const [bookingCreneau, setBookingCreneau] = useState<Creneau | null>(null);
  // Mode paiement dans le panier
  const [cartPayMode, setCartPayMode] = useState<"cb" | "cheque" | "especes" | "virement" | "avoir">("cb");
  // Acceptation des conditions d'annulation (stages uniquement).
  const [cgvAccepted, setCgvAccepted] = useState(false);
  const [cartPaySuccess, setCartPaySuccess] = useState(false);
  const [success, setSuccess] = useState(false);
  const [waitlistSuccess, setWaitlistSuccess] = useState<string | null>(null); // creneauId confirmé
  const [waitlistLoading, setWaitlistLoading] = useState<string | null>(null); // creneauId en cours
  const [familyAvoirs, setFamilyAvoirs] = useState<any[]>([]);
  const [stageBookingMode, setStageBookingMode] = useState<"semaine" | "jour">("semaine");
  const [selectedDays, setSelectedDays] = useState<string[]>([]);
  const [expandedStageDetail, setExpandedStageDetail] = useState<string | null>(null); // key du stage dont le détail est ouvert
  // Prix plancher pour un stage (configurable cote admin Reglages > Reductions).
  // Le tarif degressif ne peut pas descendre en dessous de ce montant.
  const [prixPlancherStage, setPrixPlancherStage] = useState<number>(0);

  // Tous les cavaliers disponibles = propres + liés
  const ownChildren = family?.children || [];
  const linkedChildren = (family as any)?.linkedChildren || [];
  const children = [
    ...ownChildren,
    ...linkedChildren.map((lc: any) => ({
      id: lc.childId,
      firstName: `${lc.childName} (${lc.sourceFamilyName})`,
      galopLevel: lc.galopLevel || "—",
      sourceFamilyId: lc.sourceFamilyId,
      sourceFamilyName: lc.sourceFamilyName,
      isLinked: true,
    })),
  ];
  const familyId = user?.uid || "";

  const [monthOffset, setMonthOffset] = useState(0);
  const [viewMode, setViewMode] = useState<"timeline" | "liste">(initialDate ? "liste" : "timeline");

  // Mois courant affiché
  const currentMonth = useMemo(() => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() + monthOffset);
    return d;
  }, [monthOffset]);

  const startDate = useMemo(() => {
    const d = new Date(currentMonth);
    d.setDate(1);
    return d;
  }, [currentMonth]);

  const endDate = useMemo(() => {
    const d = new Date(currentMonth);
    // Si on filtre par stage : on charge 6 mois pour ne rater aucun stage
    // futur (les stages sont souvent programmes plusieurs mois a l'avance,
    // et tu ne sais pas quel mois cliquer si tu cherches 'cet ete').
    // Sinon : 1 mois + 7 jours (comportement original pour cours).
    if (filter === "stage" || filter === "stage_journee") {
      d.setMonth(d.getMonth() + 6);
      return d;
    }
    d.setMonth(d.getMonth() + 1);
    d.setDate(0); // dernier jour du mois
    // Ajouter 7 jours pour couvrir les stages à cheval sur 2 mois
    d.setDate(d.getDate() + 7);
    return d;
  }, [currentMonth, filter]);

  const fmtDate = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };

  const monthLabel = currentMonth.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });

  // Charger le prix plancher (settings/degressivite) au montage.
  // Sert a empecher les tarifs en dessous d'un seuil quand plusieurs reductions
  // s'accumulent (famille + multi-stages).
  useEffect(() => {
    const loadPlancher = async () => {
      try {
        const snap = await getDoc(doc(db, "settings", "degressivite"));
        if (snap.exists()) {
          const data = snap.data();
          if (typeof data.prixPlancherStage === "number") {
            setPrixPlancherStage(data.prixPlancherStage);
          }
        }
      } catch { /* fallback 0 = pas de plancher */ }
    };
    loadPlancher();
  }, []);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        // Borne haute pour les STAGES seulement : 6 mois en avant
        // (les stages sont souvent programmes des mois a l'avance, le
        // bandeau 'Stages disponibles' doit etre detecte des l'ouverture
        // meme si on est en mai et les stages en juillet).
        const stagesEnd = new Date(currentMonth);
        stagesEnd.setMonth(stagesEnd.getMonth() + 6);

        const [crSnap, actSnap, stagesSnap] = await Promise.all([
          getDocs(query(collection(db, "creneaux"), where("date", ">=", fmtDate(startDate)), where("date", "<=", fmtDate(endDate)))),
          getDocs(collection(db, "activities")),
          // Requete dediee aux stages dans une fenetre large
          getDocs(query(
            collection(db, "creneaux"),
            where("date", ">=", fmtDate(startDate)),
            where("date", "<=", fmtDate(stagesEnd)),
          )),
        ]);

        // Merge des 2 requetes : on garde les creneaux du mois courant (cours)
        // + tous les stages des 6 mois. Dedoublonnage par id.
        const baseDocs = crSnap.docs.map(d => ({ id: d.id, ...d.data() })) as Creneau[];
        const stageDocs = stagesSnap.docs
          .map(d => ({ id: d.id, ...d.data() }) as Creneau)
          .filter(c => c.activityType === "stage" || c.activityType === "stage_journee");
        const seen = new Set(baseDocs.map(c => c.id));
        const merged = [...baseDocs];
        for (const s of stageDocs) {
          if (!seen.has(s.id)) {
            merged.push(s);
            seen.add(s.id);
          }
        }
        setCreneaux(merged);
        setActivities(actSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (e) { console.error(e); }
      setLoading(false);
    };
    load();
  }, [monthOffset, filter]);

  // Sous-catégories disponibles pour le filtre courant
  const availableSubcats = useMemo(() => {
    if (filter === "all") return [];
    const typeActivities = activities.filter(a => a.type === filter);
    const subcats = new Set<string>();
    typeActivities.forEach(a => (a.subcategories || []).forEach((s: string) => subcats.add(s)));
    return Array.from(subcats).sort();
  }, [filter, activities]);

  // Réinitialiser le sous-filtre quand la catégorie change
  const setFilterAndReset = (f: string) => { setFilter(f); setSubfilter("all"); };

  // Créneaux disponibles filtrés
  const available = useMemo(() => {
    const now = new Date(); const todayStr = fmtDate(now);
    let result = creneaux.filter(c => {
      if (c.date < todayStr) return false;
      return true;
    });
    if (filter !== "all") result = result.filter(c => c.activityType === filter);
    // Filtrage par sous-catégorie via l'activité associée
    if (subfilter !== "all") {
      result = result.filter(c => {
        const act = activities.find(a => a.id === c.activityId);
        return act && (act.subcategories || []).includes(subfilter);
      });
    }
    return result.sort(compareCreneauxByDate);
  }, [creneaux, filter, subfilter, activities]);

  // Grouper les stages par titre + semaine
  const stageGroups = useMemo(() => {
    const stages = available.filter(c => c.activityType === "stage" || c.activityType === "stage_journee");
    console.log(`[STAGE DEBUG] ${creneaux.length} créneaux chargés, ${available.length} disponibles, ${stages.length} stages`);
    if (stages.length > 0) {
      console.log(`[STAGE DEBUG] Types trouvés:`, [...new Set(available.map(c => c.activityType))]);
      console.log(`[STAGE DEBUG] Stages:`, stages.map(c => `${c.date} ${c.activityTitle} (${c.activityType})`));
    }
    const groups: Record<string, Creneau[]> = {};
    stages.forEach(c => {
      const d = new Date(c.date);
      const mon = new Date(d); mon.setDate(mon.getDate() - ((d.getDay() + 6) % 7));
      // Clé = stageGroupId (lot de création, fiable à 100%) avec fallback
      // activityId pour les stages antérieurs à ce champ. Deux stages
      // homonymes — même créés depuis la même activité — restent distincts.
      const key = `${(c as any).stageGroupId || c.activityId}_${fmtDate(mon)}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(c);
    });
    console.log(`[STAGE DEBUG] Groupes:`, Object.entries(groups).map(([k, v]) => `${k}: ${v.length} jours`));
    return groups;
  }, [available]);

  // Cours (non-stage)
  const coursCreneaux = useMemo(() => available.filter(c => c.activityType !== "stage" && c.activityType !== "stage_journee"), [available]);
  const coursByDate = useMemo(() => {
    const g: Record<string, Creneau[]> = {};
    coursCreneaux.forEach(c => { if (!g[c.date]) g[c.date] = []; g[c.date].push(c); });
    return g;
  }, [coursCreneaux]);

  // Compteur d'inscriptions stage famille (pour réductions)
  const existingStageCount = useMemo(() => {
    // Compter les inscriptions UNIQUES (enfant + titre stage) pour cette famille
    const uniqueInscriptions = new Set<string>();
    creneaux.filter(c => c.activityType === "stage" || c.activityType === "stage_journee").forEach(c => {
      (c.enrolled || []).filter((e: any) => e.familyId === familyId).forEach((e: any) => {
        uniqueInscriptions.add(`${e.childId}_${c.activityTitle}`);
      });
    });
    // Ajouter les items stage dans le panier (déjà uniques par enfant+stage)
    cart.filter(i => i.isStage).forEach(i => {
      uniqueInscriptions.add(`${i.childId}_${i.activityTitle}`);
    });
    return uniqueInscriptions.size;
  }, [creneaux, familyId, cart]);

  const isStage = (c: Creneau) => c.activityType === "stage" || c.activityType === "stage_journee";

  // Ajouter au panier (stage = multi-enfants, cours = 1 enfant)
  // En mode jour, stageCreneaux ne contient QUE les jours sélectionnés ; il faut
  // donc passer prixJourParam (prix d'UN jour) et totalJoursStageParam (nombre
  // total de jours du stage) calculés par l'appelant, sinon le prorata est faux.
  const addStageToCart = (stageCreneaux: Creneau[], prixJourParam?: number, totalJoursStageParam?: number) => {
    if (selectedChildren.length === 0) return;
    const first = stageCreneaux[0];
    const prixSemaine = (first as any).priceTTC || first.priceHT * (1 + (first.tvaTaux || 5.5) / 100);
    const allowDay = stageCreneaux.some((c: any) => c.allowDayBooking);
    const isJourMode = allowDay && stageBookingMode === "jour";

    // Calculer le prix effectif
    let prixBase: number;
    if (isJourMode) {
      const totalJours = totalJoursStageParam || stageCreneaux.length;
      const prixJour = prixJourParam ?? (first as any).priceTTCDay ?? Math.round(prixSemaine / Math.max(1, totalJours) * 100) / 100;
      // Prix jour × nb de jours sélectionnés. Si tous les jours sont pris,
      // on retombe sur le prix semaine complet. Pas de remise (gérée plus bas).
      prixBase = (stageCreneaux.length >= totalJours)
        ? prixSemaine
        : Math.round(prixJour * stageCreneaux.length * 100) / 100;
    } else {
      prixBase = prixSemaine;
    }

    const dates = stageCreneaux.map(c => new Date(c.date).toLocaleDateString("fr-FR", { weekday: "short" })).join(", ");

    // Filtrer les enfants déjà dans le panier OU deja inscrits au stage
    const firstCrId = stageCreneaux[0]?.id;

    // Helper : 2 plages horaires se chevauchent-elles le meme jour ?
    // Compare date + intersection [start,end]. Renvoie true si chevauchement.
    const overlap = (a: { date: string; startTime: string; endTime: string }, b: { date: string; startTime: string; endTime: string }) => {
      if (a.date !== b.date) return false;
      // Comparaison HH:MM en string fonctionne tant qu'on a le format "HH:MM" ou "HH:MM:SS"
      const aStart = a.startTime || "00:00";
      const aEnd = a.endTime || "23:59";
      const bStart = b.startTime || "00:00";
      const bEnd = b.endTime || "23:59";
      // Pas de chevauchement si a finit avant que b commence, ou b finit avant a
      return !(aEnd <= bStart || bEnd <= aStart);
    };

    // Recuperer pour un enfant la liste de tous ses creneaux deja "pris" :
    // - inscriptions deja payees (enrolled[] des creneaux en base)
    // - items dans le panier (stages et cours)
    const getChildBusySlots = (childId: string): { date: string; startTime: string; endTime: string }[] => {
      const slots: { date: string; startTime: string; endTime: string }[] = [];
      // 1. Inscriptions deja payees : on parcourt creneaux qui ont enrolled[]
      for (const c of creneaux) {
        if ((c.enrolled || []).some((e: any) => e.childId === childId && e.familyId === familyId)) {
          slots.push({ date: c.date, startTime: c.startTime, endTime: c.endTime });
        }
      }
      // 2. Items du panier : parcourir creneauIds[] et resoudre vers le creneau
      for (const item of cart) {
        if (item.childId !== childId) continue;
        for (const cid of (item.creneauIds || [])) {
          const cr = creneaux.find(c => c.id === cid);
          if (cr) slots.push({ date: cr.date, startTime: cr.startTime, endTime: cr.endTime });
        }
      }
      return slots;
    };

    const conflits: { childName: string; date: string }[] = [];
    const childrenToAdd = selectedChildren.filter(childId => {
      const alreadyInCart = cart.some(i => i.childId === childId && i.creneauIds.includes(firstCrId));
      if (alreadyInCart) {
        console.log(`Doublon panier ignoré: childId=${childId} créneau=${firstCrId}`);
        return false;
      }
      // Verifier conflit horaire : un des creneaux qu'on veut ajouter chevauche
      // un creneau ou l'enfant est deja inscrit (panier ou base)
      const busySlots = getChildBusySlots(childId);
      for (const targetCr of stageCreneaux) {
        const target = { date: targetCr.date, startTime: targetCr.startTime, endTime: targetCr.endTime };
        for (const busy of busySlots) {
          if (overlap(target, busy)) {
            const child = children.find((c: any) => c.id === childId);
            const dateFr = new Date(targetCr.date).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
            conflits.push({ childName: (child as any)?.firstName || "?", date: `${dateFr} (${target.startTime}-${target.endTime})` });
            console.log(`Conflit horaire ignore: ${childId} ${targetCr.date} ${target.startTime}-${target.endTime} vs deja inscrit ${busy.date} ${busy.startTime}-${busy.endTime}`);
            return false;
          }
        }
      }
      return true;
    });

    // Message clair si certains enfants ont des conflits
    if (conflits.length > 0) {
      const details = conflits.slice(0, 5).map(c => `• ${c.childName} : ${c.date}`).join("\n");
      const plus = conflits.length > 5 ? `\n... et ${conflits.length - 5} autre(s)` : "";
      alert(`⚠️ Conflit d'horaires détecté :\n\n${details}${plus}\n\nCet enfant est déjà inscrit à un autre stage/cours à ce moment-là. Désinscrivez-le d'abord ou choisissez une autre période.`);
      setSelectedChildren([]);
      setSelectedCreneau(null);
      return;
    }

    // Nombre total de jours du stage pour calculer la remise au prorata.
    // En mode jour, stageCreneaux = jours sélectionnés ; le total vient du param.
    const nbJoursSelectionnes = Math.max(1, stageCreneaux.length);
    const totalJoursStage = isJourMode ? Math.max(nbJoursSelectionnes, totalJoursStageParam || nbJoursSelectionnes) : 1;
    const nbJoursSemaine = totalJoursStage; // dénominateur du prorata

    const newItems: CartItem[] = childrenToAdd.map((childId, idx) => {
      const child = children.find((c: any) => c.id === childId);
      const rang = existingStageCount + idx;
      // En mode JOUR : prix jour brut (prixBase = prixJour × nb jours), AUCUNE
      // remise, AUCUN plancher. En mode semaine : remise dégressive + plancher.
      let remiseEffective: number;
      let prixFinal: number;
      if (isJourMode) {
        remiseEffective = 0;
        prixFinal = Math.max(0, Math.round(prixBase * 100) / 100);
      } else {
        const remiseSemaine = rang === 0 ? 0 : rang === 1 ? 10 : rang === 2 ? 20 : 20 + (rang - 2) * 10;
        prixFinal = Math.max(0, Math.round((prixBase - remiseSemaine) * 100) / 100);
        remiseEffective = remiseSemaine;
        // Plancher uniquement en mode semaine.
        if (prixPlancherStage > 0 && prixFinal < prixPlancherStage) {
          prixFinal = prixPlancherStage;
          remiseEffective = Math.max(0, Math.round((prixBase - prixPlancherStage) * 100) / 100);
        }
      }
      return {
        creneauIds: stageCreneaux.map(c => c.id),
        activityTitle: first.activityTitle,
        dates: isJourMode ? `${stageCreneaux.length} jour${stageCreneaux.length > 1 ? "s" : ""} (${dates})` : `${stageCreneaux.length} jours (${dates})`,
        childId,
        childName: (child as any)?.firstName || "?",
        prixBase: Math.round(prixBase * 100) / 100,
        remiseEuros: remiseEffective,
        rang: rang + 1,
        prixFinal,
        isStage: true,
      };
    });

    setCart([...cart, ...newItems]);
    setSelectedChildren([]);
    setSelectedCreneau(null);
    setShowCart(true);
  };

  const addCoursToCart = (creneau: Creneau, childId: string) => {
    // Bloquer le doublon panier
    if (cart.some(i => i.childId === childId && i.creneauIds.includes(creneau.id))) {
      toast("Cet enfant est déjà dans le panier pour ce créneau.", "warning");
      return;
    }
    const child = children.find((c: any) => c.id === childId);

    // ── Règle métier : 12 ans minimum pour les promenades ──────────────
    // "Année des 12 ans" : l'enfant doit être né au plus tard l'année N-12
    // (où N = année courante). Ex : en 2026, il faut être né en 2014 ou avant.
    if (creneau.activityType === "balade" && child) {
      const bd: any = (child as any).birthDate;
      const birthDate = bd?.seconds ? new Date(bd.seconds * 1000) : (bd ? new Date(bd) : null);
      if (birthDate && !isNaN(birthDate.getTime())) {
        const anneeSeuil = new Date().getFullYear() - 12;
        if (birthDate.getFullYear() > anneeSeuil) {
          alert(
            `Désolé, l'inscription aux promenades est réservée aux cavaliers qui ont 12 ans (ou plus) dans l'année en cours.\n\n` +
            `${(child as any)?.firstName || "Cet enfant"} est trop jeune pour cette activité.\n\n` +
            `Contactez le centre équestre pour voir les alternatives adaptées à son âge.`
          );
          return;
        }
      } else {
        // Pas de date de naissance renseignée → on bloque par précaution et on invite à compléter
        alert(
          `Aucune date de naissance n'est renseignée pour ${(child as any)?.firstName || "cet enfant"}.\n\n` +
          `Les promenades sont réservées aux cavaliers de 12 ans et plus. Merci de compléter la date de naissance dans le profil avant l'inscription.`
        );
        return;
      }
    }
    // ── fin règle d'âge ────────────────────────────────────────────────

    const priceTTC = (creneau as any).priceTTC || creneau.priceHT * (1 + (creneau.tvaTaux || 5.5) / 100);
    // Enlever le suffixe " (NomFamille)" pour les cavaliers liés
    const cleanName = ((child as any)?.firstName || "?").split(" (")[0];
    const sourceFamilyId = (child as any)?.sourceFamilyId || null;
    setCart([...cart, {
      creneauIds: [creneau.id],
      activityTitle: creneau.activityTitle,
      dates: new Date(creneau.date).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }),
      childId,
      childName: cleanName,
      prixBase: Math.round(priceTTC * 100) / 100,
      remiseEuros: 0,
      rang: 0,
      prixFinal: Math.round(priceTTC * 100) / 100,
      isStage: false,
      ...(sourceFamilyId ? { sourceFamilyId } : {}),
    }]);
    setSelectedCreneau(null);
    setSelectedChildren([]);
  };

  const removeFromCart = (idx: number) => setCart(cart.filter((_, i) => i !== idx));
  const cartTotal = cart.reduce((s, i) => s + i.prixFinal, 0);
  // Le panier contient-il un stage ? La clause d'annulation à 3 semaines ne
  // concerne que les stages : inutile de la faire accepter pour une balade.
  const cartHasStage = cart.some((i: any) => i.isStage === true);
  const cartTotalReductions = cart.reduce((s, i) => s + i.remiseEuros, 0);
  const ACOMPTE_PAR_ENFANT = 30;
  const nbEnfantsStage = cart.filter(i => i.isStage).length;
  const acompteFixe = Math.min(ACOMPTE_PAR_ENFANT * nbEnfantsStage, cartTotal);
  const soldeFixe = Math.round((cartTotal - acompteFixe) * 100) / 100;

  // Paiement
  const handlePay = async () => {
    if (cart.length === 0 || !family || !user) return;
    setPaying(true);
    try {
      // 1. Inscrire chaque enfant dans chaque créneau
      for (const item of cart) {
        // Pour les stages multi-jours, recharger les créneaux depuis Firestore
        // car le client peut n'avoir chargé qu'un seul mois
        const creneauIdsToEnroll = [...item.creneauIds];
        
        // Inscription sécurisée côté serveur (audit P0 #3 + #7) : valide
        // enfant↔famille, capacité (maxPlaces) et doublons en transaction.
        // Le navigateur n'écrit plus directement le tableau `enrolled`.
        const enrollRes = await authFetch("/api/enroll", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            enrollments: [{
              childId: item.childId,
              childName: item.childName,
              creneauIds: creneauIdsToEnroll,
              ...(( item as any).sourceFamilyId ? { sourceFamilyId: (item as any).sourceFamilyId } : {}),
            }],
          }),
        });
        if (!enrollRes.ok) {
          const err = await enrollRes.json().catch(() => ({} as any));
          throw new Error(err.error || "Inscription refusée (créneau complet ?)");
        }

        // Waitlist : marquer l'éventuel hold comme accepté pour chaque créneau. Non bloquant.
        for (const cid of creneauIdsToEnroll) {
          try {
            const wlSnap = await getDocs(query(
              collection(db, "waitlist"),
              where("creneauId", "==", cid),
              where("childId", "==", item.childId),
              where("familyId", "==", user.uid),
            ));
            for (const wd of wlSnap.docs) {
              const st = (wd.data() as any).status;
              if (st === "waiting" || st === "notified") {
                await updateDoc(doc(db, "waitlist", wd.id), { status: "accepted", acceptedAt: new Date().toISOString() });
              }
            }
          } catch (wlErr) { console.warn("[handlePay] maj waitlist:", wlErr); }
        }

        // Réservations — une SEULE réservation groupée pour les stages
        // (couvre tous les jours du stage), une seule pour les cours.
        if (item.isStage) {
          // Idempotence : si une réservation stage existe déjà pour ce trio
          // (familyId, childId, 1er créneau du stage), on ne duplique pas.
          const existingResa = await getDocs(query(
            collection(db, "reservations"),
            where("familyId", "==", user.uid),
            where("childId", "==", item.childId),
            where("creneauId", "==", creneauIdsToEnroll[0]),
          ));
          if (existingResa.empty) {
            // Dates de début/fin du stage à partir des créneaux
            const crDates: string[] = [];
            let startTime = "", endTime = "";
            for (const cid of creneauIdsToEnroll) {
              const crSnap = await getDoc(doc(db, "creneaux", cid));
              if (crSnap.exists()) {
                const d = crSnap.data();
                if (d.date) crDates.push(d.date);
                if (!startTime && d.startTime) startTime = d.startTime;
                if (!endTime && d.endTime) endTime = d.endTime;
              }
            }
            crDates.sort();
            await addDoc(collection(db, "reservations"), {
              familyId: user.uid, familyName: family.parentName,
              ...((item as any).sourceFamilyId ? { sourceFamilyId: (item as any).sourceFamilyId } : {}),
              childId: item.childId, childName: item.childName,
              activityTitle: item.activityTitle, activityType: "stage",
              type: "stage",
              // créneau "principal" (1er jour) + liste complète pour le détail
              creneauId: creneauIdsToEnroll[0],
              creneauIds: creneauIdsToEnroll,
              date: crDates[0] || todayLocalString(),
              dateFin: crDates[crDates.length - 1] || crDates[0] || todayLocalString(),
              nbJours: crDates.length,
              startTime, endTime,
              priceTTC: item.prixFinal,
              status: "pending_payment", source: "client",
              createdAt: serverTimestamp(),
            });
          } else {
            console.log(`[handlePay] Reservation stage deja existante, skip : ${item.childName}`);
          }
        } else {
          // Idempotence cours : meme check que pour les stages
          const existingCourseResa = await getDocs(query(
            collection(db, "reservations"),
            where("familyId", "==", user.uid),
            where("childId", "==", item.childId),
            where("creneauId", "==", item.creneauIds[0]),
          ));
          if (existingCourseResa.empty) {
            const firstCreneau = creneaux.find(c => c.id === item.creneauIds[0]);
            await addDoc(collection(db, "reservations"), {
              familyId: user.uid, familyName: family.parentName,
              ...((item as any).sourceFamilyId ? { sourceFamilyId: (item as any).sourceFamilyId } : {}),
              childId: item.childId, childName: item.childName,
              activityTitle: item.activityTitle, activityType: "cours",
              creneauId: item.creneauIds[0],
              date: firstCreneau?.date || todayLocalString(),
              startTime: firstCreneau?.startTime || "",
              endTime: firstCreneau?.endTime || "",
              priceTTC: item.prixFinal, status: "pending_payment", source: "client",
              createdAt: serverTimestamp(),
            });
          } else {
            console.log(`[handlePay] Reservation cours deja existante, skip : ${item.childName} - creneau ${item.creneauIds[0]}`);
          }
        }
      }

      // 2. Créer le paiement pending
      const paymentDocRef = await addDoc(collection(db, "payments"), {
        // Preuve d'acceptation des conditions d'annulation, horodatée.
        // Sans trace de l'acceptation AVANT paiement, la clause est
        // difficilement opposable en cas de litige.
        cgvAnnulationAcceptee: cartHasStage ? true : null,
        cgvAnnulationAccepteeAt: cartHasStage ? new Date().toISOString() : null,
        cgvVersion: cartHasStage ? "2026-07-stages-3semaines" : null,
        familyId: user.uid, familyName: family.parentName,
        familyEmail: family.parentEmail || user.email || "",
        items: cart.map(i => {
          const firstCr = creneaux.find(c => c.id === i.creneauIds[0]);
          const stageCrs = i.isStage ? i.creneauIds.map(id => creneaux.find(c => c.id === id)).filter(Boolean) : [];
          return {
            activityTitle: `${i.activityTitle} — ${i.childName}${i.remiseEuros > 0 ? ` (-${i.remiseEuros}€)` : ""}`,
            childId: i.childId,
            childName: i.childName,
            creneauId: i.creneauIds[0],
            creneauIds: i.isStage ? i.creneauIds : null,
            stageKey: i.isStage ? `${i.activityTitle}_${i.dates}` : null,
            activityType: i.isStage ? "stage" : "cours",
            stageSchedule: i.isStage ? (formatStageSchedule(stageCrs as any) ?? null) : null,
            stageDates: i.isStage ? stageCrs.map((c: any) => ({ date: c.date, startTime: c.startTime, endTime: c.endTime })) : null,
            priceHT: i.prixFinal / 1.055, tva: 5.5, priceTTC: i.prixFinal,
            // Prix plein (avant degressivite) : sert au recalcul des rangs si
            // un enfant est supprime de la commande plus tard (admin > Modifier).
            // Sans ce champ, on ne peut pas recalculer correctement le tarif
            // des enfants restants qui remontent en rang.
            originalPriceTTC: i.prixBase || i.prixFinal,
            date: firstCr?.date || null,
            startTime: firstCr?.startTime || null,
            endTime: firstCr?.endTime || null,
            monitor: firstCr?.monitor || null,
          };
        }),
        totalTTC: cartTotal,
        paymentMode: "", paymentRef: "",
        status: "pending", paidAmount: 0,
        source: "client",
        date: serverTimestamp(),
      });
      const newPaymentId = paymentDocRef.id;

      // NB : plus d'email de confirmation envoyé depuis le client.
      // La confirmation (unique) part du SERVEUR après le paiement — route
      // /api/cawl/status ou /api/cawl/webhook, template confirmationStageAcompte.
      // L'ancien appel client à /api/send-email (route adminOnly) renvoyait 403
      // et exposait un envoi d'email HTML arbitraire depuis le navigateur.

      const hasStage = cart.some(i => i.isStage);
      const isDeposit = hasStage && depositMode === "deposit";
      const firstStageCreneau = hasStage ? creneaux.find(c => c.id === cart.find(i => i.isStage)?.creneauIds[0]) : null;
      const stageDate = firstStageCreneau?.date || "";
      
      // Stocker les infos stage/acompte dans le paiement
      if (hasStage) {
        await updateDoc(doc(db, "payments", newPaymentId), {
          stageDate: stageDate,
          stageTitle: cart.find(i => i.isStage)?.activityTitle || "",
          acompteAmount: acompteFixe,
          soldeAmount: soldeFixe,
        });
      }

      try {
        const res = await authFetch("/api/cawl/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            familyId: user.uid,
            familyEmail: family.parentEmail || user.email,
            familyName: family.parentName,
            paymentId: newPaymentId,
            totalTTC: isDeposit ? acompteFixe : cartTotal,
            depositPercent: isDeposit ? Math.round(acompteFixe / cartTotal * 100) : null,
            stageDate,
            items: cart.map(i => ({
              name: `${i.activityTitle} — ${i.childName}`,
              description: i.dates || null,
              priceInCents: Math.round(i.prixFinal * 100),
              quantity: 1,
            })),
          }),
        });
        const data = await res.json();
        if (data.url) {
          // Redirection immédiate vers CAWL — pas de setCart ici pour éviter le message "panier vide"
          window.location.href = data.url;
          return;
        }
      } catch (cawlErr) {
        console.error("CAWL checkout (non-bloquant):", cawlErr);
      }
      setCart([]);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 5000);
    } catch (e: any) {
      console.error("[handlePay] Erreur complete:", e);
      // Afficher un message d'erreur explicite plutot que generique
      const errMsg = e?.message || e?.code || String(e) || "Erreur inconnue";
      alert(`❌ Erreur lors du paiement :\n\n${errMsg}\n\nDétails dans la console (F12).`);
    }
    setPaying(false);
  };

  // ── Hold liste d'attente (place réservée 24h) ──
  // Un hold est actif s'il n'est pas expiré ET que l'enfant concerné n'est pas
  // encore inscrit (dès qu'il s'inscrit, le hold devient sans objet).
  const holdActive = (c: any) => {
    const h = c?.waitlistHold;
    if (!h?.until) return false;
    if (new Date(h.until).getTime() < Date.now()) return false;
    if ((c.enrolled || []).some((e: any) => e.childId === h.childId)) return false;
    return true;
  };

  // Places visibles : la place sous hold est masquée pour les autres familles,
  // mais reste disponible pour la famille notifiée (elle peut réserver).
  const spotsLeft = (c: Creneau) => {
    const base = c.maxPlaces - (c.enrolled?.length || 0);
    if (holdActive(c) && (c as any).waitlistHold?.familyId !== familyId) return Math.max(0, base - 1);
    return base;
  };

  const addToWaitlist = async (c: Creneau, childId: string) => {
    if (!user || !family) return;
    const childObj = children.find((ch: any) => ch.id === childId) as any;
    const childName = childObj?.lastName ? `${childObj.firstName} ${childObj.lastName}` : childObj?.firstName || "Cavalier";
    setWaitlistLoading(c.id);
    try {
      // Vérifier si déjà en attente
      const existing = await getDocs(query(
        collection(db, "waitlist"),
        where("creneauId", "==", c.id),
        where("childId", "==", childId),
        where("familyId", "==", user.uid)
      ));
      if (!existing.empty) {
        toast("Vous êtes déjà en liste d'attente pour ce créneau.", "warning");
        setWaitlistLoading(null); return;
      }
      await addDoc(collection(db, "waitlist"), {
        creneauId: c.id,
        activityTitle: c.activityTitle,
        activityType: c.activityType,
        date: c.date,
        startTime: c.startTime,
        endTime: c.endTime,
        monitor: c.monitor,
        familyId: user.uid,
        familyName: family.parentName,
        familyEmail: family.parentEmail || user.email || "",
        childId,
        childName,
        status: "waiting",
        position: existing.size + 1,
        createdAt: serverTimestamp(),
      });
      setWaitlistSuccess(c.id);
      setTimeout(() => setWaitlistSuccess(null), 4000);
    } catch (e) { console.error(e); toast("Erreur. Réessayez.", "error"); }
    setWaitlistLoading(null);
  };

  // ── Liste d'attente STAGE : UNE seule entrée pour toute la semaine ──────
  // Une famille veut la semaine, pas le mardi : on ne crée donc pas 5 entrées.
  // `creneauId` reste le PREMIER jour pour rester compatible avec les écrans
  // admin existants (qui interrogent waitlist par creneauId), et `creneauIds`
  // porte tous les jours pour qu'une place libérée n'importe quel jour puisse
  // retrouver l'entrée.
  const addStageToWaitlist = async (stageCreneaux: Creneau[], childId: string) => {
    if (!user || !family || stageCreneaux.length === 0) return;
    const jours = [...stageCreneaux].sort((a, b) => a.date.localeCompare(b.date));
    const first = jours[0];
    const last = jours[jours.length - 1];
    const childObj = children.find((c: any) => c.id === childId);
    const childName = childObj?.lastName ? `${childObj.firstName} ${childObj.lastName}` : childObj?.firstName || "Cavalier";
    setWaitlistLoading(first.id);
    try {
      // Doublon : même trio de champs que pour les cours, afin de réutiliser
      // l'index composite existant (pas de nouvel index Firestore à déployer).
      const existing = await getDocs(query(
        collection(db, "waitlist"),
        where("creneauId", "==", first.id),
        where("childId", "==", childId),
        where("familyId", "==", user.uid)
      ));
      if (!existing.empty) {
        toast("Vous êtes déjà en liste d'attente pour ce stage.", "warning");
        setWaitlistLoading(null); return;
      }
      await addDoc(collection(db, "waitlist"), {
        isStage: true,
        stageKey: `${first.activityTitle}_${first.date}`,
        creneauId: first.id,
        creneauIds: jours.map(c => c.id),
        activityTitle: first.activityTitle,
        activityType: first.activityType,
        date: first.date,
        dateFin: last.date,
        nbJours: jours.length,
        startTime: first.startTime,
        endTime: first.endTime,
        monitor: first.monitor,
        familyId: user.uid,
        familyName: family.parentName,
        familyEmail: family.parentEmail || user.email || "",
        childId,
        childName,
        status: "waiting",
        position: existing.size + 1,
        createdAt: serverTimestamp(),
      });
      setWaitlistSuccess(first.id);
      setTimeout(() => setWaitlistSuccess(null), 4000);
    } catch (e) { console.error(e); toast("Erreur. Réessayez.", "error"); }
    setWaitlistLoading(null);
  };

  // Pas connecté
  if (!user) return (
    <div className="text-center py-20">
      <Card padding="lg">
        <p className="font-body text-sm text-gray-600">Connectez-vous pour accéder aux réservations.</p>
      </Card>
    </div>
  );

  // Connecté mais pas de fiche famille (nouveau compte)
  if (!family) return (
    <div className="flex flex-col items-center justify-center py-16 px-4">
      <div className="text-5xl mb-4">🐴</div>
      <h2 className="font-display text-xl font-bold text-blue-800 mb-2 text-center">
        Bienvenue au centre équestre !
      </h2>
      <p className="font-body text-sm text-gray-500 text-center mb-6 max-w-xs">
        Votre compte est créé. Il ne reste plus qu&apos;à compléter votre profil
        (coordonnées + cavaliers) pour pouvoir réserver.
      </p>
      <a href="/espace-cavalier/profil">
        <button className="font-body text-sm font-semibold text-white bg-blue-500 px-6 py-3 rounded-xl border-none cursor-pointer hover:bg-blue-400 transition-colors">
          Compléter mon profil →
        </button>
      </a>
      <p className="font-body text-xs text-gray-400 mt-4 text-center">
        Si vous avez déjà un dossier au centre, contactez-nous pour lier votre compte.
      </p>
    </div>
  );

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-blue-800">
            {filter === "balade" ? "Promenades" : "Réserver"}
          </h1>
          <p className="font-body text-xs text-gray-600">
            {filter === "balade" ? "Balades et promenades à cheval" : "Stages, cours ponctuels et activités"}
          </p>
        </div>
        <button onClick={async () => {
          setShowCart(true); setCartPaySuccess(false); setCartPayMode("cb");
          // Charger les avoirs de la famille
          if (user?.uid) {
            try {
              const aSnap = await getDocs(query(collection(db, "avoirs"), where("familyId", "==", user.uid)));
              setFamilyAvoirs(aSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter((a: any) => a.status === "actif" && (a.remainingAmount || 0) > 0));
            } catch { setFamilyAvoirs([]); }
          }
        }} className="relative flex items-center gap-2 font-body text-sm font-semibold text-white bg-blue-500 px-4 py-2.5 rounded-lg border-none cursor-pointer hover:bg-blue-600">
          <ShoppingCart size={16} /> Panier
          {cart.length > 0 && <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center">{cart.length}</span>}
        </button>
      </div>

      {success && <Card padding="md" className="mb-4 bg-green-50 border-green-200"><p className="font-body text-sm text-green-700"><Check size={16} className="inline mr-1" /> Inscription confirmée ! Rendez-vous au centre équestre.</p></Card>}

      {/* ── Switcher Timeline / Liste ── */}
      {filter === "all" && (
        <div className="flex bg-sand rounded-xl p-1 mb-5">
          <button onClick={() => setViewMode("timeline")}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg font-body text-sm font-semibold border-none cursor-pointer transition-all ${viewMode === "timeline" ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 bg-transparent"}`}>
            <CalendarDays size={15}/> Planning
          </button>
          <button onClick={() => setViewMode("liste")}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg font-body text-sm font-semibold border-none cursor-pointer transition-all ${viewMode === "liste" ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 bg-transparent"}`}>
            <LayoutList size={15}/> Liste
          </button>
        </div>
      )}

      {/* ── VUE TIMELINE ── */}
      {viewMode === "timeline" && filter === "all" && (<>
        {/* Bandeau stages */}
        {Object.keys(stageGroups).length > 0 && (
          <div className="mb-5 bg-green-600 rounded-2xl px-5 py-4 cursor-pointer hover:bg-green-700 transition-colors shadow-sm"
            onClick={() => setViewMode("liste")}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center text-xl flex-shrink-0">🏇</div>
                <div>
                  <div className="font-body text-base font-bold text-white">
                    {Object.keys(stageGroups).length} stage{Object.keys(stageGroups).length > 1 ? "s" : ""} disponible{Object.keys(stageGroups).length > 1 ? "s" : ""}
                  </div>
                  <div className="font-body text-xs text-green-100 mt-0.5">Inscriptions semaine ou à la journée</div>
                </div>
              </div>
              <div className="flex items-center gap-1.5 bg-white text-green-700 font-body text-sm font-bold px-4 py-2 rounded-xl flex-shrink-0">
                Voir <span className="text-base">→</span>
              </div>
            </div>
          </div>
        )}
        <TimelineReservation
          creneaux={creneaux.filter(c => c.activityType !== "stage" && c.activityType !== "stage_journee")}
          children={(family?.children || []).map((c: any) => ({ id: c.id, firstName: c.firstName, galopLevel: c.galopLevel }))}
          familyId={familyId}
          onBook={(creneau) => { setBookingCreneau(creneau as any); }}
          stagesAvailable={Object.keys(stageGroups).length}
          onSeeStages={() => setViewMode("liste")}
        />
      </>)}

      {/* ── VUE LISTE ── */}
      {(viewMode === "liste" || filter !== "all") && (<>

      {/* Filtres catégorie — masqués uniquement si le filtre est imposé par
          l'URL (?filter=stage). Tester l'état courant (filter) au lieu du
          filtre initial faisait disparaître la rangée dès le premier clic :
          impossible de revenir à "Tout". */}
      {initialFilter === "all" && (
        <div className="flex flex-wrap gap-2 mb-2">
          {[
            ["all", "Tout"],
            ["stage", "Stages semaine"],
            ["stage_journee", "Stages journée"],
            ["cours", "Cours"],
            ["competition", "Compétitions"],
            ["anniversaire", "Anniversaires"],
          ].map(([id, label]) => (
            <button key={id} onClick={() => setFilterAndReset(id)}
              className={`px-3 py-1.5 rounded-lg border font-body text-xs font-semibold cursor-pointer transition-all ${filter === id ? "bg-blue-500 text-white border-blue-500" : "bg-white text-slate-600 border-gray-200"}`}>
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Filtres sous-catégorie */}
      {availableSubcats.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4 pl-1">
          <button onClick={() => setSubfilter("all")}
            className={`px-3 py-1 rounded-full border font-body text-xs cursor-pointer transition-all ${subfilter === "all" ? "bg-gold-400 text-blue-800 border-gold-400 font-semibold" : "bg-white text-slate-600 border-gray-200"}`}>
            {filter === "balade" ? "Toutes les promenades" : "Tous niveaux"}
          </button>
          {availableSubcats.map(s => (
            <button key={s} onClick={() => setSubfilter(s)}
              className={`px-3 py-1 rounded-full border font-body text-xs cursor-pointer transition-all ${subfilter === s ? "bg-gold-400 text-blue-800 border-gold-400 font-semibold" : "bg-white text-slate-600 border-gray-200"}`}>
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Navigation par mois */}
      <div className="flex flex-col gap-2 mb-5">
        <div className="flex items-center justify-between">
          <button onClick={() => setMonthOffset(m => Math.max(0, m - 1))}
            className="flex items-center gap-1 font-body text-sm text-gray-600 bg-white px-3 py-2 rounded-lg border border-gray-200 cursor-pointer">
            <ChevronLeft size={16}/>
          </button>
          <div className="font-body text-base font-semibold text-blue-800 capitalize">{monthLabel}</div>
          <button onClick={() => setMonthOffset(m => m + 1)}
            className="flex items-center gap-1 font-body text-sm text-gray-600 bg-white px-3 py-2 rounded-lg border border-gray-200 cursor-pointer">
            <ChevronRight size={16}/>
          </button>
        </div>
        {/* Raccourcis mois rapides */}
        <div className="flex gap-1.5 flex-wrap">
          {[0, 1, 2, 3, 4, 5].map(offset => {
            const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + offset);
            const label = d.toLocaleDateString("fr-FR", { month: "short" });
            return (
              <button key={offset} onClick={() => setMonthOffset(offset)}
                className={`font-body text-xs px-3 py-1.5 rounded-full border cursor-pointer capitalize transition-all
                  ${monthOffset === offset ? "bg-blue-500 text-white border-blue-500 font-semibold" : "bg-white text-gray-600 border-gray-200 hover:border-blue-300"}`}>
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {loading ? <div className="text-center py-16"><Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto" /></div> : (
        <div className="flex flex-col gap-6">
          {/* STAGES */}
          {(filter === "all" || filter === "stage") && Object.entries(stageGroups).length > 0 && (
            <div>
              <h2 className="font-display text-lg font-bold text-green-700 mb-3">Stages</h2>
              <div className="flex flex-col gap-3">
                {(() => {
                  // Tri chronologique par premier jour du stage, puis intercalage
                  // d'un en-tête à chaque changement de semaine ("Semaine du ... au ...").
                  const sorted = Object.entries(stageGroups).sort(([, a], [, b]) => {
                    const da = [...a].map(c => c.date).sort()[0] || "";
                    const db2 = [...b].map(c => c.date).sort()[0] || "";
                    return da.localeCompare(db2);
                  });
                  let prevMonday = "";
                  return sorted.map(([key, stageCreneaux]) => {
                  // Lundi de la semaine = suffixe de la clé du groupe (YYYY-MM-DD)
                  const monday = key.slice(-10);
                  const showWeekHeader = monday !== prevMonday;
                  prevMonday = monday;
                  const weekLabel = (() => {
                    const mon = new Date(monday + "T12:00:00");
                    const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
                    const f = (d: Date, withMonth: boolean) => d.toLocaleDateString("fr-FR", withMonth ? { day: "numeric", month: "long" } : { day: "numeric" });
                    const sameMonth = mon.getMonth() === sun.getMonth();
                    return `Semaine du ${f(mon, !sameMonth)} au ${f(sun, true)}`;
                  })();
                  const first = stageCreneaux[0];
                  const prix = (first as any).priceTTC || first.priceHT * (1 + (first.tvaTaux || 5.5) / 100);
                  const spots = Math.min(...stageCreneaux.map(spotsLeft));
                  const joursUniques = [...new Map(stageCreneaux.map(c => [c.date, c])).values()]
                    .sort((a, b) => a.date.localeCompare(b.date));
                  // Affichage clair AVEC le mois. Si le stage couvre plusieurs
                  // jours, on montre la plage "du lun. 6 au ven. 10 juillet" ;
                  // sinon le jour seul avec son mois.
                  const jours = (() => {
                    if (joursUniques.length === 0) return "";
                    const fmt = (d: string, withMonth = true) =>
                      new Date(d).toLocaleDateString("fr-FR", withMonth
                        ? { weekday: "short", day: "numeric", month: "short" }
                        : { weekday: "short", day: "numeric" });
                    if (joursUniques.length === 1) return fmt(joursUniques[0].date);
                    const premier = joursUniques[0].date;
                    const dernier = joursUniques[joursUniques.length - 1].date;
                    return `du ${fmt(premier, false)} au ${fmt(dernier)}`;
                  })();
                  const isSelected = selectedCreneau?.id === first.id;

                  return (
                    <div key={key} className="flex flex-col gap-3">
                      {showWeekHeader && (
                        <div className="font-body text-xs font-bold uppercase tracking-wider text-slate-500 mt-2 first:mt-0">
                          📅 {weekLabel}
                        </div>
                      )}
                    <Card padding="md" className={isSelected ? "ring-2 ring-green-500" : ""}>
                      <div className="flex justify-between items-start cursor-pointer" onClick={() => { setSelectedCreneau(isSelected ? null : first); setSelectedChildren([]); setStageBookingMode("semaine"); setSelectedDays([]); }}>
                        <div>
                          <div className="font-body text-base font-semibold text-blue-800">{first.activityTitle}</div>
                          <div className="font-body text-xs text-gray-600 mt-1">
                            <Calendar size={12} className="inline mr-1" />{jours}
                            <span className="ml-3"><Users size={12} className="inline mr-1" />{first.monitor}</span>
                          </div>
                          {/* Horaires — par jour si les horaires varient */}
                          {(() => {
                            const horairesUniques = [...new Set(stageCreneaux.map(c => `${c.startTime}–${c.endTime}`))];
                            if (horairesUniques.length === 1) {
                              // Tous les jours au même horaire → une seule ligne
                              return (
                                <div className="font-body text-xs text-gray-600 mt-0.5">
                                  <Clock size={12} className="inline mr-1" />{horairesUniques[0]}
                                </div>
                              );
                            }
                            // Horaires variés → grouper par date et afficher proprement
                            // Regrouper les créneaux par date
                            const parDate: Record<string, Creneau[]> = {};
                            stageCreneaux.forEach(c => {
                              if (!parDate[c.date]) parDate[c.date] = [];
                              parDate[c.date].push(c);
                            });
                            return (
                              <div className="mt-1.5 flex flex-col gap-0.5">
                                {Object.entries(parDate).sort(([a],[b])=>a.localeCompare(b)).map(([date, cs]) => {
                                  const jourLabel = new Date(date).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
                                  const horaires = cs.map(c => `${c.startTime}–${c.endTime}`).join(" + ");
                                  return (
                                    <div key={date} className="font-body text-xs text-gray-600 flex items-center gap-1.5">
                                      <span className="font-semibold text-slate-600 w-24 flex-shrink-0">{jourLabel}</span>
                                      <Clock size={10} className="text-gray-600 flex-shrink-0"/>
                                      <span>{horaires}</span>
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          })()}
                        </div>
                        <div className="text-right">
                          <div className="font-body text-lg font-bold text-green-600">{prix.toFixed(0)}€</div>
                          <div className="font-body text-xs text-gray-600">
                            {joursUniques.length} {(() => {
                              const dur = parseInt(first.endTime) - parseInt(first.startTime);
                              return dur <= 4 ? "demi-journée" : "journée";
                            })()}{joursUniques.length > 1 ? "s" : ""}
                          </div>
                          <div className="font-body text-xs text-gray-500">{first.startTime}–{first.endTime}</div>
                          <Badge color={spots > 2 ? "green" : spots > 0 ? "orange" : "red"}>{spots > 0 ? `${spots} place${spots > 1 ? "s" : ""}` : "Complet"}</Badge>
                        </div>
                      </div>

                      {/* Bouton détail dépliable */}
                      {(() => {
                        const act = activities.find((a: any) => a.id === first.activityId);
                        const desc = act?.description?.trim();
                        if (!desc) return null;
                        const isOpen = expandedStageDetail === key;
                        return (
                          <div className="mt-2">
                            <button
                              onClick={e => { e.stopPropagation(); setExpandedStageDetail(isOpen ? null : key); }}
                              className="flex items-center gap-1.5 font-body text-xs text-green-700 font-semibold bg-transparent border-none cursor-pointer px-0 py-1 hover:text-green-900"
                            >
                              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 2a5 5 0 100 10A5 5 0 007 2zm0 2.5a.75.75 0 110 1.5.75.75 0 010-1.5zM6.25 6.5h1.5v3h-1.5v-3z" fill="currentColor"/></svg>
                              {isOpen ? "Masquer le détail" : "Voir le détail du stage"}
                            </button>
                            {isOpen && (
                              <div className="mt-2 p-3 bg-green-50 rounded-xl border border-green-100">
                                <p className="font-body text-xs text-gray-700 leading-relaxed whitespace-pre-line">{desc}</p>
                              </div>
                            )}
                          </div>
                        );
                      })()}

                      {/* Sélection enfants pour ce stage */}
                      {/* Stage complet — liste d'attente (UNE entrée pour la semaine) */}
                      {isSelected && spots === 0 && (
                        <div className="mt-4 pt-4 border-t border-orange-100">
                          {waitlistSuccess === joursUniques[0]?.id ? (
                            <div className="flex items-center gap-2 text-green-600 font-body text-xs">
                              <Check size={14} /> Inscrit en liste d&apos;attente ! Vous serez notifié par email si une place se libère.
                            </div>
                          ) : (
                            <>
                              <div className="font-body text-xs text-orange-600 mb-2">
                                🔔 Ce stage est complet. Inscrivez-vous en liste d&apos;attente pour la semaine :
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {children.filter((ch: any) => !(first.enrolled || []).some((e: any) => e.childId === ch.id)).map((ch: any) => (
                                  <button key={ch.id}
                                    onClick={(e) => { e.stopPropagation(); addStageToWaitlist(stageCreneaux, ch.id); }}
                                    disabled={waitlistLoading === joursUniques[0]?.id}
                                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-orange-200 bg-orange-50 font-body text-xs text-orange-700 cursor-pointer hover:bg-orange-100 disabled:opacity-50">
                                    {waitlistLoading === joursUniques[0]?.id ? <Loader2 size={12} className="animate-spin" /> : "🔔"} {ch.firstName}
                                  </button>
                                ))}
                              </div>
                            </>
                          )}
                        </div>
                      )}

                      {isSelected && spots > 0 && (() => {
                        // Jours REELLEMENT ouverts à la journée. L'option se règle
                        // créneau par créneau dans l'admin : un `some()` sur la
                        // semaine ouvrait le mode journée dès qu'UN jour l'autorisait,
                        // et le sélecteur proposait ensuite les 5 jours — dont ceux
                        // vendus uniquement à la semaine.
                        const joursJournee = joursUniques.filter((c: any) => c.allowDayBooking);
                        const allowDay = joursJournee.length > 0;
                        const prixJour = (first as any).priceTTCDay || (stageCreneaux.find((c: any) => (c as any).priceTTCDay) as any)?.priceTTCDay || Math.round(prix / joursUniques.length * 100) / 100;
                        return (
                        <div className="mt-4 pt-4 border-t border-green-200">
                          {/* Choix mode si autorisé */}
                          {allowDay && (
                            <div className="mb-3">
                              <div className="font-body text-xs font-semibold text-green-700 mb-2">Mode d'inscription :</div>
                              <div className="flex gap-2">
                                <button onClick={(e) => { e.stopPropagation(); setStageBookingMode("semaine"); setSelectedDays([]); }}
                                  className={`flex-1 py-2 rounded-lg font-body text-sm font-semibold border cursor-pointer ${stageBookingMode === "semaine" ? "bg-green-600 text-white border-green-600" : "bg-white text-gray-600 border-gray-200"}`}>
                                  Semaine complète ({prix.toFixed(0)}€)
                                </button>
                                <button onClick={(e) => { e.stopPropagation(); setStageBookingMode("jour"); }}
                                  className={`flex-1 py-2 rounded-lg font-body text-sm font-semibold border cursor-pointer ${stageBookingMode === "jour" ? "bg-green-600 text-white border-green-600" : "bg-white text-gray-600 border-gray-200"}`}>
                                  À la journée ({prixJour.toFixed(0)}€/j)
                                </button>
                              </div>
                            </div>
                          )}

                          {/* Sélection des jours si mode jour */}
                          {allowDay && stageBookingMode === "jour" && (
                            <div className="mb-3">
                              <div className="font-body text-xs font-semibold text-green-700 mb-2">
                                Choisissez vos jours :
                                {joursJournee.length < joursUniques.length && (
                                  <span className="ml-1 font-normal text-gray-500">
                                    (seuls certains jours sont proposés à l&apos;unité)
                                  </span>
                                )}
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {joursJournee.map(c => {
                                  const dayLabel = new Date(c.date).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
                                  const sel = selectedDays.includes(c.id);
                                  const daySpots = spotsLeft(c);
                                  return (
                                    <button key={c.id} disabled={daySpots <= 0} onClick={(e) => { e.stopPropagation(); setSelectedDays(sel ? selectedDays.filter(x => x !== c.id) : [...selectedDays, c.id]); }}
                                      className={`px-3 py-2 rounded-lg border font-body text-sm cursor-pointer transition-all ${daySpots <= 0 ? "opacity-40 cursor-not-allowed bg-gray-100 border-gray-200 text-gray-400" : sel ? "bg-green-600 text-white border-green-600" : "bg-white text-gray-600 border-gray-200 hover:border-green-400"}`}>
                                      {sel ? <Check size={12} className="inline mr-1" /> : null}{dayLabel}
                                      {daySpots <= 2 && daySpots > 0 && <span className="text-xs ml-1 text-orange-500">({daySpots} pl.)</span>}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          <div className="font-body text-xs font-semibold text-green-700 mb-2">Inscrire vos enfants :</div>
                          <div className="flex flex-wrap gap-2 mb-3">
                            {children.filter((c: any) => !(first.enrolled || []).some((e: any) => e.childId === c.id)).map((c: any) => {
                              const sel = selectedChildren.includes(c.id);
                              return (
                                <button key={c.id} onClick={(e) => { e.stopPropagation(); setSelectedChildren(sel ? selectedChildren.filter(x => x !== c.id) : [...selectedChildren, c.id]); }}
                                  className={`flex items-center gap-2 px-4 py-2 rounded-lg border font-body text-sm cursor-pointer ${sel ? "bg-green-600 text-white border-green-600" : "bg-white text-gray-600 border-gray-200"}`}>
                                  {sel ? <Check size={14} /> : <Users size={14} />} {c.firstName}
                                </button>
                              );
                            })}
                          </div>
                          {/* Récap avec réductions */}
                          {selectedChildren.length > 0 && (() => {
                            const isJourMode = allowDay && stageBookingMode === "jour";
                            const prixEffectif = isJourMode ? prixJour * selectedDays.length : prix;
                            const creneauxToBook = isJourMode ? stageCreneaux.filter(c => selectedDays.includes(c.id)) : stageCreneaux;
                            const nbJours = isJourMode ? selectedDays.length : joursUniques.length;
                            return (
                            <>
                            <div className="bg-green-50 rounded-lg p-3 mb-3">
                              {isJourMode && selectedDays.length === 0 && (
                                <p className="font-body text-xs text-orange-600">Sélectionnez au moins un jour</p>
                              )}
                              {(isJourMode ? selectedDays.length > 0 : true) && selectedChildren.map((childId, idx) => {
                                const child = children.find((c: any) => c.id === childId);
                                const rang = existingStageCount + idx;
                                // Mode JOUR : prix jour brut, AUCUNE remise, AUCUN plancher.
                                // Mode SEMAINE : remise dégressive + plancher.
                                // (strictement aligné sur addStageToCart pour éviter tout
                                //  écart entre l'affichage du récap et le prix réel du panier)
                                let prixFinal: number;
                                let remise: number;
                                if (isJourMode) {
                                  remise = 0;
                                  prixFinal = Math.max(0, Math.round(prixEffectif * 100) / 100);
                                } else {
                                  const remiseSemaine = rang === 0 ? 0 : rang === 1 ? 10 : rang === 2 ? 20 : 20 + (rang - 2) * 10;
                                  remise = remiseSemaine;
                                  prixFinal = Math.max(0, Math.round((prixEffectif - remiseSemaine) * 100) / 100);
                                  if (prixPlancherStage > 0 && prixFinal < prixPlancherStage) {
                                    prixFinal = prixPlancherStage;
                                    remise = Math.max(0, Math.round((prixEffectif - prixPlancherStage) * 100) / 100);
                                  }
                                }
                                return (
                                  <div key={childId} className="flex justify-between font-body text-sm py-1">
                                    <div className="flex items-center gap-2">
                                      <span className="text-blue-800 font-semibold">{(child as any)?.firstName}</span>
                                      {isJourMode && <span className="text-green-600 text-xs">{nbJours}j × {prixJour.toFixed(0)}€</span>}
                                      {remise > 0 && <span className="text-green-600 text-xs">-{remise.toFixed(0)}€</span>}
                                    </div>
                                    <span className="font-bold text-green-600">{prixFinal.toFixed(0)}€</span>
                                  </div>
                                );
                              })}
                            </div>
                            {(!isJourMode || selectedDays.length > 0) && (
                              <button onClick={(e) => {
                                e.stopPropagation();
                                if (isJourMode) {
                                  // Mode jour : inscrire uniquement les jours sélectionnés.
                                  // On passe le prix d'un jour et le nombre TOTAL de
                                  // jours du stage pour un prorata correct.
                                  addStageToCart(creneauxToBook, prixJour, joursUniques.length);
                                } else {
                                  addStageToCart(stageCreneaux);
                                }
                              }}
                                className="w-full py-2.5 rounded-lg font-body text-sm font-semibold text-white bg-green-600 border-none cursor-pointer hover:bg-green-500">
                                Ajouter au panier ({selectedChildren.length} enfant{selectedChildren.length > 1 ? "s" : ""}{isJourMode ? ` · ${nbJours} jour${nbJours > 1 ? "s" : ""}` : ""})
                              </button>
                            )}
                            </>
                          );})()}
                        </div>
                      );})()}
                    </Card>
                    </div>
                  );
                });})()}
              </div>
            </div>
          )}

          {/* COURS / BALADES */}
          {(filter === "all" || filter === "cours" || filter === "balade") && Object.entries(coursByDate).length > 0 && (
            <div>
              <h2 className="font-display text-lg font-bold text-blue-800 mb-3">Cours & activités</h2>
              {Object.entries(coursByDate).sort(([a], [b]) => a.localeCompare(b)).map(([date, cs]) => (
                <div key={date} className="mb-4">
                  <div className="font-body text-xs font-semibold text-gray-600 uppercase mb-2">{new Date(date).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}</div>
                  <div className="flex flex-col gap-2">
                    {cs.map(c => {
                      const prix = (c as any).priceTTC || c.priceHT * (1 + (c.tvaTaux || 5.5) / 100);
                      const spots = spotsLeft(c);
                      const tl = typeLabels[c.activityType] || { label: c.activityType, color: "#666" };
                      const isSelected = selectedCreneau?.id === c.id;
                      return (
                        <Card key={c.id} padding="sm" className={`cursor-pointer ${isSelected ? "ring-2 ring-blue-500" : ""} ${spots === 0 ? "opacity-80" : ""}`} onClick={() => { if (spots > 0) { setSelectedCreneau(isSelected ? null : c); setSelectedChildren([]); } else { setSelectedCreneau(isSelected ? null : c); } }}>
                          <div className="flex justify-between items-center">
                            <div className="flex items-center gap-3">
                              <div className="w-1 h-10 rounded-full" style={{ backgroundColor: tl.color }} />
                              <div>
                                <div className="font-body text-sm font-semibold text-blue-800">{c.activityTitle}</div>
                                <div className="font-body text-xs text-slate-600">{c.startTime}–{c.endTime} · {c.monitor}</div>
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="font-body text-sm font-bold text-blue-500">{prix.toFixed(0)}€</div>
                              <Badge color={spots > 2 ? "green" : spots > 0 ? "orange" : "red"}>
                                {spots > 0 ? `${spots} pl.` : "Complet"}
                              </Badge>
                            </div>
                          </div>

                          {/* Créneau disponible — sélection enfant */}
                          {isSelected && spots > 0 && (
                            <div className="mt-3 pt-3 border-t border-blue-100">
                              <div className="font-body text-xs text-slate-600 mb-2">Pour quel enfant ?</div>
                              <div className="flex flex-wrap gap-2">
                                {children.filter((ch: any) => !(c.enrolled || []).some((e: any) => e.childId === ch.id)).map((ch: any) => {
                                  // Règle : 12 ans minimum pour les promenades (année des 12 ans)
                                  let tooYoung = false;
                                  if (c.activityType === "balade") {
                                    const bd: any = ch.birthDate;
                                    const bdDate = bd?.seconds ? new Date(bd.seconds * 1000) : (bd ? new Date(bd) : null);
                                    if (!bdDate || isNaN(bdDate.getTime())) tooYoung = true; // date absente → bloqué
                                    else if (bdDate.getFullYear() > new Date().getFullYear() - 12) tooYoung = true;
                                  }
                                  return (
                                    <button key={ch.id}
                                      onClick={(e) => { e.stopPropagation(); addCoursToCart(c, ch.id); }}
                                      disabled={tooYoung}
                                      title={tooYoung ? "Promenades réservées aux 12 ans et plus" : undefined}
                                      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border font-body text-xs cursor-pointer ${
                                        tooYoung
                                          ? "border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed line-through"
                                          : "border-blue-200 bg-blue-50 text-blue-800 hover:bg-blue-100"
                                      }`}>
                                      <Users size={12} /> {ch.firstName}
                                      {tooYoung && <span className="ml-1">🔒</span>}
                                    </button>
                                  );
                                })}
                                {/* Message si tous les enfants sont trop jeunes pour cette balade */}
                                {c.activityType === "balade" && children.filter((ch: any) => !(c.enrolled || []).some((e: any) => e.childId === ch.id)).length > 0 && children.filter((ch: any) => !(c.enrolled || []).some((e: any) => e.childId === ch.id)).every((ch: any) => {
                                  const bd: any = ch.birthDate;
                                  const bdDate = bd?.seconds ? new Date(bd.seconds * 1000) : (bd ? new Date(bd) : null);
                                  if (!bdDate || isNaN(bdDate.getTime())) return true;
                                  return bdDate.getFullYear() > new Date().getFullYear() - 12;
                                }) && (
                                  <div className="w-full mt-1 font-body text-[11px] text-orange-700 bg-orange-50 border border-orange-200 rounded-lg px-2 py-1.5">
                                    ⚠️ Les promenades sont réservées aux cavaliers de 12 ans et plus (nés en {new Date().getFullYear() - 12} ou avant).
                                  </div>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Créneau complet — liste d'attente */}
                          {isSelected && spots === 0 && (
                            <div className="mt-3 pt-3 border-t border-orange-100">
                              {waitlistSuccess === c.id ? (
                                <div className="flex items-center gap-2 text-green-600 font-body text-xs">
                                  <Check size={14} /> Inscrit en liste d&apos;attente ! Vous serez notifié par email si une place se libère.
                                </div>
                              ) : (
                                <>
                                  <div className="font-body text-xs text-orange-600 mb-2">
                                    🔔 Ce créneau est complet. Inscrivez-vous en liste d&apos;attente :
                                  </div>
                                  <div className="flex flex-wrap gap-2">
                                    {children.filter((ch: any) => !(c.enrolled || []).some((e: any) => e.childId === ch.id)).map((ch: any) => (
                                      <button key={ch.id}
                                        onClick={(e) => { e.stopPropagation(); addToWaitlist(c, ch.id); }}
                                        disabled={waitlistLoading === c.id}
                                        className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-orange-200 bg-orange-50 font-body text-xs text-orange-700 cursor-pointer hover:bg-orange-100 disabled:opacity-50">
                                        {waitlistLoading === c.id ? <Loader2 size={12} className="animate-spin" /> : "🔔"} {ch.firstName}
                                      </button>
                                    ))}
                                  </div>
                                </>
                              )}
                            </div>
                          )}
                        </Card>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {available.length === 0 && <Card padding="lg" className="text-center"><p className="font-body text-sm text-gray-600">Aucune activité disponible sur cette période.</p></Card>}
        </div>
      )}

      </>) }{/* fin vue liste */}

      {/* ── MODAL SÉLECTION ENFANT (depuis Timeline) ── */}
      {bookingCreneau && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center sm:p-4"
          onClick={() => setBookingCreneau(null)}>
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-gray-100">
              <div className="font-display text-base font-bold text-blue-800">{bookingCreneau.activityTitle}</div>
              <div className="font-body text-xs text-slate-500 mt-0.5">{bookingCreneau.startTime}–{bookingCreneau.endTime} · {bookingCreneau.monitor}</div>
            </div>
            <div className="p-5">
              {spotsLeft(bookingCreneau) === 0 ? (
                /* ── Créneau complet : inscription en liste d'attente ── */
                waitlistSuccess === bookingCreneau.id ? (
                  <div className="text-center py-2">
                    <div className="flex items-center justify-center gap-2 text-green-600 font-body text-sm font-semibold mb-2">
                      <Check size={18} /> Inscrit en liste d&apos;attente !
                    </div>
                    <p className="font-body text-xs text-slate-500 mb-4">
                      Vous serez notifié par email si une place se libère.
                    </p>
                    <button onClick={() => setBookingCreneau(null)}
                      className="w-full py-2.5 rounded-xl font-body text-sm font-semibold text-white bg-blue-500 border-none cursor-pointer hover:bg-blue-400">
                      Fermer
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="font-body text-sm text-orange-600 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2 mb-3">
                      🔔 Ce créneau est complet. Inscrivez-vous en liste d&apos;attente :
                    </div>
                    <div className="font-body text-sm font-semibold text-slate-700 mb-3">Pour quel cavalier ?</div>
                    <div className="flex flex-col gap-2">
                      {(family?.children || [])
                        .filter((ch: any) => !(bookingCreneau.enrolled || []).some((e: any) => e.childId === ch.id))
                        .map((ch: any) => (
                          <button key={ch.id}
                            onClick={() => addToWaitlist(bookingCreneau, ch.id)}
                            disabled={waitlistLoading === bookingCreneau.id}
                            className="flex items-center justify-between px-4 py-3 rounded-xl border border-orange-200 bg-orange-50 font-body text-sm text-orange-700 cursor-pointer hover:bg-orange-100 disabled:opacity-50">
                            <span className="font-semibold flex items-center gap-2">
                              {waitlistLoading === bookingCreneau.id ? <Loader2 size={14} className="animate-spin" /> : "🔔"} {ch.firstName}
                            </span>
                            {ch.galopLevel && ch.galopLevel !== "—" && (
                              <span className="font-body text-xs text-orange-600 bg-orange-100 px-2 py-0.5 rounded-full">G{ch.galopLevel}</span>
                            )}
                          </button>
                        ))}
                      {(family?.children || []).filter((ch: any) => !(bookingCreneau.enrolled || []).some((e: any) => e.childId === ch.id)).length === 0 && (
                        <p className="font-body text-sm text-slate-500 text-center py-2">Tous vos cavaliers sont déjà inscrits à ce créneau.</p>
                      )}
                    </div>
                    <button onClick={() => setBookingCreneau(null)}
                      className="w-full mt-3 py-2.5 rounded-xl font-body text-sm text-slate-500 bg-gray-100 border-none cursor-pointer">
                      Annuler
                    </button>
                  </>
                )
              ) : (
              <>
              <div className="font-body text-sm font-semibold text-slate-700 mb-3">Pour quel cavalier ?</div>
              <div className="flex flex-col gap-2">
                {(family?.children || [])
                  .filter((ch: any) => !(bookingCreneau.enrolled || []).some((e: any) => e.childId === ch.id))
                  .map((ch: any) => {
                    // Règle : 12 ans minimum pour les promenades
                    let tooYoung = false;
                    if (bookingCreneau.activityType === "balade") {
                      const bd: any = ch.birthDate;
                      const bdDate = bd?.seconds ? new Date(bd.seconds * 1000) : (bd ? new Date(bd) : null);
                      if (!bdDate || isNaN(bdDate.getTime())) tooYoung = true;
                      else if (bdDate.getFullYear() > new Date().getFullYear() - 12) tooYoung = true;
                    }
                    return (
                      <button key={ch.id}
                        onClick={() => {
                          if (tooYoung) {
                            alert(`Les promenades sont réservées aux cavaliers de 12 ans et plus (nés en ${new Date().getFullYear() - 12} ou avant).`);
                            return;
                          }
                          addCoursToCart(bookingCreneau, ch.id);
                          setBookingCreneau(null);
                          setShowCart(true);
                        }}
                        disabled={tooYoung}
                        title={tooYoung ? "Promenades réservées aux 12 ans et plus" : undefined}
                        className={`flex items-center justify-between px-4 py-3 rounded-xl border font-body text-sm transition-all ${
                          tooYoung
                            ? "border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed"
                            : "border-blue-200 bg-blue-50 text-blue-800 cursor-pointer hover:bg-blue-100"
                        }`}>
                        <span className="font-semibold">
                          {ch.firstName}
                          {tooYoung && <span className="ml-2 text-xs">🔒 Moins de 12 ans</span>}
                        </span>
                        {ch.galopLevel && ch.galopLevel !== "—" && (
                          <span className="font-body text-xs text-blue-600 bg-blue-100 px-2 py-0.5 rounded-full">G{ch.galopLevel}</span>
                        )}
                      </button>
                    );
                  })
                }
                {(family?.children || []).filter((ch: any) => !(bookingCreneau.enrolled || []).some((e: any) => e.childId === ch.id)).length === 0 && (
                  <p className="font-body text-sm text-slate-500 text-center py-2">Tous vos cavaliers sont déjà inscrits à ce créneau.</p>
                )}
              </div>
              <button onClick={() => setBookingCreneau(null)}
                className="w-full mt-3 py-2.5 rounded-xl font-body text-sm text-slate-500 bg-gray-100 border-none cursor-pointer">
                Annuler
              </button>
              </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* PANIER MODAL */}
      {showCart && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center" onClick={() => setShowCart(false)}>
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[78vh] overflow-auto shadow-2xl pb-6" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-gray-100">
              <div className="flex justify-between items-center mb-3">
                <h2 className="font-display text-lg font-bold text-blue-800"><ShoppingCart size={18} className="inline mr-2" />Mon panier</h2>
                <button onClick={() => setShowCart(false)} className="text-gray-600 bg-transparent border-none cursor-pointer"><X size={20} /></button>
              </div>
              {cart.length > 0 && (
                <button
                  onClick={() => setShowCart(false)}
                  className="w-full flex items-center justify-center gap-2 text-sm font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-xl py-2.5 px-4 cursor-pointer transition-colors"
                >
                  <ShoppingCart size={15} />
                  Continuer mes réservations
                </button>
              )}
            </div>
            <div className="p-5">
              {cart.length === 0 ? (
                <p className="font-body text-sm text-gray-600 text-center py-8">Votre panier est vide.</p>
              ) : (
                <>
                  <div className="flex flex-col gap-2 mb-4">
                    {cart.map((item, idx) => (
                      <div key={idx} className="flex items-center justify-between bg-sand rounded-lg px-3 py-2.5">
                        <div className="flex-1">
                          <div className="font-body text-sm font-semibold text-blue-800">{item.activityTitle}</div>
                          <div className="font-body text-xs text-gray-600">{item.childName} · {item.dates}</div>
                          {item.remiseEuros > 0 && <div className="font-body text-xs text-green-600">Reduction : -{item.remiseEuros}€</div>}
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="text-right">
                            {item.remiseEuros > 0 && <div className="font-body text-xs text-gray-600 line-through">{item.prixBase.toFixed(0)}€</div>}
                            <div className="font-body text-sm font-bold text-blue-500">{item.prixFinal.toFixed(2)}€</div>
                          </div>
                          <button onClick={() => removeFromCart(idx)} className="text-red-400 bg-transparent border-none cursor-pointer p-1 hover:text-red-600"><X size={14} /></button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Totaux */}
                  {cartTotalReductions > 0 && (
                    <div className="flex justify-between font-body text-xs text-green-600 mb-1 px-1">
                      <span>Reductions</span><span>-{cartTotalReductions.toFixed(2)}€</span>
                    </div>
                  )}
                  <div className="flex justify-between font-body text-base font-bold text-blue-800 px-1 mb-4 pt-2 border-t border-gray-200">
                    <span>Total</span><span className="text-green-600">{cartTotal.toFixed(2)}€</span>
                  </div>

                  {/* Choix acompte si stages dans le panier */}
                  {cart.some(i => i.isStage) && cartPayMode === "cb" && (
                    <div className="bg-blue-50 rounded-lg p-3 mb-4">
                      <div className="font-body text-xs font-semibold text-blue-800 mb-2">Paiement CB</div>
                      <div className="flex gap-2">
                        <button onClick={() => setDepositMode("full")}
                          className={`flex-1 py-2 px-3 rounded-lg font-body text-xs font-semibold border cursor-pointer ${depositMode === "full" ? "bg-green-600 text-white border-green-600" : "bg-white text-gray-600 border-gray-200"}`}>
                          Payer tout ({cartTotal.toFixed(0)}€)
                        </button>
                        <button onClick={() => setDepositMode("deposit")}
                          className={`flex-1 py-2 px-3 rounded-lg font-body text-xs font-semibold border cursor-pointer ${depositMode === "deposit" ? "bg-orange-500 text-white border-orange-500" : "bg-white text-gray-600 border-gray-200"}`}>
                          Acompte ({acompteFixe}€)
                        </button>
                      </div>
                      {depositMode === "deposit" && (
                        <div className="mt-2 space-y-2">
                          <div className="font-body text-xs text-slate-500 text-center">
                            {nbEnfantsStage} enfant{nbEnfantsStage > 1 ? "s" : ""} × {ACOMPTE_PAR_ENFANT}€ = {acompteFixe}€ maintenant · solde {soldeFixe.toFixed(2)}€ prélevé automatiquement ~1 semaine avant le stage
                          </div>
                          <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5">
                            <p className="font-body text-[11px] text-amber-800 leading-snug">
                              ⚠️ <strong>À faire sur la page de paiement :</strong> cochez la case <strong>« Enregistrer mes données de paiement »</strong>. En la cochant, vous autorisez le prélèvement automatique du solde de <strong>{soldeFixe.toFixed(2)}€</strong> environ une semaine avant le stage. Sans cette case, le solde restera à régler manuellement.
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Choix mode de paiement */}
                  <div className="mb-4">
                    <div className="font-body text-xs font-semibold text-slate-600 mb-2">Comment souhaitez-vous régler ?</div>
                    <div className="grid grid-cols-2 gap-2">
                      {([
                        ["cb", "💳 Carte bancaire"],
                        ["cheque", "📝 Chèque"],
                        ["especes", "💵 Espèces"],
                        ["virement", "🏦 Virement"],
                      ] as const).map(([mode, label]) => (
                        <button key={mode} onClick={() => setCartPayMode(mode)}
                          className={`py-2.5 rounded-xl font-body text-sm font-semibold border cursor-pointer transition-all ${cartPayMode === mode ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-200 bg-white text-slate-500 hover:border-blue-300"}`}>
                          {label}
                        </button>
                      ))}
                    </div>
                    {/* Bouton avoir si la famille a un solde */}
                    {familyAvoirs.length > 0 && (() => {
                      const totalAvoir = familyAvoirs.reduce((s, a) => s + (a.remainingAmount || 0), 0);
                      return (
                        <button onClick={() => setCartPayMode("avoir")}
                          className={`w-full mt-2 py-2.5 rounded-xl font-body text-sm font-semibold border cursor-pointer transition-all ${cartPayMode === "avoir" ? "border-amber-500 bg-amber-50 text-amber-700" : "border-gray-200 bg-white text-amber-600 hover:border-amber-300"}`}>
                          💜 Utiliser mon avoir ({totalAvoir.toFixed(2)}€ disponible)
                        </button>
                      );
                    })()}
                  </div>

                  {/* Conditions d'annulation — acceptation AVANT paiement.
                      Une clause n'est opposable que si le client en a eu
                      connaissance et l'a acceptée avant de contracter :
                      l'email de confirmation arrive trop tard pour ça. */}
                  {cartHasStage && (
                    <label className="flex items-start gap-2.5 mb-3 p-3 rounded-xl bg-orange-50 border border-orange-200 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={cgvAccepted}
                        onChange={(e) => setCgvAccepted(e.target.checked)}
                        className="mt-0.5 h-4 w-4 flex-shrink-0 cursor-pointer accent-orange-500"
                      />
                      <span className="font-body text-xs text-orange-900 leading-relaxed">
                        J&apos;ai lu et j&apos;accepte les <a href="/cgv" target="_blank" rel="noopener noreferrer" className="font-semibold underline">conditions d&apos;annulation</a> :
                        au-delà de <strong>3 semaines avant le début du stage</strong>, l&apos;annulation ne donne
                        pas lieu à remboursement, sauf certificat médical ou force majeure.
                        L&apos;acompte de 30&nbsp;€ est alors converti en <strong>avoir</strong>, valable
                        jusqu&apos;à la fin de la saison en cours (30 juin).
                      </span>
                    </label>
                  )}

                  {/* Bouton CB → CAWL */}
                  {cartPayMode === "cb" && (
                    <>
                      <button onClick={handlePay} disabled={paying || (cartHasStage && !cgvAccepted)}
                        className={`w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-body text-base font-semibold border-none cursor-pointer ${paying || (cartHasStage && !cgvAccepted) ? "bg-gray-200 text-gray-600 cursor-not-allowed" : depositMode === "deposit" ? "bg-orange-500 text-white hover:bg-orange-400" : "bg-green-600 text-white hover:bg-green-500"}`}>
                        {paying ? <Loader2 size={18} className="animate-spin" /> : <CreditCard size={18} />}
                        {paying ? "Paiement en cours..." : depositMode === "deposit" ? `Payer l'acompte ${acompteFixe.toFixed(2)}€` : `Payer ${cartTotal.toFixed(2)}€`}
                      </button>
                      <p className="font-body text-xs text-gray-600 text-center mt-2">Paiement sécurisé par CAWL / Crédit Agricole</p>
                    </>
                  )}

                  {/* Bouton Chèque/Espèces/Virement → déclaration */}
                  {cartPayMode === "avoir" && (() => {
                    const totalAvoir = familyAvoirs.reduce((s, a) => s + (a.remainingAmount || 0), 0);
                    const couvre = totalAvoir >= cartTotal;
                    return cartPaySuccess ? (
                      <div className="text-center py-4">
                        <div className="text-4xl mb-2">✅</div>
                        <p className="font-body text-base font-semibold text-green-700">Avoir utilisé !</p>
                        <p className="font-body text-xs text-slate-500 mt-1">
                          {couvre ? "Votre avoir a couvert la totalité." : "Le centre équestre vous contactera pour le complément."}
                        </p>
                      </div>
                    ) : (
                      <>
                        {!couvre && (
                          <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 mb-3">
                            <p className="font-body text-xs text-orange-700">
                              Votre avoir ({totalAvoir.toFixed(2)}€) ne couvre pas la totalité ({cartTotal.toFixed(2)}€). Le reste ({(cartTotal - totalAvoir).toFixed(2)}€) sera à régler séparément.
                            </p>
                          </div>
                        )}
                        <button onClick={async () => {
                          if (!user || !family) return;
                          setPaying(true);
                          try {
                            // Tout passe par l'API serveur — les écritures Firestore
                            // (payments, encaissements, avoirs, reservations, creneaux)
                            // sont atomiques et sécurisées côté adminDb.
                            const res = await authFetch("/api/pay-with-avoir", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                cart: cart.map(i => ({
                                  activityTitle: i.activityTitle,
                                  childId: i.childId,
                                  childName: i.childName,
                                  creneauIds: i.creneauIds,
                                  prixFinal: i.prixFinal,
                                  isStage: i.isStage,
                                  ...((i as any).sourceFamilyId ? { sourceFamilyId: (i as any).sourceFamilyId } : {}),
                                })),
                              }),
                            });
                            const data = await res.json();
                            if (!res.ok) {
                              throw new Error(data.error || "Erreur serveur");
                            }
                            setCart([]);
                            setCartPaySuccess(true);
                          } catch (e: any) {
                            console.error(e);
                            alert(`Erreur lors du paiement par avoir${e?.message ? ` : ${e.message}` : ""}.`);
                          }
                          setPaying(false);
                        }} disabled={paying}
                          className={`w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-body text-base font-semibold border-none cursor-pointer ${paying ? "bg-gray-200 text-gray-600" : "bg-amber-600 text-white hover:bg-amber-500"}`}>
                          {paying ? <Loader2 size={18} className="animate-spin" /> : null}
                          {paying ? "En cours..." : couvre ? `Payer avec mon avoir (${cartTotal.toFixed(2)}€)` : `Utiliser ${totalAvoir.toFixed(2)}€ d'avoir`}
                        </button>
                      </>
                    );
                  })()}
                  {cartPayMode !== "cb" && cartPayMode !== "avoir" && (
                    cartPaySuccess ? (
                      <div className="text-center py-4">
                        <div className="text-4xl mb-2">✅</div>
                        <p className="font-body text-base font-semibold text-green-700">Déclaration envoyée !</p>
                        <p className="font-body text-xs text-slate-500 mt-1">
                          Le centre équestre va confirmer réception de votre {cartPayMode === "cheque" ? "chèque" : cartPayMode === "especes" ? "règlement en espèces" : "virement"}.
                        </p>
                      </div>
                    ) : (
                      <>
                        <button onClick={async () => {
                          if (!user || !family) return;
                          setPaying(true);
                          try {
                            // 1. Inscrire + créer réservations + paiement pending
                            for (const item of cart) {
                              // Inscription sécurisée côté serveur (audit P0 #3 + #7).
                              const enrollRes = await authFetch("/api/enroll", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                  enrollments: [{
                                    childId: item.childId,
                                    childName: item.childName,
                                    creneauIds: item.creneauIds,
                                    ...((item as any).sourceFamilyId ? { sourceFamilyId: (item as any).sourceFamilyId } : {}),
                                  }],
                                }),
                              });
                              if (!enrollRes.ok) {
                                const err = await enrollRes.json().catch(() => ({} as any));
                                throw new Error(err.error || "Inscription refusée (créneau complet ?)");
                              }
                              const firstCr = creneaux.find(c => c.id === item.creneauIds[0]);
                              await addDoc(collection(db, "reservations"), {
                                familyId: user.uid, familyName: family.parentName,
                                ...((item as any).sourceFamilyId ? { sourceFamilyId: (item as any).sourceFamilyId } : {}),
                                childId: item.childId, childName: item.childName,
                                activityTitle: item.activityTitle, activityType: item.isStage ? "stage" : "cours",
                                creneauId: item.creneauIds[0],
                                date: firstCr?.date || todayLocalString(),
                                startTime: firstCr?.startTime || "", endTime: firstCr?.endTime || "",
                                priceTTC: item.prixFinal, status: "pending_payment", source: "client",
                                createdAt: serverTimestamp(),
                              });
                            }
                            const payDoc = await addDoc(collection(db, "payments"), {
                              familyId: user.uid, familyName: family.parentName,
                              items: cart.map(i => ({
                                activityTitle: `${i.activityTitle} — ${i.childName}`,
                                childId: i.childId, childName: i.childName,
                                creneauId: i.creneauIds[0],
                                priceHT: i.prixFinal / 1.055, tva: 5.5, priceTTC: i.prixFinal,
                              })),
                              totalTTC: cartTotal,
                              paymentMode: cartPayMode, paymentRef: "",
                              status: "pending", paidAmount: 0,
                              source: "client", date: serverTimestamp(),
                            });
                            // 2. Créer la déclaration
                            await addDoc(collection(db, "payment_declarations"), {
                              paymentId: payDoc.id,
                              familyId: user.uid, familyName: family.parentName,
                              familyEmail: family.parentEmail || user.email || "",
                              montant: cartTotal,
                              mode: cartPayMode,
                              note: "",
                              activityTitle: cart.map(i => i.activityTitle).join(", "),
                              status: "pending_confirmation",
                              createdAt: serverTimestamp(),
                            });
                            // 3. Email admin
                            authFetch("/api/send-email", {
                              method: "POST", headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                to: "ceagon50@gmail.com",
                                subject: `Paiement ${cartPayMode} à confirmer — ${family.parentName}`,
                                context: "espace_cavalier_declaration",
                                familyId,
                                html: `<p>${family.parentName} déclare un paiement de <strong>${cartTotal.toFixed(2)}€</strong> par ${cartPayMode}.<br/>Activités : ${cart.map(i => i.activityTitle).join(", ")}</p>`,
                              }),
                            }).catch(() => {});
                            setCartPaySuccess(true);
                            setCart([]);
                          } catch (e) { console.error(e); toast("Erreur. Réessayez.", "error"); }
                          setPaying(false);
                        }} disabled={paying}
                          className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-body text-base font-semibold border-none cursor-pointer bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50">
                          {paying ? <Loader2 size={18} className="animate-spin" /> : null}
                          {paying ? "Envoi..." : `Déclarer mon paiement par ${cartPayMode === "cheque" ? "chèque" : cartPayMode === "especes" ? "espèces" : "virement"}`}
                        </button>
                        <p className="font-body text-xs text-gray-500 text-center mt-2">
                          L'équipe confirmera réception lors de votre prochain passage.
                        </p>
                      </>
                    )
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
