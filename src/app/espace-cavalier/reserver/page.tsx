"use client";

/**
 * src/app/espace-cavalier/reserver/page.tsx
 *
 * Écran de réservation des FAMILLES (espace cavalier). C'est la page qui prend
 * l'argent en ligne : une régression ici se voit immédiatement côté client.
 *
 * Ce fichier est volontairement réduit au rôle d'ORCHESTRATEUR : il détient
 * l'état (panier, sélections, filtres), charge les données Firestore, et
 * assemble les morceaux. Tout le reste vit à côté, dans des fichiers qu'on peut
 * relire isolément :
 *   - types.ts / libelles.ts ......... formes de données et libellés partagés
 *   - utils-reservation.ts ........... règles pures (tarif stage, places, dates)
 *   - panier.ts ...................... préparation des lignes de panier
 *   - paiement.ts .................... inscriptions, réservations, CAWL, avoir
 *   - liste-attente.ts ............... entrées waitlist (créneau et stage)
 *   - ListeStages / CarteStage ....... section stages de la vue liste
 *   - ListeCours / CarteCours ........ section cours & activités
 *   - ModaleChoixCavalier ............ sélection des cavaliers depuis le planning
 *   - ModalePanier ................... panier, mode de règlement, paiement
 *   - Bandeaux / EcransAcces ......... annonces et écrans d'accès
 *
 * Les gestionnaires qui restent ici sont ceux qui touchent à l'état React :
 * ils enchaînent une fonction métier (fichier voisin) puis les `setState` et
 * les messages affichés à la famille.
 */

