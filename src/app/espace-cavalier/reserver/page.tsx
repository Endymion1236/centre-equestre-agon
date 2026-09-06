"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { derouleEstRempli } from "@/lib/stage-deroule";
import { totauxPanier } from "@/lib/panier-reservation";
import ModalePanier from "./ModalePanier";
import ModaleChoixCavalier from "./ModaleChoixCavalier";
import { collection, getDocs, getDoc, addDoc, doc, query, where, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { BasculeReserver } from "@/components/espace-cavalier/BasculeReserver";
import { NotePetitComite } from "./NotePetitComite";
import { estPromenadeADefinir, niveauDuCreneau, titreAvecNiveau, libelleNiveauCreneau, type NiveauPromenade } from "@/lib/promenade-niveau";
import { estBalade, CONSIGNE_ARRIVEE_BALADE, CONSIGNE_ARRIVEE_BALADE_COURTE } from "@/lib/cgv-clauses";
import { useAuth } from "@/lib/auth-context";
import { Card, Badge } from "@/components/ui";
import { Calendar, Clock, Users, Loader2, ShoppingCart, ChevronLeft, ChevronRight, Check, CalendarDays, LayoutList, Tent } from "lucide-react";
import TimelineReservation from "./TimelineReservation";
import { useSearchParams } from "next/navigation";
import { authFetch } from "@/lib/auth-fetch";
import { compareCreneauxByDate } from "@/lib/creneau-sort";
import type { CarteLike } from "@/lib/cartes-seances";
import { useToast } from "@/components/ui/Toast";

import type { CartItem, Creneau } from "./types";
import { ajouterCoursAuPanier, ajouterStageAuPanier, fmtDate, isStage, type ContexteAjout, type RappelsAjout } from "./panier-ajout";
import { payerPanier } from "./panier-paiement";

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
  // Deroule des 2 sequences (Parametres > Deroule stages). Meme reglage que
  // les emails : une seule saisie, visible a la reservation ET apres paiement.
  const [deroule, setDeroule] = useState<any | null>(null);
  useEffect(() => {
    getDoc(doc(db, "settings", "stageDeroule"))
      .then(snap => setDeroule(snap.exists() ? snap.data() : null))
      .catch(() => setDeroule(null));
  }, []);
  // Verrou d'avant-ouverture : le blocage reel vit cote serveur, ce bandeau
  // evite juste a la famille de remplir un panier pour rien.
  const [reservationsFermees, setReservationsFermees] = useState(false);
  const [messageFermeture, setMessageFermeture] = useState("");
  useEffect(() => {
    getDoc(doc(db, "settings", "reservations"))
      .then(snap => {
        const d = snap.exists() ? (snap.data() as any) : null;
        setReservationsFermees(d?.ouvert === false);
        setMessageFermeture((d?.message || "").trim());
      })
      .catch(() => setReservationsFermees(false));
  }, []);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState(initialFilter);
  const [subfilter, setSubfilter] = useState("all"); // sous-catégorie
  const [cart, setCart] = useState<CartItem[]>([]);
  const [showCart, setShowCart] = useState(false);
  const [selectedCreneau, setSelectedCreneau] = useState<Creneau | null>(null);
  const [selectedChildren, setSelectedChildren] = useState<string[]>([]);
  const [paying, setPaying] = useState(false);
  const [depositMode, setDepositMode] = useState<"full" | "deposit">("full");
  // Les stages se reglent par ACOMPTE uniquement (decision gerant) : plus
  // d'option « payer le total » en ligne. Le solde est preleve a ~J-7 via
  // l'empreinte de carte. Force par effet plutot qu'en dur dans le state :
  // un panier peut gagner ou perdre son stage au fil des ajouts.
  useEffect(() => {
    setDepositMode(cart.some((i) => i.isStage) ? "deposit" : "full");
  }, [cart]);
  // Modal sélection enfant (depuis Timeline)
  const [bookingCreneau, setBookingCreneau] = useState<Creneau | null>(null);
  // Multi-selection dans la modale : une fratrie s'inscrit en une fois.
  // Avant, chaque clic ajoutait au panier et FERMAIT la modale — il fallait
  // la rouvrir pour chaque enfant (retour du client testeur).
  const [selCavaliers, setSelCavaliers] = useState<Set<string>>(new Set());
  useEffect(() => { setSelCavaliers(new Set()); }, [bookingCreneau?.id]);
  // Retour de la creation d'un cavalier : ?creneau=<id> rouvre directement
  // la modale de la promenade d'origine — la famille reprend ou elle en
  // etait, nouveau cavalier dans la liste.
  const creneauRouvert = useRef(false);
  // Un lien vers un créneau d'un autre mois (code QR de la borne, email de
  // liste d'attente) ne le trouvait pas dans la fenêtre chargée et n'ouvrait
  // rien : on lit alors le créneau seul pour afficher son mois, puis la
  // modale s'ouvre au rechargement.
  const creneauCherche = useRef(false);
  useEffect(() => {
    if (creneauRouvert.current || typeof window === "undefined" || creneaux.length === 0) return;
    const cid = new URLSearchParams(window.location.search).get("creneau");
    if (!cid) { creneauRouvert.current = true; return; }
    const c = creneaux.find((x: any) => x.id === cid);
    if (c) { setBookingCreneau(c); creneauRouvert.current = true; return; }
    if (creneauCherche.current) { creneauRouvert.current = true; return; }
    creneauCherche.current = true;
    getDoc(doc(db, "creneaux", cid)).then((snap) => {
      const date = snap.exists() ? String((snap.data() as any).date || "") : "";
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { creneauRouvert.current = true; return; }
      const cible = new Date(`${date}T12:00:00`);
      const now = new Date();
      const offset = (cible.getFullYear() - now.getFullYear()) * 12 + (cible.getMonth() - now.getMonth());
      if (offset > 0) setMonthOffset(offset); else creneauRouvert.current = true;
    }).catch(() => { creneauRouvert.current = true; });
  }, [creneaux]);
  // Mode paiement dans le panier
  const [cartPayMode, setCartPayMode] = useState<"cb" | "cheque" | "especes" | "virement" | "avoir">("cb");
  // Acceptation des conditions d'annulation (stages uniquement).
  const [cgvAccepted, setCgvAccepted] = useState(false);
  const [cartPaySuccess, setCartPaySuccess] = useState(false);
  const [success, setSuccess] = useState(false);
  const [waitlistSuccess, setWaitlistSuccess] = useState<string | null>(null); // creneauId confirmé
  const [waitlistLoading, setWaitlistLoading] = useState<string | null>(null); // creneauId en cours
  // Enfants déjà en liste d'attente (waiting/notified), clé `${creneauId}|${childId}`.
  // Chargé au montage puis maintenu localement : sans lui, la confirmation
  // disparaissait au bout de 4 s et plus RIEN n'indiquait l'inscription — la
  // famille croyait n'avoir rien fait alors que l'enfant était bien en file.
  const [mesAttentes, setMesAttentes] = useState<Set<string>>(new Set());
  // Ids de MES entrées de liste d'attente actives — sert à ne montrer un
  // bandeau « place réservée » que si l'attente existe encore : un hold posé
  // sur un créneau peut survivre à la suppression de l'entrée (reset, ménage
  // admin) et afficherait une promesse fantôme.
  const [mesEntryIds, setMesEntryIds] = useState<Set<string>>(new Set());
  const [attentesChargees, setAttentesChargees] = useState(false);
  const [familyAvoirs, setFamilyAvoirs] = useState<any[]>([]);
  // Chargement des avoirs AU MONTAGE, pas seulement au clic sur « Panier ».
  // Le panier s'ouvre depuis 3 endroits mais un seul chargeait les avoirs :
  // selon le chemin emprunté, le bouton « Utiliser mon avoir » n'apparaissait
  // jamais, alors que l'avoir existait bien dans la fiche client.
  const rechargerAvoirs = async (uid: string) => {
    try {
      const snap = await getDocs(query(collection(db, "avoirs"), where("familyId", "==", uid)));
      setFamilyAvoirs(
        snap.docs.map(d => ({ id: d.id, ...d.data() }))
          .filter((a: any) => a.status === "actif" && (a.remainingAmount || 0) > 0)
      );
    } catch { setFamilyAvoirs([]); }
  };
  // Cartes de séances actives de la famille : une séance de cours ou de
  // balade couverte par une carte se réserve sans paiement, la séance est
  // décomptée au montoir. Chargées au montage comme les avoirs.
  const [familyCartes, setFamilyCartes] = useState<CarteLike[]>([]);
  const rechargerCartes = async (uid: string) => {
    try {
      const snap = await getDocs(query(collection(db, "cartes"), where("familyId", "==", uid)));
      setFamilyCartes(
        snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }) as CarteLike)
          .filter((c) => c.status === "active" && (Number(c.remainingSessions) || 0) > 0)
      );
    } catch { setFamilyCartes([]); }
  };
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
  // Jeu LARGE (6 mois) destine a la timeline, qui laisse naviguer semaine par
  // semaine sans limite. La liste mensuelle, elle, garde son jeu restreint au
  // mois affiche. Ces creneaux sont deja telecharges par la requete « stages »
  // ci-dessous : on cessait simplement de les conserver.
  const [creneauxLarge, setCreneauxLarge] = useState<Creneau[]>([]);
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

  // Avoirs disponibles, chargés dès l'arrivée sur la page.
  useEffect(() => {
    if (user?.uid) { rechargerAvoirs(user.uid); rechargerCartes(user.uid); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid]);

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
        const wideDocs = stagesSnap.docs.map(d => ({ id: d.id, ...d.data() }) as Creneau);
        setCreneauxLarge(wideDocs);
        const stageDocs = wideDocs
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

  // Ajout au panier — traitement dans panier-ajout.ts, contexte explicite.
  const ctxAjout = (): ContexteAjout => ({
    creneaux, cart, children, familyId, user, familyCartes, reservationsFermees, messageFermeture,
    stageBookingMode, selectedChildren, existingStageCount, prixPlancherStage, stageGroups,
  });
  const rappelsAjout: RappelsAjout = { setCart, setSelectedChildren, setSelectedCreneau, setShowCart, setBookingCreneau, toast };
  const addStageToCart = (stageCreneaux: Creneau[], prixJourParam?: number, totalJoursStageParam?: number, childIdsParam?: string[]) =>
    ajouterStageAuPanier(ctxAjout(), rappelsAjout, stageCreneaux, prixJourParam, totalJoursStageParam, childIdsParam);
  const addCoursToCart = (creneau: Creneau, childId: string, opts?: { viaHold?: boolean; niveauPromenade?: NiveauPromenade }) =>
    ajouterCoursAuPanier(ctxAjout(), rappelsAjout, creneau, childId, opts);


  const removeFromCart = (idx: number) => setCart(cart.filter((_, i) => i !== idx));
  // Les totaux du panier et l'acompte dû viennent de panier-reservation, la
  // même source que le paiement : ce que la famille lit est ce qu'elle règle.
  const {
    total: cartTotal, reductions: cartTotalReductions, contientUnStage: cartHasStage,
    nbEnfantsStage, acompte: acompteFixe, solde: soldeFixe,
  } = totauxPanier(cart);

  // Paiement — traitement dans panier-paiement.ts, contexte explicite.
  const handlePay = () => payerPanier(
    { cart, creneaux, user, family, reservationsFermees, messageFermeture, depositMode, cartTotal, cartHasStage, acompteFixe, soldeFixe },
    { setCart, setPaying, setSuccess, rechargerCartes, toast },
  );

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

  useEffect(() => {
    if (!user) return;
    getDocs(query(collection(db, "waitlist"), where("familyId", "==", user.uid)))
      .then((snap) => {
        const s = new Set<string>();
        const ids = new Set<string>();
        snap.docs.forEach((d) => {
          const w = d.data() as any;
          if (!["waiting", "notified"].includes(w.status || "waiting")) return;
          ids.add(d.id);
          const cids: string[] = Array.isArray(w.creneauIds) && w.creneauIds.length ? w.creneauIds : [w.creneauId];
          cids.forEach((id) => id && s.add(`${id}|${w.childId}`));
        });
        setMesAttentes(s);
        setMesEntryIds(ids);
        setAttentesChargees(true);
      })
      .catch((e) => { console.warn("[waitlist] lecture mes attentes:", e); setAttentesChargees(true); });
  }, [user]);

  const enAttente = (creneauId: string | undefined, childId: string) =>
    !!creneauId && mesAttentes.has(`${creneauId}|${childId}`);

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
      // Seules les entrees ACTIVES bloquent (waiting/notified). Une entree
      // expiree — 24h ecoulees sans reponse — ne doit pas empecher de se
      // reinscrire : sinon « deja en liste d'attente » tombe alors que la
      // famille n'est plus dans la file.
      if (existing.docs.some((d) => ["waiting", "notified"].includes((d.data() as any).status || "waiting"))) {
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
      // Confirmation par email via une route DEDIEE : /api/send-email est
      // reserve aux admins, l'appel depuis l'espace famille partait en 401
      // et le catch l'avalait — la famille ne recevait rien.
      authFetch("/api/waitlist/confirmation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          creneauId: c.id,
          activityTitle: c.activityTitle,
          activityType: c.activityType,
          date: c.date,
          startTime: c.startTime,
          endTime: c.endTime,
          childName,
          parentName: family.parentName || "",
        }),
      }).catch((e) => console.warn("Confirmation liste d'attente:", e));

      setMesAttentes(prev => new Set(prev).add(`${c.id}|${childId}`));
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
      if (existing.docs.some((d) => ["waiting", "notified"].includes((d.data() as any).status || "waiting"))) {
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
      // Même confirmation par email que pour les cours et les jours isolés :
      // une attente de semaine restait muette, la famille doutait d'être inscrite.
      authFetch("/api/waitlist/confirmation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          creneauId: first.id,
          activityTitle: first.activityTitle,
          activityType: first.activityType,
          date: first.date,
          dateFin: last.date,
          nbJours: jours.length,
          startTime: first.startTime,
          endTime: first.endTime,
          childName,
          parentName: family.parentName || "",
        }),
      }).catch((e) => console.warn("Confirmation liste d'attente stage:", e));

      setMesAttentes(prev => {
        const s = new Set(prev);
        jours.forEach(j => s.add(`${j.id}|${childId}`));
        return s;
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
      <a href={`/espace-cavalier/profil?action=ajouter-cavalier&retour=${encodeURIComponent(typeof window !== "undefined" ? window.location.pathname + window.location.search + (bookingCreneau ? `${window.location.search ? "&" : "?"}creneau=${bookingCreneau.id}` : "") : "/espace-cavalier/reserver")}`}>
        <button type="button" className="font-body text-sm font-semibold text-white bg-blue-500 px-6 py-3 rounded-xl border-none cursor-pointer hover:bg-blue-400 transition-colors">
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
      {reservationsFermees && (
        <div className="mb-5 rounded-2xl border-2 border-amber-300 bg-amber-50 p-4">
          <div className="font-body text-sm font-bold text-amber-900">
            Réservations en ligne pas encore ouvertes
          </div>
          <div className="mt-1 font-body text-sm text-amber-800">
            {messageFermeture ||
              "Les réservations en ligne ne sont pas encore ouvertes. Contactez le centre équestre pour toute demande."}
          </div>
        </div>
      )}

      {/* Place(s) reservee(s) pour CETTE famille (hold 24h) : bandeau global,
          visible quel que soit le chemin d'arrivee. Le lien de l'email perdait
          son parametre ?creneau= a l'ouverture dans l'application installee
          (PWA demarre sur sa page d'accueil) — on ne depend donc plus de
          l'URL : les holds sont dans les donnees deja chargees. */}
      {attentesChargees && (() => {
        // Ne montrer que les holds ADOSSÉS à une attente encore vivante : un
        // hold peut survivre à son entrée de liste d'attente (reset de la
        // base, ménage admin) et promettrait une place fantôme.
        const miens = creneaux.filter((c: any) => holdActive(c)
          && (c as any).waitlistHold?.familyId === familyId
          && (!(c as any).waitlistHold?.waitlistEntryId || mesEntryIds.has((c as any).waitlistHold.waitlistEntryId)));
        // Un hold de STAGE est posé sur chaque jour de la semaine : on
        // regroupe par entrée d'attente → UN bandeau, UN bouton qui met
        // tous les jours au panier (au lieu de cinq bandeaux identiques).
        const groupes = new Map<string, any[]>();
        miens.forEach((c: any) => {
          const h = (c as any).waitlistHold;
          const cle = h.waitlistEntryId || `${h.childId}|${h.until}|${c.activityTitle}`;
          if (!groupes.has(cle)) groupes.set(cle, []);
          groupes.get(cle)!.push(c);
        });
        return [...groupes.entries()].map(([cle, joursHold]) => {
          const jours = [...joursHold].sort((a: any, b: any) => a.date.localeCompare(b.date));
          const c = jours[0];
          const hold = (c as any).waitlistHold;
          const fin = new Date(hold.until);
          const fmt = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
          return (
            <div key={`hold_${cle}`} className="mb-4 rounded-2xl border-2 border-green-300 bg-green-50 p-4">
              <div className="font-body text-sm font-bold text-green-800">
                🎉 Une place est réservée pour {hold.childName}
              </div>
              <div className="mt-1 font-body text-xs text-green-700">
                {c.activityTitle} — {jours.length > 1
                  ? `du ${fmt(c.date)} au ${fmt(jours[jours.length - 1].date)} (${jours.length} jours)`
                  : fmt(c.date)} · {c.startTime}–{c.endTime}.
                À confirmer avant le {fin.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric" })} à {fin.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}.
              </div>
              <button type="button"
                onClick={() => { jours.forEach((j: any) => addCoursToCart(j, hold.childId, { viaHold: true })); setShowCart(true); }}
                className="w-full mt-3 py-3 rounded-xl font-body text-sm font-bold text-white bg-green-600 hover:bg-green-500 border-none cursor-pointer">
                ✓ J&apos;accepte {jours.length > 1 ? "ces places" : "cette place"} — passer au paiement
              </button>
            </div>
          );
        });
      })()}
      <div className="flex justify-between items-center mb-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-blue-800">
            {filter === "balade" ? "Promenades" : "Réserver"}
          </h1>
          <p className="font-body text-xs text-gray-600">
            {filter === "balade" ? "Balades et promenades à cheval" : "Stages, cours ponctuels et activités"}
          </p>
        </div>
        <button type="button" onClick={async () => {
          setShowCart(true); setCartPaySuccess(false); setCartPayMode("cb");
          // Rafraîchit au cas où un avoir aurait été créé depuis l'arrivée.
          if (user?.uid) { await rechargerAvoirs(user.uid); await rechargerCartes(user.uid); }
        }} className="relative flex items-center gap-2 font-body text-sm font-semibold text-white bg-blue-500 px-4 py-2.5 rounded-lg border-none cursor-pointer hover:bg-blue-600">
          <ShoppingCart size={16} /> Panier
          {cart.length > 0 && <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center">{cart.length}</span>}
        </button>
      </div>

      {/* Onglets de page à gauche, réglage d'affichage (Planning / Liste)
          réduit à droite sur la même ligne : deux choses différentes, deux
          formes différentes. */}
      {initialFilter === "all" && (
        <BasculeReserver
          active="activites"
          droite={filter === "all" ? (
            <div className="flex bg-sand rounded-lg p-0.5" role="group" aria-label="Affichage">
              {([["timeline", CalendarDays, "Planning"], ["liste", LayoutList, "Liste"]] as const).map(([mode, Icone, libelle]) => (
                <button key={mode} type="button" onClick={() => setViewMode(mode)} title={libelle} aria-label={libelle} aria-pressed={viewMode === mode}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md font-body text-xs font-semibold border-none cursor-pointer transition-all ${viewMode === mode ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 bg-transparent"}`}>
                  <Icone size={14} /><span className="hidden sm:inline">{libelle}</span>
                </button>
              ))}
            </div>
          ) : undefined}
        />
      )}

      {success && <Card padding="md" className="mb-4 bg-green-50 border-green-200"><p className="font-body text-sm text-green-700"><Check size={16} className="inline mr-1" /> Inscription confirmée ! Rendez-vous au centre équestre.</p></Card>}

      {/* ── VUE TIMELINE ── */}
      {viewMode === "timeline" && filter === "all" && (<>
        {/* Bandeau stages */}
        {Object.keys(stageGroups).length > 0 && (
          <Card hover padding="sm" className="mb-5" onClick={() => setViewMode("liste")}>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center flex-shrink-0"><Tent size={20} className="text-green-700" /></div>
                <div className="min-w-0">
                  <div className="font-body text-base font-bold text-blue-800">
                    {Object.keys(stageGroups).length} stage{Object.keys(stageGroups).length > 1 ? "s" : ""} disponible{Object.keys(stageGroups).length > 1 ? "s" : ""}
                  </div>
                  <div className="font-body text-xs text-gray-600 mt-0.5">Inscriptions à la semaine ou à la journée</div>
                </div>
              </div>
              <div className="flex items-center gap-1 bg-blue-50 text-blue-500 font-body text-sm font-bold px-4 py-2 rounded-lg flex-shrink-0">
                Voir <ChevronRight size={15} />
              </div>
            </div>
          </Card>
        )}
        <TimelineReservation
          creneaux={(creneauxLarge.length > 0 ? creneauxLarge : creneaux).filter(c => c.activityType !== "stage" && c.activityType !== "stage_journee")}
          children={(family?.children || []).map((c: any) => ({ id: c.id, firstName: c.firstName, galopLevel: c.galopLevel }))}
          familyId={familyId}
          activities={activities}
          onBook={(creneau) => { setBookingCreneau(creneau as any); }}
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
                  // `spots` = places pour la SEMAINE COMPLÈTE (le jour le plus
                  // plein fait foi) : 0 dès qu'UN jour est plein. Ça ne veut PAS
                  // dire que le stage est plein — sur un stage ouvert à la
                  // journée, les autres jours restent réservables à l'unité.
                  const spots = Math.min(...stageCreneaux.map(spotsLeft));
                  const joursUniques = [...new Map(stageCreneaux.map(c => [c.date, c])).values()]
                    .sort((a, b) => a.date.localeCompare(b.date));
                  const joursOuvertsALaJournee = joursUniques.filter((c: any) => c.allowDayBooking && spotsLeft(c) > 0);
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
                        <div className="font-body text-[11px] font-bold uppercase tracking-wider text-slate-500 mt-2 first:mt-0">
                          📅 {weekLabel}
                        </div>
                      )}
                    {/* Liseré coloré = couleur de l'ACTIVITÉ (celle choisie dans
                        l'admin, déjà utilisée dans le planning). La couleur
                        encode le niveau du stage plutôt que de décorer : même
                        repère visuel côté back-office et côté famille. */}
                    <Card
                      padding="md"
                      className={isSelected ? "ring-2 ring-green-500" : ""}
                      style={(() => {
                        const col = (first as any).color
                          || activities.find((a: any) => a.id === (first as any).activityId)?.color;
                        return col ? { borderLeft: `4px solid ${col}` } : undefined;
                      })()}
                    >
                      <div className="flex justify-between items-start cursor-pointer" onClick={() => { setSelectedCreneau(isSelected ? null : first); setSelectedChildren([]); setStageBookingMode(spots === 0 ? "jour" : "semaine"); setSelectedDays([]); }}>
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
                          <Badge color={spots > 2 ? "green" : spots > 0 ? "orange" : "red"}>
                            {spots > 0 ? `${spots} place${spots > 1 ? "s" : ""}` : joursOuvertsALaJournee.length > 0 ? "Semaine complète" : "Complet"}
                          </Badge>
                          {/* Un badge "Complet" seul ressemble à une porte fermée :
                              on annonce ce qui reste possible SANS avoir à déplier. */}
                          {spots === 0 && (
                            <div className="mt-1 font-body text-xs font-semibold text-orange-600 whitespace-nowrap">
                              {joursOuvertsALaJournee.length > 0 ? "🗓 Jours à l'unité dispo" : "🔔 Liste d'attente"}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Bouton détail dépliable */}
                      {(() => {
                        const act = activities.find((a: any) => a.id === first.activityId);
                        const desc = act?.description?.trim();
                        // Le deroule des 2 sequences s'affiche meme sans
                        // description : c'est l'information qui manquait le
                        // plus aux familles, elle ne doit dependre d'aucune
                        // autre saisie.
                        const montrerDeroule = derouleEstRempli(deroule);
                        if (!desc && !montrerDeroule) return null;
                        const isOpen = expandedStageDetail === key;
                        return (
                          <div className="mt-2">
                            <button
                              onClick={e => { e.stopPropagation(); setExpandedStageDetail(isOpen ? null : key); }}
                              className="flex items-center gap-1.5 font-body text-xs text-green-700 font-semibold bg-transparent border-none cursor-pointer px-0 py-1 hover:text-green-900"
                            >
                              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 2a5 5 0 100 10A5 5 0 007 2zm0 2.5a.75.75 0 110 1.5.75.75 0 010-1.5zM6.25 6.5h1.5v3h-1.5v-3z" fill="currentColor"/></svg>
                              {isOpen ? "Masquer le détail" : (montrerDeroule ? "Voir le détail et le déroulé de la séance" : "Voir le détail du stage")}
                            </button>
                            {isOpen && (
                              <div className="mt-2 p-3 bg-green-50 rounded-xl border border-green-100">
                                {desc && (
                                  <p className="font-body text-xs text-gray-700 leading-relaxed whitespace-pre-line">{desc}</p>
                                )}
                                {montrerDeroule && (
                                  <div className={desc ? "mt-3 pt-3 border-t border-green-200" : ""}>
                                    <div className="font-body text-[11px] font-semibold text-green-800 uppercase tracking-wider mb-2">
                                      🐴 Comment se déroule la séance
                                    </div>
                                    {[1, 2].map((n) => {
                                      const titre = n === 1 ? deroule.sequence1Titre : deroule.sequence2Titre;
                                      const detail = n === 1 ? deroule.sequence1Detail : deroule.sequence2Detail;
                                      return (
                                        <div key={n} className="flex gap-2 mb-1.5 last:mb-0">
                                          <span className="w-4 h-4 rounded-full bg-green-600 text-white font-body text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">{n}</span>
                                          <div className="min-w-0">
                                            <div className="font-body text-xs font-semibold text-gray-800 leading-snug">{titre}</div>
                                            {detail?.trim() && (
                                              <div className="font-body text-xs text-gray-600 leading-snug">{detail}</div>
                                            )}
                                          </div>
                                        </div>
                                      );
                                    })}
                                    {deroule.note?.trim() && (
                                      <p className="font-body text-xs text-gray-500 mt-2 mb-0">{deroule.note}</p>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })()}

                      {/* Sélection enfants pour ce stage */}
                      {/* Place réservée POUR CETTE FAMILLE suite à la liste d'attente.
                          Sans ce rappel, la famille notifiée par email arrive sur un
                          stage qui semble simplement disponible : rien ne lui dit que
                          la place lui est gardée, ni jusqu'à quand. */}
                      {(() => {
                        const hold = (first as any).waitlistHold;
                        if (!holdActive(first) || hold?.familyId !== familyId) return null;
                        const fin = new Date(hold.until);
                        return (
                          <div className="mt-3 rounded-lg border border-green-200 bg-green-50 px-3 py-2">
                            <div className="font-body text-xs font-semibold text-green-800">
                              🎉 Place réservée pour {hold.childName}
                            </div>
                            <div className="mt-0.5 font-body text-xs text-green-700">
                              Confirmez votre inscription avant le{" "}
                              {fin.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })} à{" "}
                              {fin.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}.
                              Passé ce délai, la place sera proposée aux autres familles.
                            </div>
                          </div>
                        );
                      })()}

                      {/* Appel à l'action visible SANS déplier la carte : sinon
                          un "Complet" seul donne l'impression d'une impasse. */}
                      {!isSelected && spots === 0 && (() => {
                        const dejaEnAttente = children.filter((ch: any) => enAttente(joursUniques[0]?.id, ch.id));
                        return (
                          <button
                            onClick={(e) => { e.stopPropagation(); setSelectedCreneau(first); setSelectedChildren([]); setStageBookingMode("jour"); setSelectedDays([]); }}
                            className={`mt-3 w-full flex items-center justify-center gap-2 rounded-lg border px-3 py-2 font-body text-xs font-semibold cursor-pointer ${
                              dejaEnAttente.length > 0
                                ? "border-green-200 bg-green-50 text-green-700 hover:bg-green-100"
                                : "border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-100"
                            }`}
                          >
                            {dejaEnAttente.length > 0
                              ? <>✓ {dejaEnAttente.map((ch: any) => ch.firstName).join(", ")} en liste d&apos;attente</>
                              : joursOuvertsALaJournee.length > 0
                                ? <>🗓 Semaine complète — des jours restent disponibles à l&apos;unité</>
                                : <>🔔 Stage complet — s&apos;inscrire en liste d&apos;attente</>}
                          </button>
                        );
                      })()}

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
                                {joursOuvertsALaJournee.length > 0
                                  ? <>🔔 La <strong>semaine complète</strong> n&apos;est plus disponible (un ou plusieurs jours sont pleins).
                                      Pour être prévenu si elle se libère, touchez un prénom (inscription immédiate) :</>
                                  : <>🔔 Ce stage est complet. Touchez un prénom pour l&apos;inscrire en liste d&apos;attente
                                      (l&apos;inscription est immédiate) :</>}
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {children.filter((ch: any) => !(first.enrolled || []).some((e: any) => e.childId === ch.id)).map((ch: any) => (
                                  enAttente(joursUniques[0]?.id, ch.id) ? (
                                    <span key={ch.id} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-green-200 bg-green-50 font-body text-xs font-semibold text-green-700">
                                      <Check size={12} /> {ch.firstName} — en liste d&apos;attente
                                    </span>
                                  ) : (
                                    <button key={ch.id}
                                      onClick={(e) => { e.stopPropagation(); addStageToWaitlist(stageCreneaux, ch.id); }}
                                      disabled={waitlistLoading === joursUniques[0]?.id}
                                      className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-orange-200 bg-orange-50 font-body text-xs text-orange-700 cursor-pointer hover:bg-orange-100 disabled:opacity-50">
                                      {waitlistLoading === joursUniques[0]?.id ? <Loader2 size={12} className="animate-spin" /> : "🔔"} Inscrire {ch.firstName}
                                    </button>
                                  )
                                ))}
                              </div>

                              {/* Stage ENTIÈREMENT plein et ouvert à la journée : la
                                  famille qui ne veut qu'un ou deux jours s'inscrit en
                                  attente de CES jours-là. Ne lister que les jours
                                  COMPLETS : si des jours ont encore des places, c'est
                                  le mode « À la journée » (juste au-dessus) qui gère —
                                  on réserve les jours ouverts, on n'attend pas. */}
                              {(() => {
                                const joursALaJournee = joursUniques.filter((c: any) => (c as any).allowDayBooking && spotsLeft(c) <= 0);
                                if (joursALaJournee.length === 0 || joursOuvertsALaJournee.length > 0) return null;
                                return (
                                  <div className="mt-3 rounded-lg border border-orange-100 bg-orange-50/60 p-2.5">
                                    <div className="font-body text-xs font-semibold text-orange-700 mb-1.5">
                                      Ou pour une journée précise seulement :
                                    </div>
                                    {joursALaJournee.map((c: any) => (
                                      <div key={c.id} className="flex flex-wrap items-center gap-1.5 mb-1.5 last:mb-0">
                                        <span className="font-body text-xs font-semibold text-slate-600 min-w-24">
                                          {new Date(c.date).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })}
                                        </span>
                                        {children.filter((ch: any) => !(c.enrolled || []).some((e: any) => e.childId === ch.id)).map((ch: any) => (
                                          enAttente(c.id, ch.id) ? (
                                            <span key={ch.id} className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-green-200 bg-green-50 font-body text-xs font-semibold text-green-700">
                                              <Check size={11} /> {ch.firstName} — en liste d&apos;attente
                                            </span>
                                          ) : (
                                            <button key={ch.id}
                                              onClick={(e) => { e.stopPropagation(); addToWaitlist(c, ch.id); }}
                                              disabled={waitlistLoading === c.id}
                                              className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-orange-200 bg-white font-body text-xs text-orange-700 cursor-pointer hover:bg-orange-100 disabled:opacity-50">
                                              {waitlistLoading === c.id ? <Loader2 size={11} className="animate-spin" /> : "🔔"} Inscrire {ch.firstName}
                                            </button>
                                          )
                                        ))}
                                      </div>
                                    ))}
                                  </div>
                                );
                              })()}
                            </>
                          )}
                        </div>
                      )}

                      {/* Réservation : semaine si elle est encore possible, et TOUJOURS
                          le mode journée tant que des jours ouverts à l'unité ont des
                          places — un lundi plein ne doit pas fermer le mardi. */}
                      {isSelected && (spots > 0 || joursOuvertsALaJournee.length > 0) && (() => {
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
                                  disabled={spots === 0}
                                  title={spots === 0 ? "Un ou plusieurs jours sont pleins : la semaine complète n'est plus disponible (liste d'attente ci-dessous)" : undefined}
                                  className={`flex-1 py-2 rounded-lg font-body text-sm font-semibold border ${spots === 0 ? "opacity-45 cursor-not-allowed bg-gray-100 text-gray-400 border-gray-200" : `cursor-pointer ${stageBookingMode === "semaine" ? "bg-green-600 text-white border-green-600" : "bg-white text-gray-600 border-gray-200"}`}`}>
                                  Semaine complète {spots === 0 ? "(complet)" : `(${prix.toFixed(0)}€)`}
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
                                      {daySpots <= 0 && <span className="text-xs ml-1">— complet</span>}
                                    </button>
                                  );
                                })}
                              </div>

                              {/* Liste d'attente PAR JOUR : un jour complet grisé sans
                                  alternative était une impasse — la seule file existante
                                  (« semaine entière ») ne sert à rien à une famille qui
                                  veut juste le mardi. Une entrée par jour rejoint le
                                  circuit des créneaux simples : hold 24h sur CE jour,
                                  email, confirmation — tout existe déjà. */}
                              {joursJournee.some((c: any) => spotsLeft(c) <= 0) && (
                                <div className="mt-2 rounded-lg border border-orange-100 bg-orange-50/60 p-2.5">
                                  <div className="font-body text-xs font-semibold text-orange-700 mb-1.5">
                                    🔔 Un jour complet vous intéresse ? Touchez un prénom pour l&apos;inscrire en liste
                                    d&apos;attente de ce jour (inscription immédiate, vous serez prévenus par email) :
                                  </div>
                                  {joursJournee.filter((c: any) => spotsLeft(c) <= 0).map((c: any) => (
                                    <div key={c.id} className="flex flex-wrap items-center gap-1.5 mb-1.5 last:mb-0">
                                      <span className="font-body text-xs font-semibold text-slate-600 min-w-24">
                                        {new Date(c.date).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })}
                                      </span>
                                      {children.filter((ch: any) => !(c.enrolled || []).some((e: any) => e.childId === ch.id)).map((ch: any) => (
                                        enAttente(c.id, ch.id) ? (
                                          <span key={ch.id} className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-green-200 bg-green-50 font-body text-xs font-semibold text-green-700">
                                            <Check size={11} /> {ch.firstName} — en liste d&apos;attente
                                          </span>
                                        ) : (
                                          <button key={ch.id}
                                            onClick={(e) => { e.stopPropagation(); addToWaitlist(c, ch.id); }}
                                            disabled={waitlistLoading === c.id}
                                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-orange-200 bg-white font-body text-xs text-orange-700 cursor-pointer hover:bg-orange-100 disabled:opacity-50">
                                            {waitlistLoading === c.id ? <Loader2 size={11} className="animate-spin" /> : "🔔"} Inscrire {ch.firstName}
                                          </button>
                                        )
                                      ))}
                                    </div>
                                  ))}
                                </div>
                              )}
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
                                disabled={reservationsFermees}
                                className={`w-full py-2.5 rounded-lg font-body text-sm font-semibold border-none ${reservationsFermees ? "bg-gray-200 text-gray-500 cursor-not-allowed" : "text-white bg-green-600 cursor-pointer hover:bg-green-500"}`}>
                                {reservationsFermees
                                  ? "Réservations fermées"
                                  : `Ajouter au panier (${selectedChildren.length} enfant${selectedChildren.length > 1 ? "s" : ""}${isJourMode ? ` · ${nbJours} jour${nbJours > 1 ? "s" : ""}` : ""})`}
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
                          {(() => {
                            const hold = (c as any).waitlistHold;
                            if (!holdActive(c) || hold?.familyId !== familyId) return null;
                            const fin = new Date(hold.until);
                            return (
                              <div className="mb-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2">
                                <div className="font-body text-xs font-semibold text-green-800">
                                  🎉 Place réservée pour {hold.childName}
                                </div>
                                <div className="mt-0.5 font-body text-xs text-green-700">
                                  Confirmez avant le{" "}
                                  {fin.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })} à{" "}
                                  {fin.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}.
                                </div>
                                {/* Le bandeau etait purement informatif : la famille
                                    lisait que la place lui etait gardee sans aucun
                                    moyen de l'accepter. Ce bouton ajoute directement
                                    l'enfant concerne au panier et ouvre le panier. */}
                                <button
                                  onClick={(ev) => {
                                    ev.stopPropagation();
                                    addCoursToCart(c, hold.childId);
                                    setShowCart(true);
                                  }}
                                  className="w-full mt-2 py-2.5 rounded-lg font-body text-xs font-bold text-white bg-green-600 hover:bg-green-500 border-none cursor-pointer">
                                  ✓ J'accepte cette place — passer au paiement
                                </button>
                              </div>
                            );
                          })()}
                          <div className="flex justify-between items-center">
                            <div className="flex items-center gap-3">
                              <div className="w-1 h-10 rounded-full" style={{ backgroundColor: tl.color }} />
                              <div>
                                <div className="font-body text-sm font-semibold text-blue-800">{titreAvecNiveau(c as any)}</div>
                                <div className="font-body text-xs text-slate-600">{c.startTime}–{c.endTime} · {c.monitor}</div>
                                {estPromenadeADefinir(c as any) && !niveauDuCreneau(c as any) && (
                                  <div className="font-body text-[11px] text-amber-700 mt-0.5">{libelleNiveauCreneau(c as any)} — premier arrivé, premier servi.</div>
                                )}
                                {estBalade(c) && (
                                  <div className="font-body text-[11px] text-slate-500 mt-0.5" title={CONSIGNE_ARRIVEE_BALADE}>⏱ {CONSIGNE_ARRIVEE_BALADE_COURTE}</div>
                                )}
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="font-body text-sm font-bold text-blue-500">{prix.toFixed(0)}€</div>
                              <Badge color={spots > 2 ? "green" : spots > 0 ? "orange" : "red"}>
                                {spots > 0 ? `${spots} pl.` : "Complet"}
                              </Badge>
                            </div>
                          </div>

                          {/* Balades collectives : minimum de participants annoncé AVANT la
                              réservation — c'est ce qui rend le supplément petit comité
                              opposable (cf. CGV_BALADES_PETIT_GROUPE). */}
                          <NotePetitComite creneau={c} activities={activities} className="mt-2" />

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
                                      onClick={(e) => { e.stopPropagation(); if (estPromenadeADefinir(c as any)) { setBookingCreneau(c); return; } addCoursToCart(c, ch.id); }}
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
                                  <div className="w-full mt-1 font-body text-xs text-orange-700 bg-orange-50 border border-orange-200 rounded-lg px-2 py-1.5">
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
                                    🔔 Ce créneau est complet. Touchez un prénom pour l&apos;inscrire en liste d&apos;attente
                                    (l&apos;inscription est immédiate) :
                                  </div>
                                  <div className="flex flex-wrap gap-2">
                                    {children.filter((ch: any) => !(c.enrolled || []).some((e: any) => e.childId === ch.id)).map((ch: any) => (
                                      enAttente(c.id, ch.id) ? (
                                        <span key={ch.id} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-green-200 bg-green-50 font-body text-xs font-semibold text-green-700">
                                          <Check size={12} /> {ch.firstName} — en liste d&apos;attente
                                        </span>
                                      ) : (
                                        <button key={ch.id}
                                          onClick={(e) => { e.stopPropagation(); addToWaitlist(c, ch.id); }}
                                          disabled={waitlistLoading === c.id}
                                          className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-orange-200 bg-orange-50 font-body text-xs text-orange-700 cursor-pointer hover:bg-orange-100 disabled:opacity-50">
                                          {waitlistLoading === c.id ? <Loader2 size={12} className="animate-spin" /> : "🔔"} Inscrire {ch.firstName}
                                        </button>
                                      )
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
        <ModaleChoixCavalier
          bookingCreneau={bookingCreneau} onClose={() => setBookingCreneau(null)}
          children={children} cart={cart} filter={filter}
          selCavaliers={selCavaliers} setSelCavaliers={setSelCavaliers}
          setShowCart={setShowCart} spotsLeft={spotsLeft} enAttente={enAttente}
          addCoursToCart={addCoursToCart} addToWaitlist={addToWaitlist}
          waitlistLoading={waitlistLoading} waitlistSuccess={waitlistSuccess}
          family={family} activities={activities} />
      )}

      {/* PANIER MODAL */}
      {showCart && (
        <ModalePanier
          cart={cart} setCart={setCart} removeFromCart={removeFromCart}
          onClose={() => setShowCart(false)} creneaux={creneaux} isStage={isStage}
          totaux={totauxPanier(cart)} familyAvoirs={familyAvoirs}
          depositMode={depositMode} cartPayMode={cartPayMode} setCartPayMode={setCartPayMode}
          cgvAccepted={cgvAccepted} setCgvAccepted={setCgvAccepted}
          cartPaySuccess={cartPaySuccess} setCartPaySuccess={setCartPaySuccess}
          paying={paying} setPaying={setPaying} handlePay={handlePay}
          user={user} family={family} />
      )}
    </div>
  );
}
