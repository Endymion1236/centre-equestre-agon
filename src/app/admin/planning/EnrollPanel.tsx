"use client";
/**
 * src/app/admin/planning/EnrollPanel.tsx
 *
 * Panneau d'inscription d'un cavalier sur un créneau : à la séance, à l'année
 * via forfait, en stage, en compétition, sur carte, en rattrapage, en
 * pré-inscription ou en liste d'attente.
 *
 * C'est le fichier le plus sensible de l'application : il crée de vrais
 * paiements, de vraies échéances SEPA et de vraies factures. Ce qui reste ici
 * est l'ORCHESTRATION — l'état du formulaire et l'enchaînement des écritures
 * Firestore, dans l'ordre exact où elles doivent partir. Tout ce qui pouvait
 * en être isolé sans toucher à cet enchaînement l'a été :
 *
 *   enroll-tarifs.ts       les calculs de prix (prorata, différentiel, remises)
 *   enroll-helpers.ts      les questions pures (conflit horaire, forfait, statut)
 *   enroll-constantes.ts   les valeurs de repli et les tables de libellés
 *   enroll-types.ts        les formes de données partagées
 *   *.tsx voisins          les blocs d'écran (notes, stage, forfait, listes…)
 *
 * Règle de survie pour la suite : un calcul de prix n'a rien à faire dans ce
 * fichier, et une écriture Firestore d'inscription n'a rien à faire ailleurs.
 */
import { useState, useEffect, useMemo, useRef } from "react";
import { STAGE_ACOMPTE_EUROS } from "@/lib/cgv-clauses";
import { collection, getDocs, getDoc, updateDoc, doc, query, where, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Badge } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { estSemaineAttendue } from "@/lib/rythme";
import { X, Plus, Check, Loader2, Users, UserPlus, Search, Mail, FileText, Printer } from "lucide-react";
import { Creneau, fmtDate, typeColors, sameStage } from "./types";
import { useAuth } from "@/lib/auth-context";
import type { EnrollPanelProps, AjoutJoursStage, FamilleAvecId, RegleReductionFamille, StatutSepa } from "./enroll-types";
import { PARAMS_INSCRIPTION_DEFAUT, JOURS_COURTS_DEPUIS_DIMANCHE } from "./enroll-constantes";
import {
  filtrerFamilles, trouveConflitHoraire, forfaitsQuinzaineNonAttendus, destinatairesCreneau,
} from "./enroll-helpers";
import {
  prixForfaitPlein as prixForfaitPleinPour, calculeFinSaisonEffective, calculeProrata,
  calculeRangEnfantFamille, calculeFrequenceDejaInscrite, calculePrixForfaitAnnuel,
  calculePrixForfaitBrut, calculeReductionFamille, calculeAdhesionDegressive,
  calculePriceTTC, prixAfficheEntete, calculeAcompteStage,
} from "./enroll-tarifs";
import SepaWarning from "./SepaWarning";
import NotesSeance from "./NotesSeance";
import PlanSeance, { LightboxPlan, usePlanSeance } from "./PlanSeance";
import ListeInscrits from "./ListeInscrits";
import ListeAttente, { AjoutListeAttente, BandeauPlaceTenue } from "./ListeAttente";
import FormulaireEmailCreneau from "./FormulaireEmailCreneau";
import NouvelleFamilleForm from "./NouvelleFamilleForm";
import FormulaireAjoutCavalier from "./FormulaireAjoutCavalier";
import RecapStage from "./RecapStage";
import FormulaireCompetition from "./FormulaireCompetition";
import FormulaireForfaitAnnuel from "./FormulaireForfaitAnnuel";
import FormulaireInscriptionCours from "./FormulaireInscriptionCours";
import AjoutJoursStagePanel from "./AjoutJoursStagePanel";
import BandeauImpayes from "./BandeauImpayes";
import { useListeAttente } from "./useListeAttente";
import { useSessionsSaison, useLignesStage } from "./useTarifsInscription";
import { constituerPanierStage, creerForfaitEtPaiementAnnuel } from "./enroll-paiements";
import {
  inscrireSaisonEtablissement, inscrireSurToutesLesSeances, verifierEtAlerterSiComplet,
} from "./enroll-inscriptions";
import {
  genererEmailCreneauIA, envoyerEmailCreneau,
  imprimerFichesProgression, envoyerFicheProgression, envoyerConfirmationStage,
} from "./enroll-communications";