import { useState, useEffect, useRef, useMemo } from "react";
import { STAGE_ACOMPTE_EUROS } from "@/lib/cgv-clauses";
import { collection, getDocs, getDoc, doc, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { Card } from "@/components/ui";
import { Loader2, ShoppingCart, Check, CalendarDays, LayoutList } from "lucide-react";
import TimelineReservation from "./TimelineReservation";
import { useSearchParams } from "next/navigation";
import { compareCreneauxByDate } from "@/lib/creneau-sort";
import { useToast } from "@/components/ui/Toast";
import type { CartItem, Creneau } from "./types";
import { fmtDate } from "./utils-reservation";
import { preparerAjoutStageAuPanier } from "./panier";
import {
  creerPaiementEnAttente, declarerPaiementDiffere, demanderCheckoutCawl,
  enregistrerInfosStage, inscrireEtCreerReservations, payerAvecAvoir,
} from "./paiement";
import { inscrireEnListeAttente, inscrireStageEnListeAttente, nomCompletCavalier } from "./liste-attente";
import { BandeauReservationsFermees, BandeauxPlacesReservees } from "./Bandeaux";
import { EcranNonConnecte, EcranProfilIncomplet } from "./EcransAcces";
import FiltresReservation from "./FiltresReservation";
import ListeStages from "./ListeStages";
import ListeCours from "./ListeCours";
import ModaleChoixCavalier from "./ModaleChoixCavalier";
import ModalePanier from "./ModalePanier";

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
  useEffect(() => {
    if (creneauRouvert.current || typeof window === "undefined" || creneaux.length === 0) return;
    const cid = new URLSearchParams(window.location.search).get("creneau");
    if (!cid) { creneauRouvert.current = true; return; }
    const c = creneaux.find((x: any) => x.id === cid);
    if (c) setBookingCreneau(c);
    creneauRouvert.current = true;
  }, [creneaux]);
  // Mode paiement dans le panier
  const [cartPayMode, setCartPayMode] = useState<"cb" | "cheque" | "especes" | "virement" | "avoir">("cb");
  // Acceptation des conditions d'annulation (stages uniquement).
  const [cgvAccepted, setCgvAccepted] = useState(false);
  const [cartPaySuccess, setCartPaySuccess] = useState(false);
  const [success, setSuccess] = useState(false);
  const [waitlistSuccess, setWaitlistSuccess] = useState<string | null>(null); // creneauId confirmé
  const [waitlistLoading, setWaitlistLoading] = useState<string | null>(null); // creneauId en cours
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
    if (user?.uid) rechargerAvoirs(user.uid);
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

  // Ajouter au panier (stage = multi-enfants, cours = 1 enfant).
  // Le calcul (prix, doublons, conflits d'horaires) vit dans panier.ts ; ici on
  // ne garde que les messages et l'état.
  const addStageToCart = (stageCreneaux: Creneau[], prixJourParam?: number, totalJoursStageParam?: number) => {
    if (reservationsFermees) {
      alert(messageFermeture ||
        "Les réservations en ligne ne sont pas encore ouvertes. Contactez le centre équestre pour toute demande.");
      return;
    }

    if (selectedChildren.length === 0) return;

    const { items, conflits } = preparerAjoutStageAuPanier({
      stageCreneaux, prixJourParam, totalJoursStageParam,
      selectedChildren, children, cart, creneaux, familyId,
      stageBookingMode, existingStageCount, prixPlancherStage,
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

    // Forme fonctionnelle par coherence (ce chemin ajoute tous les enfants
    // d'un coup, mais un appel concurrent ne doit rien ecraser).
    setCart((prev) => [...prev, ...items]);
    setSelectedChildren([]);
    setSelectedCreneau(null);
    setShowCart(true);
  };

  const addCoursToCart = (creneau: Creneau, childId: string, opts?: { viaHold?: boolean }) => {
    if (reservationsFermees) {
      alert(messageFermeture ||
        "Les réservations en ligne ne sont pas encore ouvertes. Contactez le centre équestre pour toute demande.");
      return;
    }

    // Bloquer le doublon panier (verification rapide sur l'etat courant ;
    // la garde definitive est dans le setCart fonctionnel ci-dessous)
    if (cart.some(i => i.childId === childId && i.creneauIds.includes(creneau.id))) {
      toast("Cet enfant est déjà dans le panier pour ce créneau.", "warning");
      return;
    }
    const child = children.find((c: any) => c.id === childId);

    // ── Règle métier : 12 ans minimum pour les promenades ──────────────
    // "Année des 12 ans" : l'enfant doit être né au plus tard l'année N-12
    // (où N = année courante). Ex : en 2026, il faut être né en 2014 ou avant.
    if (creneau.activityType === "balade" && child && !opts?.viaHold) {
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
    // ⚠️ Forme FONCTIONNELLE obligatoire : `setCart([...cart, x])` capture le
    // panier fige au rendu. Sur une inscription multi-cavaliers (boucle
    // forEach sur la selection), les deux appels partaient du meme panier et
    // le second ECRASAIT le premier — une seule personne etait facturee.
    setCart((prev) => {
      if (prev.some(i => i.childId === childId && i.creneauIds.includes(creneau.id))) return prev;
      return [...prev, {
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
      }];
    });
    setSelectedCreneau(null);
    setSelectedChildren([]);
  };

  const removeFromCart = (idx: number) => setCart(cart.filter((_, i) => i !== idx));
  const cartTotal = cart.reduce((s, i) => s + i.prixFinal, 0);
  // Le panier contient-il un stage ? La clause d'annulation à 3 semaines ne
  // concerne que les stages : inutile de la faire accepter pour une balade.
  const cartHasStage = cart.some((i: any) => i.isStage === true);
  const cartTotalReductions = cart.reduce((s, i) => s + i.remiseEuros, 0);
  const ACOMPTE_PAR_ENFANT = STAGE_ACOMPTE_EUROS; // source unique cgv-clauses
  const nbEnfantsStage = cart.filter(i => i.isStage).length;
  const acompteFixe = Math.min(ACOMPTE_PAR_ENFANT * nbEnfantsStage, cartTotal);
  const soldeFixe = Math.round((cartTotal - acompteFixe) * 100) / 100;

  // Paiement
  const handlePay = async () => {
    if (cart.length === 0 || !family || !user) return;
    if (reservationsFermees) {
      alert(messageFermeture ||
        "Les réservations en ligne ne sont pas encore ouvertes. Contactez le centre équestre pour toute demande.");
      return;
    }

    setPaying(true);
    try {
      // 1. Inscrire chaque enfant dans chaque créneau (+ réservations)
      await inscrireEtCreerReservations(cart, creneaux, user, family);

      // 2. Créer le paiement pending
      const newPaymentId = await creerPaiementEnAttente({ cart, creneaux, cartHasStage, cartTotal, user, family });

      const hasStage = cart.some(i => i.isStage);
      const isDeposit = hasStage && depositMode === "deposit";
      const firstStageCreneau = hasStage ? creneaux.find(c => c.id === cart.find(i => i.isStage)?.creneauIds[0]) : null;
      const stageDate = firstStageCreneau?.date || "";

      // Stocker les infos stage/acompte dans le paiement
      if (hasStage) {
        await enregistrerInfosStage(newPaymentId, {
          stageDate: stageDate,
          stageTitle: cart.find(i => i.isStage)?.activityTitle || "",
          acompteAmount: acompteFixe,
          soldeAmount: soldeFixe,
        });
      }

      const urlCawl = await demanderCheckoutCawl({
        user, family,
        paymentId: newPaymentId,
        totalTTC: isDeposit ? acompteFixe : cartTotal,
        depositPercent: isDeposit ? Math.round(acompteFixe / cartTotal * 100) : null,
        stageDate,
        cart,
      });
      if (urlCawl) {
        // Redirection immédiate vers CAWL — pas de setCart ici pour éviter le message "panier vide"
        window.location.href = urlCawl;
        return;
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

  // Règlement par avoir (bouton du panier).
  const handlePayerAvecAvoir = async () => {
    if (!user || !family) return;
    setPaying(true);
    try {
      await payerAvecAvoir(cart);
      setCart([]);
      setCartPaySuccess(true);
    } catch (e: any) {
      console.error(e);
      alert(`Erreur lors du paiement par avoir${e?.message ? ` : ${e.message}` : ""}.`);
    }
    setPaying(false);
  };

  // Déclaration d'un paiement chèque / espèces / virement (bouton du panier).
  const handleDeclarerPaiement = async () => {
    if (!user || !family) return;
    setPaying(true);
    try {
      await declarerPaiementDiffere({ cart, creneaux, cartTotal, cartPayMode, user, family, familyId });
      setCartPaySuccess(true);
      setCart([]);
    } catch (e) { console.error(e); toast("Erreur. Réessayez.", "error"); }
    setPaying(false);
  };

  const addToWaitlist = async (c: Creneau, childId: string) => {
    if (!user || !family) return;
    const childObj = children.find((ch: any) => ch.id === childId) as any;
    const childName = nomCompletCavalier(childObj);
    setWaitlistLoading(c.id);
    try {
      const dejaInscrit = await inscrireEnListeAttente({ creneau: c, childId, childName, user, family });
      if (dejaInscrit) {
        toast("Vous êtes déjà en liste d'attente pour ce créneau.", "warning");
        setWaitlistLoading(null); return;
      }
      setWaitlistSuccess(c.id);
      setTimeout(() => setWaitlistSuccess(null), 4000);
    } catch (e) { console.error(e); toast("Erreur. Réessayez.", "error"); }
    setWaitlistLoading(null);
  };

  const addStageToWaitlist = async (stageCreneaux: Creneau[], childId: string) => {
    if (!user || !family || stageCreneaux.length === 0) return;
    const jours = [...stageCreneaux].sort((a, b) => a.date.localeCompare(b.date));
    const first = jours[0];
    const childObj = children.find((c: any) => c.id === childId);
    const childName = nomCompletCavalier(childObj);
    setWaitlistLoading(first.id);
    try {
      const dejaInscrit = await inscrireStageEnListeAttente({ jours, childId, childName, user, family });
      if (dejaInscrit) {
        toast("Vous êtes déjà en liste d'attente pour ce stage.", "warning");
        setWaitlistLoading(null); return;
      }
      setWaitlistSuccess(first.id);
      setTimeout(() => setWaitlistSuccess(null), 4000);
    } catch (e) { console.error(e); toast("Erreur. Réessayez.", "error"); }
    setWaitlistLoading(null);
  };

  // Pas connecté
  if (!user) return <EcranNonConnecte />;

  // Connecté mais pas de fiche famille (nouveau compte)
  if (!family) return <EcranProfilIncomplet bookingCreneau={bookingCreneau} />;

  return (
    <div>
      {reservationsFermees && <BandeauReservationsFermees messageFermeture={messageFermeture} />}

      <BandeauxPlacesReservees
        creneaux={creneaux}
        familyId={familyId}
        onAccepter={(c, childId) => { addCoursToCart(c, childId, { viaHold: true }); setShowCart(true); }}
      />

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
          // Rafraîchit au cas où un avoir aurait été créé depuis l'arrivée.
          if (user?.uid) await rechargerAvoirs(user.uid);
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
          creneaux={(creneauxLarge.length > 0 ? creneauxLarge : creneaux).filter(c => c.activityType !== "stage" && c.activityType !== "stage_journee")}
          children={(family?.children || []).map((c: any) => ({ id: c.id, firstName: c.firstName, galopLevel: c.galopLevel }))}
          familyId={familyId}
          onBook={(creneau) => { setBookingCreneau(creneau as any); }}
        />
      </>)}

      {/* ── VUE LISTE ── */}
      {(viewMode === "liste" || filter !== "all") && (<>

      <FiltresReservation
        initialFilter={initialFilter}
        filter={filter}
        setFilterAndReset={setFilterAndReset}
        availableSubcats={availableSubcats}
        subfilter={subfilter}
        setSubfilter={setSubfilter}
        monthOffset={monthOffset}
        setMonthOffset={setMonthOffset}
        monthLabel={monthLabel}
      />

      {loading ? <div className="text-center py-16"><Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto" /></div> : (
        <div className="flex flex-col gap-6">
          {/* STAGES */}
          {(filter === "all" || filter === "stage") && Object.entries(stageGroups).length > 0 && (
            <ListeStages
              stageGroups={stageGroups}
              activities={activities}
              deroule={deroule}
              familyId={familyId}
              cavaliers={children}
              selectedCreneau={selectedCreneau}
              setSelectedCreneau={setSelectedCreneau}
              selectedChildren={selectedChildren}
              setSelectedChildren={setSelectedChildren}
              stageBookingMode={stageBookingMode}
              setStageBookingMode={setStageBookingMode}
              selectedDays={selectedDays}
              setSelectedDays={setSelectedDays}
              expandedStageDetail={expandedStageDetail}
              setExpandedStageDetail={setExpandedStageDetail}
              waitlistSuccess={waitlistSuccess}
              waitlistLoading={waitlistLoading}
              addStageToWaitlist={addStageToWaitlist}
              addStageToCart={addStageToCart}
              existingStageCount={existingStageCount}
              prixPlancherStage={prixPlancherStage}
              reservationsFermees={reservationsFermees}
            />
          )}

          {/* COURS / BALADES */}
          {(filter === "all" || filter === "cours" || filter === "balade") && Object.entries(coursByDate).length > 0 && (
            <ListeCours
              coursByDate={coursByDate}
              familyId={familyId}
              cavaliers={children}
              selectedCreneau={selectedCreneau}
              setSelectedCreneau={setSelectedCreneau}
              setSelectedChildren={setSelectedChildren}
              addCoursToCart={addCoursToCart}
              addToWaitlist={addToWaitlist}
              setShowCart={setShowCart}
              waitlistSuccess={waitlistSuccess}
              waitlistLoading={waitlistLoading}
            />
          )}

          {available.length === 0 && <Card padding="lg" className="text-center"><p className="font-body text-sm text-gray-600">Aucune activité disponible sur cette période.</p></Card>}
        </div>
      )}

      </>) }{/* fin vue liste */}

      {/* ── MODAL SÉLECTION ENFANT (depuis Timeline) ── */}
      {bookingCreneau && (
        <ModaleChoixCavalier
          bookingCreneau={bookingCreneau}
          setBookingCreneau={setBookingCreneau}
          family={family}
          cavaliers={children}
          familyId={familyId}
          cart={cart}
          selCavaliers={selCavaliers}
          setSelCavaliers={setSelCavaliers}
          addCoursToCart={addCoursToCart}
          addToWaitlist={addToWaitlist}
          waitlistSuccess={waitlistSuccess}
          waitlistLoading={waitlistLoading}
          setShowCart={setShowCart}
        />
      )}

      {/* PANIER MODAL */}
      {showCart && (
        <ModalePanier
          cart={cart}
          removeFromCart={removeFromCart}
          cartTotal={cartTotal}
          cartTotalReductions={cartTotalReductions}
          cartHasStage={cartHasStage}
          nbEnfantsStage={nbEnfantsStage}
          acompteFixe={acompteFixe}
          soldeFixe={soldeFixe}
          depositMode={depositMode}
          cartPayMode={cartPayMode}
          setCartPayMode={setCartPayMode}
          cgvAccepted={cgvAccepted}
          setCgvAccepted={setCgvAccepted}
          cartPaySuccess={cartPaySuccess}
          familyAvoirs={familyAvoirs}
          paying={paying}
          setShowCart={setShowCart}
          handlePay={handlePay}
          onPayerAvecAvoir={handlePayerAvecAvoir}
          onDeclarerPaiement={handleDeclarerPaiement}
        />
      )}
    </div>
  );
}
