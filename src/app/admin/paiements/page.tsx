"use client";

/**
 * src/app/admin/paiements/page.tsx
 *
 * Page Paiements & facturation : le point d'entrée unique de tout l'argent
 * du club — encaissements, journal comptable, impayés, échéances, avoirs.
 *
 * Ce fichier n'est plus qu'un CHEF D'ORCHESTRE : il détient l'état partagé
 * par les onglets (familles, commandes, encaissements, avoirs), charge les
 * données, et branche les onglets sur les modales. Tout ce qui écrit en base
 * vit dans un module voisin :
 *
 *   encaissement-central.ts  → l'argent qui entre (source unique de vérité)
 *   encaissement-rapide.ts   → les quatre modes de la modale « Encaisser »
 *   commande-annulation.ts   → supprimer / annuler / retirer une ligne
 *   commande-edition.ts      → enregistrer une commande modifiée
 *   desinscription.ts        → le pendant planning de ces opérations
 *   fidelite-retrait.ts      → retrait des points quand l'argent repart
 *   broadcast-concours.ts    → une commande type diffusée à N familles
 *   calculs-paiement.ts      → les calculs vérifiables hors composant
 *
 * Pourquoi cette découpe : la moitié de ces traitements sont appelés depuis
 * plusieurs onglets à la fois. Tant qu'ils vivaient dans le corps du
 * composant, chaque onglet les recevait en props par une chaîne de plus en
 * plus longue, et toute vérification demandait de rejouer un clic.
 */

import React, { useState, useEffect } from "react";
import AnnulationModal from "./AnnulationModal";
import { useSearchParams } from "next/navigation";
import { collection, getDocs, addDoc, doc, getDoc, serverTimestamp, query, where, orderBy, limit } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { safeNumber, round2, generateOrderId } from "@/lib/utils";
import { useToast } from "@/components/ui/Toast";
import type { Family, Activity } from "@/types";
import { normalizePayment, loadPayments } from "./utils";
import { BasketItem, Payment, PaymentMode, paymentModes } from "./types";
import type {
  AnnulModalState, BroadcastRow, ChequeDiffereSaisi, DuplicateTarget,
  MultiEncaisserState, TabId,
} from "./types-etat";
import { TabEncaisser } from "./TabEncaisser";
import { TabJournal } from "./TabJournal";
import { TabHistorique } from "./TabHistorique";
import { TabEcheances } from "./TabEcheances";
import { TabImpayes } from "./TabImpayes";
import { TabOfferts } from "./TabOfferts";
import { TabDeclarations } from "./TabDeclarations";
import { TabChequesDiffres } from "./TabChequesDiffres";
import { BarreOnglets } from "./BarreOnglets";
import { ModaleDuplication } from "./ModaleDuplication";
import { ModaleBroadcast } from "./ModaleBroadcast";
import { ModaleEncaissementGroupe } from "./ModaleEncaissementGroupe";
import { ModaleEncaisserRapide } from "./ModaleEncaisserRapide";
import { ModaleEditionCommande } from "./ModaleEditionCommande";
import { ModaleLienPaiement } from "./ModaleLienPaiement";
import { totalEncaissePourPaiement } from "./calculs-paiement";
import { enregistrerEncaissement } from "./encaissement-central";
import { executerEncaissementRapide } from "./encaissement-rapide";
import { supprimerCommande, executerAnnulation, retirerLigneCommande } from "./commande-annulation";
import { enrollChildInForfait as inscrireDansForfait } from "./desinscription";
import { creerCommandesBroadcast } from "./broadcast-concours";

