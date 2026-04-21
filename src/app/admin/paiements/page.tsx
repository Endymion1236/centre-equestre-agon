"use client";

import React, { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { collection, getDocs, addDoc, deleteDoc, updateDoc, setDoc, doc, getDoc, serverTimestamp, Timestamp, query, where, orderBy, limit, runTransaction } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { emailTemplates } from "@/lib/email-templates";
import { safeNumber, round2, generateOrderId } from "@/lib/utils";
import { Card, Badge, Button } from "@/components/ui";
import { HelpButton } from "@/components/HelpButton";
import { createEncaissement } from "@/lib/compta-encaissement";
import { useToast } from "@/components/ui/Toast";
import { useAgentContext } from "@/hooks/useAgentContext";
import { Plus, Trash2, ShoppingCart, CreditCard, Check, Loader2, Search, X, Receipt, AlertTriangle, Copy, ChevronDown, Gift, Calendar } from "lucide-react";
import { openHtmlInTab } from "@/lib/open-html-tab";
import { downloadInvoicePdf } from "@/lib/download-invoice";
import { downloadAvoirPdf } from "@/lib/download-avoir";
import type { Family, Activity } from "@/types";
import { normalizePayment, loadPayments } from "./utils";
import { BasketItem, Payment, PaymentMode, paymentModes } from "./types";
import { NoteField } from "./NoteField";
import { TabEncaisser } from "./TabEncaisser";
import { TabJournal } from "./TabJournal";
import { TabHistorique } from "./TabHistorique";
import { TabEcheances } from "./TabEcheances";
import { TabImpayes } from "./TabImpayes";
import { TabOfferts } from "./TabOfferts";
import { TabDeclarations } from "./TabDeclarations";
import { TabChequesDiffres } from "./TabChequesDiffres";
import { authFetch } from "@/lib/auth-fetch";

export default function PaiementsPage() {
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const urlSearch = searchParams.get("search") || "";
  const urlFamily = searchParams.get("family") || "";
  const urlTab = searchParams.get("tab") || "";
  const [tab, setTab] = useState<"encaisser" | "journal" | "historique" | "echeances" | "impayes" | "offerts" | "declarations" | "cheques_differes">(urlTab === "impayes" ? "impayes" : urlSearch ? "impayes" : "encaisser");
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
  const [quickMontant, setQuickMontant] = useState("");
  const [quickDate, setQuickDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [quickRef, setQuickRef] = useState("");
  const [quickSaving, setQuickSaving] = useState(false);
  const [quickMandatActif, setQuickMandatActif] = useState<boolean | null>(null);
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

  const handleQuickEncaisser = async () => {
    if (!quickEncaisser) return;
    const p = quickEncaisser.payment;
    const montant = parseFloat(quickMontant) || ((p.totalTTC || 0) - (p.paidAmount || 0));
    if (montant <= 0) return;
    setQuickSaving(true);
    try {
      // ── Mode SEPA : créer les échéances au lieu d'encaisser directement ──
      if (quickMode === "prelevement_sepa") {
        const nbEch = parseInt(quickRef || "10");
        const startDate = new Date(quickDate || new Date().toISOString().split("T")[0]);

        // Trouver le mandat SEPA de cette famille
        const mandatSnap = await getDocs(collection(db, "mandats-sepa"));
        const mandat = mandatSnap.docs.find(d => d.data().familyId === p.familyId && d.data().status === "active");
        if (!mandat) {
          toast("⚠️ Aucun mandat SEPA actif pour cette famille. Créez-en un dans Prélèvements SEPA.", "error");
          setQuickSaving(false);
          return;
        }
        const mandatData = mandat.data();

        // Créer les échéances
        const montantEch = Math.floor(montant / nbEch * 100) / 100;
        const reste = Math.round((montant - montantEch * nbEch) * 100) / 100;
        const desc = (p.items || []).map((i: any) => i.activityTitle).join(", ") || "Forfait";

        for (let i = 0; i < nbEch; i++) {
          const d = new Date(startDate);
          d.setMonth(d.getMonth() + i);
          const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
          const m = i === nbEch - 1 ? montantEch + reste : montantEch;

          await addDoc(collection(db, "echeances-sepa"), {
            familyId: p.familyId,
            familyName: p.familyName,
            mandatId: mandatData.mandatId,
            montant: Math.round(m * 100) / 100,
            dateEcheance: dateStr,
            reference: `Paiement ${p.id}`,
            description: `${desc} — ${i + 1}/${nbEch}`,
            status: "pending",
            remiseId: null,
            paymentId: p.id,
            createdAt: serverTimestamp(),
          });
        }

        // Marquer le paiement comme SEPA (mais pas payé — il sera payé quand la remise passera)
        await updateDoc(doc(db, "payments", p.id), {
          paymentMode: "prelevement_sepa",
          paymentRef: `${nbEch}× SEPA · ${mandatData.mandatId}`,
          updatedAt: serverTimestamp(),
        });

        toast(`✅ ${nbEch} échéances SEPA créées pour ${p.familyName} (${montant.toFixed(2)}€)`, "success");
        setQuickEncaisser(null);
        setQuickMontant(""); setQuickRef("");
        setQuickDate(new Date().toISOString().split("T")[0]);
        await refreshAll();
        setQuickSaving(false);
        return;
      }

      // ── Encaissement normal (CB, chèque, espèces, etc.) ──
      // Utiliser la fonction centralisée qui gère points fidélité + invoiceNumber
      await enregistrerEncaissement(
        p.id!, p, montant, quickMode, quickRef,
        (p.items || []).map((i: any) => i.activityTitle).join(", "),
        quickDate,
      );
      const encSnap2 = await getDocs(query(collection(db, "encaissements"), where("paymentId", "==", p.id)));
      const totalEncaisse2 = Math.round(encSnap2.docs.reduce((s, d) => s + safeNumber(d.data().montant), 0) * 100) / 100;
      const totalTTC2 = safeNumber(p.totalTTC);
      toast(`✅ ${montant.toFixed(2)}€ encaissé (${paymentModes.find(m => m.id === quickMode)?.label}) pour ${p.familyName}${totalEncaisse2 >= totalTTC2 ? " — Tout réglé !" : ` — Reste : ${(totalTTC2 - totalEncaisse2).toFixed(2)}€`}`, "success");
      setQuickEncaisser(null);
      setQuickMontant(""); setQuickRef("");
      setQuickDate(new Date().toISOString().split("T")[0]);
      await refreshAll();
    } catch (e) { console.error(e); toast("Erreur encaissement", "error"); }
    setQuickSaving(false);
  };

  const family = families.find((f) => f.firestoreId === selectedFamily);
  const children = family?.children || [];

  // ═══ FONCTION CENTRALE D'ENCAISSEMENT ═══
  // Source unique de vérité : crée l'encaissement + recalcule paidAmount
  const enregistrerEncaissement = async (
    paymentId: string,
    paymentData: any,
    montant: number,
    mode: string,
    ref: string = "",
    activityTitle: string = "",
    customDate?: string, // format YYYY-MM-DD, si absent → serverTimestamp()
  ) => {
    // 1. Créer le doc encaissement (journal) — avec hash SHA-256 chaîné
    const explicitDate = customDate ? new Date(customDate + "T12:00:00") : undefined;
    await createEncaissement({
      paymentId,
      familyId: paymentData.familyId,
      familyName: paymentData.familyName,
      montant: Math.round(montant * 100) / 100,
      mode,
      modeLabel: paymentModes.find(m => m.id === mode)?.label || mode,
      ref,
      activityTitle: activityTitle || (paymentData.items || []).map((i: any) => i.activityTitle).join(", "),
      explicitDate,
      createdAt: serverTimestamp(), // heure réelle de l'encaissement (pour tri chronologique)
    });

    // 2. Recalculer paidAmount depuis TOUS les encaissements de ce payment
    // On relit APRÈS l'écriture — le snapshot contient forcément le doc qu'on vient de créer
    const encSnap = await getDocs(query(collection(db, "encaissements"), where("paymentId", "==", paymentId)));
    const totalEncaisse = Math.round(encSnap.docs.reduce((s, d) => s + safeNumber(d.data().montant), 0) * 100) / 100;
    const totalTTC = safeNumber(paymentData.totalTTC);
    const newStatus = totalEncaisse >= totalTTC ? "paid" : totalEncaisse > 0 ? "partial" : "pending";

    // 3. Déterminer le mode de paiement à afficher
    const allModes = encSnap.docs.map(d => d.data().mode).filter(Boolean);
    const uniqueModes = [...new Set(allModes)];
    const displayMode = uniqueModes.length === 1 ? uniqueModes[0] : uniqueModes.length > 1 ? "mixte" : mode;

    // 4. Mettre à jour le payment avec paidAmount calculé
    const updateData: any = {
      paidAmount: totalEncaisse,
      status: newStatus,
      paymentMode: displayMode,
      paymentModes: uniqueModes,
      updatedAt: serverTimestamp(),
    };

    // 4b. Attribuer un numéro de facture séquentiel quand le paiement est soldé
    //     via une transaction atomique côté serveur (évite doublons en cas de
    //     paiements simultanés — conformité CGI art. 242 nonies A)
    if (newStatus === "paid" && !paymentData.invoiceNumber) {
      try {
        const res = await authFetch("/api/invoice/next-number", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paymentId }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data?.invoiceNumber) {
            updateData.invoiceNumber = data.invoiceNumber;
          }
        } else {
          const errText = await res.text();
          console.error("Attribution numéro facture — API error:", res.status, errText);
          // Pas de fallback en local : on préfère un paiement sans numéro de
          // facture (facile à régulariser en admin) plutôt qu'un numéro hors
          // séquence qui casserait la continuité fiscale
        }
      } catch (e) {
        console.error("Attribution numéro facture — erreur réseau:", e);
      }
    }

    await updateDoc(doc(db, "payments", paymentId), updateData);

    // 5. Attribuer des points de fidélité (1 point par euro encaissé)
    // Ne pas attribuer sur les avoirs ni les remboursements
    if (montant > 0 && mode !== "avoir") {
      try {
        const settingsSnap = await getDoc(doc(db, "settings", "fidelite"));
        const fideliteEnabled = settingsSnap.exists() ? (settingsSnap.data()?.enabled !== false) : false;
        if (fideliteEnabled) {
          const pointsGagnes = Math.floor(montant);
          const expiry = new Date();
          expiry.setFullYear(expiry.getFullYear() + 1);
          const fidRef = doc(db, "fidelite", paymentData.familyId);
          const fidSnap = await getDoc(fidRef);
          if (fidSnap.exists()) {
            const current = fidSnap.data() || {};
            await updateDoc(fidRef, {
              points: ((current.points as number) || 0) + pointsGagnes,
              history: [...((current.history as any[]) || []), {
                date: new Date().toISOString(),
                points: pointsGagnes,
                type: "gain",
                label: activityTitle || "Encaissement",
                expiry: expiry.toISOString(),
                montant,
              }],
              updatedAt: serverTimestamp(),
            });
          } else {
            await setDoc(fidRef, {
              familyId: paymentData.familyId,
              familyName: paymentData.familyName,
              points: pointsGagnes,
              history: [{
                date: new Date().toISOString(),
                points: pointsGagnes,
                type: "gain",
                label: activityTitle || "Encaissement",
                expiry: expiry.toISOString(),
                montant,
              }],
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          }
        }
      } catch (e) { console.error("Erreur attribution points fidélité:", e); }
    }

    return { paidAmount: totalEncaisse, status: newStatus };
  };

  // Rafraîchir les données
  const refreshAll = async () => {
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

  const getTotalEncaisse = (payment: any) => {
    // Chercher dans la collection encaissements
    return encaissements
      .filter((e: any) => e.paymentId === payment.id)
      .reduce((s: number, e: any) => s + (e.montant || 0), 0);
  };

  /** Désinscrit un enfant des créneaux/réservations liés à un item de commande */
  const unenrollPaymentItem = async (payment: any, item: any) => {
    if (!item.childId) return;

    /** Helper : retire un enfant d'un créneau + met à jour enrolled + enrolledCount */
    const removeFromCreneau = async (creneauId: string, childId: string) => {
      try {
        const creneauRef = doc(db, "creneaux", creneauId);
        const cSnap = await getDoc(creneauRef);
        if (cSnap.exists()) {
          const enrolled = cSnap.data().enrolled || [];
          const newEnrolled = enrolled.filter((e: any) => e.childId !== childId);
          await updateDoc(creneauRef, { enrolled: newEnrolled, enrolledCount: newEnrolled.length });
        }
      } catch (e) { console.error("Erreur retrait créneau:", e); }
    };

    try {
      // Cas 1 : stage avec creneauIds array → désinscrire de TOUS les jours
      if (item.creneauIds && item.creneauIds.length > 0) {
        for (const cid of item.creneauIds) {
          await removeFromCreneau(cid, item.childId);
          // Supprimer les réservations liées à chaque jour
          try {
            const resSnap = await getDocs(query(collection(db, "reservations"), where("creneauId", "==", cid), where("childId", "==", item.childId)));
            for (const d of resSnap.docs) await deleteDoc(doc(db, "reservations", d.id));
          } catch (e) { console.error("Erreur suppression réservation:", e); }
        }
        return;
      }

      // Cas 2 : créneau unique lié directement par ID
      if (item.creneauId) {
        await removeFromCreneau(item.creneauId, item.childId);
        try {
          const resSnap = await getDocs(query(collection(db, "reservations"), where("creneauId", "==", item.creneauId), where("childId", "==", item.childId)));
          for (const d of resSnap.docs) await deleteDoc(doc(db, "reservations", d.id));
        } catch (e) { console.error("Erreur suppression réservation:", e); }
        return;
      }

      // Cas 3 : pas de creneauId → chercher les réservations par familyId + childId + matching texte
      const resSnap = await getDocs(query(collection(db, "reservations"), where("familyId", "==", payment.familyId), where("childId", "==", item.childId)));
      for (const d of resSnap.docs) {
        const r = d.data();
        const matchById = (item.activityId && r.activityId === item.activityId) ||
                          (item.stageKey && r.stageKey === item.stageKey);
        const matchByTitle = !matchById && item.activityTitle && r.activityTitle &&
                             r.activityTitle.includes(item.activityTitle.split(" (")[0].split(" — ")[0]);
        if (!matchById && !matchByTitle) continue;

        if (r.creneauId) await removeFromCreneau(r.creneauId, item.childId);
        await deleteDoc(doc(db, "reservations", d.id));
      }
    } catch (e) {
      console.error("Erreur désinscription:", e);
    }
  };

  const deletePaymentCommand = async (payment: any) => {
    const totalEnc = getTotalEncaisse(payment);
    const hasInscriptions = (payment.items || []).some((i: any) => i.childId && (i.creneauId || i.activityType));
    const isForfait = (payment as any).forfaitType || (payment.items || []).some((i: any) => i.activityTitle?.includes("Forfait"));
    const inscriptionMsg = hasInscriptions || isForfait ? "\n\n⚠️ Les cavaliers seront aussi désinscrits des créneaux associés." : "";

    if (totalEnc === 0) {
      // Si c'est une facture définitive (invoiceNumber), on ne peut pas supprimer → annuler avec avoir à 0
      if ((payment as any).invoiceNumber) {
        if (!confirm(`Annuler la facture ${(payment as any).invoiceNumber} de ${payment.familyName} ?\n\n${(payment.items || []).map((i: any) => `• ${i.childName || ""} — ${i.activityTitle}`).join("\n")}\n\nLa facture sera marquée annulée (non supprimée — obligation légale).${inscriptionMsg}`)) return;

        // Désinscrire
        if (isForfait) {
          const childIds = [...new Set((payment.items || []).filter((i: any) => i.childId).map((i: any) => i.childId))];
          for (const childId of childIds) {
            const childName = (payment.items || []).find((i: any) => i.childId === childId)?.childName || "";
            try { await authFetch("/api/admin/unenroll-annual", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ childId, childName, familyId: payment.familyId }) }); } catch (e) { console.error(e); }
          }
        } else {
          for (const item of payment.items || []) await unenrollPaymentItem(payment, item);
        }

        await updateDoc(doc(db, "payments", payment.id), {
          status: "cancelled", cancelledAt: serverTimestamp(),
          cancelReason: "Annulation facture (non encaissée)",
          originalTotalTTC: payment.totalTTC || 0,
          updatedAt: serverTimestamp(),
        });
        toast(`Facture ${(payment as any).invoiceNumber} annulée`, "success");
        await refreshAll();
        return;
      }

      if (!confirm(`Annuler l'inscription de ${payment.familyName} ?\n\n${(payment.items || []).map((i: any) => `• ${i.childName || ""} — ${i.activityTitle}`).join("\n")}\n\nTotal : ${(payment.totalTTC || 0).toFixed(2)}€ (non encaissé)${inscriptionMsg}`)) return;

      // Pour les forfaits annuels : désinscription en masse via API
      if (isForfait) {
        const childIds = [...new Set((payment.items || []).filter((i: any) => i.childId).map((i: any) => i.childId))];
        for (const childId of childIds) {
          const childName = (payment.items || []).find((i: any) => i.childId === childId)?.childName || "";
          try {
            await authFetch("/api/admin/unenroll-annual", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ childId, childName, familyId: payment.familyId }),
            });
          } catch (e) { console.error("Erreur désinscription annuelle:", e); }
        }
      } else {
        // Désinscrire avant suppression (ponctuel/stage)
        for (const item of payment.items || []) await unenrollPaymentItem(payment, item);
      }

      await deleteDoc(doc(db, "payments", payment.id));

      // Annuler les autres échéances liées si c'est un paiement échelonné
      if ((payment as any).echeancesTotal > 1) {
        try {
          const echeancesSnap = await getDocs(query(
            collection(db, "payments"),
            where("familyId", "==", payment.familyId),
            where("forfaitRef", "==", (payment as any).forfaitRef)
          ));
          for (const d of echeancesSnap.docs) {
            if (d.id !== payment.id && d.data().status !== "paid") {
              await deleteDoc(doc(db, "payments", d.id));
            }
          }
        } catch (e) { console.error("Erreur suppression échéances:", e); }
      }

      toast(`${payment.familyName} — inscription annulée et cavaliers désinscrits`, "success");
    } else {
      // Encaissé → avoir automatique
      if (!confirm(`Annuler l'inscription de ${payment.familyName} ?\n\n${(payment.items || []).map((i: any) => `• ${i.childName || ""} — ${i.activityTitle}`).join("\n")}\n\n💰 ${totalEnc.toFixed(2)}€ déjà encaissés → un avoir sera créé${inscriptionMsg}\n\nConfirmer ?`)) return;

      // Marquer cancelled d'abord pour éviter double-traitement
      await updateDoc(doc(db, "payments", payment.id), {
        status: "cancelled",
        cancelledAt: serverTimestamp(),
        cancelReason: "Annulation manuelle",
        originalTotalTTC: payment.totalTTC || 0,
        updatedAt: serverTimestamp(),
      });

      // Désinscrire chaque cavalier (erreurs silencieuses pour ne pas bloquer l'avoir)
      let unenrollErrors = 0;
      if (isForfait) {
        // Forfait annuel : désinscription en masse
        const childIds = [...new Set((payment.items || []).filter((i: any) => i.childId).map((i: any) => i.childId))];
        for (const childId of childIds) {
          const childName = (payment.items || []).find((i: any) => i.childId === childId)?.childName || "";
          try {
            await authFetch("/api/admin/unenroll-annual", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ childId, childName, familyId: payment.familyId }),
            });
          } catch (e) { console.error("Erreur désinscription annuelle:", e); unenrollErrors++; }
        }
      } else {
        for (const item of payment.items || []) {
          try { await unenrollPaymentItem(payment, item); }
          catch (e) { console.error("Erreur désinscription item:", item.activityTitle, e); unenrollErrors++; }
        }
      }

      const ref = `AV-${Date.now().toString(36).toUpperCase()}`;
      const expiry = new Date();
      expiry.setFullYear(expiry.getFullYear() + 1);

      const avoirAmount = Math.round(totalEnc * 100) / 100;
      const avoirReason = `Annulation commande — ${(payment.items || []).map((i: any) => i.activityTitle).join(", ").slice(0, 60)}`;

      await addDoc(collection(db, "avoirs"), {
        familyId: payment.familyId,
        familyName: payment.familyName,
        type: "avoir",
        amount: avoirAmount,
        usedAmount: 0,
        remainingAmount: avoirAmount,
        reason: avoirReason,
        reference: ref,
        sourcePaymentId: payment.id,
        sourceType: "annulation",
        expiryDate: expiry,
        status: "actif",
        usageHistory: [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // Trace dans le journal des encaissements (montant négatif = avoir)
      await createEncaissement({
        paymentId: payment.id,
        familyId: payment.familyId,
        familyName: payment.familyName,
        montant: -avoirAmount,
        mode: "avoir",
        modeLabel: "Avoir (annulation)",
        ref: ref,
        activityTitle: (payment.items || []).map((i: any) => i.activityTitle).join(", "),
        isAvoir: true,
        avoirRef: ref,
      });

      const warnMsg = unenrollErrors > 0 ? `\n⚠️ ${unenrollErrors} désinscription(s) à vérifier manuellement.` : "";
      toast(`Commande annulée. Avoir créé : ${totalEnc.toFixed(2)}€ (réf. ${ref})${warnMsg}`);
    }
    await refreshAll();
  };

  const removePaymentItem = async (payment: any, itemIndex: number) => {
    const totalEnc = getTotalEncaisse(payment);
    const items = payment.items || [];
    const itemToRemove = items[itemIndex];
    if (!itemToRemove) return;

    const newItems = items.filter((_: any, i: number) => i !== itemIndex);
    const newTotal = newItems.reduce((s: number, i: any) => s + (i.priceTTC || 0), 0);

    if (totalEnc === 0) {
      const hasInscription = itemToRemove.childId && (itemToRemove.creneauId || itemToRemove.activityType);
      if (!confirm(`Désinscrire${itemToRemove.childName ? ` ${itemToRemove.childName} de` : ""} "${itemToRemove.activityTitle}" (${(itemToRemove.priceTTC || 0).toFixed(2)}€) ?${hasInscription ? "\n\n⚠️ Le cavalier sera désinscrit du créneau." : ""}`)) return;

      // Désinscrire l'enfant du créneau
      await unenrollPaymentItem(payment, itemToRemove);

      if (newItems.length === 0) {
        await deleteDoc(doc(db, "payments", payment.id));
      } else {
        await updateDoc(doc(db, "payments", payment.id), {
          items: newItems,
          totalTTC: Math.round(newTotal * 100) / 100,
          updatedAt: serverTimestamp(),
        });
      }
    } else {
      // Encaissé → avoir du trop-perçu si nécessaire
      const tropPercu = totalEnc - newTotal;
      const hasInscription = itemToRemove.childId && (itemToRemove.creneauId || itemToRemove.activityType);
      const msg = tropPercu > 0
        ? `Retirer "${itemToRemove.activityTitle}" ?\n\n${tropPercu.toFixed(2)}€ de trop-perçu → un avoir sera créé.${hasInscription ? "\n\n⚠️ Le cavalier sera aussi désinscrit." : ""}`
        : `Retirer "${itemToRemove.activityTitle}" ?${hasInscription ? "\n\n⚠️ Le cavalier sera aussi désinscrit." : ""}`;
      if (!confirm(msg)) return;

      // Désinscrire l'enfant du créneau
      await unenrollPaymentItem(payment, itemToRemove);

      if (tropPercu > 0) {
        const ref = `AV-${Date.now().toString(36).toUpperCase()}`;
        const expiry = new Date();
        expiry.setFullYear(expiry.getFullYear() + 1);
        const tropPercuAmount = Math.round(tropPercu * 100) / 100;

        await addDoc(collection(db, "avoirs"), {
          familyId: payment.familyId,
          familyName: payment.familyName,
          type: "avoir",
          amount: tropPercuAmount,
          usedAmount: 0,
          remainingAmount: tropPercuAmount,
          reason: `Retrait prestation — ${itemToRemove.activityTitle}`,
          reference: ref,
          sourcePaymentId: payment.id,
          sourceType: "retrait_prestation",
          expiryDate: expiry,
          status: "actif",
          usageHistory: [],
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        // Trace dans le journal des encaissements (montant négatif = avoir)
        await createEncaissement({
          paymentId: payment.id,
          familyId: payment.familyId,
          familyName: payment.familyName,
          montant: -tropPercuAmount,
          mode: "avoir",
          modeLabel: "Avoir (trop-perçu)",
          ref: ref,
          activityTitle: itemToRemove.activityTitle,
          isAvoir: true,
          avoirRef: ref,
        });
      }

      if (newItems.length === 0) {
        await updateDoc(doc(db, "payments", payment.id), {
          status: "cancelled", cancelledAt: serverTimestamp(),
          cancelReason: "Dernière prestation retirée",
          originalTotalTTC: payment.originalTotalTTC || payment.totalTTC || 0,
          updatedAt: serverTimestamp(),
        });
      } else {
        const newPaid = Math.min(totalEnc, newTotal);
        await updateDoc(doc(db, "payments", payment.id), {
          items: newItems,
          totalTTC: Math.round(newTotal * 100) / 100,
          paidAmount: Math.round(newPaid * 100) / 100,
          status: newPaid >= newTotal ? "paid" : newPaid > 0 ? "partial" : "pending",
          updatedAt: serverTimestamp(),
        });
      }
    }
    await refreshAll();
  };

  const [duplicateTarget, setDuplicateTarget] = useState<{ payment: any; targetFamilyId: string; targetSearch: string; mode: "choose" | "other_family" } | null>(null);

  // ─── Broadcast concours : state ───
  interface BroadcastRow { familyId: string; familyName: string; childId: string; childName: string; items: any[]; totalTTC: number; overrides: Record<number, number>; }
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
  const enrollChildInForfait = async (payment: any, targetFamilyId: string): Promise<number> => {
    const targetFamily = families.find(f => f.firestoreId === targetFamilyId);
    if (!targetFamily) return 0;
    const targetChild = (targetFamily.children || [])[0];
    if (!targetChild) return 0;

    const today = `${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,"0")}-${String(new Date().getDate()).padStart(2,"0")}`;
    let inscriptions = 0;

    // Items de type forfait/cours
    const forfaitItems = (payment.items || []).filter((i: any) =>
      i.activityType === "cours" || i.activityTitle?.includes("Forfait")
    );

    for (const item of forfaitItems) {
      try {
        let refDate = "", refStartTime = "", refTitle = "", refMonitor = "";

        if (item.creneauId) {
          const refSnap = await getDoc(doc(db, "creneaux", item.creneauId));
          if (!refSnap.exists()) continue;
          const r = refSnap.data() as any;
          refDate = r.date; refStartTime = r.startTime; refTitle = r.activityTitle; refMonitor = r.monitor || "";
        } else {
          // Extraire depuis le libellé : "Forfait Titre (Titre — Mer 17:00)"
          // On extrait le titre ET l'horaire directement depuis le libellé
          const matchFull = item.activityTitle?.match(/\((.+?) — \w+ (\d{2}:\d{2})\)/);
          const matchTitle = item.activityTitle?.match(/\((.+?) —/);
          if (!matchTitle) continue;
          refTitle = matchTitle[1].trim();
          // Extraire l'horaire depuis le libellé si disponible (ex: "Mer 17:00" → "17:00")
          const libelleStartTime = matchFull ? matchFull[2] : null;

          // Chercher un créneau existant avec ce titre pour avoir le jour/moniteur
          const sSnap = await getDocs(query(
            collection(db, "creneaux"),
            where("activityTitle", "==", refTitle),
            where("date", ">=", today)
          ));
          if (sSnap.empty) continue;

          // Si on a l'horaire depuis le libellé, chercher un créneau qui correspond
          let refDoc = sSnap.docs[0].data() as any;
          if (libelleStartTime) {
            const matching = sSnap.docs.find(d => d.data().startTime === libelleStartTime);
            if (matching) refDoc = matching.data();
          }
          refDate = refDoc.date;
          refStartTime = libelleStartTime || refDoc.startTime;
          refMonitor = refDoc.monitor || "";
        }

        const dow = new Date(refDate + "T12:00:00").getDay();

        const futureSnap = await getDocs(query(
          collection(db, "creneaux"),
          where("activityTitle", "==", refTitle),
          where("date", ">=", today)
        ));

        const slots = futureSnap.docs
          .map(d => ({ id: d.id, ...d.data() } as any))
          .filter(c =>
            new Date(c.date + "T12:00:00").getDay() === dow &&
            c.startTime === refStartTime
          );

        for (const slot of slots) {
          const enrolled: any[] = slot.enrolled || [];
          if (enrolled.some((e: any) => e.childId === targetChild.id)) continue;
          await updateDoc(doc(db, "creneaux", slot.id), {
            enrolled: [...enrolled, {
              childId: targetChild.id,
              childName: targetChild.firstName || "",
              familyId: targetFamily.firestoreId,
              familyName: targetFamily.parentName || "",
              enrolledAt: new Date().toISOString(),
            }],
            enrolledCount: enrolled.length + 1,
          });
          inscriptions++;
        }
      } catch (e) { console.error("Erreur inscription forfait:", e); }
    }
    return inscriptions;
  };

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
    let ok = 0; let err = 0;
    for (const row of broadcastRows) {
      try {
        // Recalculer les items avec les overrides de prix
        const items = row.items.map((item: any, idx: number) => {
          const overrideTTC = row.overrides[idx];
          if (overrideTTC !== undefined) {
            const tva = safeNumber(item.tva || item.tvaTaux || 5.5);
            return { ...item, priceTTC: overrideTTC, priceHT: round2(overrideTTC / (1 + tva / 100)) };
          }
          return item;
        });
        const totalTTC = round2(items.reduce((s: number, i: any) => s + safeNumber(i.priceTTC), 0));
        await addDoc(collection(db, "payments"), {
          orderId: generateOrderId(),
          familyId: row.familyId,
          familyName: row.familyName,
          items,
          totalTTC,
          status: "pending",
          paidAmount: 0,
          paymentMode: "",
          paymentRef: "",
          source: "broadcast",
          sourcePaymentId: broadcastSource?.id || "",
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        ok++;
      } catch (e) { console.error("Erreur broadcast famille", row.familyName, e); err++; }
    }
    setBroadcastSending(false);
    setBroadcastSource(null);
    setBroadcastRows([]);
    setBroadcastSearch("");
    await refreshAll();
    toast(`${ok} commande${ok > 1 ? "s" : ""} créée${ok > 1 ? "s" : ""} dans Impayés${err > 0 ? ` — ${err} erreur(s)` : ""}.`);
  };

  // Toggle une famille dans la sélection broadcast
  const toggleBroadcastFamily = (family: Family & { firestoreId: string }) => {
    const already = broadcastRows.find(r => r.familyId === family.firestoreId);
    if (already) {
      setBroadcastRows(broadcastRows.filter(r => r.familyId !== family.firestoreId));
      return;
    }
    if (!broadcastSource) return;
    const children = family.children || [];
    // Mapper les items du source sur les enfants de la famille cible
    const items = (broadcastSource.items || []).map((item: any, idx: number) => {
      const child = children[idx] || children[0];
      return {
        ...item,
        childId: child?.id || "",
        childName: child?.firstName || "",
        creneauId: "",
        reservationId: "",
      };
    });
    const totalTTC = round2(items.reduce((s: number, i: any) => s + safeNumber(i.priceTTC), 0));
    setBroadcastRows([...broadcastRows, { familyId: family.firestoreId, familyName: family.parentName || "", childId: children[0]?.id || "", childName: children[0]?.firstName || "", items, totalTTC, overrides: {} }]);
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
          <HelpButton tourId="paiements-encaisser" manualLink="/admin/manuel#paiements" />
        </div>
        <button onClick={() => fetchData(true)} disabled={refreshing}
          className="flex items-center gap-1.5 font-body text-xs text-slate-600 bg-white border border-gray-200 px-3 py-2 rounded-lg cursor-pointer hover:bg-gray-50 disabled:opacity-50 transition-colors">
          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={refreshing ? "animate-spin" : ""}><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>
          {refreshing ? "Actualisation..." : "Actualiser"}
        </button>
      </div>

      <div className="flex gap-1.5 mb-6 overflow-x-auto pb-1 -mx-1 px-1 hide-scrollbar">
        {([["encaisser", "Encaisser", ShoppingCart], ["journal", "Journal", Receipt], ["historique", "Historique", Receipt], ["echeances", "Échéances", Receipt], ["impayes", "Impayés", Receipt], ["cheques_differes", "Chèques différés", Calendar], ["offerts", "Offerts", Gift], ["declarations", "Déclarations", Receipt]] as const).map(([id, label, Icon]) => (
          <button key={id} onClick={() => setTab(id as any)}
            className={`flex items-center gap-1.5 px-3 sm:px-5 py-2 sm:py-2.5 rounded-lg border font-body text-xs sm:text-sm font-medium cursor-pointer transition-all whitespace-nowrap flex-shrink-0
              ${tab === id ? "bg-blue-500 text-white border-blue-500" : "bg-white text-slate-600 border-gray-200"}`}>
            <Icon size={14} /> {label}
            {id === "impayes" && (() => {
              const todayBadge = new Date().toISOString().split("T")[0];
              const count = payments.filter(p => {
                if (p.status === "cancelled" || p.status === "paid" || p.status === "sepa_scheduled") return false;
                if ((p.paidAmount || 0) >= (p.totalTTC || 0)) return false;
                if ((p as any).echeancesTotal > 1) return (p as any).echeanceDate && (p as any).echeanceDate < todayBadge;
                return true;
              }).length;
              return count > 0 ? <span className="bg-red-500 text-white text-[10px] w-5 h-5 rounded-full flex items-center justify-center">{count}</span> : null;
            })()}
            {id === "cheques_differes" && chequesDiffresCount.overdue > 0 && (
              <span className="bg-red-500 text-white text-[10px] w-5 h-5 rounded-full flex items-center justify-center" title={`${chequesDiffresCount.overdue} chèque(s) en retard`}>
                {chequesDiffresCount.overdue}
              </span>
            )}
            {id === "declarations" && declarations.length > 0 && (
              <span className="bg-orange-500 text-white text-[10px] w-5 h-5 rounded-full flex items-center justify-center">{declarations.length}</span>
            )}
          </button>
        ))}
      </div>

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
          toast={toast} setPayments={setPayments}
        />
      )}

      {/* ─── Modale duplication 3 modes ─── */}
      {duplicateTarget && (() => {
        const p = duplicateTarget.payment;
        const mode = duplicateTarget.mode;
        const searchLower = duplicateTarget.targetSearch.toLowerCase();
        const filteredFams = families.filter(f =>
          f.firestoreId !== p.familyId &&
          (f.parentName?.toLowerCase().includes(searchLower) ||
          (f.children || []).some((c: any) =>
            `${c.firstName || ""} ${c.lastName || ""}`.toLowerCase().includes(searchLower) ||
            `${c.lastName || ""} ${c.firstName || ""}`.toLowerCase().includes(searchLower)
          ))
        ).slice(0, 8);

        return (
          <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setDuplicateTarget(null)}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>

              {/* En-tête */}
              <div className="p-5 border-b border-gray-100">
                <h2 className="font-display text-lg font-bold text-blue-800">Utiliser cette commande</h2>
                <div className="mt-2 p-3 bg-sand rounded-lg">
                  <div className="font-body text-sm font-semibold text-blue-800">{p.familyName}</div>
                  <div className="font-body text-xs text-slate-600 mt-0.5">{(p.items || []).map((i: any) => i.activityTitle).join(" · ")}</div>
                  <div className="font-body text-sm font-bold text-blue-500 mt-1">{safeNumber(p.totalTTC).toFixed(2)}€</div>
                </div>
              </div>

              {/* Choix du mode */}
              {mode === "choose" && (
                <div className="p-5 flex flex-col gap-3">
                  {/* Mode 1 : pré-remplir le panier */}
                  <button onClick={() => duplicateToBasket(p)}
                    className="w-full flex items-center gap-4 px-4 py-4 rounded-xl border-2 border-blue-200 bg-blue-50 cursor-pointer hover:bg-blue-100 hover:border-blue-400 text-left transition-all">
                    <div className="w-10 h-10 rounded-lg bg-blue-500 flex items-center justify-center flex-shrink-0">
                      <ShoppingCart size={18} className="text-white" />
                    </div>
                    <div>
                      <div className="font-body text-sm font-bold text-blue-800">Pré-remplir le panier</div>
                      <div className="font-body text-xs text-slate-600 mt-0.5">Même famille · les prestations sont chargées dans le panier, vous choisissez les créneaux puis encaissez</div>
                    </div>
                  </button>
                  {/* Mode 2 : commande à encaisser pour autre famille */}
                  <button onClick={() => setDuplicateTarget({ ...duplicateTarget, mode: "other_family" })}
                    className="w-full flex items-center gap-4 px-4 py-4 rounded-xl border-2 border-purple-200 bg-purple-50 cursor-pointer hover:bg-purple-100 hover:border-purple-400 text-left transition-all">
                    <div className="w-10 h-10 rounded-lg bg-purple-500 flex items-center justify-center flex-shrink-0">
                      <Plus size={18} className="text-white" />
                    </div>
                    <div>
                      <div className="font-body text-sm font-bold text-purple-800">Commande pour une autre famille</div>
                      <div className="font-body text-xs text-slate-600 mt-0.5">Crée une commande en attente pour une famille différente · apparaît dans Impayés</div>
                    </div>
                  </button>
                  {/* Mode 3 : diffusion concours */}
                  <button onClick={() => { setBroadcastSource(duplicateTarget.payment); setDuplicateTarget(null); setBroadcastRows([]); setBroadcastSearch(""); }}
                    className="w-full flex items-center gap-4 px-4 py-4 rounded-xl border-2 border-orange-200 bg-orange-50 cursor-pointer hover:bg-orange-100 hover:border-orange-400 text-left transition-all">
                    <div className="w-10 h-10 rounded-lg bg-orange-500 flex items-center justify-center flex-shrink-0">
                      <Copy size={18} className="text-white" />
                    </div>
                    <div>
                      <div className="font-body text-sm font-bold text-orange-800">Diffusion concours / coaching</div>
                      <div className="font-body text-xs text-slate-600 mt-0.5">Cochez plusieurs familles · ajustez les montants · créez toutes les commandes d'un coup</div>
                    </div>
                  </button>
                </div>
              )}
              {/* Mode 2 : sélection autre famille + mapping enfants */}
              {mode === "other_family" && (() => {
                const targetFam = duplicateTarget.targetFamilyId
                  ? families.find(f => f.firestoreId === duplicateTarget.targetFamilyId)
                  : null;
                const targetChildren = targetFam?.children || [];
                const sourceItems = p.items || [];

                // Phase A : chercher la famille
                if (!targetFam) return (
                  <div className="p-5 flex flex-col gap-3">
                    <button onClick={() => setDuplicateTarget({ ...duplicateTarget, mode: "choose" })}
                      className="flex items-center gap-1 font-body text-xs text-slate-600 hover:text-gray-600 bg-transparent border-none cursor-pointer p-0 mb-1">
                      ← Retour
                    </button>
                    <p className="font-body text-sm text-gray-600">Chercher la famille destinataire :</p>
                    <div className="relative">
                      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input autoFocus value={duplicateTarget.targetSearch}
                        onChange={e => setDuplicateTarget({ ...duplicateTarget, targetSearch: e.target.value })}
                        placeholder="Nom de famille ou prénom enfant..."
                        className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-gray-200 font-body text-sm bg-white focus:border-blue-500 focus:outline-none" />
                    </div>
                    {duplicateTarget.targetSearch.length > 0 && (
                      <div className="flex flex-col gap-1 max-h-[260px] overflow-y-auto">
                        {filteredFams.length === 0 ? (
                          <p className="font-body text-xs text-slate-600 text-center py-3">Aucune famille trouvée</p>
                        ) : filteredFams.map(f => (
                          <button key={f.firestoreId}
                            onClick={() => setDuplicateTarget({ ...duplicateTarget, targetFamilyId: f.firestoreId, targetSearch: "" })}
                            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border border-gray-200 bg-white cursor-pointer hover:bg-purple-50 hover:border-purple-200 text-left transition-all">
                            <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center font-body text-xs font-bold text-purple-600 flex-shrink-0">
                              {(f.parentName || "?")[0]}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="font-body text-sm font-semibold text-blue-800">{f.parentName}</div>
                              <div className="font-body text-xs text-slate-600 truncate">{(f.children || []).map((c: any) => c.firstName).join(", ") || "Aucun enfant enregistré"}</div>
                            </div>
                            <div className="font-body text-xs text-purple-500 flex-shrink-0">Choisir →</div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );

                // Phase B : mapper les enfants
                return (
                  <div className="p-5 flex flex-col gap-4 overflow-y-auto">
                    <button onClick={() => setDuplicateTarget({ ...duplicateTarget, targetFamilyId: "", targetSearch: "" })}
                      className="flex items-center gap-1 font-body text-xs text-slate-600 hover:text-gray-600 bg-transparent border-none cursor-pointer p-0">
                      ← Changer de famille
                    </button>
                    <div className="p-3 bg-purple-50 rounded-lg border border-purple-200">
                      <div className="font-body text-sm font-bold text-purple-800">{targetFam.parentName}</div>
                      <div className="font-body text-xs text-slate-600 mt-0.5">{targetChildren.map((c: any) => c.firstName).join(", ") || "Aucun enfant"}</div>
                    </div>
                    <p className="font-body text-xs text-slate-600">Pour chaque prestation, indiquer quel cavalier de la famille cible :</p>
                    <div className="flex flex-col gap-3">
                      {sourceItems.map((item: any, idx: number) => (
                        <div key={idx} className="flex items-center gap-3 p-3 rounded-lg bg-sand">
                          <div className="flex-1 min-w-0">
                            <div className="font-body text-xs font-semibold text-blue-800 truncate">{item.activityTitle}</div>
                            <div className="font-body text-[10px] text-slate-600">Original : {item.childName || "—"} · {(item.priceTTC || 0).toFixed(2)}€</div>
                          </div>
                          <select
                            defaultValue={targetChildren[idx]?.id || targetChildren[0]?.id || ""}
                            id={`child-map-${idx}`}
                            className="border border-purple-200 rounded-lg px-2 py-1.5 font-body text-xs bg-white focus:border-purple-500 focus:outline-none flex-shrink-0">
                            {targetChildren.length === 0
                              ? <option value="">Aucun enfant</option>
                              : targetChildren.map((c: any) => (
                                <option key={c.id} value={c.id}>{c.firstName}</option>
                              ))
                            }
                          </select>
                        </div>
                      ))}
                    </div>
                    <button onClick={async () => {
                      // Lire le mapping depuis les selects
                      const mappedItems = sourceItems.map((item: any, idx: number) => {
                        const sel = document.getElementById(`child-map-${idx}`) as HTMLSelectElement;
                        const childId = sel?.value || "";
                        const child = targetChildren.find((c: any) => c.id === childId);
                        return {
                          ...item,
                          childId,
                          childName: child?.firstName || "",
                          creneauId: "",
                          reservationId: "",
                        };
                      });
                      const totalTTC = round2(mappedItems.reduce((s: number, i: any) => s + safeNumber(i.priceTTC), 0));
                      await addDoc(collection(db, "payments"), {
                        orderId: generateOrderId(),
                        familyId: targetFam.firestoreId,
                        familyName: targetFam.parentName || "",
                        items: mappedItems,
                        totalTTC,
                        status: "pending",
                        paidAmount: 0,
                        paymentMode: "",
                        paymentRef: "",
                        source: "duplicate",
                        sourcePaymentId: p.id,
                        createdAt: serverTimestamp(),
                        updatedAt: serverTimestamp(),
                      });
                      setDuplicateTarget(null);
                      await refreshAll();
                      toast(`Commande créée pour ${targetFam.parentName} — ${totalTTC.toFixed(2)}€ dans Impayés.`);
                    }}
                      className="w-full py-3 rounded-xl font-body text-sm font-bold text-white bg-purple-500 border-none cursor-pointer hover:bg-purple-600 transition-all">
                      Créer la commande — {round2(sourceItems.reduce((s: number, i: any) => s + safeNumber(i.priceTTC), 0)).toFixed(2)}€
                    </button>
                  </div>
                );
              })()}

              {/* Footer */}
              <div className="p-5 border-t border-gray-100">
                <button onClick={() => setDuplicateTarget(null)}
                  className="w-full py-2.5 rounded-lg font-body text-sm text-slate-600 bg-gray-100 border-none cursor-pointer hover:bg-gray-200">Annuler</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ─── Modale Broadcast Concours ─── */}
      {broadcastSource && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>

            {/* Header */}
            <div className="p-5 border-b border-gray-100 flex-shrink-0">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-display text-lg font-bold text-orange-700">Diffusion concours / coaching</h2>
                  <p className="font-body text-xs text-slate-600 mt-0.5">Basé sur : <span className="font-semibold">{(broadcastSource.items || []).map((i: any) => i.activityTitle).join(" · ")}</span></p>
                </div>
                <button onClick={() => setBroadcastSource(null)} className="text-slate-600 hover:text-gray-600 bg-transparent border-none cursor-pointer"><X size={20} /></button>
              </div>
              {/* Barre de recherche */}
              <div className="relative mt-3">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input autoFocus value={broadcastSearch} onChange={e => setBroadcastSearch(e.target.value)}
                  placeholder="Filtrer les familles par nom ou prénom cavalier..."
                  className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-gray-200 font-body text-sm bg-white focus:border-orange-400 focus:outline-none" />
              </div>
            </div>

            {/* Liste familles cochables */}
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2">
              {families
                .filter(f => {
                  if (!broadcastSearch) return true;
                  const q = broadcastSearch.toLowerCase();
                  return f.parentName?.toLowerCase().includes(q) ||
                    (f.children || []).some((c: any) =>
                      `${c.firstName || ""} ${c.lastName || ""}`.toLowerCase().includes(q) ||
                      `${c.lastName || ""} ${c.firstName || ""}`.toLowerCase().includes(q)
                    );
                })
                .map(f => {
                  const row = broadcastRows.find(r => r.familyId === f.firestoreId);
                  const checked = !!row;
                  return (
                    <div key={f.firestoreId}
                      className={`rounded-xl border-2 transition-all ${checked ? "border-orange-400 bg-orange-50" : "border-gray-200 bg-white hover:border-gray-300"}`}>
                      {/* Ligne principale — clic pour cocher */}
                      <div className="flex items-center gap-3 px-4 py-3 cursor-pointer" onClick={() => toggleBroadcastFamily(f)}>
                        <div className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 transition-all ${checked ? "bg-orange-500" : "bg-gray-200"}`}>
                          {checked && <Check size={12} className="text-white" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-body text-sm font-semibold text-blue-800">{f.parentName}</div>
                          <div className="font-body text-xs text-slate-600">{(f.children || []).map((c: any) => c.firstName).join(", ") || "Aucun cavalier"}</div>
                        </div>
                        {checked && (
                          <div className="font-body text-sm font-bold text-orange-600 flex-shrink-0">
                            {row!.totalTTC.toFixed(2)}€
                          </div>
                        )}
                      </div>
                      {/* Détail ajustable si coché */}
                      {checked && (
                        <div className="px-4 pb-3 pt-0 border-t border-orange-200 mt-0">
                          {row!.items.map((item: any, idx: number) => {
                            const currentPrice = row!.overrides[idx] !== undefined ? row!.overrides[idx] : safeNumber(item.priceTTC);
                            return (
                              <div key={idx} className="flex items-center gap-3 mt-2">
                                <span className="font-body text-xs text-gray-600 flex-1 truncate">
                                  {item.childName ? <span className="text-blue-500 font-semibold">{item.childName}</span> : null}
                                  {item.childName ? " — " : ""}{item.activityTitle}
                                </span>
                                <div className="flex items-center gap-1 flex-shrink-0">
                                  <input
                                    type="number" step="0.01" min="0"
                                    value={currentPrice}
                                    onChange={e => {
                                      const val = safeNumber(e.target.value);
                                      setBroadcastRows(prev => prev.map(r => {
                                        if (r.familyId !== f.firestoreId) return r;
                                        const newOverrides = { ...r.overrides, [idx]: val };
                                        const newTotal = round2(r.items.reduce((s: number, it: any, i: number) =>
                                          s + (newOverrides[i] !== undefined ? newOverrides[i] : safeNumber(it.priceTTC)), 0));
                                        return { ...r, overrides: newOverrides, totalTTC: newTotal };
                                      }));
                                    }}
                                    className="w-20 text-right border border-orange-300 rounded px-2 py-1 font-body text-sm font-bold text-orange-700 bg-white focus:outline-none focus:border-orange-500"
                                  />
                                  <span className="font-body text-xs text-slate-600">€</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>

            {/* Footer */}
            <div className="p-5 border-t border-gray-100 flex-shrink-0">
              <div className="flex items-center justify-between gap-4">
                <div>
                  {broadcastRows.length > 0 ? (
                    <div>
                      <span className="font-body text-sm font-bold text-orange-700">{broadcastRows.length} famille{broadcastRows.length > 1 ? "s" : ""} sélectionnée{broadcastRows.length > 1 ? "s" : ""}</span>
                      <span className="font-body text-xs text-slate-600 ml-2">· {broadcastRows.reduce((s, r) => s + r.totalTTC, 0).toFixed(2)}€ total à encaisser</span>
                    </div>
                  ) : (
                    <span className="font-body text-xs text-slate-600">Cochez les familles concernées</span>
                  )}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setBroadcastSource(null)}
                    className="font-body text-sm text-slate-600 bg-gray-100 px-4 py-2.5 rounded-lg border-none cursor-pointer hover:bg-gray-200">
                    Annuler
                  </button>
                  <button onClick={broadcastToFamilies}
                    disabled={broadcastRows.length === 0 || broadcastSending}
                    className={`font-body text-sm font-bold text-white px-5 py-2.5 rounded-lg border-none cursor-pointer transition-all flex items-center gap-2 ${broadcastRows.length === 0 || broadcastSending ? "bg-gray-300 cursor-not-allowed" : "bg-orange-500 hover:bg-orange-600"}`}>
                    {broadcastSending ? <><Loader2 size={14} className="animate-spin" /> Envoi...</> : <>Créer {broadcastRows.length > 0 ? broadcastRows.length : ""} commande{broadcastRows.length > 1 ? "s" : ""}</>}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Onglet Déclarations ─── */}

      {/* ── Modal édition commande ── */}
      {/* ── Modal encaissement rapide ── */}
      {quickEncaisser && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setQuickEncaisser(null)}>
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl flex flex-col max-h-[92vh]" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
              <div>
                <h2 className="font-display text-lg font-bold text-blue-800">Encaisser</h2>
                <p className="font-body text-xs text-slate-500 mt-0.5">{quickEncaisser.payment.familyName}</p>
              </div>
              <button onClick={() => setQuickEncaisser(null)} className="text-slate-400 bg-transparent border-none cursor-pointer"><X size={20}/></button>
            </div>
            <div className="p-5 flex flex-col gap-4 overflow-y-auto flex-1 min-h-0">
              {/* Montant */}
              <div>
                <label className="font-body text-xs font-semibold text-blue-800 block mb-1">Montant (€)</label>
                <input type="number" min="0" step="0.01" value={quickMontant}
                  onChange={e => setQuickMontant(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-blue-500/8 font-body text-sm bg-cream focus:border-blue-500 focus:outline-none text-right text-lg font-semibold"/>
                <p className="font-body text-[10px] text-slate-400 mt-1">Dû : {((quickEncaisser.payment.totalTTC||0)-(quickEncaisser.payment.paidAmount||0)).toFixed(2)}€</p>
              </div>
              {/* Mode */}
              <div>
                <label className="font-body text-xs font-semibold text-blue-800 block mb-1">Mode de paiement</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: "cheque", label: "Chèque", icon: "📝" },
                    { id: "especes", label: "Espèces", icon: "💵" },
                    { id: "virement", label: "Virement", icon: "🏦" },
                    { id: "cb_terminal", label: "CB", icon: "💳" },
                    { id: "prelevement_sepa", label: "SEPA", icon: "🏦" },
                  ].map(m => {
                    const isSepa = m.id === "prelevement_sepa";
                    const sepaBlocked = isSepa && quickMandatActif === false;
                    return (
                      <button key={m.id}
                        onClick={() => !sepaBlocked && setQuickMode(m.id)}
                        disabled={sepaBlocked}
                        title={sepaBlocked ? "Aucun mandat SEPA actif pour cette famille" : undefined}
                        className={`py-2.5 rounded-xl font-body text-sm font-semibold border transition-all
                          ${sepaBlocked ? "bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed opacity-60" :
                            quickMode === m.id ? "bg-blue-500 text-white border-blue-500 cursor-pointer" :
                            "bg-white text-slate-600 border-gray-200 hover:border-blue-300 cursor-pointer"}`}>
                        {m.icon} {m.label}
                        {sepaBlocked && <span className="block text-[9px] text-red-400 mt-0.5">Pas de mandat</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
              {/* Échéancier SEPA */}
              {quickMandatActif === false && quickMode === "prelevement_sepa" && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">
                  <span className="text-red-500 text-base">⚠️</span>
                  <div>
                    <p className="font-body text-xs font-semibold text-red-600">Aucun mandat SEPA actif pour cette famille</p>
                    <p className="font-body text-[10px] text-red-400 mt-0.5">Créez un mandat dans <strong>Prélèvements SEPA</strong> avant d'utiliser ce mode.</p>
                  </div>
                </div>
              )}
              {quickMandatActif === null && quickMode === "prelevement_sepa" && (
                <div className="font-body text-xs text-slate-400 flex items-center gap-2">
                  <span className="animate-spin inline-block">⏳</span> Vérification du mandat...
                </div>
              )}
              {quickMode === "prelevement_sepa" && (
                <div className="bg-blue-50 rounded-xl p-4 flex flex-col gap-3">
                  <div className="font-body text-xs font-semibold text-blue-800">Échéancier SEPA</div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="font-body text-[10px] text-gray-400 block mb-1">Nb échéances</label>
                      <select value={quickRef || "10"} onChange={e => setQuickRef(e.target.value)}
                        className="w-full px-2 py-2 rounded-lg border border-gray-200 font-body text-sm bg-white">
                        {[1,2,3,4,5,6,7,8,9,10,11,12].map(n => <option key={n} value={n}>{n}×</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="font-body text-[10px] text-gray-400 block mb-1">1ère échéance</label>
                      <input type="date" value={quickDate} onChange={e => setQuickDate(e.target.value)}
                        className="w-full px-2 py-2 rounded-lg border border-gray-200 font-body text-sm"/>
                    </div>
                  </div>
                  {quickMontant && (
                    <div className="font-body text-xs text-blue-600">
                      💡 {quickRef || "10"} × {(parseFloat(quickMontant) / parseInt(quickRef || "10")).toFixed(2)}€ = {parseFloat(quickMontant).toFixed(2)}€
                    </div>
                  )}
                  <div className="font-body text-[10px] text-gray-400">
                    Un mandat SEPA doit exister pour cette famille. Les échéances seront créées dans le module Prélèvements SEPA.
                  </div>
                </div>
              )}
              {/* Date */}
              <div>
                <label className="font-body text-xs font-semibold text-blue-800 block mb-1">Date d'encaissement</label>
                <input type="date" value={quickDate} onChange={e => setQuickDate(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-blue-500/8 font-body text-sm bg-cream focus:border-blue-500 focus:outline-none"/>
                <p className="font-body text-[10px] text-slate-400 mt-1">Modifiable si encaissement différé</p>
              </div>
              {/* Référence */}
              <div>
                <label className="font-body text-xs font-semibold text-blue-800 block mb-1">Référence (optionnel)</label>
                <input value={quickRef} onChange={e => setQuickRef(e.target.value)}
                  placeholder="N° chèque, virement..."
                  className="w-full px-3 py-2.5 rounded-xl border border-blue-500/8 font-body text-sm bg-cream focus:border-blue-500 focus:outline-none"/>
              </div>
              <div className="flex gap-3 pt-1">
                <button onClick={() => setQuickEncaisser(null)} className="px-5 py-3 rounded-xl font-body text-sm text-slate-500 bg-gray-100 border-none cursor-pointer">Annuler</button>
                <button onClick={handleQuickEncaisser} disabled={quickSaving || !quickMontant || (quickMode === "prelevement_sepa" && quickMandatActif !== true)}
                  className="flex-1 py-3 rounded-xl font-body text-sm font-semibold text-white bg-green-600 hover:bg-green-700 border-none cursor-pointer disabled:opacity-50">
                  {quickSaving ? <Loader2 size={16} className="animate-spin inline mr-2"/> : "💶 "}
                  Confirmer {quickMontant ? `${parseFloat(quickMontant).toFixed(2)}€` : ""}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {editPayment && (() => {
        const isInvoiced = !!editPayment.invoiceNumber;
        const newTotalLive = Math.round(editItems.reduce((s, i) => s + (i.priceTTC || 0), 0) * 100) / 100;
        const paidAmount = editPayment.paidAmount || 0;
        const tropPercu = Math.round((paidAmount - newTotalLive) * 100) / 100;
        return (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4"
          onClick={() => !editSaving && setEditPayment(null)}>
          <div className="bg-white rounded-2xl w-full sm:max-w-lg max-h-[85vh] overflow-auto shadow-2xl" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h2 className="font-display text-lg font-bold text-blue-800">Modifier la commande</h2>
                <p className="font-body text-xs text-slate-500">{editPayment.familyName}</p>
              </div>
              <button onClick={() => setEditPayment(null)} className="text-slate-400 bg-transparent border-none cursor-pointer"><X size={20}/></button>
            </div>

            {/* Bandeau de blocage si facture définitive émise */}
            {isInvoiced && (
              <div className="mx-5 mt-5 p-4 rounded-xl bg-red-50 border border-red-200">
                <div className="font-body text-sm font-semibold text-red-700 mb-1">
                  🔒 Modification impossible — facture {editPayment.invoiceNumber} émise
                </div>
                <div className="font-body text-xs text-red-600 leading-relaxed">
                  Cette commande a déjà fait l'objet d'une facture définitive numérotée.
                  Pour des raisons de conformité comptable (article L123-14 du Code de commerce),
                  une facture émise ne peut pas être modifiée.
                  <br /><br />
                  Pour corriger le montant, vous devez : <strong>annuler la facture via un avoir</strong>,
                  puis créer une nouvelle commande avec le bon montant.
                </div>
              </div>
            )}

            {/* Alerte trop-perçu */}
            {!isInvoiced && tropPercu > 0 && (
              <div className="mx-5 mt-5 p-4 rounded-xl bg-orange-50 border border-orange-300">
                <div className="font-body text-sm font-semibold text-orange-700 mb-1">
                  ⚠️ Attention — trop-perçu de {tropPercu.toFixed(2)}€
                </div>
                <div className="font-body text-xs text-orange-700 leading-relaxed">
                  La famille a déjà payé <strong>{paidAmount.toFixed(2)}€</strong> mais le nouveau total ne sera que de <strong>{newTotalLive.toFixed(2)}€</strong>.
                  À l'enregistrement, un <strong>avoir de {tropPercu.toFixed(2)}€</strong> sera automatiquement créé au nom de {editPayment.familyName}, utilisable sur une prochaine commande ou remboursable.
                </div>
              </div>
            )}

            <div className="p-5 flex flex-col gap-4">
              {/* Items modifiables */}
              <div>
                <div className="font-body text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">Lignes de la commande</div>
                <div className="flex flex-col gap-2">
                  {editItems.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2.5">
                      <div className="flex-1 min-w-0">
                        <div className="font-body text-xs text-blue-800 truncate">{item.activityTitle}</div>
                        {item.childName && <div className="font-body text-[10px] text-slate-400">{item.childName}</div>}
                      </div>
                      <input
                        type="number" step="0.01" min="0"
                        value={item.priceTTC}
                        disabled={isInvoiced}
                        onChange={e => {
                          const v = parseFloat(e.target.value) || 0;
                          setEditItems(prev => prev.map((it, i) => i === idx ? { ...it, priceTTC: v, priceHT: Math.round(v / (1 + (it.tva || 5.5) / 100) * 100) / 100 } : it));
                        }}
                        className={`w-20 px-2 py-1.5 rounded-lg border border-gray-200 font-body text-sm text-right focus:outline-none focus:border-blue-500 ${isInvoiced ? "opacity-50 cursor-not-allowed bg-gray-100" : ""}`}
                      />
                      <span className="font-body text-xs text-slate-400">€</span>
                      <button onClick={() => !isInvoiced && setEditItems(prev => prev.filter((_, i) => i !== idx))}
                        disabled={isInvoiced}
                        className={`text-red-400 hover:text-red-600 bg-transparent border-none p-1 ${isInvoiced ? "opacity-30 cursor-not-allowed" : "cursor-pointer"}`}>
                        <Trash2 size={14}/>
                      </button>
                    </div>
                  ))}
                </div>

                {/* Ajouter une ligne libre */}
                <button onClick={() => setEditItems(prev => [...prev, { activityTitle: "Remise / Ajustement", priceTTC: 0, priceHT: 0, tva: 5.5, childName: "" }])}
                  className="mt-2 font-body text-xs text-blue-500 bg-transparent border-none cursor-pointer hover:underline">
                  + Ajouter une ligne
                </button>
              </div>

              {/* Remise globale */}
              <div className="border border-orange-200 rounded-xl p-4 bg-orange-50">
                <div className="font-body text-xs font-semibold text-orange-700 mb-3">🎁 Appliquer une remise globale</div>
                <div className="flex gap-2 items-center">
                  <div className="flex-1">
                    <label className="font-body text-[10px] text-slate-500 block mb-1">En %</label>
                    <input type="number" min="0" max="100" step="1" value={editRemisePct}
                      onChange={e => { setEditRemisePct(e.target.value); setEditRemiseEuros(""); }}
                      placeholder="ex: 10"
                      className="w-full px-3 py-2 rounded-lg border border-orange-200 font-body text-sm bg-white focus:outline-none focus:border-orange-400" />
                  </div>
                  <div className="font-body text-slate-400 pt-4">ou</div>
                  <div className="flex-1">
                    <label className="font-body text-[10px] text-slate-500 block mb-1">En €</label>
                    <input type="number" min="0" step="0.01" value={editRemiseEuros}
                      onChange={e => { setEditRemiseEuros(e.target.value); setEditRemisePct(""); }}
                      placeholder="ex: 50"
                      className="w-full px-3 py-2 rounded-lg border border-orange-200 font-body text-sm bg-white focus:outline-none focus:border-orange-400" />
                  </div>
                  <button
                    onClick={() => {
                      const total = editItems.reduce((s, i) => s + (i.priceTTC || 0), 0);
                      const remise = editRemisePct
                        ? Math.round(total * parseFloat(editRemisePct) / 100 * 100) / 100
                        : parseFloat(editRemiseEuros) || 0;
                      if (remise <= 0) return;
                      // Répartir la remise proportionnellement sur tous les items
                      setEditItems(prev => prev.map(it => {
                        const part = total > 0 ? (it.priceTTC || 0) / total : 0;
                        const newPrice = Math.max(0, Math.round((it.priceTTC - remise * part) * 100) / 100);
                        return { ...it, priceTTC: newPrice, priceHT: Math.round(newPrice / (1 + (it.tva || 5.5) / 100) * 100) / 100 };
                      }));
                      setEditRemisePct(""); setEditRemiseEuros("");
                    }}
                    className="mt-4 px-4 py-2 rounded-lg font-body text-xs font-semibold text-white bg-orange-500 hover:bg-orange-600 border-none cursor-pointer whitespace-nowrap">
                    Appliquer
                  </button>
                </div>
              </div>

              {/* Récap */}
              <div className="flex items-center justify-between py-3 border-t border-gray-100">
                <div>
                  <div className="font-body text-xs text-slate-500">Ancien total</div>
                  <div className="font-body text-sm text-slate-400 line-through">{(editPayment.totalTTC || 0).toFixed(2)}€</div>
                </div>
                <div className="text-right">
                  <div className="font-body text-xs text-slate-500">Nouveau total</div>
                  <div className="font-body text-xl font-bold text-blue-500">
                    {editItems.reduce((s, i) => s + (i.priceTTC || 0), 0).toFixed(2)}€
                  </div>
                </div>
              </div>

              {/* Boutons */}
              <div className="flex gap-3">
                <button onClick={() => setEditPayment(null)}
                  className="px-5 py-2.5 rounded-xl font-body text-sm text-slate-500 bg-gray-100 border-none cursor-pointer">
                  {isInvoiced ? "Fermer" : "Annuler"}
                </button>
                {!isInvoiced && (
                <button
                  disabled={editSaving}
                  onClick={async () => {
                    setEditSaving(true);
                    try {
                      const newTotal = Math.round(editItems.reduce((s, i) => s + (i.priceTTC || 0), 0) * 100) / 100;
                      const previousPaid = editPayment.paidAmount || 0;
                      const overpayment = Math.round((previousPaid - newTotal) * 100) / 100;
                      // Si trop-perçu : on garde paidAmount au niveau de newTotal
                      // et on crée un avoir pour la différence (pas d'écrasement silencieux)
                      const newPaid = Math.min(previousPaid, newTotal);
                      const newStatus = newPaid >= newTotal ? "paid" : newPaid > 0 ? "partial" : "pending";

                      await updateDoc(doc(db, "payments", editPayment.id), {
                        items: editItems,
                        totalTTC: newTotal,
                        paidAmount: newPaid,
                        status: newStatus,
                        updatedAt: serverTimestamp(),
                      });

                      // Création automatique d'un avoir si trop-perçu
                      let avoirMsg = "";
                      if (overpayment > 0) {
                        try {
                          const avoirRef = await addDoc(collection(db, "avoirs"), {
                            familyId: editPayment.familyId,
                            familyName: editPayment.familyName,
                            amount: overpayment,
                            remainingAmount: overpayment,
                            reason: `Trop-perçu suite modification commande ${editPayment.orderId || editPayment.id.slice(-6)} (total ${(editPayment.totalTTC || 0).toFixed(2)}€ → ${newTotal.toFixed(2)}€)`,
                            sourcePaymentId: editPayment.id,
                            status: "active",
                            createdAt: serverTimestamp(),
                          });
                          avoirMsg = ` — Avoir de ${overpayment.toFixed(2)}€ créé (réf. ${avoirRef.id.slice(-6)})`;
                        } catch (avoirErr) {
                          console.error("[paiements] échec création avoir trop-perçu:", avoirErr);
                          toast(`⚠️ Commande modifiée mais avoir non créé — à faire manuellement (${overpayment.toFixed(2)}€)`, "warning");
                        }
                      }

                      // Mettre à jour la liste locale
                      setPayments(prev => prev.map(p => p.id === editPayment.id
                        ? { ...p, items: editItems, totalTTC: newTotal, paidAmount: newPaid, status: newStatus }
                        : p
                      ));
                      toast(`✅ Commande mise à jour — ${newTotal.toFixed(2)}€${avoirMsg}`, "success");
                      setEditPayment(null);
                    } catch (e) { console.error(e); toast("Erreur lors de la sauvegarde", "error"); }
                    setEditSaving(false);
                  }}
                  className={`flex-1 py-2.5 rounded-xl font-body text-sm font-semibold border-none cursor-pointer ${editSaving ? "bg-gray-200 text-slate-400" : "bg-blue-500 text-white hover:bg-blue-600"}`}>
                  {editSaving ? "Sauvegarde..." : tropPercu > 0 ? `Enregistrer + créer avoir ${tropPercu.toFixed(2)}€` : "Enregistrer les modifications"}
                </button>
                )}
              </div>
            </div>
          </div>
        </div>
        );
      })()}

      {/* ─── Modale : Envoyer un lien de paiement ─── */}
      {payLinkModal && (() => {
        const p = payLinkModal;
        const due = (p.totalTTC || 0) - (p.paidAmount || 0);
        const prestations = (p.items || []).map((i: any) => `${i.activityTitle}${i.childName ? ` — ${i.childName}` : ""}`).join(", ");

        return (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setPayLinkModal(null)}>
            <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <div className="p-5 border-b border-gray-100 flex justify-between items-center">
                <div>
                  <h2 className="font-display text-lg font-bold text-blue-800">💳 Envoyer un lien de paiement</h2>
                  <p className="font-body text-xs text-slate-500 mt-0.5">{p.familyName} · {prestations.slice(0, 60)}</p>
                </div>
                <button onClick={() => setPayLinkModal(null)} className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center cursor-pointer border-none"><X size={16} /></button>
              </div>
              <div className="p-5 flex flex-col gap-4">
                <div>
                  <label className="font-body text-xs font-semibold text-slate-600 block mb-1">Email destinataire</label>
                  <input type="email" value={payLinkEmail} onChange={e => setPayLinkEmail(e.target.value)}
                    placeholder="email@exemple.com"
                    className="w-full px-3 py-2.5 rounded-lg border border-gray-200 font-body text-sm bg-white focus:border-blue-400 focus:outline-none" />
                  <p className="font-body text-[10px] text-slate-400 mt-1">Le paiement sera encaissé sur le compte de {p.familyName} quel que soit l'email</p>
                </div>
                <div>
                  <label className="font-body text-xs font-semibold text-slate-600 block mb-1">Montant (€)</label>
                  <input type="number" step="0.01" min="1" max={due} value={payLinkAmount} onChange={e => setPayLinkAmount(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-lg border border-gray-200 font-body text-sm bg-white focus:border-blue-400 focus:outline-none" />
                  <p className="font-body text-[10px] text-slate-400 mt-1">Reste dû : {due.toFixed(2)}€ — vous pouvez envoyer un montant partiel</p>
                </div>
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="font-body text-xs font-semibold text-slate-600">Message personnalisé</label>
                    <button disabled={payLinkGenerating} onClick={async () => {
                      setPayLinkGenerating(true);
                      try {
                        const res = await authFetch("/api/ia", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            prompt: `Tu es l'assistant du Centre Équestre d'Agon-Coutainville. Rédige un email court et chaleureux pour envoyer un lien de paiement.

Contexte :
- Famille : ${p.familyName}
- Prestations : ${prestations}
- Montant à payer : ${payLinkAmount}€
- Reste dû total : ${due.toFixed(2)}€
- Destinataire : ${payLinkEmail}
${payLinkEmail !== families.find(f => f.firestoreId === p.familyId)?.parentEmail ? `- Note : le destinataire n'est PAS le titulaire du compte (peut-être un grand-parent, CE, mairie...)` : ""}

Règles :
- Commence par "Bonjour" (pas de nom si le destinataire est différent du titulaire)
- Mentionne les prestations et le montant
- Ton chaleureux et professionnel
- 3-4 phrases max
- Pas de formule de politesse finale (le template email s'en charge)
- Format texte simple (pas de HTML)`,
                          }),
                        });
                        const data = await res.json();
                        const text = data.content?.[0]?.text || data.text || data.message || "";
                        setPayLinkMessage(text);
                      } catch (e) { console.error(e); toast("Erreur IA", "error"); }
                      setPayLinkGenerating(false);
                    }}
                      className="font-body text-[10px] text-purple-600 bg-purple-50 px-3 py-1 rounded-lg border-none cursor-pointer hover:bg-purple-100 disabled:opacity-50 flex items-center gap-1">
                      {payLinkGenerating ? <Loader2 size={10} className="animate-spin" /> : "✨"} Générer avec l'IA
                    </button>
                  </div>
                  <textarea value={payLinkMessage} onChange={e => setPayLinkMessage(e.target.value)}
                    rows={4} placeholder="Message optionnel qui sera inclus dans l'email..."
                    className="w-full px-3 py-2.5 rounded-lg border border-gray-200 font-body text-sm bg-white focus:border-blue-400 focus:outline-none resize-none" />
                </div>

                {/* Aperçu */}
                {payLinkMessage && (
                  <div className="bg-blue-50 rounded-lg p-3">
                    <div className="font-body text-[10px] text-blue-500 font-semibold uppercase mb-1">Aperçu du message</div>
                    <p className="font-body text-xs text-slate-600 whitespace-pre-wrap">{payLinkMessage}</p>
                  </div>
                )}
              </div>
              <div className="flex justify-end gap-3 p-5 border-t border-gray-100">
                <button onClick={() => setPayLinkModal(null)}
                  className="font-body text-sm text-slate-500 bg-white px-5 py-2.5 rounded-lg border border-gray-200 cursor-pointer">Annuler</button>
                <button disabled={payLinkSending || !payLinkEmail || !payLinkAmount || parseFloat(payLinkAmount) <= 0}
                  onClick={async () => {
                    setPayLinkSending(true);
                    try {
                      const res = await authFetch("/api/send-payment-link", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          paymentId: p.id,
                          recipientEmail: payLinkEmail,
                          amount: parseFloat(payLinkAmount),
                          message: payLinkMessage,
                          familyId: p.familyId,
                          familyName: p.familyName,
                        }),
                      });
                      const data = await res.json();
                      if (!res.ok) throw new Error(data.error || "Erreur");
                      toast(`✅ Lien envoyé à ${payLinkEmail} — ${parseFloat(payLinkAmount).toFixed(2)}€`, "success");
                      setPayLinkModal(null);
                    } catch (e: any) {
                      console.error(e);
                      toast(e.message || "Erreur envoi", "error");
                    }
                    setPayLinkSending(false);
                  }}
                  className="font-body text-sm font-semibold text-white bg-indigo-500 px-6 py-2.5 rounded-lg border-none cursor-pointer hover:bg-indigo-400 disabled:opacity-50 flex items-center gap-2">
                  {payLinkSending ? <Loader2 size={14} className="animate-spin" /> : <CreditCard size={14} />}
                  Envoyer le lien
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