function EnrollPanel({ creneau, families, allCreneaux, payments, allCartes, allForfaits, onClose, onEnroll, onUnenroll, onRefresh }: EnrollPanelProps) {
  const { toast: panelToast } = useToast();
  const { isAdmin, isMoniteur } = useAuth();
  const [search, setSearch] = useState(""); const [selFam, setSelFam] = useState(""); const [selChild, setSelChild] = useState("");
  const [enrolling, setEnrolling] = useState(false); const [justEnrolled, setJustEnrolled] = useState("");

  // Inscription établissement sur TOUTE la saison, sans facturation aux
  // parents (cf. enroll-inscriptions.ts). Seul l'indicateur d'attente reste
  // ici : c'est lui qui désactive le bouton pendant la salve d'écritures.
  const [enrollingSaison, setEnrollingSaison] = useState(false);
  const inscrireSaison = async (childId: string, childName: string, familyId: string, familyName: string) => {
    if (!childId) { panelToast("Sélectionne d'abord un cavalier", "error"); return; }
    setEnrollingSaison(true);
    await inscrireSaisonEtablissement({
      creneau, dateFinSaisonEffective, childId, childName, familyId, familyName,
      panelToast, setJustEnrolled, onRefresh,
    });
    setEnrollingSaison(false);
  };
  const [showPay, setShowPay] = useState(false); const [payMode, setPayMode] = useState("cb_terminal"); const [unenrolling, setUnenrolling] = useState("");
  const [avoirSolde, setAvoirSolde] = useState<Record<string, number>>({});
  const [freeEnroll, setFreeEnroll] = useState(false);
  // PRE-INSCRIPTION : poser un cavalier sur un creneau sans rien declencher —
  // ni paiement, ni facture, ni email. Sert a remplir les cours avant que les
  // mandats de prelevement soient signes. Se supprime comme une inscription
  // ordinaire, ou se transforme en inscription definitive une fois les
  // conditions reunies.
  const [preinscription, setPreinscription] = useState(false);
  const [conversion, setConversion] = useState<string | null>(null);

  /**
   * Transforme une pré-inscription en inscription définitive.
   *
   * On retire la pré-inscription puis on REPASSE PAR LE FORMULAIRE, au lieu de
   * créer le paiement en douce. C'est volontaire : le mode de paiement se
   * choisit ici, et notamment le prélèvement SEPA, qui exige un mandat actif,
   * un échéancier et un montant annuel — rien qu'une conversion silencieuse ne
   * saurait deviner. Le cavalier et sa famille sont pré-sélectionnés, il ne
   * reste qu'à choisir le règlement et valider.
   */
  const convertirPreinscription = async (e: any) => {
    if (!confirm(
      `Transformer la pré-inscription de ${e.childName} en inscription définitive ?\n\n` +
      `Elle sera retirée de la liste et le formulaire s'ouvrira pré-rempli : ` +
      `vous choisirez le mode de règlement (dont le prélèvement SEPA) avant de valider.`
    )) return;
    setConversion(e.childId);
    try {
      await onUnenroll(creneau.id!, e.childId);
      setSelFam(e.familyId);
      setSelChild(e.childId);
      setSelectedChildren([e.childId]);
      setPreinscription(false);
      setShowPay(false);
      setSearch(e.familyName || "");
      if ((e as any).preinscriptionMode === "annuel") setInscriptionMode("annuel");
      // Sur un stage, le cavalier se coche dans le selecteur multi-enfants.
      if ((e as any).preinscriptionMode === "stage") setSelectedChildren([e.childId]);
      panelToast(`${e.childName} — choisissez le règlement puis validez l'inscription`, "success");
      await onRefresh?.();
    } catch (err: any) {
      panelToast(`Échec : ${err?.message || err}`, "error");
    }
    setConversion(null);
  };
  const [freeReason, setFreeReason] = useState("Rattrapage");
  const [childRattrapages, setChildRattrapages] = useState<any[]>([]);
  const [useRattrapage, setUseRattrapage] = useState<string | null>(null); // rattrapageId
  const [inscriptionMode, setInscriptionMode] = useState<"ponctuel" | "annuel">("ponctuel");
  const [weekCreneaux, setWeekCreneaux] = useState<(Creneau & { id: string })[]>([]);
  const [licenceType, setLicenceType] = useState<"moins18" | "plus18">("moins18");
  // ── Mode compétition ──
  const isCompetition = creneau.activityType === "competition";
  const [compEpreuves, setCompEpreuves] = useState<{ epreuve: string; montant: string }[]>([{ epreuve: "", montant: "" }]);
  const [compCoaching, setCompCoaching] = useState("");
  const [adhesion, setAdhesion] = useState(true);
  const [licence, setLicence] = useState(true);
  const [assuranceOccasionnelle, setAssuranceOccasionnelle] = useState(false);
  const [payPlan, setPayPlan] = useState<"1x" | "3x" | "10x">("1x");
  const [annualPayMode, setAnnualPayMode] = useState<string>("cb_terminal");
  // Verdict du controle de mandat, remonte par SepaWarning : sans lui, le
  // bouton restait actif et l'inscription echouait au clic.
  const [sepaStatus, setSepaStatus] = useState<StatutSepa>("loading");
  const sepaBloque =
    inscriptionMode === "annuel" &&
    annualPayMode === "prelevement_sepa" &&
    sepaStatus === "missing" &&
    !preinscription;

  // ── Protection contre fermeture involontaire du panel ──────────────
  // Bug rapporte : un clic mal place sur le fond noir (ou un raccourci
  // navigateur) fermait le panel et faisait perdre la saisie en cours.
  // On considere qu'une saisie est "en cours" des qu'une famille est
  // selectionnee — c'est suffisant pour proteger les cas courants.
  // hasFormChanges centralise ce check.
  const [inscriptionFaite, setInscriptionFaite] = useState(false);
  const hasFormChanges = !!(selFam || selChild) && !inscriptionFaite;

  // confirmClose : remplace les appels onClose() directs. Si une saisie
  // est en cours, demande une confirmation native avant fermeture.
  const confirmClose = () => {
    if (hasFormChanges && !confirm("Une saisie est en cours. Quitter sans enregistrer ?")) {
      return;
    }
    onClose();
  };

  // beforeunload : si l'utilisateur ferme l'onglet, recharge la page,
  // ferme le navigateur ou suit un lien externe pendant qu'une saisie
  // est en cours, on lui montre l'avertissement natif du navigateur.
  // (Texte personnalise non supporte par les navigateurs modernes mais
  // l'evenement bloque la sortie le temps que l'utilisateur confirme.)
  useEffect(() => {
    if (!hasFormChanges) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = ""; // requis pour Chrome
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasFormChanges]);

  // ── Création famille inline ──
  const [showNewFamily, setShowNewFamily] = useState(false);
  // ── Surlignage manuel d'une inscription (usage interne) ───────────────
  // Marqueur libre, porte par l'INSCRIPTION a un creneau precis (pas par le
  // cavalier) : surligner Lola sur le stage de mardi ne marque pas ses
  // autres cours. Un clic pose, un clic retire.
  const [highlightBusy, setHighlightBusy] = useState<string>("");
  const toggleHighlight = async (e: any) => {
    if (!creneau.id || highlightBusy) return;
    setHighlightBusy(e.childId);
    try {
      const snap = await getDoc(doc(db, "creneaux", creneau.id));
      if (!snap.exists()) return;
      const list = (snap.data() as any).enrolled || [];
      const maj = list.map((x: any) =>
        x.childId === e.childId ? { ...x, highlight: !x.highlight } : x
      );
      await updateDoc(doc(db, "creneaux", creneau.id), { enrolled: maj });
      await onRefresh?.();
    } catch (err) {
      console.error("Surlignage :", err);
    }
    setHighlightBusy("");
  };

  const [localFamilies, setLocalFamilies] = useState<FamilleAvecId[]>([]);
  // Cavaliers ajoutés depuis cette modale : `families` vient du parent et ne
  // peut pas être muté ici, on superpose donc la liste à jour le temps de la
  // session pour que le nouveau cavalier apparaisse sans recharger le planning.
  const [childOverrides, setChildOverrides] = useState<Record<string, any[]>>({});
  const allFamilies = useMemo(
    () => [...families, ...localFamilies].map((f: any) =>
      childOverrides[f.firestoreId] ? { ...f, children: childOverrides[f.firestoreId] } : f),
    [families, localFamilies, childOverrides]);
  // Ajout d'un cavalier à une famille DÉJÀ existante, sans quitter la modale.
  // Auparavant il fallait sortir du planning, passer par la fiche famille,
  // puis revenir — et souvent reprendre la recherche du créneau.
  const [showAddChild, setShowAddChild] = useState(false);
  const [addingChild, setAddingChild] = useState(false);
  const [childDraft, setChildDraft] = useState({ firstName: "", lastName: "", birthDate: "", galopLevel: "—" });

  // Enregistrement du cavalier ajouté depuis la modale. Reste ici (et non
  // dans FormulaireAjoutCavalier) parce qu'il repositionne la sélection du
  // panneau : le cavalier qu'on vient de créer doit être celui qu'on inscrit.
  const ajouterCavalierAFamille = async (fam: any) => {
    setAddingChild(true);
    try {
      const nouveau = {
        id: `child_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        firstName: childDraft.firstName.trim(),
        lastName: (childDraft.lastName || "").trim(),
        birthDate: childDraft.birthDate ? new Date(childDraft.birthDate) : null,
        galopLevel: childDraft.galopLevel || "—",
        sanitaryForm: null,
      };
      const liste = [...(fam.children || []), nouveau];
      await updateDoc(doc(db, "families", fam.firestoreId), {
        children: liste, updatedAt: serverTimestamp(),
      });
      // Le cavalier apparaît immédiatement dans la liste,
      // sans recharger tout le planning.
      setChildOverrides(prev => ({ ...prev, [fam.firestoreId]: liste }));
      // Et il est présélectionné : c'est bien pour l'inscrire
      // qu'on vient de le créer.
      setSelectedChildren(inscriptionMode === "annuel" ? [nouveau.id] : [...selectedChildren, nouveau.id]);
      if (!selChild) setSelChild(nouveau.id);
      setShowAddChild(false);
      panelToast(`${nouveau.firstName} ajouté(e) à la famille`, "success");
    } catch (e: any) {
      panelToast(`Échec : ${e?.message || e}`, "error");
    }
    setAddingChild(false);
  };

  // Formulaire d'ajout d'un cavalier, partagé entre les créneaux ordinaires et
  // les stages. Fonction locale (et non composant déclaré ici) : un composant
  // déclaré dans le corps du panneau serait recréé à chaque rendu, et le champ
  // perdrait le focus à chaque lettre tapée. Le vrai composant, lui, est
  // défini au niveau module dans FormulaireAjoutCavalier.tsx : son identité
  // est stable, le focus est donc préservé.
  const renderAjoutCavalier = (fam: any) => (
    <FormulaireAjoutCavalier
      fam={fam} childDraft={childDraft} setChildDraft={setChildDraft}
      addingChild={addingChild}
      onAjouter={() => ajouterCavalierAFamille(fam)}
      onAnnuler={() => setShowAddChild(false)}
    />
  );

  // Plan de séance : état, upload et visionneuse (cf. PlanSeance.tsx).
  const plan = usePlanSeance(creneau);
  const { planUrl, planType } = plan;
  const inscritsRef = useRef<HTMLDivElement>(null);
  const hasScrolledToInscrits = useRef(false);

  // Charger le solde avoir quand on sélectionne une famille
  useEffect(() => {
    if (!selFam) return;
    if (avoirSolde[selFam] !== undefined) return;
    getDocs(query(collection(db, "avoirs"), where("familyId", "==", selFam)))
      .then(snap => {
        const total = snap.docs.reduce((s, d) => {
          const a = d.data();
          return s + (a.status === "actif" ? (a.remainingAmount || 0) : 0);
        }, 0);
        setAvoirSolde(prev => ({ ...prev, [selFam]: Math.round(total * 100) / 100 }));
      })
      .catch(() => {});
  }, [selFam]);

  // Charger les rattrapages disponibles pour l'enfant sélectionné
  useEffect(() => {
    if (!selChild) { setChildRattrapages([]); setUseRattrapage(null); return; }
    const today = new Date().toISOString().split("T")[0];
    getDocs(query(collection(db, "rattrapages"), where("childId", "==", selChild), where("status", "==", "pending")))
      .then(snap => {
        const valid = snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter((r: any) => !r.expiryDate || r.expiryDate >= today);
        setChildRattrapages(valid);
      })
      .catch(() => setChildRattrapages([]));
    setUseRattrapage(null);
  }, [selChild]);

  const [selectedChildren, setSelectedChildren] = useState<string[]>([]);
  const [stageMode, setStageMode] = useState<"semaine" | "jour">("semaine");
  const [stageDaysCount, setStageDaysCount] = useState<number>(0);
  const [stagePayChoice, setStagePayChoice] = useState<"acompte" | "total">("total");
  const [showAddDays, setShowAddDays] = useState<AjoutJoursStage | null>(null);
  const isStage = creneau.activityType === "stage" || creneau.activityType === "stage_journee";

  // ── Email créneau ──
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [emailSending, setEmailSending] = useState(false);
  const [emailGenerating, setEmailGenerating] = useState(false);
  const [progressionSending, setProgressionSending] = useState(false);

  // Charger le nombre réel de jours du stage depuis Firestore (pas allCreneaux qui est limité à la vue)
  useEffect(() => {
    if (!isStage) return;
    const creneauDate = new Date(creneau.date);
    const dow = creneauDate.getDay();
    const mon = new Date(creneauDate); mon.setDate(mon.getDate() - ((dow + 6) % 7));
    const sun = new Date(mon); sun.setDate(sun.getDate() + 6);
    const monStr = mon.toISOString().split("T")[0];
    const sunStr = sun.toISOString().split("T")[0];

    getDocs(query(collection(db, "creneaux"), where("date", ">=", monStr), where("date", "<=", sunStr)))
      .then(snap => {
        const days = snap.docs.filter(d => {
          const data = d.data();
          return data.activityTitle === creneau.activityTitle &&
            (data.activityType === "stage" || data.activityType === "stage_journee");
        }).length;
        setStageDaysCount(days || 1);
        console.log(`📋 Stage "${creneau.activityTitle}" : ${days} jour(s) cette semaine`);
      })
      .catch(() => setStageDaysCount(1));
  }, [isStage, creneau.date, creneau.activityTitle]);

  const enrolled = creneau.enrolled || []; const enrolledIds = enrolled.map((e: any) => e.childId);

  // Cavaliers en quinzaine non attendus cette semaine : affichés en grisé sous
  // la liste des inscrits (cf. forfaitsQuinzaineNonAttendus).
  const nonAttendusQuinzaine = useMemo(() => {
    if (isStage) return [];
    return forfaitsQuinzaineNonAttendus(allForfaits, creneau, enrolledIds);
  }, [allForfaits, creneau.date, creneau.activityTitle, creneau.startTime, enrolledIds.join(","), isStage]); // eslint-disable-line react-hooks/exhaustive-deps

  // À l'ouverture, arriver directement sur la liste des inscrits (une seule
  // fois), sur mobile ET desktop — évite de scroller sous le plan et les notes.
  useEffect(() => {
    if (hasScrolledToInscrits.current) return;
    if (typeof window === "undefined") return;
    if (!inscritsRef.current) return;
    hasScrolledToInscrits.current = true;
    setTimeout(() => inscritsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 150);
  }, [enrolled]);

  // Verrou de scroll du fond tant que le panneau est ouvert.
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);
  const spots = creneau.maxPlaces - enrolled.length; const color = typeColors[creneau.activityType] || "#666";
  const priceTTC = calculePriceTTC(creneau);
  // Prix affiché dans l'en-tête : pour les stages, utiliser le tarif configuré si dispo
  const displayPrice = useMemo(
    () => prixAfficheEntete(creneau, priceTTC, isStage, stageDaysCount),
    [isStage, priceTTC, creneau, stageDaysCount]);

  // Liste d'attente, place tenue et ajout manuel : cf. useListeAttente.ts.
  // Placé après `enrolled` et `spots`, dont il a besoin pour savoir si une
  // place s'est libérée et si un hold est encore vivant.
  const {
    waitlist, waitlistLoading, waitRemoving, waitAdding, holdReleasing, holdActif,
    retirerWaitlist, libererHold, addToWaitlistAdmin, acceptWaitlist,
  } = useListeAttente({
    creneau, enrolled, spots, allFamilies, allCreneaux, selFam, selChild,
    panelToast, onClose, onRefresh,
    onAjoutReussi: () => { setSelFam(""); setSelChild(""); setSearch(""); },
  });

  const filteredFamilies = useMemo(() => filtrerFamilles(allFamilies, search), [allFamilies, search]);

  const fam = allFamilies.find(f => f.firestoreId === selFam); const children = fam?.children || [];
  const available = children.filter((c: any) => {
    if (enrolledIds.includes(c.id)) return false;
    // Vérifier si l'enfant est déjà inscrit sur un autre créneau qui chevauche cet horaire
    return !trouveConflitHoraire(c.id, creneau, allCreneaux);
  });

  // ─── Paramètres inscription depuis Firestore ──────────────────────────────
  const [inscParams, setInscParams] = useState(PARAMS_INSCRIPTION_DEFAUT);

  useEffect(() => {
    getDocs(collection(db, "settings")).then(snap => {
      const inscDoc = snap.docs.find(d => d.id === "inscription");
      if (inscDoc) setInscParams(prev => ({ ...prev, ...inscDoc.data() }));
    }).catch(() => {});
  }, []);

  // Charger TOUS les créneaux de la semaine pour les extra slots (2x/3x semaine)
  // Indépendamment de la vue courante du planning (jour/semaine)
  useEffect(() => {
    const creneauDate = new Date(creneau.date + "T12:00:00");
    const dow = creneauDate.getDay();
    const mon = new Date(creneauDate); mon.setDate(creneauDate.getDate() - ((dow + 6) % 7));
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
    const monStr = fmtDate(mon); const sunStr = fmtDate(sun);
    getDocs(query(collection(db, "creneaux"), where("date", ">=", monStr), where("date", "<=", sunStr)))
      .then(snap => {
        setWeekCreneaux(snap.docs.map(d => ({ id: d.id, ...d.data() })) as (Creneau & { id: string })[]);
      })
      .catch(() => setWeekCreneaux(allCreneaux));
  }, [creneau.id, creneau.date]);

  // Calcul forfait annuel avec prorata
  const prixLicence = licenceType === "moins18" ? inscParams.licenceMoins18 : inscParams.licencePlus18;
  // Forfait selon fréquence (sélectionnable)
  const [frequenceCours, setFrequenceCours] = useState<1 | 2 | 3>(1);
  // Une semaine sur deux : cas des gardes alternées. Le cavalier ne vient que
  // la moitié des séances, le forfait est donc calculé sur la moitié du tarif.
  // `semainePaire` dit QUELLES semaines, au sens du numéro ISO de semaine.
  const [quinzaine, setQuinzaine] = useState(false);
  const [semainePaire, setSemainePaire] = useState(true);
  const [extraSlots, setExtraSlots] = useState<string[]>([]); // 2ème + 3ème créneaux pour 2×/3×/sem
  const [extraSlotSearch, setExtraSlotSearch] = useState("");
  // Tarif plein de la fréquence choisie, avec les paramètres du club en cours
  // (cf. enroll-tarifs.ts pour la règle).
  const prixForfaitPlein = (f: number) => prixForfaitPleinPour(f, inscParams);
  const totalSessionsSaison = inscParams.totalSessionsSaison * frequenceCours;
  const dateFinSaisonRef = inscParams.dateFinSaison;

  // Fin de saison "effective" du créneau : permet de pré-inscrire pour la
  // saison suivante au tarif plein (cf. calculeFinSaisonEffective).
  const dateFinSaisonEffective = useMemo(
    () => calculeFinSaisonEffective(dateFinSaisonRef, creneau.date),
    [dateFinSaisonRef, creneau.date]);

  // Séances de la saison et séances restantes : le prorata du forfait annuel
  // en dépend directement (cf. useSessionsSaison).
  const { sessionsRestantes, sessionsTotalSaison, loadingSessions } =
    useSessionsSaison({ creneau, dateFinSaisonEffective, inscParams });

  // Prorata sur la saison RÉELLE, plafonné à 100% (cf. calculeProrata).
  const prorata = calculeProrata(sessionsRestantes, sessionsTotalSaison);
  // prixForfaitBrut est calculé plus bas, après prixForfaitAnnuel (différentiel).

  // Rang de l'enfant dans la fratrie POUR LA SAISON du créneau : commande
  // l'adhésion dégressive et la réduction famille (cf. enroll-tarifs.ts).
  const rangEnfantFamille = useMemo(
    () => calculeRangEnfantFamille(fam?.firestoreId, allForfaits, selChild, creneau.date),
    [fam, allForfaits, selChild, creneau.date]);

  // Fréquence (cours/semaine) déjà inscrite pour CET enfant cette saison :
  // une heure ajoutée se facture au différentiel, pas à plein tarif.
  const frequenceDejaInscrite = useMemo(
    () => calculeFrequenceDejaInscrite(fam?.firestoreId, allForfaits, selChild, creneau.date),
    [fam, allForfaits, selChild, creneau.date]);
  const freqMaxAjoutable = Math.max(0, 3 - frequenceDejaInscrite);

  const ajoutHeureAdmin = frequenceDejaInscrite > 0;
  const freqCumuleeAdmin = Math.min(3, frequenceDejaInscrite + frequenceCours);
  const prixForfaitAnnuel = calculePrixForfaitAnnuel(frequenceCours, frequenceDejaInscrite, inscParams);
  const prixForfaitBrut = calculePrixForfaitBrut(prixForfaitAnnuel, prorata, quinzaine);

  // Réduction famille sur le forfait (chargée depuis settings/degressivite)
  const [familyDiscountRules, setFamilyDiscountRules] = useState<RegleReductionFamille[]>([]);
  useEffect(() => {
    getDoc(doc(db, "settings", "degressivite")).then(snap => {
      if (snap.exists() && snap.data().familyDiscount) {
        setFamilyDiscountRules(snap.data().familyDiscount);
      }
    }).catch(() => {});
  }, []);

  const familyRule = familyDiscountRules.find(r => r.nth === rangEnfantFamille);
  const familyDiscountPercent = familyRule?.discount || 0;
  const familyDiscountAmount = calculeReductionFamille(prixForfaitBrut, familyDiscountPercent);
  const prixForfait = prixForfaitBrut - familyDiscountAmount;

  const prixAdhesionDegressif = calculeAdhesionDegressive(rangEnfantFamille, inscParams);

  const totalAnnuel = (adhesion ? prixAdhesionDegressif : 0) + (licence ? prixLicence : 0) + prixForfait;

  // Lignes de facturation du stage, réductions comprises (cf. useLignesStage).
  const { stageLines, existingStageCount } = useLignesStage({
    isStage, selectedChildren, children, priceTTC, stageMode, stageDaysCount, creneau, fam,
  });

  const stageTotalTTC = stageLines.reduce((s, l) => s + l.prixReduit, 0);
  const ACOMPTE_PAR_ENFANT = STAGE_ACOMPTE_EUROS; // par enfant — source unique cgv-clauses
  const { showAcompte, stageAcompte, stageSolde } = calculeAcompteStage({
    stageMode, stagePayChoice, stageTotalTTC,
    nbEnfants: stageLines.length, acompteParEnfant: ACOMPTE_PAR_ENFANT,
  });

  // Alerte « créneau complet » après inscription (cf. enroll-inscriptions.ts).
  const checkAndAlertIfFull = (creneauIds: string[]) => verifierEtAlerterSiComplet(creneauIds, panelToast);

  const handleEnroll = async () => {
    // Mode non-stage, non-compétition, ponctuel, 2+ enfants sélectionnés :
    // inscrire un par un avec un paiement séparé par enfant (plus simple pour
    // les avoirs/remboursements individuels).
    if (!isStage && !isCompetition && inscriptionMode === "ponctuel" && selectedChildren.length > 1 && fam) {
      setEnrolling(true);
      try {
        const childrenToEnroll = selectedChildren
          .map(cid => children.find((c: any) => c.id === cid))
          .filter(Boolean) as any[];

        const freeEnrollOptions = freeEnroll ? { freeReason, skipEmail: false } : undefined;
        const payModeToUse = showPay && !freeEnroll && !useRattrapage ? payMode : undefined;

        const enrolledNames: string[] = [];
        for (const child of childrenToEnroll) {
          const firstName = child.firstName || "—";
          const lastName = child.lastName || "";
          const childName = lastName ? `${firstName} ${lastName}` : firstName;
          try {
            await onEnroll(
              creneau.id!,
              {
                childId: child.id,
                childName,
                familyId: fam.firestoreId,
                familyName: fam.parentName || "—",
                enrolledAt: new Date().toISOString(),
                ...(preinscription ? { preinscription: true } : {}),
              } as any,
              preinscription ? undefined : payModeToUse,
              preinscription ? { skipPayment: true, skipEmail: true } : freeEnrollOptions,
            );
            enrolledNames.push(firstName);
          } catch (err) {
            console.error(`[EnrollPanel] échec inscription ${firstName}:`, err);
            panelToast(`Erreur inscription ${firstName}`, "error");
          }
        }

        const payInfo = freeEnroll ? ` — 🎁 offert (${freeReason})` : showPay ? " — encaissé ✅" : priceTTC > 0 ? " — paiement(s) en attente" : "";
        setJustEnrolled(`${enrolledNames.length} cavalier${enrolledNames.length > 1 ? "s" : ""} inscrit${enrolledNames.length > 1 ? "s" : ""} : ${enrolledNames.join(", ")}${payInfo}`);
        panelToast(`${enrolledNames.length} inscription${enrolledNames.length > 1 ? "s" : ""} créée${enrolledNames.length > 1 ? "s" : ""} — ${(priceTTC * enrolledNames.length).toFixed(2)}€ au total`, "success");
        // Alerter si le creneau passe complet apres la salve d'inscriptions
        await checkAndAlertIfFull([creneau.id!]);
      } finally {
        setSelChild(""); setSelectedChildren([]); setSelFam(""); setSearch("");
        setEnrolling(false); setShowPay(false); setFreeEnroll(false); setFreeReason("Rattrapage");
        setUseRattrapage(null); setInscriptionMode("ponctuel");
        setTimeout(() => setJustEnrolled(""), 5000);
      }
      return;
    }

    // Mode stage : inscription multi-enfants
    if (isStage && selectedChildren.length > 0 && fam) {
      setEnrolling(true);
      try {
        // Trouver les créneaux à inscrire selon le mode choisi
        let creneauxAInscrire = [creneau];
        if (stageMode === "semaine") {
          const creneauDate = new Date(creneau.date);
          const dayOfWeek = creneauDate.getDay();
          const monday = new Date(creneauDate);
          monday.setDate(monday.getDate() - ((dayOfWeek + 6) % 7));
          const sunday = new Date(monday);
          sunday.setDate(sunday.getDate() + 6);
          const monStr = monday.toISOString().split("T")[0];
          const sunStr = sunday.toISOString().split("T")[0];

          // IMPORTANT: allCreneaux ne contient que la vue courante du planning.
          // Pour les stages en mode semaine, charger TOUS les créneaux de la semaine.
          let stageCreneaux = allCreneaux.filter(c =>
            sameStage(c, creneau) &&
            (c.activityType === "stage" || c.activityType === "stage_journee") &&
            c.date >= monStr && c.date <= sunStr
          ).sort((a, b) => a.date.localeCompare(b.date));

          // Si on n'a trouvé que 1 jour (vue jour), charger depuis Firestore
          if (stageCreneaux.length <= 1) {
            try {
              const weekSnap = await getDocs(query(
                collection(db, "creneaux"),
                where("date", ">=", monStr),
                where("date", "<=", sunStr)
              ));
              const weekCreneaux = weekSnap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];
              stageCreneaux = weekCreneaux.filter(c =>
                sameStage(c, creneau) &&
                (c.activityType === "stage" || c.activityType === "stage_journee")
              ).sort((a, b) => a.date.localeCompare(b.date));
              console.log(`📋 Stage semaine : ${stageCreneaux.length} jours trouvés pour "${creneau.activityTitle}" (${monStr} → ${sunStr})`);
            } catch (e) { console.error("Erreur chargement stage semaine:", e); }
          }

          creneauxAInscrire = stageCreneaux.length > 0 ? stageCreneaux : [creneau];
        }
        // Mode "jour" → juste le créneau cliqué (déjà par défaut)

        // Calculer un stageKey STABLE pour ce stage : il est le même pour
        // tous les créneaux du stage (peu importe lequel on a cliqué dans
        // le planning). Format : "activityTitle_premierJourDuStage".
        // On le stocke dans chaque enrolled + dans l'item paiement, pour que
        // le filtre planning puisse matcher les badges paiement de manière
        // stricte (aucun risque de confusion entre deux stages de même titre
        // sur deux semaines différentes).
        const stageKey = `${creneau.activityTitle}_${creneauxAInscrire[0]?.date || creneau.date}`;

        // Inscrire chaque enfant dans TOUS les jours du stage (inscription technique seulement, pas de paiement par jour)
        const conflictsFound: string[] = [];
        for (const line of stageLines) {
          for (const sc of creneauxAInscrire) {
            const enrolled = sc.enrolled || [];
            if (enrolled.some((e: any) => e.childId === line.childId)) continue;
            // Vérifier conflit horaire avec un autre créneau ce jour
            const hasConflict = allCreneaux.find(other =>
              other.id !== sc.id &&
              other.date === sc.date &&
              (other.enrolled || []).some((e: any) => e.childId === line.childId) &&
              sc.startTime < other.endTime && other.startTime < sc.endTime
            );
            if (hasConflict) {
              conflictsFound.push(`${line.childName} (${sc.date} : conflit avec ${hasConflict.activityTitle})`);
              continue;
            }
            await onEnroll(sc.id!, {
              childId: line.childId, childName: line.childName,
              familyId: fam.firestoreId, familyName: fam.parentName || "—",
              enrolledAt: new Date().toISOString(),
              stageKey, // ← NOUVEAU : permet le matching paiement précis
              ...(preinscription ? { preinscription: true, preinscriptionMode: "stage" } : {}),
            } as any, undefined, { skipPayment: true, skipEmail: true });
          }
        }
        if (conflictsFound.length > 0) {
          panelToast(`Conflits horaires ignorés : ${conflictsFound.join(", ")}`, "warning");
        }

        // Alerter pour chaque jour du stage qui passe complet (demande Nicolas)
        await checkAndAlertIfFull(creneauxAInscrire.map(c => c.id!).filter(Boolean));

        // Pré-inscription : on s'arrête là. Les places sont retenues, aucun
        // panier n'est constitué — donc ni commande, ni facture, ni relance.
        if (preinscription) {
          panelToast(
            `${stageLines.length} cavalier(s) pré-inscrit(s) au stage — aucun paiement créé`,
            "success"
          );
          setSelectedChildren([]); setPreinscription(false); setInscriptionFaite(true);
          await onRefresh?.();
          setEnrolling(false);
          return;
        }

        // Constitution (ou complément) de la commande de la famille :
        // panier unique, acompte éventuel, lien de paiement (enroll-paiements).
        await constituerPanierStage({
          creneau, fam, stageLines, creneauxAInscrire, stageKey,
          assuranceOccasionnelle, inscParams, ACOMPTE_PAR_ENFANT,
          stageTotalTTC, showAcompte, stageAcompte, stageSolde,
        });

        const noms = stageLines.map(l => l.childName).join(", ");
        setJustEnrolled(`${noms} inscrit(s) dans ${creneauxAInscrire.length} jour(s) — ${stageTotalTTC.toFixed(2)}€${showAcompte ? ` (acompte ${stageAcompte}€ + solde ${stageSolde}€ J-7)` : ""}`);

        await envoyerConfirmationStage({
          creneau, fam, stageLines, creneauxAInscrire, stageMode,
          stageTotalTTC, stageAcompte, stageSolde, noms,
        });

        panelToast(`${noms} inscrit(s) — ${stageTotalTTC.toFixed(2)}€${showAcompte ? ` (acompte ${stageAcompte}€ + solde J-7)` : " — paiement en attente"}`, "success");
      } catch (e) { console.error(e); panelToast("Erreur lors de l'inscription", "error"); }
      setSelectedChildren([]);
      setSelChild(""); setSelFam(""); setSearch(""); setEnrolling(false);
      setTimeout(() => setJustEnrolled(""), 6000);

      // Si mode jour : proposer d'inscrire dans d'autres jours du stage
      if (stageMode === "jour" && fam) {
        const creneauDate = new Date(creneau.date);
        const dow = creneauDate.getDay();
        const mon = new Date(creneauDate); mon.setDate(mon.getDate() - ((dow + 6) % 7));
        const sun = new Date(mon); sun.setDate(sun.getDate() + 6);
        // Utiliser weekCreneaux (chargé depuis Firestore) plutôt qu'allCreneaux (limité à la vue)
        const source = weekCreneaux.length > 0 ? weekCreneaux : allCreneaux;
        const autresJours = source.filter(c =>
          c.activityTitle === creneau.activityTitle &&
          (c.activityType === "stage" || c.activityType === "stage_journee") &&
          new Date(c.date) >= mon && new Date(c.date) <= sun &&
          c.id !== creneau.id
        ).map(c => ({
          id: c.id!,
          date: c.date,
          label: new Date(c.date).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }),
        }));
        if (autresJours.length > 0) {
          setShowAddDays({
            familyId: fam.firestoreId,
            enfants: stageLines.map(l => ({ childId: l.childId, childName: l.childName })),
            joursRestants: autresJours,
            totalJoursStage: autresJours.length + 1, // tous les jours de la semaine pour ce stage
            joursInscrits: 1, // on vient d'en inscrire 1
            stageTitle: creneau.activityTitle,
            creneauRef: creneau, // pour accéder aux prix multi-jours
          });
        }
      }
      return;
    }

    // Mode cours/forfait : inscription simple
    if (!selChild || !fam) return;
    setEnrolling(true);
    const child = children.find((c: any) => c.id === selChild);
    const childFirstName = (child as any)?.firstName || "—";
    const childLastName = (child as any)?.lastName || "";
    const childName = childLastName ? `${childFirstName} ${childLastName}` : childFirstName;

    // ── PRÉ-INSCRIPTION ANNUELLE ────────────────────────────────────────
    // La branche annuelle ci-dessous crée le forfait, l'échéancier et le
    // paiement AVANT d'inscrire : elle ne peut pas être neutralisée par les
    // options passées à onEnroll. On la court-circuite donc entièrement.
    // Le cavalier est simplement posé sur le créneau, marqué pré-inscrit.
    if (inscriptionMode === "annuel" && preinscription) {
      if (!selChild || !fam) return;
      const childName = (fam.children || []).find((c: any) => c.id === selChild)?.firstName || "—";
      setEnrolling(true);
      try {
        await onEnroll(creneau.id!, {
          childId: selChild,
          childName,
          familyId: fam.firestoreId,
          familyName: fam.parentName || "—",
          enrolledAt: new Date().toISOString(),
          preinscription: true,
          // Mémorisé pour la conversion : on saura qu'il s'agissait d'une
          // inscription à l'année, pas d'une séance isolée.
          preinscriptionMode: "annuel",
        } as any, undefined, { skipPayment: true, skipEmail: true });
        panelToast(`${childName} pré-inscrit(e) à l'année — aucun paiement créé`, "success");
        setSelChild(""); setSelectedChildren([]); setPreinscription(false);
        setInscriptionFaite(true);
        await onRefresh?.();
      } catch (err: any) {
        panelToast(`Échec : ${err?.message || err}`, "error");
      }
      setEnrolling(false);
      return;
    }

    if (inscriptionMode === "annuel") {
      // Inscription annuelle : créer le forfait + l'échéancier (enroll-paiements),
      // puis inscrire dans le créneau plus bas.
      const { abandon } = await creerForfaitEtPaiementAnnuel({
        creneau, fam, selChild, childName,
        quinzaine, semainePaire, sessionsRestantes, totalSessionsSaison,
        licence, licenceType, adhesion,
        prixForfaitAnnuel, prorata, totalAnnuel, payPlan, frequenceCours,
        ajoutHeureAdmin, freqCumuleeAdmin, frequenceDejaInscrite,
        rangEnfantFamille, prixAdhesionDegressif, prixLicence, prixForfait,
        extraSlots, familyDiscountAmount, familyDiscountPercent,
        annualPayMode, dayNames: JOURS_COURTS_DEPUIS_DIMANCHE, panelToast,
      });
      // Mandat SEPA manquant : rien n'a été écrit, on rend la main sans inscrire.
      if (abandon) { setEnrolling(false); return; }
    }

    // Dans les 2 cas : inscrire dans le créneau
    // Pour les forfaits annuels : skipPayment car les échéances sont déjà créées
    // Une pre-inscription ne declenche RIEN : ni paiement, ni facture, ni email.
    const enrollOptions = preinscription
      ? { skipPayment: true, skipEmail: true }
      : inscriptionMode === "annuel" ? { skipPayment: true, skipEmail: true } : undefined;

    if (inscriptionMode === "annuel") {
      // Poser le cavalier sur toutes les séances de la saison, au rythme de
      // son forfait (cf. enroll-inscriptions.ts).
      const allSlotsToEnroll = await inscrireSurToutesLesSeances({
        creneau, dateFinSaisonEffective, quinzaine, semainePaire, extraSlots,
        weekCreneaux, selChild, childName, fam, onEnroll, onRefresh,
      });

      // Alerter pour chaque seance qui passe complete apres inscription annuelle
      await checkAndAlertIfFull(allSlotsToEnroll);
    } else {
      // ── Mode Compétition : un engagement par épreuve/passage + coaching global ──
      if (isCompetition) {
        const coachingTTC = parseFloat(compCoaching) || 0;
        const compItems: any[] = [];
        for (const ep of compEpreuves) {
          const montantTTC = parseFloat(ep.montant) || 0;
          if (montantTTC <= 0) continue;
          compItems.push({
            activityTitle: `Engagement — ${ep.epreuve || creneau.activityTitle}`,
            childId: selChild, childName, creneauId: creneau.id, activityType: "competition",
            description: ep.epreuve || "Engagement compétition",
            priceHT: montantTTC / 1.055, tva: 5.5, priceTTC: montantTTC,
          });
        }
        if (coachingTTC > 0) compItems.push({
          activityTitle: `Coaching — ${creneau.activityTitle}`,
          childId: selChild, childName, creneauId: creneau.id, activityType: "competition",
          description: "Coaching moniteur",
          priceHT: coachingTTC / 1.055, tva: 5.5, priceTTC: coachingTTC,
        });
        const compOptions = compItems.length > 0 ? { competitionItems: compItems, skipEmail: false } : undefined;
        await onEnroll(creneau.id!, { childId: selChild, childName, familyId: fam.firestoreId, familyName: fam.parentName || "—", enrolledAt: new Date().toISOString() }, showPay ? payMode : undefined, compOptions);
      } else {
        const freeEnrollOptions = freeEnroll ? { freeReason, skipEmail: false } : undefined;
        const rattrapageOptions = useRattrapage ? { rattrapageId: useRattrapage, skipEmail: false } : undefined;
        await onEnroll(creneau.id!, { childId: selChild, childName, familyId: fam.firestoreId, familyName: fam.parentName || "—", enrolledAt: new Date().toISOString(), ...(preinscription ? { preinscription: true } : {}) } as any, preinscription ? undefined : (inscriptionMode === "ponctuel" && showPay && !freeEnroll && !useRattrapage ? payMode : undefined), enrollOptions || freeEnrollOptions || rattrapageOptions);
      }
      // Alerter si le creneau (cours collectif ou competition) passe complet
      await checkAndAlertIfFull([creneau.id!]);
    }

    if (inscriptionMode === "annuel") {
      setJustEnrolled(`${childName} inscrit(e) en forfait annuel — ${sessionsRestantes} séances — ${totalAnnuel.toFixed(2)}€ en ${payPlan}`);
      panelToast(`Forfait créé — ${totalAnnuel.toFixed(2)}€ en ${payPlan}`, "success");
    } else {
      const payInfo = useRattrapage ? " — 🔄 rattrapage utilisé" : freeEnroll ? ` — 🎁 offert (${freeReason})` : showPay ? " — encaissé ✅" : priceTTC > 0 ? " — paiement en attente" : "";
      setJustEnrolled(`${childName}${payInfo}`);
    }
    // Reset complet du formulaire pour permettre une nouvelle inscription
    // dans la foulee (cas frequent : inscrire toute une fratrie l'un apres
    // l'autre sans fermer le panel).
    // CRITICAL : selectedChildren doit aussi etre vide, sinon en mode annuel
    // le re-clic sur un autre enfant additionne au precedent puis le
    // useEffect-like de cleanup garde le PREMIER (= l'ancien). Resultat :
    // l'inscription suivante reutilise l'ancien enfant. Bug rapporte par
    // Nicolas : a inscrit Suzanne puis click Marianne, mais Suzanne inscrite
    // 2x.
    setSelChild(""); setSelectedChildren([]); setSelFam(""); setSearch(""); setEnrolling(false); setShowPay(false); setFreeEnroll(false); setFreeReason("Rattrapage"); setUseRattrapage(null); setInscriptionMode("ponctuel"); setExtraSlots([]); setExtraSlotSearch(""); setAnnualPayMode("cb_terminal");
    setTimeout(() => setJustEnrolled(""), 5000);
  };

  const handleUnenroll = async (childId: string) => {
    setUnenrolling(childId);
    // La notification du premier en liste d'attente (email + hold 24h sur la
    // place) est gérée de manière centralisée dans onUnenroll (planning/page.tsx).
    // Ne PAS renvoyer d'email ici : cela créait un doublon de notification.
    await onUnenroll(creneau.id!, childId);
    setUnenrolling("");
  };

  // ── Email créneau : envoi à toutes les familles inscrites ──
  // Rédaction et envoi sont dans enroll-communications.ts ; ne reste ici que
  // l'enchaînement avec l'état du formulaire.
  const getCreneauRecipients = () => destinatairesCreneau(enrolled, families);

  const handleEmailGenerate = async () => {
    setEmailGenerating(true);
    const res = await genererEmailCreneauIA(creneau, enrolled, families);
    if (res.ok) {
      setEmailSubject(res.sujet);
      setEmailBody(res.corps);
    } else { panelToast(res.erreur, "error"); }
    setEmailGenerating(false);
  };

  const handleEmailSend = async () => {
    const recipients = getCreneauRecipients();
    if (recipients.length === 0) { panelToast("Aucune famille avec email", "error"); return; }
    if (!emailSubject || !emailBody) { panelToast("Sujet et message requis", "error"); return; }
    setEmailSending(true);
    const sent = await envoyerEmailCreneau({ creneau, recipients, emailSubject, emailBody });
    panelToast(`Email envoyé à ${sent} famille${sent > 1 ? "s" : ""}`, "success");
    setShowEmailForm(false);
    setEmailSubject(""); setEmailBody("");
    setEmailSending(false);
  };

  // ── Fiches de progression (stage) ──────────────────────────────────
  const handlePrintProgressions = async () => {
    if (enrolled.length === 0) return;
    const ouverte = await imprimerFichesProgression(enrolled);
    if (!ouverte) panelToast("Le navigateur a bloqué l'ouverture. Autorisez les popups.", "error");
  };

  const handleEmailProgressions = async () => {
    if (enrolled.length === 0) return;
    setProgressionSending(true);
    let sent = 0;
    for (const e of enrolled) {
      if ((await envoyerFicheProgression(e, allFamilies, creneau)).ok) sent++;
    }
    panelToast(`Fiches envoyées à ${sent} famille${sent > 1 ? "s" : ""}`, "success");
    setProgressionSending(false);
  };

  // Envoi INDIVIDUEL de la fiche d'un enfant (bouton ✉️ sur sa ligne).
  const [sendingFicheFor, setSendingFicheFor] = useState<string | null>(null);
  const handleSendOneFiche = async (e: any) => {
    if (sendingFicheFor) return;
    setSendingFicheFor(e.childId);
    const res = await envoyerFicheProgression(e, allFamilies, creneau);
    panelToast(
      res.ok ? `Fiche de ${e.childName} envoyée à la famille` : `${e.childName} : ${res.reason || "échec d'envoi"}`,
      res.ok ? "success" : "error"
    );
    setSendingFicheFor(null);
  };

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-start md:items-center justify-center p-3 pb-6 md:p-4 overflow-y-auto">
      {/* La barre de navigation mobile s'escamote quand cet overlay est monte
          (cf. admin/layout) : plus besoin de reserver 96px en bas, la modale
          peut prendre presque toute la hauteur. dvh plutot que vh pour tenir
          compte de la barre d'URL mobile qui se retracte au defilement. */}
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[92dvh] md:max-h-[88vh] my-auto flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex-1 overflow-auto">
        <div className="p-5 border-b border-blue-500/8" style={{ borderLeftWidth: 4, borderLeftColor: color }}>
          <div className="flex justify-between items-start"><div><div className="font-body text-sm font-semibold" style={{ color }}>{creneau.startTime}–{creneau.endTime}</div><h2 className="font-display text-lg font-bold text-blue-800">{creneau.activityTitle}</h2><div className="font-body text-xs text-slate-500 mt-1">{new Date(creneau.date).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })} · {creneau.monitor}{displayPrice > 0 ? ` · ${displayPrice.toFixed(2)}€${isStage ? "" : "/séance"}` : ""}</div></div><button onClick={confirmClose} className="text-slate-500 hover:text-gray-600 bg-transparent border-none cursor-pointer"><X size={20} /></button></div>
          <div className="flex items-center gap-3 mt-3">
            <Badge color={spots > 2 ? "green" : spots > 0 ? "orange" : "red"}>{spots > 0 ? `${spots} place${spots > 1 ? "s" : ""}` : "COMPLET"}</Badge>
            <span className="font-body text-xs text-slate-500">{enrolled.length}/{creneau.maxPlaces}</span>
            {(creneau as any).status === "closed" && <Badge color="gray">Clôturée</Badge>}
          </div>

          {/* ── Plan de séance ── */}
          <PlanSeance plan={plan} />

          {/* ── Notes pédagogiques (préparation, historique, séances précédentes) ── */}
          <NotesSeance creneau={creneau} planUrl={planUrl} planType={planType} />
        </div>
        {(creneau as any).status === "closed" && (
          <div className="p-5 bg-gray-50 border-b border-gray-200">
            <p className="font-body text-sm text-slate-600 mb-2">Cette séance est clôturée. Les inscriptions et modifications sont verrouillées.</p>
            <button onClick={async () => {
              if (!confirm("Réouvrir cette séance ?\n\nLes modifications seront à nouveau possibles.\nLes traces pédagogiques et débits de cartes déjà créés ne seront pas affectés.")) return;
              await updateDoc(doc(db, "creneaux", creneau.id!), { status: "planned" });
              onClose();
            }} className="font-body text-xs text-orange-600 bg-orange-50 px-3 py-1.5 rounded-lg border-none cursor-pointer hover:bg-orange-100">
              Réouvrir la séance
            </button>
          </div>
        )}
        <div ref={inscritsRef} className="p-5">
          {justEnrolled && <div className="mb-3 p-3 bg-green-50 border border-green-200 rounded-lg font-body text-sm text-green-700"><Check size={16} className="inline mr-1" /> {justEnrolled} inscrit(e) !</div>}
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-body text-sm font-semibold text-blue-800"><Users size={16} className="inline mr-1"/>Inscrits ({enrolled.length})</h3>
            {enrolled.length > 0 && (
              <div className="flex items-center gap-1.5">
                <button onClick={handlePrintProgressions}
                  className="flex items-center gap-1 font-body text-xs text-purple-500 bg-purple-50 px-2.5 py-1.5 rounded-lg border-none cursor-pointer hover:bg-purple-100"
                  title="Imprimer les fiches de progression">
                  <Printer size={12} /> Fiches
                </button>
                <button onClick={handleEmailProgressions} disabled={progressionSending}
                  className="flex items-center gap-1 font-body text-xs text-green-600 bg-green-50 px-2.5 py-1.5 rounded-lg border-none cursor-pointer hover:bg-green-100 disabled:opacity-50"
                  title="Envoyer les fiches de progression par email">
                  {progressionSending ? <Loader2 size={12} className="animate-spin" /> : <FileText size={12} />} Envoyer fiches
                </button>
                <button onClick={() => { setShowEmailForm(!showEmailForm); if (!showEmailForm && !emailSubject) setEmailSubject(`${creneau.activityTitle} — ${new Date(creneau.date).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}`); }}
                  className="flex items-center gap-1 font-body text-xs text-blue-500 bg-blue-50 px-2.5 py-1.5 rounded-lg border-none cursor-pointer hover:bg-blue-100">
                  <Mail size={12} /> Email
                </button>
              </div>
            )}
          </div>

          {/* ── Formulaire email créneau ── */}
          {showEmailForm && (
            <FormulaireEmailCreneau
              nbDestinataires={getCreneauRecipients().length}
              emailSubject={emailSubject} setEmailSubject={setEmailSubject}
              emailBody={emailBody} setEmailBody={setEmailBody}
              emailGenerating={emailGenerating} emailSending={emailSending}
              onGenerer={handleEmailGenerate} onEnvoyer={handleEmailSend}
              onFermer={() => setShowEmailForm(false)}
            />
          )}
          <ListeInscrits
            creneau={creneau} enrolled={enrolled}
            families={families} allFamilies={allFamilies} payments={payments}
            nonAttendusQuinzaine={nonAttendusQuinzaine}
            isAdmin={isAdmin} isMoniteur={isMoniteur}
            highlightBusy={highlightBusy} onToggleHighlight={toggleHighlight}
            sendingFicheFor={sendingFicheFor} onEnvoyerFiche={handleSendOneFiche}
            conversion={conversion} onConvertirPreinscription={convertirPreinscription}
            unenrolling={unenrolling} onDesinscrire={handleUnenroll}
          />

          {/* ── Place tenue pour une famille notifiée ── */}
          <BandeauPlaceTenue holdActif={holdActif} holdReleasing={holdReleasing} onLiberer={libererHold} />

          {/* ── Liste d'attente ── */}
          <ListeAttente
            waitlist={waitlist} spots={spots} waitlistLoading={waitlistLoading}
            waitRemoving={waitRemoving} onAccepter={acceptWaitlist} onRetirer={retirerWaitlist}
          />

          {/* ── Créneau complet : ajout MANUEL en liste d'attente ────────── */}
          {spots <= 0 && (creneau as any).status !== "closed" && (
            <AjoutListeAttente
              creneau={creneau} filteredFamilies={filteredFamilies} allFamilies={allFamilies}
              search={search} selFam={selFam} selChild={selChild} waitAdding={waitAdding}
              onChangeRecherche={v => { setSearch(v); setSelFam(""); setSelChild(""); setInscriptionFaite(false); }}
              onChangeFamille={v => { setSelFam(v); setSelChild(""); setInscriptionFaite(false); }}
              onChangeCavalier={v => setSelChild(v)}
              onAjouter={addToWaitlistAdmin}
            />
          )}

          {spots > 0 && (creneau as any).status !== "closed" && (<div className="border-t border-blue-500/8 pt-4"><h3 className="font-body text-sm font-semibold text-blue-800 mb-3"><UserPlus size={16} className="inline mr-1"/>Inscrire</h3><div className="flex flex-col gap-3">
            {/* Recherche famille */}
            <div className="relative"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/><input value={search} onChange={e=>{setSearch(e.target.value);setSelFam("");setSelChild("");setInscriptionFaite(false);}} placeholder="Nom parent, prénom enfant, email..." className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-blue-500/8 font-body text-sm bg-cream focus:border-blue-500 focus:outline-none"/></div>
            <select value={selFam} onChange={e=>{setSelFam(e.target.value);setSelChild("");}} className="w-full px-3 py-2.5 rounded-lg border border-blue-500/8 font-body text-sm bg-cream"><option value="">Famille ({filteredFamilies.length})</option>{filteredFamilies.map(f=>{const n=(f.children||[]).map((c:any)=>c.firstName).join(", ");return<option key={f.firestoreId} value={f.firestoreId}>{f.parentName} {n?`(${n})`:""}</option>})}</select>

            {/* Bouton nouvelle famille */}
            {!selFam && !showNewFamily && (
              <button onClick={() => setShowNewFamily(true)}
                className="flex items-center gap-1.5 font-body text-xs font-semibold text-green-600 bg-green-50 px-3 py-2 rounded-lg border-none cursor-pointer hover:bg-green-100 self-start">
                <UserPlus size={12} /> Nouvelle famille
              </button>
            )}

            {/* Formulaire création famille inline */}
            {showNewFamily && (
              <NouvelleFamilleForm
                onFermer={() => setShowNewFamily(false)}
                panelToast={panelToast}
                onFamilleCreee={(famId, children, parent) => {
                  // Ajouter la famille au state local pour qu'elle soit sélectionnable
                  setLocalFamilies(prev => [...prev, {
                    firestoreId: famId,
                    parentName: parent.parentName,
                    parentEmail: parent.parentEmail,
                    parentPhone: parent.parentPhone,
                    children,
                  } as any]);
                  // Sélectionner automatiquement la nouvelle famille + premier enfant
                  setSelFam(famId);
                  setSelChild(children[0].id);
                  setShowNewFamily(false);
                  setSearch(parent.parentName);
                  const noms = children.map((c: any) => c.firstName).join(", ");
                  panelToast(`✅ Famille ${parent.parentName} créée (${noms}) — sélectionnez le mode d'inscription`, "success");
                }}
              />
            )}
            {fam && !isStage && (
              <div>
                {available.length === 0 && (
                  <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 mb-2 font-body text-xs text-amber-800">
                    Tous les cavaliers de cette famille sont déjà inscrits sur ce créneau
                    ou occupés au même horaire. Vous pouvez en ajouter un nouveau.
                  </div>
                )}
                {available.length > 1 && (
                  <div className="font-body text-xs font-semibold text-slate-500 mb-2">
                    {inscriptionMode === "annuel"
                      ? "Sélectionner le cavalier"
                      : `Sélectionner les cavaliers ${selectedChildren.length > 1 ? "(un paiement séparé par enfant)" : ""}`}
                  </div>
                )}
                {/* En mode annuel : indication que l'inscription est mono-enfant */}
                {inscriptionMode === "annuel" && fam && available.length > 0 && (
                  <div className="rounded-lg bg-blue-50 border border-blue-200 px-3 py-2 mb-2">
                    <div className="font-body text-xs text-blue-700">
                      <span className="font-semibold">Mode annuel :</span> inscription d'un seul cavalier à la fois. Pour inscrire plusieurs enfants, faites-le un par un.
                    </div>
                  </div>
                )}
                <div className="flex flex-wrap gap-2">{available.map((c:any) => {
                  const sel = selectedChildren.includes(c.id);
                  return (
                    <button key={c.id} onClick={() => {
                      // En mode annuel : mono-selection (remplace) plutot que multi
                      if (inscriptionMode === "annuel") {
                        setSelectedChildren([c.id]);
                        setSelChild(c.id);
                        return;
                      }
                      if (sel) {
                        // Désélectionner
                        const next = selectedChildren.filter(x => x !== c.id);
                        setSelectedChildren(next);
                        // selChild reflète le premier pour compat avec le reste du code
                        setSelChild(next[0] || "");
                      } else {
                        // Sélectionner
                        const next = [...selectedChildren, c.id];
                        setSelectedChildren(next);
                        if (!selChild) setSelChild(c.id);
                      }
                    }}
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg border font-body text-sm cursor-pointer ${sel ? "bg-blue-500 text-white border-blue-500" : "bg-white text-slate-600 border-gray-200"}`}>
                      {sel ? <Check size={12}/> : <Users size={12}/>} {c.firstName}
                    </button>
                  );
                })}
                  {/* Ajout d'un membre de la famille sans quitter la modale */}
                  <button onClick={() => { setChildDraft({ firstName: "", lastName: fam.children?.[0]?.lastName || "", birthDate: "", galopLevel: "—" }); setShowAddChild(v => !v); }}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg border border-dashed border-blue-300 bg-blue-50 text-blue-700 font-body text-sm cursor-pointer hover:bg-blue-100">
                    <Plus size={12}/> Ajouter un cavalier
                  </button>
                </div>

                {showAddChild && renderAjoutCavalier(fam)}
              </div>
            )}

            {/* Message explicite si aucun enfant disponible */}
            {fam && children.length > 0 && available.length === 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                <div className="font-body text-xs font-semibold text-amber-800 mb-2">
                  Aucun cavalier disponible pour ce créneau
                </div>
                <ul className="font-body text-xs text-amber-700 space-y-1">
                  {children.map((c: any) => {
                    const isEnrolled = enrolledIds.includes(c.id);
                    // Même test que pour `available` : une seule définition du
                    // conflit horaire, sinon les deux écrans se contredisent.
                    const conflict = !isEnrolled && trouveConflitHoraire(c.id, creneau, allCreneaux);
                    return (
                      <li key={c.id}>
                        <strong>{c.firstName}</strong>
                        {isEnrolled && <span> — déjà inscrit(e) sur ce créneau</span>}
                        {conflict && <span> — déjà inscrit(e) sur « {(conflict as any).activityTitle} » à {(conflict as any).startTime}</span>}
                        {!isEnrolled && !conflict && <span> — indisponible</span>}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {fam && children.length === 0 && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 font-body text-xs text-red-700">
                Cette famille n'a aucun cavalier enregistré. Ajoutez-en un depuis la fiche famille.
              </div>
            )}

            {/* Stage : sélection multiple d'enfants */}
            {fam && isStage && (
              <div>
                <div className="font-body text-xs font-semibold text-slate-500 mb-2">Sélectionner les enfants (multi-sélection)</div>
                {available.length === 0 && (
                  <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 mb-2 font-body text-xs text-amber-800">
                    Tous les cavaliers de cette famille sont déjà inscrits sur ce stage
                    ou occupés au même horaire. Vous pouvez en ajouter un nouveau.
                  </div>
                )}
                <div className="flex flex-wrap gap-2 mb-3">
                  {available.map((c: any) => {
                    const sel = selectedChildren.includes(c.id);
                    return (
                      <button key={c.id} onClick={() => setSelectedChildren(sel ? selectedChildren.filter(x => x !== c.id) : [...selectedChildren, c.id])}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg border font-body text-sm cursor-pointer ${sel ? "bg-green-600 text-white border-green-600" : "bg-white text-slate-600 border-gray-200"}`}>
                        {sel ? <Check size={12}/> : <Users size={12}/>} {c.firstName}
                      </button>
                    );
                  })}
                  <button onClick={() => { setChildDraft({ firstName: "", lastName: fam.children?.[0]?.lastName || "", birthDate: "", galopLevel: "—" }); setShowAddChild(v => !v); }}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg border border-dashed border-green-400 bg-green-50 text-green-700 font-body text-sm cursor-pointer hover:bg-green-100">
                    <Plus size={12}/> Ajouter un cavalier
                  </button>
                </div>
                {showAddChild && renderAjoutCavalier(fam)}

                {/* Pré-inscription : retenir les places d'un stage à venir
                    (Toussaint, vacances) avant d'ouvrir les paiements. */}
                <label className={`flex items-start gap-2 mt-3 p-2.5 rounded-lg border cursor-pointer ${
                  preinscription ? "bg-indigo-50 border-indigo-300" : "bg-white border-gray-200"}`}>
                  <input type="checkbox" checked={preinscription}
                    onChange={e => setPreinscription(e.target.checked)}
                    className="mt-0.5 cursor-pointer" />
                  <span className="font-body text-xs text-slate-700 leading-relaxed">
                    <strong>Pré-inscription</strong> — retenir la place sans créer
                    de paiement, de facture ni d'email.
                  </span>
                </label>

                {/* Récap stage */}
                {selectedChildren.length > 0 && (
                  <RecapStage
                    creneau={creneau} priceTTC={priceTTC}
                    nbJours={stageDaysCount || 1}
                    stageMode={stageMode} setStageMode={setStageMode}
                    existingStageCount={existingStageCount}
                    stageLines={stageLines} stageTotalTTC={stageTotalTTC}
                    selectedChildren={selectedChildren}
                    acompteParEnfant={ACOMPTE_PAR_ENFANT}
                    stagePayChoice={stagePayChoice} setStagePayChoice={setStagePayChoice}
                    showAcompte={showAcompte} stageAcompte={stageAcompte} stageSolde={stageSolde}
                  />
                )}
              </div>
            )}

            {/* Choix du mode d'inscription — COURS réguliers uniquement */}
            {/* ── Mode Compétition : un engagement par épreuve/passage + coaching global ── */}
            {selChild && isCompetition && (
              <FormulaireCompetition
                creneau={creneau}
                compEpreuves={compEpreuves} setCompEpreuves={setCompEpreuves}
                compCoaching={compCoaching} setCompCoaching={setCompCoaching}
                showPay={showPay} setShowPay={setShowPay}
                payMode={payMode} setPayMode={setPayMode}
              />
            )}

            {selChild && !isStage && !isCompetition && (
              <FormulaireInscriptionCours
                creneau={creneau} allForfaits={allForfaits} allCartes={allCartes}
                fam={fam} families={families} selChild={selChild} selFam={selFam} priceTTC={priceTTC}
                inscriptionMode={inscriptionMode} setInscriptionMode={setInscriptionMode}
                selectedChildren={selectedChildren} setSelectedChildren={setSelectedChildren} setSelChild={setSelChild}
                loadingSessions={loadingSessions} sessionsRestantes={sessionsRestantes}
                frequenceCours={frequenceCours} totalAnnuel={totalAnnuel} prorata={prorata}
                freeEnroll={freeEnroll} setFreeEnroll={setFreeEnroll}
                freeReason={freeReason} setFreeReason={setFreeReason}
                showPay={showPay} setShowPay={setShowPay}
                payMode={payMode} setPayMode={setPayMode} avoirSolde={avoirSolde}
                useRattrapage={useRattrapage} setUseRattrapage={setUseRattrapage}
                childRattrapages={childRattrapages}
                preinscription={preinscription} setPreinscription={setPreinscription}
                enrollingSaison={enrollingSaison} inscrireSaisonEtablissement={inscrireSaison}
                blocForfaitAnnuel={
                    <FormulaireForfaitAnnuel
                      creneau={creneau} weekCreneaux={weekCreneaux} selFam={selFam}
                      quinzaine={quinzaine} setQuinzaine={setQuinzaine}
                      semainePaire={semainePaire} setSemainePaire={setSemainePaire}
                      ajoutHeureAdmin={ajoutHeureAdmin} frequenceDejaInscrite={frequenceDejaInscrite}
                      freqMaxAjoutable={freqMaxAjoutable}
                      frequenceCours={frequenceCours} setFrequenceCours={setFrequenceCours}
                      prixForfaitPlein={prixForfaitPlein}
                      extraSlots={extraSlots} setExtraSlots={setExtraSlots}
                      extraSlotSearch={extraSlotSearch} setExtraSlotSearch={setExtraSlotSearch}
                      adhesion={adhesion} setAdhesion={setAdhesion}
                      prixAdhesionDegressif={prixAdhesionDegressif} rangEnfantFamille={rangEnfantFamille}
                      licence={licence} setLicence={setLicence}
                      licenceType={licenceType} setLicenceType={setLicenceType} prixLicence={prixLicence}
                      prixForfait={prixForfait} prixForfaitAnnuel={prixForfaitAnnuel} prorata={prorata}
                      sessionsRestantes={sessionsRestantes} sessionsTotalSaison={sessionsTotalSaison}
                      familyDiscountAmount={familyDiscountAmount} familyDiscountPercent={familyDiscountPercent}
                      totalAnnuel={totalAnnuel}
                      payPlan={payPlan} setPayPlan={setPayPlan}
                      annualPayMode={annualPayMode} setAnnualPayMode={setAnnualPayMode}
                      setSepaStatus={setSepaStatus}
                    />
                }
              />
            )}

            {/* Bouton Stage */}
            {isStage && selectedChildren.length > 0 && (
              <div className="flex flex-col gap-2">
                {/* Option assurance occasionnelle */}
                <label className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl border border-orange-200 bg-orange-50 cursor-pointer">
                  <div className="flex items-center gap-2">
                    <input type="checkbox" checked={assuranceOccasionnelle} onChange={e => setAssuranceOccasionnelle(e.target.checked)} className="accent-orange-500 w-4 h-4"/>
                    <div>
                      <div className="font-body text-sm font-semibold text-orange-800">🛡️ Assurance occasionnelle 1 mois</div>
                      <div className="font-body text-[10px] text-orange-600">Pour cavaliers non licenciés FFE — {inscParams.assuranceOccasionnelle}€/enfant</div>
                    </div>
                  </div>
                  {assuranceOccasionnelle && <span className="font-body text-sm font-bold text-orange-700">+{inscParams.assuranceOccasionnelle * selectedChildren.length}€</span>}
                </label>
                {/* SEPA sans mandat : l'inscription echouerait de toute facon
                    cote traitement. On le dit AVANT le clic, et on propose la
                    seule issue utile — pre-inscrire en attendant le mandat. */}
                {sepaBloque && (
                  <div className="mb-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5">
                    <p className="font-body text-xs font-semibold text-amber-900">
                      Le prélèvement SEPA demande un mandat signé
                    </p>
                    <p className="mt-0.5 font-body text-[11px] text-amber-800 leading-relaxed">
                      Créez-le dans <strong>Prélèvements SEPA</strong>, ou pré-inscrivez
                      ce cavalier en attendant : la place est retenue, sans paiement ni
                      facture, et vous confirmerez l&apos;inscription une fois le mandat signé.
                    </p>
                    <button onClick={() => { setPreinscription(true); setAnnualPayMode("cb_terminal"); }}
                      className="mt-2 rounded-lg bg-indigo-600 px-3 py-1.5 font-body text-[11px] font-semibold text-white border-none cursor-pointer hover:bg-indigo-700">
                      Pré-inscrire à la place
                    </button>
                  </div>
                )}
                <button onClick={handleEnroll} disabled={enrolling || sepaBloque} className={`w-full py-3 rounded-xl font-body text-sm font-semibold border-none ${enrolling || sepaBloque ? "bg-gray-200 text-slate-500 cursor-not-allowed" : "bg-green-600 text-white hover:bg-green-500 cursor-pointer"}`}>
                  {enrolling ? "..." : `Inscrire ${selectedChildren.length} enfant${selectedChildren.length > 1 ? "s" : ""} — ${(stageTotalTTC + (assuranceOccasionnelle ? inscParams.assuranceOccasionnelle * selectedChildren.length : 0)).toFixed(2)}€`}
                </button>
              </div>
            )}

            {/* Bouton Cours / Activité ponctuelle */}
            {!isStage && selChild && (() => {
              const nbSel = Math.max(1, selectedChildren.length);
              const isMulti = nbSel > 1 && inscriptionMode === "ponctuel" && !isCompetition;
              const totalTTC = priceTTC * nbSel;
              const suffixe = isMulti ? ` (${nbSel} cavaliers)` : "";
              return (
              <button onClick={handleEnroll} disabled={!selChild||enrolling||(inscriptionMode==="annuel"&&frequenceCours>=2&&extraSlots.length<frequenceCours-1)} className={`w-full py-3 rounded-xl font-body text-sm font-semibold border-none cursor-pointer ${(!selChild||enrolling||(inscriptionMode==="annuel"&&frequenceCours>=2&&extraSlots.length<frequenceCours-1))?"bg-gray-200 text-slate-500":useRattrapage?"bg-purple-600 text-white hover:bg-purple-500":inscriptionMode==="annuel"?"bg-green-600 text-white hover:bg-green-500":"bg-blue-500 text-white hover:bg-blue-400"}`}>
                {enrolling ? "..."
                  // ── Priorité 0 : inscription établissement (aucune facture) ───
                  : freeEnroll && freeReason === "Établissement" ? `🏫 Inscrire (établissement, sans facture)${suffixe}`
                  // ── Priorité 1 : un rattrapage est sélectionné ───
                  // Aucun paiement ne sera créé (handleEnroll côté page
                  // marque juste le rattrapage 'used'), donc le label doit
                  // refléter qu'aucun montant n'est dû. Sans ce cas, le label
                  // affichait "Inscrire + Encaisser" alors que cliquer ne
                  // crée bien aucun paiement → confusion utilisateur.
                  : useRattrapage ? `🔄 Inscrire en rattrapage (gratuit)${suffixe}`
                  : preinscription ? `✎ Pré-inscrire (aucun paiement)`
                  : inscriptionMode === "annuel" ? `Inscrire à l'année (${totalAnnuel.toFixed(2)}€)`
                  : (allCartes.some((c: any) => c.status === "active" && (c.remainingSessions || 0) > 0 && (c.childId === selChild || (c.familiale && c.familyId === selFam)))) ? `Inscrire 🎟️ (débit carte à la clôture)${suffixe}`
                  : showPay ? `Inscrire + Encaisser (${totalTTC.toFixed(2)}€)${suffixe}`
                  : totalTTC > 0 ? `Inscrire — paiement${isMulti ? "s" : ""} en attente (${totalTTC.toFixed(2)}€)${suffixe}`
                  : `Inscrire${suffixe}`}
              </button>
              );
            })()}
          </div></div>)}

          {/* Panel proposant d'autres jours après inscription jour */}
          {showAddDays && (
            <AjoutJoursStagePanel
              showAddDays={showAddDays} setShowAddDays={setShowAddDays}
              families={families} onEnroll={onEnroll}
              setEnrolling={setEnrolling} setJustEnrolled={setJustEnrolled}
              panelToast={panelToast}
            />
          )}
        </div>
        </div>
        {/* ── Bandeau impayés sticky ── */}
        <BandeauImpayes creneau={creneau} payments={payments} />
      </div>
      <LightboxPlan plan={plan} />
    </div>
  );
}

export default EnrollPanel;