export default function PaiementsPage() {
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const urlSearch = searchParams.get("search") || "";
  const urlFamily = searchParams.get("family") || "";
  const urlTab = searchParams.get("tab") || "";
  const [tab, setTab] = useState<TabId>(urlTab === "impayes" ? "impayes" : urlSearch ? "impayes" : "encaisser");
  const [editPayment, setEditPayment] = useState<any | null>(null);
  const [quickEncaisser, setQuickEncaisser] = useState<{ payment: any } | null>(null);
  const [sendingCawlLink, setSendingCawlLink] = useState<string | null>(null);
  const [payLinkModal, setPayLinkModal] = useState<any | null>(null); // payment pour la modale
  const [payLinkEmail, setPayLinkEmail] = useState("");
  const [payLinkAmount, setPayLinkAmount] = useState("");
  const [payLinkMessage, setPayLinkMessage] = useState("");
  const [payLinkGenerating, setPayLinkGenerating] = useState(false);
  const [payLinkSending, setPayLinkSending] = useState(false);
  const [quickMode, setQuickMode] = useState("cheque");
  // Annulation : répartition avoir / remboursement (cf. AnnulationModal)
  const [annulModal, setAnnulModal] = useState<AnnulModalState | null>(null);
  const [quickMontant, setQuickMontant] = useState("");
  const [quickDate, setQuickDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [quickRef, setQuickRef] = useState("");
  const [quickSaving, setQuickSaving] = useState(false);

  // ─── Encaissement groupé : régler plusieurs factures d'une famille en une fois ───
  // Uniquement des commandes SANS règlement en cours (ni chèque différé, ni SEPA
  // programmé) : un seul geste (espèces / chèque / CB), réparti sur les commandes.
  const [multiEncaisser, setMultiEncaisser] = useState<MultiEncaisserState | null>(null);
  const [multiMode, setMultiMode] = useState<string>("cheque");
  const [multiRef, setMultiRef] = useState("");
  const [multiDate, setMultiDate] = useState(new Date().toISOString().split("T")[0]);
  const [multiSaving, setMultiSaving] = useState(false);

  const handleMultiEncaisser = async () => {
    if (!multiEncaisser) return;
    const cibles = multiEncaisser.payments;
    if (cibles.length === 0) return;
    setMultiSaving(true);
    try {
      const ids: string[] = [];
      let totalEncaisse = 0;
      // Chaque commande reste un document distinct (compta/NF525 intacts) : on
      // solde son dû via la fonction centralisée, une à une, même geste de paiement.
      for (const p of cibles) {
        const du = Math.max(0, Math.round(((p.totalTTC || 0) - (p.paidAmount || 0)) * 100) / 100);
        if (du <= 0) continue;
        await enregistrerEncaissement(
          p.id!, p, du, multiMode, multiRef,
          (p.items || []).map((i: any) => i.activityTitle).join(", "),
          multiDate,
        );
        ids.push(p.id!);
        totalEncaisse += du;
      }
      toast(`✅ ${ids.length} facture(s) réglée(s) pour ${multiEncaisser.familyName} — ${totalEncaisse.toFixed(2)}€ (${paymentModes.find(m => m.id === multiMode)?.label})`, "success");
      setMultiEncaisser(null);
      setMultiRef(""); setMultiDate(new Date().toISOString().split("T")[0]);
      await refreshAll(ids);
    } catch (e) { console.error(e); toast("Erreur encaissement groupé", "error"); }
    setMultiSaving(false);
  };
  const [quickMandatActif, setQuickMandatActif] = useState<boolean | null>(null);
  // Saisie multi-chèques pour le mode "cheque_differe" dans la modale rapide
  const [quickChequesDiffres, setQuickChequesDiffres] = useState<ChequeDiffereSaisi[]>([{ numero: "", banque: "", montant: "", dateEncaissementPrevue: new Date().toISOString().split("T")[0] }]);
  const [impayesSearch, setImpayesSearch] = useState(urlSearch);
  const [impayesExpanded, setImpayesExpanded] = useState<Set<string>>(new Set());
  const [editItems, setEditItems] = useState<any[]>([]);
  const [editRemisePct, setEditRemisePct] = useState("");
  const [selectedFamily, setSelectedFamily] = useState<string>(urlFamily);
  const [editRemiseEuros, setEditRemiseEuros] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [families, setFamilies] = useState<(Family & { firestoreId: string })[]>([]);
  const [activities, setActivities] = useState<(Activity & { firestoreId: string })[]>([]);
  const [payments, setPayments] = useState<(Payment & { id: string })[]>([]);
  const [encaissements, setEncaissements] = useState<any[]>([]);
  const [avoirs, setAvoirs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [declarations, setDeclarations] = useState<any[]>([]);
  const [confirmingDeclId, setConfirmingDeclId] = useState<string | null>(null);
  // Chèques différés (pour calcul du badge de retard dans la barre d'onglets)
  const [chequesDiffresCount, setChequesDiffresCount] = useState<{ total: number; overdue: number }>({ total: 0, overdue: 0 });

  // Historique filters
  const [histModeFilter, setHistModeFilter] = useState<string>("all");
  const [histStatusFilter, setHistStatusFilter] = useState<string>("all");
  const [histSearch, setHistSearch] = useState("");
  const [histPeriod, setHistPeriod] = useState("");

  // Journal filters
  const [journalDateFrom, setJournalDateFrom] = useState("");
  const [journalDateTo, setJournalDateTo] = useState("");
  const [journalMontantMin, setJournalMontantMin] = useState("");
  const [journalMontantMax, setJournalMontantMax] = useState("");
  const [journalMode, setJournalMode] = useState("all");
  const [journalStatus, setJournalStatus] = useState("all");
  const [journalSearch, setJournalSearch] = useState("");
  const [correctionEnc, setCorrectionEnc] = useState<any | null>(null);
  const [correctionMontant, setCorrectionMontant] = useState("");
  const [correctionMode, setCorrectionMode] = useState("");
  const [correctionRef, setCorrectionRef] = useState("");
  const [correctionRaison, setCorrectionRaison] = useState("");

  // Basket state
  const [familySearch, setFamilySearch] = useState("");
  const [basket, setBasket] = useState<BasketItem[]>([]);
  const [selectedActivity, setSelectedActivity] = useState("");
  const [selectedChild, setSelectedChild] = useState("");
  const [customLabel, setCustomLabel] = useState("");
  const [customPrice, setCustomPrice] = useState("");

  // Payment state
  const [paymentMode, setPaymentMode] = useState<PaymentMode>("cb_terminal");
  const [paymentRef, setPaymentRef] = useState("");
  const [paidAmount, setPaidAmount] = useState("");
  const [encaissementDate, setEncaissementDate] = useState(new Date().toISOString().split("T")[0]);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  // Réductions
  const [promos, setPromos] = useState<any[]>([]);
  const [promoCode, setPromoCode] = useState("");
  const [appliedPromo, setAppliedPromo] = useState<{ label: string; discountMode: string; discountValue: number } | null>(null);
  const [manualDiscount, setManualDiscount] = useState("");

  const fetchData = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const [famSnap, actSnap, paySnap, encSnap, avoirsSnap, promoSnap, declSnap] = await Promise.all([
        getDocs(collection(db, "families")),
        getDocs(collection(db, "activities")),
        getDocs(collection(db, "payments")),
        getDocs(query(collection(db, "encaissements"), orderBy("date", "desc"), limit(500))),
        getDocs(collection(db, "avoirs")),
        getDoc(doc(db, "settings", "promos")),
        getDocs(query(collection(db, "payment_declarations"), where("status", "==", "pending_confirmation"))),
      ]);
      setFamilies(famSnap.docs.map((d) => ({ firestoreId: d.id, ...d.data() })) as any);
      setActivities(actSnap.docs.map((d) => ({ firestoreId: d.id, ...d.data() })) as any);
      const pays = loadPayments(paySnap.docs) as any[];
      pays.sort((a, b) => (b.date?.seconds || 0) - (a.date?.seconds || 0));
      setPayments(pays as any);
      setEncaissements(encSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as any);
      setAvoirs(avoirsSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as any);
      if (promoSnap.exists() && promoSnap.data().items) setPromos(promoSnap.data().items);
      const decls = declSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a: any, b: any) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setDeclarations(decls);
      // Charger les chèques différés pour le badge
      try {
        const chqSnap = await getDocs(collection(db, "cheques-differes"));
        const todayBadge = new Date().toISOString().split("T")[0];
        const pending = chqSnap.docs.filter(d => d.data().status === "pending");
        const overdue = pending.filter(d => (d.data().dateEncaissementPrevue || "") < todayBadge);
        setChequesDiffresCount({ total: pending.length, overdue: overdue.length });
      } catch {}
      setLoading(false);
      const impayes = (pays as any[]).filter(p => p.status === "pending" || p.status === "partial");
      const totalImpaye = impayes.reduce((s: number, p: any) => s + ((p.totalTTC||0) - (p.paidAmount||0)), 0);
      window.dispatchEvent(new CustomEvent("agent:setContext", { detail: {
        module_actif: "paiements",
        impayes_count: impayes.length,
        impayes_total: `${totalImpaye.toFixed(2)}€`,
        declarations_en_attente: decls.length,
        impayes_details: impayes.slice(0, 10).map((p: any) => ({
          famille: p.familyName,
          montant: `${((p.totalTTC||0)-(p.paidAmount||0)).toFixed(2)}€`,
          prestations: (p.items||[]).map((i: any) => i.activityTitle).join(", "),
        })),
      }}));
    } catch { setLoading(false); }
    if (isRefresh) setRefreshing(false);
  };

  useEffect(() => { fetchData(); }, []);

  // ═══ ENCAISSEMENT RAPIDE DEPUIS L'ONGLET IMPAYÉS ═══
  // Charger le mandat SEPA dès que la modale s'ouvre
  useEffect(() => {
    if (!quickEncaisser) { setQuickMandatActif(null); return; }
    setQuickMandatActif(null);
    getDocs(query(collection(db, "mandats-sepa"),
      where("familyId", "==", quickEncaisser.payment.familyId),
      where("status", "==", "active")
    )).then(snap => setQuickMandatActif(!snap.empty)).catch(() => setQuickMandatActif(false));
  }, [quickEncaisser]);

  // ── Avoirs actifs de la famille (pour permettre encaissement par avoir) ──
  // Affichés dans la modale "Encaisser" comme un mode de paiement supplementaire
  // si la famille a un solde d'avoir disponible (status='actif' et remainingAmount>0).
  const [quickAvoirs, setQuickAvoirs] = useState<any[]>([]);
  useEffect(() => {
    if (!quickEncaisser) { setQuickAvoirs([]); return; }
    getDocs(query(collection(db, "avoirs"),
      where("familyId", "==", quickEncaisser.payment.familyId)
    )).then(snap => {
      const list = snap.docs
        .map(d => ({ id: d.id, ...d.data() }) as any)
        .filter(a => a.status === "actif" && (a.remainingAmount || 0) > 0);
      setQuickAvoirs(list);
    }).catch(() => setQuickAvoirs([]));
  }, [quickEncaisser]);

  // Pré-remplir la grille de chèques différés avec le montant dû quand la modale s'ouvre
  useEffect(() => {
    if (!quickEncaisser) return;
    const p = quickEncaisser.payment;
    const du = Math.max(0, Math.round(((p.totalTTC || 0) - (p.paidAmount || 0)) * 100) / 100);
    setQuickChequesDiffres([{
      numero: "", banque: "",
      montant: du > 0 ? du.toFixed(2) : "",
      dateEncaissementPrevue: new Date().toISOString().split("T")[0],
    }]);
  }, [quickEncaisser]);

  const handleQuickEncaisser = async () => {
    if (!quickEncaisser) return;
    await executerEncaissementRapide({
      quickEncaisser, quickMontant, quickMode, quickRef, quickDate,
      quickChequesDiffres, quickAvoirs,
      setQuickSaving, setQuickEncaisser, setQuickMontant, setQuickRef, setQuickDate,
      setQuickChequesDiffres, toast, refreshAll,
    });
  };

  const family = families.find((f) => f.firestoreId === selectedFamily);
  const children = family?.children || [];

  // Rafraîchir les données
  // Rafraîchir les données.
  // changedPaymentIds fourni  → rafraîchissement CIBLÉ (relit seulement ces
  //   paiements + leurs encaissements + les avoirs de leurs familles).
  //   Évite de relire TOUTE la collection payments à chaque action
  //   (~2500 lectures Firestore -> ~6). Utilisé par les actions sur 1 paiement.
  // Aucun argument → rafraîchissement COMPLET (broadcast, duplication, fallback).
  const refreshAll = async (changedPaymentIds?: string[]) => {
    if (changedPaymentIds && changedPaymentIds.length > 0 && changedPaymentIds.length <= 10) {
      try {
        // 1. Relire uniquement les paiements modifiés
        const paySnaps = await Promise.all(
          changedPaymentIds.map((id) => getDoc(doc(db, "payments", id)))
        );
        const updated = paySnaps
          .filter((s) => s.exists())
          .map((s) => normalizePayment({ id: s.id, ...s.data() })) as any[];
        const updatedIds = new Set(updated.map((p) => p.id));

        // 2. Relire les encaissements de ces paiements
        const encSnap = await getDocs(
          query(collection(db, "encaissements"), where("paymentId", "in", changedPaymentIds))
        );
        const encForChanged = encSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as any[];

        // 3. Relire les avoirs des familles concernées (création/consommation)
        const famIds = Array.from(new Set(updated.map((p) => p.familyId).filter(Boolean)));
        let avoirsForFam: any[] | null = null;
        if (famIds.length > 0 && famIds.length <= 10) {
          const avSnap = await getDocs(
            query(collection(db, "avoirs"), where("familyId", "in", famIds))
          );
          avoirsForFam = avSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as any[];
        }

        // 4. Mise à jour locale du state (sans tout relire)
        setPayments((prev: any[]) => {
          const next = prev.map((p) => (updatedIds.has(p.id) ? updated.find((u) => u.id === p.id) : p));
          for (const u of updated) if (!prev.some((p) => p.id === u.id)) next.unshift(u);
          next.sort((a: any, b: any) => (b.date?.seconds || 0) - (a.date?.seconds || 0));
          return next as any;
        });
        setEncaissements((prev: any[]) => {
          const kept = prev.filter((e) => !changedPaymentIds.includes(e.paymentId));
          return [...encForChanged, ...kept] as any;
        });
        if (avoirsForFam !== null) {
          const fam = famIds;
          setAvoirs((prev: any[]) => {
            const kept = prev.filter((a) => !fam.includes(a.familyId));
            return [...(avoirsForFam as any[]), ...kept] as any;
          });
        }
        return;
      } catch (e) {
        console.error("refreshAll ciblé échoué, fallback complet:", e);
        // on retombe sur le rafraîchissement complet ci-dessous
      }
    }

    // ── Rafraîchissement COMPLET ──
    const [paySnap, encSnap, avoirsSnap, chqSnap] = await Promise.all([
      getDocs(collection(db, "payments")),
      getDocs(query(collection(db, "encaissements"), orderBy("date", "desc"), limit(500))),
      getDocs(collection(db, "avoirs")),
      getDocs(collection(db, "cheques-differes")).catch(() => null),
    ]);
    const pays = loadPayments(paySnap.docs) as any[];
    pays.sort((a, b) => (b.date?.seconds || 0) - (a.date?.seconds || 0));
    setPayments(pays as any);
    setEncaissements(encSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as any);
    setAvoirs(avoirsSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as any);
    // Calcul du badge chèques différés (total en attente + retard)
    if (chqSnap) {
      const today = new Date().toISOString().split("T")[0];
      const pending = chqSnap.docs.filter(d => d.data().status === "pending");
      const overdue = pending.filter(d => (d.data().dateEncaissementPrevue || "") < today);
      setChequesDiffresCount({ total: pending.length, overdue: overdue.length });
    }
  };

  // ═══ SUPPRESSION / MODIFICATION DE COMMANDE ═══
  // Règle : non encaissé = supprimable, encaissé = avoir automatique

  /** Montant réellement encaissé sur une commande, lu dans le journal local. */
  const getTotalEncaisse = (payment: any) => totalEncaissePourPaiement(encaissements, payment);

  const deletePaymentCommand = async (payment: any) =>
    supprimerCommande(payment, getTotalEncaisse(payment), toast, refreshAll, setAnnulModal);

  const removePaymentItem = async (payment: any, itemIndex: number) =>
    retirerLigneCommande(payment, itemIndex, getTotalEncaisse(payment), refreshAll);

  const [duplicateTarget, setDuplicateTarget] = useState<DuplicateTarget | null>(null);

  // ─── Broadcast concours : state ───
  const [broadcastSource, setBroadcastSource] = useState<any | null>(null); // payment source
  const [broadcastRows, setBroadcastRows] = useState<BroadcastRow[]>([]);
  const [broadcastSearch, setBroadcastSearch] = useState("");
  const [broadcastSending, setBroadcastSending] = useState(false);

  // ─── Duplication Mode 1 : pré-remplir le panier (même famille, créneaux à choisir) ───
  const duplicateToBasket = (payment: any) => {
    const family = families.find(f => f.firestoreId === payment.familyId);
    if (!family) return;
    const items: BasketItem[] = (payment.items || []).map((item: any) => ({
      id: `dup_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      activityTitle: item.activityTitle || item.label || "",
      childId: item.childId || "",
      childName: item.childName || "",
      activityId: item.activityId || "",
      activityType: item.activityType || "",
      description: item.description || item.activityTitle || "",
      priceHT: safeNumber(item.priceHT),
      tva: safeNumber(item.tva || item.tvaTaux || 5.5),
      priceTTC: safeNumber(item.priceTTC),
      creneauId: "",
    }));
    setSelectedFamily(family.firestoreId);
    setFamilySearch(family.parentName || "");
    setBasket(items);
    setTab("encaisser");
    setDuplicateTarget(null);
    toast(`Panier pré-rempli pour ${family.parentName} — ${items.length} prestation(s). Ajustez les créneaux puis encaissez.`);
  };

  // ─── Inscription d'un enfant dans tous les créneaux futurs d'un forfait ───
  // (le détail est dans desinscription.ts : il a besoin de la liste des familles)
  const enrollChildInForfait = async (payment: any, targetFamilyId: string): Promise<number> =>
    inscrireDansForfait(families, payment, targetFamilyId);

  // ─── Duplication Mode 2 : commande pending vers une autre famille ───
  const duplicateToFamily = async (payment: any, targetFamilyId: string) => {
    const targetFamily = families.find(f => f.firestoreId === targetFamilyId);
    if (!targetFamily) return;
    const targetChildren = targetFamily.children || [];
    const targetChild = targetChildren[0];

    const cleanedItems = (payment.items || []).map((item: any, idx: number) => {
      const mapped = targetChildren[idx] || targetChildren[0];
      const tc = mapped ? { childId: mapped.id || "", childName: mapped.firstName || "" } : { childId: "", childName: "" };
      return {
        ...tc,
        activityType: item.activityType || "",
        activityTitle: item.activityTitle || item.label || "",
        stageKey: item.stageKey || "",
        priceHT: safeNumber(item.priceHT),
        priceTTC: safeNumber(item.priceTTC),
        tva: safeNumber(item.tva || item.tvaTaux || 5.5),
        creneauId: item.creneauId || "",
        reservationId: "",
      };
    });

    const totalTTC = round2(cleanedItems.reduce((s: number, i: any) => s + safeNumber(i.priceTTC), 0));
    await addDoc(collection(db, "payments"), {
      orderId: generateOrderId(),
      familyId: targetFamily.firestoreId,
      familyName: targetFamily.parentName || "",
      items: cleanedItems, totalTTC,
      status: "pending", paidAmount: 0, paymentMode: "", paymentRef: "",
      source: "duplicate", sourcePaymentId: payment.id,
      createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    });

    // Inscrire l'enfant dans tous les créneaux futurs en utilisant les items ORIGINAUX
    // (qui ont les creneauIds de référence) plutôt que les cleanedItems
    const inscriptions = await enrollChildInForfait(payment, targetFamilyId);

    setDuplicateTarget(null);
    await refreshAll();
    toast(
      inscriptions > 0
        ? `✅ ${targetFamily.parentName} — commande créée + ${inscriptions} séance(s) inscrite(s)`
        : `⚠️ Commande créée pour ${targetFamily.parentName} — aucune séance inscrite automatiquement`,
      inscriptions > 0 ? "success" : "error"
    );
  };

  // ─── Broadcast concours : envoi en masse ───
  const broadcastToFamilies = async () => {
    if (broadcastRows.length === 0) return;
    setBroadcastSending(true);
    const { ok, err, totalInscriptionsCompet, inscriptionsCompetErr } =
      await creerCommandesBroadcast(broadcastRows, broadcastSource);
    setBroadcastSending(false);
    setBroadcastSource(null);
    setBroadcastRows([]);
    setBroadcastSearch("");
    await refreshAll();
    // Toast récapitulatif : commandes + inscriptions compétition
    const partsToast: string[] = [`${ok} commande${ok > 1 ? "s" : ""} créée${ok > 1 ? "s" : ""} dans Impayés`];
    if (totalInscriptionsCompet > 0) partsToast.push(`${totalInscriptionsCompet} inscription${totalInscriptionsCompet > 1 ? "s" : ""} compétition`);
    if (err > 0) partsToast.push(`${err} erreur(s) commande`);
    if (inscriptionsCompetErr > 0) partsToast.push(`${inscriptionsCompetErr} inscription(s) compétition échouée(s)`);
    toast(partsToast.join(" — ") + ".");
  };

  const basketSubtotal = basket.reduce((s, i) => s + i.priceTTC, 0);
  const promoDiscount = appliedPromo
    ? (appliedPromo.discountMode === "percent" ? basketSubtotal * appliedPromo.discountValue / 100 : appliedPromo.discountValue)
    : (safeNumber(manualDiscount));
  const basketTotal = Math.max(0, basketSubtotal - promoDiscount);

  const applyPromoCode = () => {
    const found = promos.find((p: any) => p.type === "code" && p.code === promoCode.toUpperCase() && p.active && (p.appliesTo === "paiement" || p.appliesTo === "tout"));
    if (found) {
      if (found.maxUses > 0 && found.usedCount >= found.maxUses) { toast("Ce code a atteint son nombre max d'utilisations."); return; }
      if (found.validUntil && new Date(found.validUntil) < new Date()) { toast("Ce code a expiré.", "warning"); return; }
      setAppliedPromo({ label: found.label, discountMode: found.discountMode, discountValue: found.discountValue });
      setManualDiscount("");
    } else {
      toast("Code promo invalide ou non applicable aux paiements.");
    }
  };

  const filteredFamilies = familySearch
    ? families.filter((f) => { const terms = familySearch.toLowerCase().trim().split(/\s+/); const childText = (f.children || []).map((c: any) => `${c.firstName || ""} ${(c as any).lastName || ""}`).join(" "); const searchable = `${f.parentName || ""} ${f.parentEmail || ""} ${childText}`.toLowerCase(); return terms.every(t => searchable.includes(t)); })
    : families;

  const addToBasket = () => {
    if (customLabel && customPrice) {
      const price = safeNumber(customPrice);
      setBasket([...basket, {
        id: Date.now().toString(),
        activityTitle: customLabel,
        childId: selectedChild || "",
        childName: selectedChild || "—",
        description: "Saisie manuelle",
        priceHT: price / 1.055,
        tva: 5.5,
        priceTTC: price,
      }]);
      setCustomLabel("");
      setCustomPrice("");
      return;
    }

    const activity = activities.find((a) => a.firestoreId === selectedActivity);
    if (!activity) return;
    const child = children.find((c: any) => c.id === selectedChild);
    const priceTTC = (activity as any).priceTTC || (activity.priceHT || 0) * (1 + (activity.tvaTaux || 5.5) / 100);
    const priceHT = priceTTC / (1 + (activity.tvaTaux || 5.5) / 100);
    setBasket([...basket, {
      id: Date.now().toString(),
      activityTitle: activity.title,
      childId: selectedChild || "",
      childName: child?.firstName || "—",
      activityId: activity.firestoreId,
      description: activity.schedule || "",
      priceHT: Math.round(priceHT * 100) / 100,
      tva: activity.tvaTaux || 5.5,
      priceTTC: Math.round(priceTTC * 100) / 100,
    }]);
    setSelectedActivity("");
  };

  const inputCls = "w-full px-3 py-2.5 rounded-lg border border-blue-500/8 font-body text-sm bg-cream focus:border-blue-500 focus:outline-none";

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h1 className="font-display text-2xl font-bold text-blue-800">Paiements & facturation</h1>
        </div>
        <button onClick={() => fetchData(true)} disabled={refreshing}
          className="flex items-center gap-1.5 font-body text-xs text-slate-600 bg-white border border-gray-200 px-3 py-2 rounded-lg cursor-pointer hover:bg-gray-50 disabled:opacity-50 transition-colors">
          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={refreshing ? "animate-spin" : ""}><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>
          {refreshing ? "Actualisation..." : "Actualiser"}
        </button>
      </div>

      <BarreOnglets tab={tab} setTab={setTab} payments={payments}
        chequesDiffresCount={chequesDiffresCount} declarations={declarations}
      />

      {/* ─── Encaisser Tab ─── */}
      {tab === "encaisser" && (
        <TabEncaisser
          families={families} activities={activities} payments={payments}
          encaissements={encaissements} avoirs={avoirs} promos={promos} loading={loading}
          enregistrerEncaissement={enregistrerEncaissement}
          toast={toast} setTab={setTab} refreshAll={refreshAll}
        />
      )}

      {/* ─── Journal des encaissements ─── */}
      {tab === "journal" && (
        <TabJournal loading={loading} payments={payments}
          encaissements={encaissements} avoirs={avoirs} toast={toast} refreshAll={refreshAll}
        />
      )}

      {/* ─── Historique Tab ─── */}
      {tab === "historique" && (
        <TabHistorique loading={loading} payments={payments} avoirs={avoirs}
          encaissements={encaissements} families={families}
          toast={toast} setPayments={setPayments}
          setDuplicateTarget={setDuplicateTarget}
          deletePaymentCommand={deletePaymentCommand}
          setEditPayment={setEditPayment}
          setEditItems={setEditItems}
          setEditRemisePct={setEditRemisePct}
          setEditRemiseEuros={setEditRemiseEuros}
        />
      )}
      {/* ─── Échéances Tab ─── */}
      {tab === "echeances" && (
        <TabEcheances loading={loading} payments={payments}
          toast={toast} setPayments={setPayments} refreshAll={refreshAll}
          enregistrerEncaissement={enregistrerEncaissement}
        />
      )}

      {/* ─── Impayés Tab ─── */}
      {tab === "impayes" && (
        <TabImpayes loading={loading} payments={payments}
          families={families} toast={toast} setPayments={setPayments}
          setQuickEncaisser={setQuickEncaisser}
          setQuickMontant={setQuickMontant}
          setQuickDate={setQuickDate}
          setQuickRef={setQuickRef}
          setQuickMode={setQuickMode}
          setEditPayment={setEditPayment}
          setEditItems={setEditItems}
          setEditRemisePct={setEditRemisePct}
          setEditRemiseEuros={setEditRemiseEuros}
          setPayLinkModal={setPayLinkModal}
          setPayLinkEmail={setPayLinkEmail}
          setPayLinkAmount={setPayLinkAmount}
          setPayLinkMessage={setPayLinkMessage}
          removePaymentItem={removePaymentItem}
          setDuplicateTarget={setDuplicateTarget}
          deletePaymentCommand={deletePaymentCommand}
          enrollChildInForfait={enrollChildInForfait}
          onMultiEncaisser={(familyId, familyName, pays) => { setMultiEncaisser({ familyId, familyName, payments: pays }); setMultiMode("cheque"); setMultiRef(""); setMultiDate(new Date().toISOString().split("T")[0]); }}
        />
      )}

      {/* ─── Onglet Chèques différés ─── */}
      {tab === "cheques_differes" && (
        <TabChequesDiffres
          payments={payments}
          enregistrerEncaissement={enregistrerEncaissement}
          toast={toast}
          refreshAll={refreshAll}
        />
      )}

      {/* ─── Onglet Offerts ─── */}
      {tab === "offerts" && (
        <TabOfferts payments={payments} />
      )}

      {/* ─── Onglet Déclarations ─── */}
      {tab === "declarations" && (
        <TabDeclarations
          loading={loading} payments={payments}
          declarations={declarations} setDeclarations={setDeclarations}
          families={families} avoirs={avoirs}
          broadcastSource={broadcastSource} setBroadcastSource={setBroadcastSource}
          broadcastRows={broadcastRows} setBroadcastRows={setBroadcastRows}
          broadcastSearch={broadcastSearch} setBroadcastSearch={setBroadcastSearch}
          broadcastSending={broadcastSending} setBroadcastSending={setBroadcastSending}
          toast={toast} setPayments={setPayments} refreshAll={refreshAll}
        />
      )}

      {/* ─── Modale duplication 3 modes ─── */}
      {duplicateTarget && (
        <ModaleDuplication
          duplicateTarget={duplicateTarget} setDuplicateTarget={setDuplicateTarget}
          families={families} duplicateToBasket={duplicateToBasket}
          setBroadcastSource={setBroadcastSource} setBroadcastRows={setBroadcastRows}
          setBroadcastSearch={setBroadcastSearch}
          refreshAll={refreshAll} toast={toast}
        />
      )}

      {/* ─── Modale Broadcast Concours ─── */}
      {broadcastSource && (
        <ModaleBroadcast
          broadcastSource={broadcastSource} setBroadcastSource={setBroadcastSource}
          broadcastRows={broadcastRows} setBroadcastRows={setBroadcastRows}
          broadcastSearch={broadcastSearch} setBroadcastSearch={setBroadcastSearch}
          broadcastSending={broadcastSending} broadcastToFamilies={broadcastToFamilies}
          families={families}
        />
      )}

      {/* ─── Modale Encaissement groupé ─── */}
      {multiEncaisser && (
        <ModaleEncaissementGroupe
          multiEncaisser={multiEncaisser} setMultiEncaisser={setMultiEncaisser}
          multiMode={multiMode} setMultiMode={setMultiMode}
          multiRef={multiRef} setMultiRef={setMultiRef}
          multiDate={multiDate} setMultiDate={setMultiDate}
          multiSaving={multiSaving} handleMultiEncaisser={handleMultiEncaisser}
        />
      )}

      {/* ─── Modale Encaisser (commande unique) ─── */}
      {quickEncaisser && (
        <ModaleEncaisserRapide
          quickEncaisser={quickEncaisser} setQuickEncaisser={setQuickEncaisser}
          quickMontant={quickMontant} setQuickMontant={setQuickMontant}
          quickMode={quickMode} setQuickMode={setQuickMode}
          quickRef={quickRef} setQuickRef={setQuickRef}
          quickDate={quickDate} setQuickDate={setQuickDate}
          quickAvoirs={quickAvoirs} quickMandatActif={quickMandatActif}
          quickChequesDiffres={quickChequesDiffres} setQuickChequesDiffres={setQuickChequesDiffres}
          quickSaving={quickSaving} handleQuickEncaisser={handleQuickEncaisser}
        />
      )}

      {/* ── Modal édition commande ── */}
      {editPayment && (
        <ModaleEditionCommande
          editPayment={editPayment} setEditPayment={setEditPayment}
          editItems={editItems} setEditItems={setEditItems}
          editRemisePct={editRemisePct} setEditRemisePct={setEditRemisePct}
          editRemiseEuros={editRemiseEuros} setEditRemiseEuros={setEditRemiseEuros}
          editSaving={editSaving} setEditSaving={setEditSaving}
          setPayments={setPayments} toast={toast}
        />
      )}

      {/* ─── Modale : Envoyer un lien de paiement ─── */}
      {payLinkModal && (
        <ModaleLienPaiement
          payLinkModal={payLinkModal} setPayLinkModal={setPayLinkModal}
          payLinkEmail={payLinkEmail} setPayLinkEmail={setPayLinkEmail}
          payLinkAmount={payLinkAmount} setPayLinkAmount={setPayLinkAmount}
          payLinkMessage={payLinkMessage} setPayLinkMessage={setPayLinkMessage}
          payLinkGenerating={payLinkGenerating} setPayLinkGenerating={setPayLinkGenerating}
          payLinkSending={payLinkSending} setPayLinkSending={setPayLinkSending}
          families={families} toast={toast}
        />
      )}

      {annulModal && (
        <AnnulationModal
          familyName={annulModal.payment.familyName}
          encaisse={annulModal.encaisse}
          lignes={annulModal.lignes}
          onClose={() => setAnnulModal(null)}
          onConfirm={async (data) => {
            const { payment, encaisse } = annulModal;
            setAnnulModal(null);
            await executerAnnulation(payment, encaisse, data, toast, refreshAll);
          }}
        />
      )}
    </div>
  );
}
