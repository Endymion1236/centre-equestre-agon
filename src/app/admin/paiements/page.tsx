"use client";

import { useState, useEffect } from "react";
import { collection, getDocs, addDoc, deleteDoc, updateDoc, doc, getDoc, serverTimestamp, query, where, orderBy, limit, runTransaction } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { emailTemplates } from "@/lib/email-templates";
import { safeNumber, round2, generateOrderId } from "@/lib/utils";
import { Card, Badge, Button } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { Plus, Trash2, ShoppingCart, CreditCard, Check, Loader2, Search, X, Receipt, AlertTriangle } from "lucide-react";
import type { Family, Activity } from "@/types";

/** Normalise un payment chargé depuis Firestore — tue les NaN à la source */
const normalizePayment = (d: any) => ({
  ...d,
  totalTTC: safeNumber(d.totalTTC),
  paidAmount: safeNumber(d.paidAmount),
  items: (d.items || []).map((i: any) => ({
    ...i,
    priceTTC: safeNumber(i.priceTTC),
    priceHT: safeNumber(i.priceHT),
    tva: safeNumber(i.tva || 5.5),
  })),
});

const loadPayments = (docs: any[]) => docs.map(d => normalizePayment({ id: d.id, ...d.data() }));

type PaymentMode = "cb_terminal" | "cb_online" | "cheque" | "especes" | "cheque_vacances" | "pass_sport" | "ancv" | "virement" | "avoir";

interface BasketItem {
  id: string;
  activityTitle: string;
  childId?: string;
  childName: string;
  activityId?: string;
  creneauId?: string;
  activityType?: string;
  description: string;
  priceHT: number;
  tva: number;
  priceTTC: number;
}

interface Payment {
  id?: string;
  familyId: string;
  familyName: string;
  items: BasketItem[];
  totalTTC: number;
  paymentMode: PaymentMode;
  paymentRef: string;
  status: "draft" | "paid" | "pending" | "partial" | "cancelled";
  paidAmount: number;
  date: any;
}

const paymentModes: { id: PaymentMode; label: string }[] = [
  { id: "cb_terminal", label: "CB (terminal)" },
  { id: "cb_online", label: "CB en ligne (Stripe)" },
  { id: "cheque", label: "Chèque" },
  { id: "especes", label: "Espèces" },
  { id: "cheque_vacances", label: "Chèques vacances" },
  { id: "pass_sport", label: "Pass'Sport" },
  { id: "ancv", label: "ANCV" },
  { id: "virement", label: "Virement" },
  { id: "avoir", label: "Avoir" },
];

export default function PaiementsPage() {
  const { toast } = useToast();
  const [tab, setTab] = useState<"encaisser" | "journal" | "historique" | "echeances" | "impayes">("encaisser");
  const [families, setFamilies] = useState<(Family & { firestoreId: string })[]>([]);
  const [activities, setActivities] = useState<(Activity & { firestoreId: string })[]>([]);
  const [payments, setPayments] = useState<(Payment & { id: string })[]>([]);
  const [encaissements, setEncaissements] = useState<any[]>([]);
  const [avoirs, setAvoirs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

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
  const [selectedFamily, setSelectedFamily] = useState<string>("");
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
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  // Réductions
  const [promos, setPromos] = useState<any[]>([]);
  const [promoCode, setPromoCode] = useState("");
  const [appliedPromo, setAppliedPromo] = useState<{ label: string; discountMode: string; discountValue: number } | null>(null);
  const [manualDiscount, setManualDiscount] = useState("");

  useEffect(() => {
    Promise.all([
      getDocs(collection(db, "families")),
      getDocs(collection(db, "activities")),
      getDocs(query(collection(db, "payments"), orderBy("date", "desc"), limit(200))),
      getDocs(query(collection(db, "encaissements"), orderBy("date", "desc"), limit(500))),
      getDocs(collection(db, "avoirs")),
      getDoc(doc(db, "settings", "promos")),
    ]).then(([famSnap, actSnap, paySnap, encSnap, avoirsSnap, promoSnap]) => {
      setFamilies(famSnap.docs.map((d) => ({ firestoreId: d.id, ...d.data() })) as any);
      setActivities(actSnap.docs.map((d) => ({ firestoreId: d.id, ...d.data() })) as any);
      setPayments(loadPayments(paySnap.docs) as any);
      setEncaissements(encSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as any);
      setAvoirs(avoirsSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as any);
      if (promoSnap.exists() && promoSnap.data().items) setPromos(promoSnap.data().items);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

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
  ) => {
    // 1. Créer le doc encaissement (journal)
    await addDoc(collection(db, "encaissements"), {
      paymentId,
      familyId: paymentData.familyId,
      familyName: paymentData.familyName,
      montant: Math.round(montant * 100) / 100,
      mode,
      modeLabel: paymentModes.find(m => m.id === mode)?.label || mode,
      ref,
      activityTitle: activityTitle || (paymentData.items || []).map((i: any) => i.activityTitle).join(", "),
      date: serverTimestamp(),
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
    await updateDoc(doc(db, "payments", paymentId), {
      paidAmount: totalEncaisse,
      status: newStatus,
      paymentMode: displayMode,
      paymentModes: uniqueModes,
      updatedAt: serverTimestamp(),
    });

    return { paidAmount: totalEncaisse, status: newStatus };
  };

  // Rafraîchir les données
  const refreshAll = async () => {
    const [paySnap, encSnap, avoirsSnap] = await Promise.all([
      getDocs(query(collection(db, "payments"), orderBy("date", "desc"), limit(200))),
      getDocs(query(collection(db, "encaissements"), orderBy("date", "desc"), limit(500))),
      getDocs(collection(db, "avoirs")),
    ]);
    setPayments(loadPayments(paySnap.docs) as any);
    setEncaissements(encSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as any);
    setAvoirs(avoirsSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as any);
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
      // Cas 1 : créneau lié directement par ID (le plus fiable)
      if (item.creneauId) {
        await removeFromCreneau(item.creneauId, item.childId);
        // Supprimer les réservations liées
        try {
          const resSnap = await getDocs(query(collection(db, "reservations"), where("creneauId", "==", item.creneauId), where("childId", "==", item.childId)));
          for (const d of resSnap.docs) await deleteDoc(doc(db, "reservations", d.id));
        } catch (e) { console.error("Erreur suppression réservation:", e); }
        return;
      }

      // Cas 2 : pas de creneauId → chercher les réservations par IDs puis fallback texte
      const resSnap = await getDocs(query(collection(db, "reservations"), where("familyId", "==", payment.familyId), where("childId", "==", item.childId)));
      for (const d of resSnap.docs) {
        const r = d.data();
        // Matching par priorité : IDs d'abord, texte en fallback
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
    const inscriptionMsg = hasInscriptions ? "\n\n⚠️ Les cavaliers seront aussi désinscrits des créneaux associés." : "";

    if (totalEnc === 0) {
      if (!confirm(`Annuler l'inscription de ${payment.familyName} ?\n\n${(payment.items || []).map((i: any) => `• ${i.childName || ""} — ${i.activityTitle}`).join("\n")}\n\nTotal : ${(payment.totalTTC || 0).toFixed(2)}€ (non encaissé)${inscriptionMsg}`)) return;
      // Désinscrire avant suppression
      for (const item of payment.items || []) await unenrollPaymentItem(payment, item);
      await deleteDoc(doc(db, "payments", payment.id));
      toast(`${payment.familyName} — inscription annulée et cavaliers désinscrits`, "success");
    } else {
      // Encaissé → avoir automatique
      if (!confirm(`Annuler l'inscription de ${payment.familyName} ?\n\n${(payment.items || []).map((i: any) => `• ${i.childName || ""} — ${i.activityTitle}`).join("\n")}\n\n💰 ${totalEnc.toFixed(2)}€ déjà encaissés → un avoir sera créé${inscriptionMsg}\n\nConfirmer ?`)) return;

      // Désinscrire avant annulation
      for (const item of payment.items || []) await unenrollPaymentItem(payment, item);

      const ref = `AV-${Date.now().toString(36).toUpperCase()}`;
      const expiry = new Date();
      expiry.setFullYear(expiry.getFullYear() + 1);

      await addDoc(collection(db, "avoirs"), {
        familyId: payment.familyId,
        familyName: payment.familyName,
        type: "avoir",
        amount: Math.round(totalEnc * 100) / 100,
        usedAmount: 0,
        remainingAmount: Math.round(totalEnc * 100) / 100,
        reason: `Annulation commande — ${(payment.items || []).map((i: any) => i.activityTitle).join(", ").slice(0, 60)}`,
        reference: ref,
        sourcePaymentId: payment.id,
        sourceType: "annulation",
        expiryDate: expiry,
        status: "actif",
        usageHistory: [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      await updateDoc(doc(db, "payments", payment.id), {
        status: "cancelled",
        cancelledAt: serverTimestamp(),
        cancelReason: "Annulation manuelle",
        updatedAt: serverTimestamp(),
      });

      toast(`Commande annulée.\nAvoir créé : ${totalEnc.toFixed(2)}€ (réf. ${ref})`);
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

        await addDoc(collection(db, "avoirs"), {
          familyId: payment.familyId,
          familyName: payment.familyName,
          type: "avoir",
          amount: Math.round(tropPercu * 100) / 100,
          usedAmount: 0,
          remainingAmount: Math.round(tropPercu * 100) / 100,
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
      }

      if (newItems.length === 0) {
        await updateDoc(doc(db, "payments", payment.id), {
          status: "cancelled", cancelledAt: serverTimestamp(),
          cancelReason: "Dernière prestation retirée", updatedAt: serverTimestamp(),
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

  const [duplicateTarget, setDuplicateTarget] = useState<{ payment: any; targetFamilyId: string; targetSearch: string } | null>(null);

  const duplicatePayment = async (payment: any, targetFamilyId?: string) => {
    const targetFamily = targetFamilyId
      ? families.find(f => f.firestoreId === targetFamilyId)
      : families.find(f => f.firestoreId === payment.familyId);
    if (!targetFamily) return;

    const targetChildren = targetFamily.children || [];
    const sourceChildren = (payment.items || []).map((i: any) => i.childName).filter(Boolean);

    const cleanedItems = (payment.items || []).map((item: any, idx: number) => {
      // Si autre famille : remplacer l'enfant par celui de la cible (par position)
      const targetChild = targetFamilyId && targetChildren[idx]
        ? { childId: targetChildren[idx].id, childName: targetChildren[idx].firstName }
        : { childId: item.childId || "", childName: item.childName || "" };
      return {
        ...targetChild,
        activityType: item.activityType || "",
        activityTitle: item.activityTitle || item.label || "",
        stageKey: item.stageKey || "",
        priceHT: safeNumber(item.priceHT),
        priceTTC: safeNumber(item.priceTTC),
        tva: safeNumber(item.tva || item.tvaTaux || 5.5),
        creneauId: "",
        reservationId: "",
      };
    });
    const totalTTC = round2(cleanedItems.reduce((sum: number, item: any) => sum + safeNumber(item.priceTTC), 0));
    await addDoc(collection(db, "payments"), { orderId: generateOrderId(),
      familyId: targetFamily.firestoreId,
      familyName: targetFamily.parentName || "",
      items: cleanedItems,
      totalTTC,
      status: "draft",
      paidAmount: 0,
      paymentMode: "",
      paymentRef: "",
      source: "duplicate",
      sourcePaymentId: payment.id,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    setDuplicateTarget(null);
    await refreshAll();
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

  const removeFromBasket = (id: string) => setBasket(basket.filter((i) => i.id !== id));

  const handlePayment = async () => {
    if (!selectedFamily || basket.length === 0) return;
    setSaving(true);
    const paid = paidAmount ? safeNumber(paidAmount) : basketTotal;

    const payRef = await addDoc(collection(db, "payments"), { orderId: generateOrderId(),
      familyId: selectedFamily,
      familyName: family?.parentName || "—",
      items: basket,
      totalTTC: basketTotal,
      paymentMode: "",
      paymentRef: "",
      status: "pending",
      paidAmount: 0,
      date: serverTimestamp(),
    });

    // Encaisser via la fonction centrale
    if (paid > 0) {
      await enregistrerEncaissement(payRef.id, {
        familyId: selectedFamily,
        familyName: family?.parentName || "—",
        items: basket,
        totalTTC: basketTotal,
      }, paid, paymentMode, paymentRef, basket.map(i => i.activityTitle).join(", "));
    }

    setBasket([]);
    setPaymentRef("");
    setPaidAmount("");
    setSaving(false);
    setSuccess(true);
    setTimeout(() => setSuccess(false), 3000);
    await refreshAll();
  };

  const inputCls = "w-full px-3 py-2.5 rounded-lg border border-blue-500/8 font-body text-sm bg-cream focus:border-blue-500 focus:outline-none";

  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-blue-800 mb-6">Paiements & facturation</h1>

      <div className="flex gap-1.5 mb-6 overflow-x-auto pb-1 -mx-1 px-1 hide-scrollbar">
        {([["encaisser", "Encaisser", ShoppingCart], ["journal", "Journal", Receipt], ["historique", "Historique", Receipt], ["echeances", "Échéances", Receipt], ["impayes", "Impayés", Receipt]] as const).map(([id, label, Icon]) => (
          <button key={id} onClick={() => setTab(id as any)}
            className={`flex items-center gap-1.5 px-3 sm:px-5 py-2 sm:py-2.5 rounded-lg border font-body text-xs sm:text-sm font-medium cursor-pointer transition-all whitespace-nowrap flex-shrink-0
              ${tab === id ? "bg-blue-500 text-white border-blue-500" : "bg-white text-gray-500 border-gray-200"}`}>
            <Icon size={14} /> {label}
            {id === "impayes" && payments.filter(p => p.status !== "cancelled" && !(p as any).echeancesTotal && (p.status === "partial" || (p.paidAmount || 0) < (p.totalTTC || 0))).length > 0 && (
              <span className="bg-red-500 text-white text-[10px] w-5 h-5 rounded-full flex items-center justify-center">{payments.filter(p => p.status !== "cancelled" && !(p as any).echeancesTotal && (p.status === "partial" || ((p.paidAmount || 0) < (p.totalTTC || 0) && p.status !== "paid"))).length}</span>
            )}
          </button>
        ))}
      </div>

      {/* ─── Encaisser Tab ─── */}
      {tab === "encaisser" && (
        <div className="flex gap-6 flex-wrap">
          {/* Left: basket builder */}
          <div className="flex-1 min-w-[400px]">
            {success && (
              <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg font-body text-sm text-green-700 flex items-center gap-2">
                <Check size={16} /> Paiement enregistré avec succès !
              </div>
            )}

            {/* Family selector */}
            <Card padding="md" className="mb-4">
              <h3 className="font-body text-sm font-semibold text-blue-800 mb-3">1. Sélectionner la famille</h3>
              <div className="relative mb-2">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" />
                <input value={familySearch} onChange={(e) => setFamilySearch(e.target.value)} placeholder="Rechercher..." className={`${inputCls} !pl-9`} />
              </div>
              <select value={selectedFamily} onChange={(e) => { setSelectedFamily(e.target.value); setSelectedChild(""); }} className={inputCls}>
                <option value="">Choisir une famille...</option>
                {filteredFamilies.map((f) => (
                  <option key={f.firestoreId} value={f.firestoreId}>{f.parentName} ({f.parentEmail})</option>
                ))}
              </select>
              {family && children.length > 0 && (
                <div className="mt-3">
                  <div className="font-body text-xs font-semibold text-gray-400 mb-1">Cavalier</div>
                  <div className="flex flex-wrap gap-2">
                    {children.map((c: any) => (
                      <button key={c.id} onClick={() => setSelectedChild(c.id)}
                        className={`px-3 py-1.5 rounded-lg border font-body text-xs font-medium cursor-pointer transition-all
                          ${selectedChild === c.id ? "bg-blue-500 text-white border-blue-500" : "bg-white text-gray-500 border-gray-200"}`}>
                        🧒 {c.firstName}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </Card>

            {/* Impayés de cette famille */}
            {family && (() => {
              const familyPending = payments.filter(p =>
                p.familyId === selectedFamily &&
                (p.status === "pending" || (p.status === "partial" && (p.paidAmount || 0) < (p.totalTTC || 0)))
              );
              if (familyPending.length === 0) return null;
              const totalPending = familyPending.reduce((s, p) => s + (p.totalTTC || 0) - (p.paidAmount || 0), 0);

              return (
                <Card padding="md" className="mb-4 border-orange-200 bg-orange-50/30">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-body text-sm font-semibold text-orange-700">
                      <AlertTriangle size={14} className="inline mr-1" />
                      Impayés — {family.parentName} ({familyPending.length})
                    </h3>
                    <span className="font-body text-lg font-bold text-red-500">{totalPending.toFixed(2)}€</span>
                  </div>
                  {/* Détail des lignes */}
                  <div className="flex flex-col gap-1.5 mb-4">
                    {familyPending.map(p => {
                      const reste = (p.totalTTC || 0) - (p.paidAmount || 0);
                      return (
                        <div key={p.id} className="flex items-center justify-between bg-white rounded-lg px-3 py-2">
                          <div>
                            <div className="font-body text-sm text-blue-800">{(p.items || []).map((i: any) => i.activityTitle).join(", ") || "Prestation"}</div>
                            <div className="font-body text-xs text-gray-400">{reste.toFixed(2)}€ dû sur {(p.totalTTC || 0).toFixed(2)}€</div>
                            {(() => {
                              const payEnc = encaissements.filter((e: any) => e.paymentId === p.id);
                              if (payEnc.length === 0) return null;
                              return (
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {payEnc.map((enc: any, i: number) => {
                                    const d = enc.date?.seconds ? new Date(enc.date.seconds * 1000) : null;
                                    return (
                                      <span key={i} className="font-body text-[10px] bg-green-50 text-green-700 px-1.5 py-0.5 rounded">
                                        {(enc.montant || 0).toFixed(2)}€ {enc.modeLabel || enc.mode} {d ? d.toLocaleDateString("fr-FR") : ""}
                                      </span>
                                    );
                                  })}
                                </div>
                              );
                            })()}
                          </div>
                          <span className="font-body text-sm font-bold text-red-500">{reste.toFixed(2)}€</span>
                        </div>
                      );
                    })}
                  </div>
                  {/* Total + montant + mode + bouton */}
                  <div className="bg-white rounded-lg p-3 border border-green-200">
                    <div className="flex items-center justify-between mb-3">
                      <span className="font-body text-sm font-semibold text-blue-800">Total dû</span>
                      <span className="font-body text-xl font-bold text-red-500">{totalPending.toFixed(2)}€</span>
                    </div>

                    {/* Avoirs disponibles */}
                    {(() => {
                      const familyAvoirs = avoirs.filter(a => a.familyId === selectedFamily && a.status === "actif" && (a.remainingAmount || 0) > 0);
                      const totalAvoir = familyAvoirs.reduce((s, a) => s + (a.remainingAmount || 0), 0);
                      if (totalAvoir <= 0) return null;
                      return (
                        <div className="mb-3 p-2 bg-purple-50 rounded-lg">
                          <div className="flex items-center justify-between font-body text-sm">
                            <span className="text-purple-700 font-semibold">Avoir disponible</span>
                            <span className="text-purple-700 font-bold">{totalAvoir.toFixed(2)}€</span>
                          </div>
                          <button onClick={async () => {
                            const toUse = Math.min(totalAvoir, totalPending);
                            if (!confirm(`Utiliser ${toUse.toFixed(2)}€ d'avoir pour cette famille ?`)) return;
                            try {
                              let resteAUtiliser = toUse;
                              // 1. Déduire des avoirs
                              for (const a of familyAvoirs) {
                                if (resteAUtiliser <= 0) break;
                                const used = Math.min(a.remainingAmount || 0, resteAUtiliser);
                                await updateDoc(doc(db, "avoirs", a.id), {
                                  usedAmount: (a.usedAmount || 0) + used,
                                  remainingAmount: (a.remainingAmount || 0) - used,
                                  status: (a.remainingAmount || 0) - used <= 0 ? "utilise" : "actif",
                                  updatedAt: serverTimestamp(),
                                });
                                resteAUtiliser -= used;
                              }
                              // 2. Encaisser en mode "avoir" sur les paiements
                              let resteAPayer = toUse;
                              for (const p of familyPending) {
                                if (resteAPayer <= 0) break;
                                const du = (p.totalTTC || 0) - (p.paidAmount || 0);
                                const paye = Math.min(du, resteAPayer);
                                await enregistrerEncaissement(p.id!, p, paye, "avoir", "", "Utilisation avoir");
                                resteAPayer -= paye;
                              }
                              toast(`${toUse.toFixed(2)}€ d'avoir utilisé !`);
                              await refreshAll();
                            } catch (e) { console.error(e); toast("Erreur.", "error"); }
                          }} className="w-full mt-2 py-1.5 rounded-lg font-body text-xs font-semibold text-purple-700 bg-purple-100 border-none cursor-pointer hover:bg-purple-200">
                            Utiliser {Math.min(totalAvoir, totalPending).toFixed(2)}€ d'avoir
                          </button>
                        </div>
                      );
                    })()}

                    {/* Montant à encaisser */}
                    <div className="mb-3">
                      <div className="font-body text-xs font-semibold text-gray-400 mb-1">Montant encaissé</div>
                      <div className="flex gap-2 items-center">
                        <input type="number" step="0.01" value={paidAmount} onChange={e => setPaidAmount(e.target.value)}
                          placeholder={totalPending.toFixed(2)}
                          className={`${inputCls} w-32`} />
                        <span className="font-body text-xs text-gray-400">€</span>
                        {!paidAmount && <span className="font-body text-[10px] text-gray-400">(vide = tout encaisser)</span>}
                      </div>
                      {paidAmount && safeNumber(paidAmount) < totalPending && safeNumber(paidAmount) > 0 && (
                        <div className="font-body text-xs text-orange-500 mt-1">
                          Paiement partiel — reste dû après : {(totalPending - safeNumber(paidAmount)).toFixed(2)}€
                        </div>
                      )}
                    </div>

                    {/* Mode de paiement */}
                    <div className="font-body text-xs font-semibold text-gray-400 mb-2">Mode de paiement</div>
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {paymentModes.map(m => (
                        <button key={m.id} onClick={() => setPaymentMode(m.id)}
                          className={`px-3 py-1.5 rounded-lg border font-body text-[11px] font-medium cursor-pointer transition-all ${
                            paymentMode === m.id ? "bg-blue-500 text-white border-blue-500" : "bg-white text-gray-500 border-gray-200"
                          }`}>
                          {m.label}
                        </button>
                      ))}
                    </div>

                    {/* Référence */}
                    {["cheque", "cheque_vacances", "pass_sport", "ancv", "virement"].includes(paymentMode) && (
                      <div className="mb-3">
                        <input value={paymentRef} onChange={e => setPaymentRef(e.target.value)}
                          placeholder="N° de chèque, référence..."
                          className={inputCls} />
                      </div>
                    )}

                    <button onClick={async () => {
                      const montant = paidAmount ? safeNumber(paidAmount) : totalPending;
                      if (montant <= 0) return;
                      try {
                        let resteARegler = montant;
                        for (const p of familyPending) {
                          if (resteARegler <= 0) break;
                          const du = (p.totalTTC || 0) - (p.paidAmount || 0);
                          const paye = Math.min(du, resteARegler);
                          await enregistrerEncaissement(p.id!, p, paye, paymentMode, paymentRef);
                          resteARegler -= paye;
                        }
                        const resteFinal = totalPending - montant;
                        toast(`${montant.toFixed(2)}€ encaissé (${paymentModes.find(m => m.id === paymentMode)?.label || paymentMode}) pour ${family.parentName} !${resteFinal > 0 ? `\nReste dû : ${resteFinal.toFixed(2)}€` : "\nTout est réglé !"}`);
                        // Email confirmation paiement
                        if (family.parentEmail && montant > 0) {
                          try {
                            const emailData = emailTemplates.confirmationPaiement({
                              parentName: family.parentName || "",
                              montant,
                              mode: paymentModes.find(m => m.id === paymentMode)?.label || paymentMode,
                              prestations: familyPending.flatMap(p => (p.items || []).map((i: any) => i.activityTitle)).join(", "),
                            });
                            fetch("/api/send-email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to: family.parentEmail, ...emailData }) }).catch(e => console.warn("Email:", e));
                          } catch (e) { console.error("Email confirmation paiement:", e); }
                        }
                        setPaidAmount("");
                        setPaymentRef("");
                        await refreshAll();
                      } catch (e) { console.error(e); toast("Erreur.", "error"); }
                    }}
                      className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-body text-base font-semibold text-white bg-green-600 border-none cursor-pointer hover:bg-green-500 transition-colors">
                      <Check size={18} />
                      Encaisser {(paidAmount ? safeNumber(paidAmount) : totalPending).toFixed(2)}€
                      {paidAmount && safeNumber(paidAmount) < totalPending ? " (partiel)" : ` (${familyPending.length} prestation${familyPending.length > 1 ? "s" : ""})`}
                    </button>
                  </div>
                </Card>
              );
            })()}

            {/* Add items */}
            <Card padding="md" className="mb-4">
              <h3 className="font-body text-sm font-semibold text-blue-800 mb-3">2. Ajouter au panier</h3>
              
              {/* From activity catalog */}
              <div className="flex gap-2 mb-3">
                <select value={selectedActivity} onChange={(e) => setSelectedActivity(e.target.value)} className={`${inputCls} flex-1 min-w-0`}>
                  <option value="">Choisir une activité...</option>
                  {activities.filter((a) => a.active !== false).map((a, idx) => {
                    const ttc = (a as any).priceTTC || (a.priceHT || 0) * (1 + (a.tvaTaux || 5.5) / 100);
                    return <option key={`${a.firestoreId}-${idx}`} value={a.firestoreId}>{a.title} — {ttc.toFixed(2)}€</option>;
                  })}
                </select>
                <button onClick={addToBasket} disabled={!selectedActivity}
                  className={`px-3 py-2 rounded-lg font-body text-sm font-semibold border-none cursor-pointer flex-shrink-0
                    ${selectedActivity ? "bg-blue-500 text-white" : "bg-gray-200 text-gray-400"}`}>
                  <Plus size={16} />
                </button>
              </div>

              {/* Custom item */}
              <div className="font-body text-xs text-gray-400 mb-2">— ou saisie libre —</div>
              <div className="flex flex-col sm:flex-row gap-2">
                <input value={customLabel} onChange={(e) => setCustomLabel(e.target.value)} placeholder="Libellé (ex: Licence FFE)" className={`${inputCls} flex-1`} />
                <div className="flex gap-2">
                  <input value={customPrice} onChange={(e) => setCustomPrice(e.target.value)} placeholder="Prix TTC" type="number" step="0.01" className={`${inputCls} w-24`} />
                  <button onClick={addToBasket} disabled={!customLabel || !customPrice}
                    className={`px-3 py-2 rounded-lg font-body text-sm font-semibold border-none cursor-pointer flex-shrink-0
                      ${customLabel && customPrice ? "bg-gold-400 text-blue-800" : "bg-gray-200 text-gray-400"}`}>
                    <Plus size={16} />
                  </button>
                </div>
              </div>
            </Card>

            {/* Payment mode */}
            {basket.length > 0 && (
              <Card padding="md">
                <h3 className="font-body text-sm font-semibold text-blue-800 mb-3">3. Mode de paiement</h3>
                <div className="flex flex-wrap gap-2 mb-4">
                  {paymentModes.map((m) => (
                    <button key={m.id} onClick={() => setPaymentMode(m.id)}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border font-body text-xs font-medium cursor-pointer transition-all
                        ${paymentMode === m.id ? "bg-blue-500 text-white border-blue-500" : "bg-white text-gray-500 border-gray-200"}`}>
                      {m.label}
                    </button>
                  ))}
                </div>

                {/* Reference for cheque/pass sport */}
                {["cheque", "cheque_vacances", "pass_sport", "ancv", "virement"].includes(paymentMode) && (
                  <div className="mb-3">
                    <label className="font-body text-xs font-semibold text-gray-500 block mb-1">
                      Référence ({paymentModes.find((m) => m.id === paymentMode)?.label})
                    </label>
                    <input value={paymentRef} onChange={(e) => setPaymentRef(e.target.value)}
                      placeholder="N° de chèque, référence Pass'Sport..."
                      className={inputCls} />
                  </div>
                )}

                {/* Partial payment */}
                <div className="mb-3">
                  <label className="font-body text-xs font-semibold text-gray-500 block mb-1">
                    Montant encaissé (laisser vide = total)
                  </label>
                  <input value={paidAmount} onChange={(e) => setPaidAmount(e.target.value)}
                    placeholder={`${basketTotal.toFixed(2)}€`}
                    type="number" step="0.01" className={`${inputCls} w-40`} />
                  {paidAmount && safeNumber(paidAmount) < basketTotal && (
                    <div className="font-body text-xs text-orange-500 mt-1">
                      Paiement partiel — reste dû : {(basketTotal - safeNumber(paidAmount)).toFixed(2)}€
                    </div>
                  )}
                </div>

                <button onClick={handlePayment} disabled={saving}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-body text-base font-semibold text-white bg-green-600 border-none cursor-pointer hover:bg-green-500 transition-colors">
                  {saving ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
                  {saving ? "Enregistrement..." : `Valider le paiement — ${basketTotal.toFixed(2)}€`}
                </button>
              </Card>
            )}
          </div>

          {/* Right: basket summary */}
          <div className="w-[300px] flex-shrink-0">
            <Card padding="md" className="sticky top-4">
              <div className="flex items-center gap-2 mb-4">
                <ShoppingCart size={18} className="text-blue-500" />
                <h3 className="font-body text-sm font-semibold text-blue-800">
                  Panier {family ? `— ${family.parentName}` : ""}
                </h3>
              </div>

              {basket.length === 0 ? (
                <div className="text-center py-8">
                  <span className="text-3xl block mb-2 opacity-30">🛒</span>
                  <p className="font-body text-xs text-gray-400">Panier vide</p>
                </div>
              ) : (
                <>
                  <div className="flex flex-col gap-2 mb-4">
                    {basket.map((item) => (
                      <div key={item.id} className="flex items-start justify-between bg-sand rounded-lg p-3">
                        <div className="flex-1 min-w-0">
                          <div className="font-body text-sm font-semibold text-blue-800 truncate">{item.activityTitle}</div>
                          <div className="font-body text-xs text-gray-400">{item.childName}</div>
                          <div className="font-body text-xs text-gray-400">{item.description}</div>
                        </div>
                        <div className="flex items-center gap-2 ml-2">
                          <span className="font-body text-sm font-bold text-blue-500">{item.priceTTC.toFixed(2)}€</span>
                          <button onClick={() => removeFromBasket(item.id)}
                            className="text-gray-300 hover:text-red-500 bg-transparent border-none cursor-pointer">
                            <X size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Réductions */}
                  {basket.length > 0 && (
                    <div className="border-t border-blue-500/8 pt-3 mb-3">
                      <div className="font-body text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Réduction</div>
                      {appliedPromo && (
                        <div className="bg-green-50 rounded-lg px-3 py-2 mb-2 flex items-center justify-between">
                          <span className="font-body text-xs text-green-800">{appliedPromo.label} ({appliedPromo.discountMode === "percent" ? `-${appliedPromo.discountValue}%` : `-${appliedPromo.discountValue}€`})</span>
                          <button onClick={() => setAppliedPromo(null)} className="font-body text-[10px] text-red-500 bg-transparent border-none cursor-pointer">Retirer</button>
                        </div>
                      )}
                      <div className="flex gap-1.5 mb-1.5">
                        <input value={promoCode} onChange={e => setPromoCode(e.target.value.toUpperCase())} placeholder="Code promo"
                          className="flex-1 px-2 py-1.5 rounded border border-blue-500/8 font-body text-xs bg-cream font-mono uppercase focus:border-blue-500 focus:outline-none" />
                        <button onClick={applyPromoCode} disabled={!promoCode}
                          className={`px-3 py-1.5 rounded font-body text-xs font-semibold border-none cursor-pointer ${!promoCode ? "bg-gray-200 text-gray-400" : "bg-blue-500 text-white"}`}>
                          OK
                        </button>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-body text-[10px] text-gray-400">ou remise :</span>
                        <input type="number" value={manualDiscount} onChange={e => { setManualDiscount(e.target.value); setAppliedPromo(null); }}
                          placeholder="0" className="w-16 px-2 py-1.5 rounded border border-blue-500/8 font-body text-xs bg-cream text-center focus:border-blue-500 focus:outline-none" />
                        <span className="font-body text-[10px] text-gray-400">€</span>
                      </div>
                    </div>
                  )}

                  {/* Totals */}
                  <div className="border-t border-blue-500/8 pt-3">
                    <div className="flex justify-between mb-1">
                      <span className="font-body text-xs text-gray-400">Sous-total HT</span>
                      <span className="font-body text-xs text-gray-500">{basket.reduce((s, i) => s + i.priceHT, 0).toFixed(2)}€</span>
                    </div>
                    <div className="flex justify-between mb-1">
                      <span className="font-body text-xs text-gray-400">TVA</span>
                      <span className="font-body text-xs text-gray-500">{(basketSubtotal - basket.reduce((s, i) => s + i.priceHT, 0)).toFixed(2)}€</span>
                    </div>
                    {promoDiscount > 0 && (
                      <div className="flex justify-between mb-1">
                        <span className="font-body text-xs text-green-600">Réduction</span>
                        <span className="font-body text-xs font-semibold text-green-600">-{promoDiscount.toFixed(2)}€</span>
                      </div>
                    )}
                    <div className="flex justify-between pt-2 border-t border-blue-500/8">
                      <span className="font-body text-base font-bold text-blue-800">Total TTC</span>
                      <div className="flex items-center gap-2">
                        {promoDiscount > 0 && <span className="font-body text-xs text-gray-400 line-through">{basketSubtotal.toFixed(2)}€</span>}
                        <span className="font-body text-xl font-bold text-blue-500">{basketTotal.toFixed(2)}€</span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 flex gap-2">
                    <button onClick={() => { setBasket([]); setAppliedPromo(null); setManualDiscount(""); setPromoCode(""); }}
                      className="flex-1 py-2 rounded-lg font-body text-xs font-medium text-red-500 bg-red-50 border-none cursor-pointer hover:bg-red-100">
                      Vider le panier
                    </button>
                  </div>
                </>
              )}
            </Card>
          </div>
        </div>
      )}

      {/* ─── Journal des encaissements ─── */}
      {tab === "journal" && (
        <div>
          {loading ? <div className="text-center py-16"><Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto" /></div> :
          (() => {
            // Filtrage des encaissements
            // Construire le journal : encaissements réels + fallback anciens payments payés
            const encPaymentIds = new Set(encaissements.map((e: any) => e.paymentId));
            const fallbackLines = payments
              .filter(p => (p.status === "paid" || p.paidAmount > 0) && p.status !== "cancelled" && !encPaymentIds.has(p.id))
              .map(p => ({
                id: `fallback_${p.id}`,
                paymentId: p.id,
                familyId: p.familyId,
                familyName: p.familyName,
                montant: p.paidAmount || p.totalTTC || 0,
                mode: p.paymentMode || "",
                modeLabel: paymentModes.find(m => m.id === p.paymentMode)?.label || p.paymentMode || "—",
                ref: p.paymentRef || "",
                activityTitle: (p.items || []).map((i: any) => i.activityTitle).join(", "),
                date: p.date,
              }));
            
            let filtered = [...encaissements, ...fallbackLines];
            if (journalDateFrom) filtered = filtered.filter(e => { const d = e.date?.seconds ? new Date(e.date.seconds * 1000) : null; return d && d >= new Date(journalDateFrom); });
            if (journalDateTo) filtered = filtered.filter(e => { const d = e.date?.seconds ? new Date(e.date.seconds * 1000) : null; return d && d <= new Date(journalDateTo + "T23:59:59"); });
            if (journalMontantMin) filtered = filtered.filter(e => (e.montant || 0) >= safeNumber(journalMontantMin));
            if (journalMontantMax) filtered = filtered.filter(e => (e.montant || 0) <= safeNumber(journalMontantMax));
            if (journalMode !== "all") filtered = filtered.filter(e => e.mode === journalMode);
            if (journalSearch) { const q = journalSearch.toLowerCase(); filtered = filtered.filter(e => e.familyName?.toLowerCase().includes(q) || e.activityTitle?.toLowerCase().includes(q) || e.ref?.toLowerCase().includes(q)); }
            filtered.sort((a, b) => (b.date?.seconds || 0) - (a.date?.seconds || 0));

            // Totaux par mode
            const totalsByMode: Record<string, number> = {};
            filtered.forEach(e => { totalsByMode[e.mode || "autre"] = (totalsByMode[e.mode || "autre"] || 0) + (e.montant || 0); });
            const grandTotal = filtered.reduce((s, e) => s + (e.montant || 0), 0);

            return (
              <>
                {/* Totaux par mode — style Céléris */}
                <div className="flex flex-wrap gap-3 mb-4">
                  {Object.entries(totalsByMode).sort(([,a],[,b]) => b - a).map(([mode, total]) => {
                    const modeObj = paymentModes.find(m => m.id === mode);
                    return (
                      <div key={mode} onClick={() => setJournalMode(journalMode === mode ? "all" : mode)}
                        className={`flex flex-col items-center px-4 py-2.5 rounded-xl cursor-pointer transition-all ${journalMode === mode ? "bg-blue-500 text-white ring-2 ring-blue-300" : "bg-sand hover:bg-blue-50"}`}>
                        <div className={`font-body text-[10px] uppercase font-semibold ${journalMode === mode ? "text-white/70" : "text-gray-400"}`}>{modeObj?.label || mode}</div>
                        <div className={`font-body text-lg font-bold ${journalMode === mode ? "text-white" : "text-blue-800"}`}>{total.toFixed(2)}€</div>
                      </div>
                    );
                  })}
                  <div className="flex flex-col items-center px-4 py-2.5 rounded-xl bg-green-50">
                    <div className="font-body text-[10px] uppercase font-semibold text-green-600">Total encaissé</div>
                    <div className="font-body text-lg font-bold text-green-600">{grandTotal.toFixed(2)}€</div>
                  </div>
                </div>

                {/* Filtres */}
                <Card padding="sm" className="mb-4">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2">
                    <div><label className="font-body text-[10px] text-gray-400 uppercase block mb-0.5">Date de</label><input type="date" value={journalDateFrom} onChange={e => setJournalDateFrom(e.target.value)} className={inputCls} /></div>
                    <div><label className="font-body text-[10px] text-gray-400 uppercase block mb-0.5">Date à</label><input type="date" value={journalDateTo} onChange={e => setJournalDateTo(e.target.value)} className={inputCls} /></div>
                    <div><label className="font-body text-[10px] text-gray-400 uppercase block mb-0.5">Montant min</label><input type="number" step="0.01" placeholder="0" value={journalMontantMin} onChange={e => setJournalMontantMin(e.target.value)} className={inputCls} /></div>
                    <div><label className="font-body text-[10px] text-gray-400 uppercase block mb-0.5">Montant max</label><input type="number" step="0.01" placeholder="9999" value={journalMontantMax} onChange={e => setJournalMontantMax(e.target.value)} className={inputCls} /></div>
                  </div>
                  <div className="flex flex-wrap gap-2 items-center">
                    <select value={journalMode} onChange={e => setJournalMode(e.target.value)} className={`${inputCls} w-40`}>
                      <option value="all">Tous les modes</option>
                      {paymentModes.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                    </select>
                    <div className="relative flex-1 min-w-[150px]">
                      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" />
                      <input placeholder="Nom, prestation, référence…" value={journalSearch} onChange={e => setJournalSearch(e.target.value)} className={`${inputCls} !pl-9`} />
                    </div>
                    {(journalDateFrom || journalDateTo || journalMontantMin || journalMontantMax || journalMode !== "all" || journalSearch) && (
                      <button onClick={() => { setJournalDateFrom(""); setJournalDateTo(""); setJournalMontantMin(""); setJournalMontantMax(""); setJournalMode("all"); setJournalSearch(""); }}
                        className="font-body text-xs text-red-500 bg-red-50 px-3 py-1.5 rounded-lg border-none cursor-pointer hover:bg-red-100">Effacer</button>
                    )}
                    <span className="font-body text-xs text-gray-400">{filtered.length} mouvement{filtered.length > 1 ? "s" : ""}</span>
                  </div>
                </Card>

                {/* Tableau des encaissements — 1 ligne = 1 mouvement réel */}
                {filtered.length === 0 ? (
                  <Card padding="lg" className="text-center"><p className="font-body text-sm text-gray-500">{encaissements.length === 0 ? "Aucun encaissement enregistré." : "Aucun encaissement correspondant aux filtres."}</p></Card>
                ) : (
                  <Card className="!p-0 overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="bg-sand border-b border-blue-500/8">
                            {["Date", "Client", "Prestation", "Montant", "Mode", "Référence", ""].map(h => (
                              <th key={h} className="px-3 py-2.5 font-body text-[10px] font-semibold text-gray-400 uppercase tracking-wider text-left">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {filtered.map(enc => {
                            const d = enc.date?.seconds ? new Date(enc.date.seconds * 1000) : null;
                            return (
                              <tr key={enc.id} className={`border-b border-blue-500/5 hover:bg-blue-50/30 ${(enc.montant || 0) < 0 ? "bg-red-50/30" : ""}`}>
                                <td className="px-3 py-2.5 font-body text-xs text-gray-500">{d ? d.toLocaleDateString("fr-FR") : "—"}</td>
                                <td className="px-3 py-2.5 font-body text-sm font-semibold text-blue-800">{enc.familyName || "—"}</td>
                                <td className="px-3 py-2.5 font-body text-xs text-gray-500 max-w-[250px] truncate">
                                  {enc.activityTitle || "—"}
                                  {enc.correctionDe && <span className="text-red-400 ml-1">(annule #{enc.correctionDe.slice(-4)})</span>}
                                  {enc.raison && <span className="text-orange-400 ml-1">— {enc.raison}</span>}
                                </td>
                                <td className={`px-3 py-2.5 font-body text-sm font-bold ${(enc.montant || 0) < 0 ? "text-red-500" : "text-green-600"}`}>{(enc.montant || 0).toFixed(2)}€</td>
                                <td className="px-3 py-2.5"><Badge color={(enc.montant || 0) < 0 ? "red" : "blue"}>{enc.modeLabel || enc.mode || "—"}</Badge></td>
                                <td className="px-3 py-2.5 font-body text-xs text-gray-400">{enc.ref || "—"}</td>
                                <td className="px-3 py-2.5">
                                  {!enc.id?.startsWith("fallback_") && (enc.montant || 0) > 0 && !enc.correctionDe && (
                                    <button onClick={() => { setCorrectionEnc(enc); setCorrectionMontant(enc.montant?.toString() || ""); setCorrectionMode(enc.mode || ""); setCorrectionRef(enc.ref || ""); setCorrectionRaison(""); }}
                                      className="font-body text-[10px] text-orange-500 bg-orange-50 px-2 py-1 rounded border-none cursor-pointer hover:bg-orange-100">Corriger</button>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </Card>
                )}

                {/* Modale correction encaissement */}
                {correctionEnc && (
                  <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setCorrectionEnc(null)}>
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
                      <div className="p-5 border-b border-gray-100">
                        <h2 className="font-display text-lg font-bold text-blue-800">Corriger un encaissement</h2>
                        <p className="font-body text-xs text-gray-400 mt-1">
                          Une contre-passation sera créée (écriture négative), puis le bon encaissement sera enregistré. Les deux écritures restent visibles pour la traçabilité.
                        </p>
                      </div>
                      <div className="p-5">
                        <div className="bg-red-50 rounded-lg p-3 mb-4">
                          <div className="font-body text-xs text-red-500 font-semibold mb-1">Encaissement à corriger</div>
                          <div className="font-body text-sm text-blue-800">{correctionEnc.familyName} — {correctionEnc.activityTitle}</div>
                          <div className="font-body text-sm font-bold text-red-500">{(correctionEnc.montant || 0).toFixed(2)}€ ({correctionEnc.modeLabel || correctionEnc.mode})</div>
                        </div>

                        <div className="font-body text-xs font-semibold text-blue-800 mb-2">Raison de la correction *</div>
                        <input value={correctionRaison} onChange={e => setCorrectionRaison(e.target.value)} placeholder="Ex: erreur de montant, mauvais mode de paiement..."
                          className="w-full px-3 py-2 rounded-lg border border-blue-500/8 font-body text-sm bg-cream mb-3" />

                        <div className="font-body text-xs font-semibold text-blue-800 mb-2">Nouveau montant (0 = annulation pure)</div>
                        <input type="number" step="0.01" value={correctionMontant} onChange={e => setCorrectionMontant(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg border border-blue-500/8 font-body text-sm bg-cream mb-3" />

                        <div className="font-body text-xs font-semibold text-blue-800 mb-2">Mode de paiement</div>
                        <select value={correctionMode} onChange={e => setCorrectionMode(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg border border-blue-500/8 font-body text-sm bg-cream mb-3">
                          {paymentModes.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                        </select>

                        <div className="font-body text-xs font-semibold text-blue-800 mb-2">Référence</div>
                        <input value={correctionRef} onChange={e => setCorrectionRef(e.target.value)} placeholder="N° chèque, réf virement..."
                          className="w-full px-3 py-2 rounded-lg border border-blue-500/8 font-body text-sm bg-cream mb-4" />
                      </div>
                      <div className="p-5 border-t border-gray-100 flex gap-3">
                        <button onClick={() => setCorrectionEnc(null)}
                          className="flex-1 py-2.5 rounded-lg font-body text-sm text-gray-500 bg-gray-100 border-none cursor-pointer">Annuler</button>
                        <button onClick={async () => {
                          if (!correctionRaison) { toast("Indiquez la raison de la correction.", "warning"); return; }
                          const newMontant = safeNumber(correctionMontant);

                          // 1. Contre-passation (écriture négative)
                          await addDoc(collection(db, "encaissements"), {
                            paymentId: correctionEnc.paymentId,
                            familyId: correctionEnc.familyId,
                            familyName: correctionEnc.familyName,
                            montant: -(correctionEnc.montant || 0),
                            mode: correctionEnc.mode,
                            modeLabel: `ANNUL. ${correctionEnc.modeLabel || correctionEnc.mode}`,
                            ref: correctionEnc.ref || "",
                            activityTitle: correctionEnc.activityTitle,
                            raison: `Correction : ${correctionRaison}`,
                            correctionDe: correctionEnc.id,
                            date: serverTimestamp(),
                          });

                          // 2. Nouvel encaissement correct (si montant > 0)
                          if (newMontant > 0) {
                            await addDoc(collection(db, "encaissements"), {
                              paymentId: correctionEnc.paymentId,
                              familyId: correctionEnc.familyId,
                              familyName: correctionEnc.familyName,
                              montant: newMontant,
                              mode: correctionMode,
                              modeLabel: paymentModes.find(m => m.id === correctionMode)?.label || correctionMode,
                              ref: correctionRef,
                              activityTitle: correctionEnc.activityTitle,
                              raison: `Remplacement : ${correctionRaison}`,
                              date: serverTimestamp(),
                            });
                          }

                          // 3. Recalculer paidAmount du payment
                          if (correctionEnc.paymentId) {
                            const encSnap = await getDocs(query(collection(db, "encaissements"), where("paymentId", "==", correctionEnc.paymentId)));
                            const totalEnc = encSnap.docs.reduce((s, d) => s + (d.data().montant || 0), 0);
                            const payDocRef = doc(db, "payments", correctionEnc.paymentId);
                            const paySnap2 = await getDoc(payDocRef);
                            if (paySnap2.exists()) {
                              const totalTTC = paySnap2.data().totalTTC || 0;
                              await updateDoc(payDocRef, {
                                paidAmount: Math.max(0, totalEnc),
                                status: totalEnc >= totalTTC ? "paid" : totalEnc > 0 ? "partial" : "pending",
                              });
                            }
                          }

                          setCorrectionEnc(null);
                          await refreshAll();
                        }}
                          className="flex-1 py-2.5 rounded-lg font-body text-sm font-semibold text-white bg-orange-500 border-none cursor-pointer hover:bg-orange-600">
                          Contre-passer et corriger
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </>
            );
          })()}
        </div>
      )}

      {/* ─── Historique Tab ─── */}
      {tab === "historique" && (
        <div>
          {loading ? (
            <div className="text-center py-16"><Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto" /></div>
          ) : (() => {
            // Filtres
            const [modeFilter, setModeFilter] = [histModeFilter, setHistModeFilter];
            const [statusFilter, setStatusFilter] = [histStatusFilter, setHistStatusFilter];
            const [searchFilter, setSearchFilter] = [histSearch, setHistSearch];
            const [periodFilter, setPeriodFilter] = [histPeriod, setHistPeriod];

            // Filtrage — exclure les annulés par défaut
            let filtered = payments.filter(p => p.status !== "cancelled");
            if (modeFilter !== "all") filtered = filtered.filter(p => p.paymentMode === modeFilter);
            if (statusFilter !== "all") filtered = filtered.filter(p => p.status === statusFilter);
            if (searchFilter) {
              const q = searchFilter.toLowerCase();
              filtered = filtered.filter(p => p.familyName?.toLowerCase().includes(q) || (p.items || []).some((i: any) => i.activityTitle?.toLowerCase().includes(q)));
            }
            if (periodFilter) {
              filtered = filtered.filter(p => {
                const d = p.date?.seconds ? new Date(p.date.seconds * 1000) : null;
                if (!d) return false;
                const m = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
                return m === periodFilter;
              });
            }

            // Totaux par mode
            const totalsByMode: Record<string, number> = {};
            filtered.forEach(p => { totalsByMode[p.paymentMode] = (totalsByMode[p.paymentMode] || 0) + (p.totalTTC || 0); });
            const grandTotal = filtered.reduce((s, p) => s + (p.totalTTC || 0), 0);

            return (
              <>
                {/* KPIs par mode */}
                <div className="flex flex-wrap gap-3 mb-4">
                  {Object.entries(totalsByMode).sort(([,a],[,b]) => b - a).map(([mode, total]) => {
                    const modeObj = paymentModes.find(m => m.id === mode);
                    return (
                      <div key={mode} onClick={() => setHistModeFilter(modeFilter === mode ? "all" : mode as any)}
                        className={`flex flex-col items-center px-4 py-2.5 rounded-xl cursor-pointer transition-all ${modeFilter === mode ? "bg-blue-500 text-white ring-2 ring-blue-300" : "bg-sand hover:bg-blue-50"}`}>
                        <div className={`font-body text-[10px] uppercase font-semibold ${modeFilter === mode ? "text-white/70" : "text-gray-400"}`}>
                          {modeObj?.label?.split("(")[0]?.trim() || mode}
                        </div>
                        <div className={`font-body text-base font-bold ${modeFilter === mode ? "text-white" : "text-blue-800"}`}>{total.toFixed(2)}€</div>
                      </div>
                    );
                  })}
                  <div className="flex flex-col items-center px-4 py-2.5 rounded-xl bg-blue-50">
                    <div className="font-body text-[10px] uppercase font-semibold text-blue-400">Total</div>
                    <div className="font-body text-base font-bold text-blue-500">{grandTotal.toFixed(2)}€</div>
                  </div>
                </div>

                {/* Filtres : statut + recherche + période */}
                <div className="flex flex-wrap gap-3 mb-4 items-center">
                  <div className="flex gap-1.5">
                    {([["all", "Tous"], ["paid", "Réglés"], ["pending", "À régler"], ["partial", "Partiels"]] as const).map(([val, label]) => (
                      <button key={val} onClick={() => setHistStatusFilter(val as any)}
                        className={`font-body text-xs px-3 py-1.5 rounded-lg border-none cursor-pointer transition-all ${histStatusFilter === val ? "bg-blue-500 text-white" : "bg-white text-gray-500 border border-gray-200"}`}>
                        {label}
                      </button>
                    ))}
                  </div>
                  <div className="relative flex-1 min-w-[200px]">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" />
                    <input placeholder="Rechercher par nom ou prestation…" value={histSearch} onChange={e => setHistSearch(e.target.value)}
                      className="w-full font-body text-xs border border-gray-200 rounded-lg pl-9 pr-3 py-2 bg-white focus:outline-none focus:border-blue-400" />
                  </div>
                  <input type="month" value={histPeriod} onChange={e => setHistPeriod(e.target.value)}
                    className="font-body text-xs border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-blue-400" />
                  {(modeFilter !== "all" || statusFilter !== "all" || searchFilter || periodFilter) && (
                    <button onClick={() => { setHistModeFilter("all"); setHistStatusFilter("all"); setHistSearch(""); setHistPeriod(""); }}
                      className="font-body text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg border-none cursor-pointer hover:bg-red-100">
                      Réinitialiser
                    </button>
                  )}
                  <span className="font-body text-xs text-gray-400">{filtered.length} paiement{filtered.length > 1 ? "s" : ""}</span>
                </div>

                {/* Tableau */}
                {filtered.length === 0 ? (
                  <Card padding="lg" className="text-center">
                    <p className="font-body text-sm text-gray-500">Aucun paiement correspondant aux filtres.</p>
                  </Card>
                ) : (
                  <Card className="!p-0 overflow-hidden">
                    <div className="px-5 py-3 bg-sand border-b border-blue-500/8 flex font-body text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                      <span className="w-20">Date</span>
                      <span className="w-20">N° Facture</span>
                      <span className="flex-1">Client</span>
                      <span className="w-32">Prestations</span>
                      <span className="w-20 text-right">Montant</span>
                      <span className="w-20 text-center">Mode</span>
                      <span className="w-16 text-center">Statut</span>
                      <span className="w-16 text-center">PDF</span>
                    </div>
                    {filtered.map((p, idx) => {
                      const date = p.date?.seconds ? new Date(p.date.seconds * 1000) : new Date();
                      const mode = paymentModes.find((m) => m.id === p.paymentMode);
                      const invoiceNum = `F${date.getFullYear()}-${String(payments.length - payments.indexOf(p)).padStart(3, "0")}`;
                      const ht = (p.items || []).reduce((s: number, i: any) => s + (i.priceHT || 0), 0);
                      const printInvoice = async () => {
                        const res = await fetch("/api/facture", {
                          method: "POST", headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            invoiceNumber: invoiceNum, date: date.toLocaleDateString("fr-FR"),
                            familyName: p.familyName, familyAddress: "",
                            items: p.items || [], totalHT: ht,
                            totalTVA: (p.totalTTC || 0) - ht, totalTTC: p.totalTTC || 0,
                            paymentMode: mode?.label || p.paymentMode, paymentRef: p.paymentRef || "",
                            paidAmount: p.paidAmount || p.totalTTC || 0, status: p.status,
                          }),
                        });
                        const html = await res.text();
                        const w = window.open("", "_blank");
                        if (w) { w.document.write(html); w.document.close(); setTimeout(() => w.print(), 500); }
                      };
                      return (
                        <div key={p.id || idx} className="px-5 py-3 border-b border-blue-500/8 last:border-b-0 flex items-center hover:bg-blue-50/30 transition-colors">
                          <span className="w-20 font-body text-xs text-gray-400">{date.toLocaleDateString("fr-FR")}</span>
                          <span className="w-20 font-body text-xs font-semibold text-blue-800">{invoiceNum}</span>
                          <span className="flex-1"><div className="font-body text-sm font-semibold text-blue-800">{p.familyName}</div></span>
                          <span className="w-32 font-body text-xs text-gray-500 truncate">{(p.items || []).map((i: any) => i.activityTitle).join(", ")}</span>
                          <span className="w-20 text-right font-body text-sm font-bold text-blue-500">{p.totalTTC?.toFixed(2)}€</span>
                          <span className="w-20 text-center"><Badge color="blue">{(p.paymentMode as string) === "mixte" && (p as any).paymentModes ? (p as any).paymentModes.map((m: string) => paymentModes.find(pm => pm.id === m)?.label?.split(" ")[0] || m).join(" + ") : mode?.label?.split(" ")[0] || p.paymentMode}</Badge></span>
                          <span className="w-16 text-center"><Badge color={p.status === "paid" ? "green" : p.status === "partial" ? "orange" : p.status === "draft" ? "blue" : "gray"}>{p.status === "paid" ? "Réglé" : p.status === "partial" ? "Partiel" : p.status === "draft" ? "Brouillon" : "À régler"}</Badge></span>
                          <span className="w-16 text-center"><button onClick={printInvoice} className="font-body text-xs text-blue-500 bg-blue-50 px-2 py-1 rounded cursor-pointer border-none hover:bg-blue-100"><Receipt size={12} /></button></span>
                        </div>
                      );
                    })}
                  </Card>
                )}
              </>
            );
          })()}
        </div>
      )}
      {/* ─── Échéances Tab ─── */}
      {tab === "echeances" && (
        <div>
          {loading ? <div className="text-center py-16"><Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto" /></div> :
          (() => {
            // Filtrer les paiements qui font partie d'un échéancier
            const echeances = payments.filter(p => (p as any).echeancesTotal > 1);
            
            // Grouper par famille + forfaitRef
            const groupes: Record<string, typeof echeances> = {};
            echeances.forEach(p => {
              const key = `${p.familyId}_${(p as any).forfaitRef || ""}`;
              if (!groupes[key]) groupes[key] = [];
              groupes[key].push(p);
            });

            // Trier chaque groupe par numéro d'échéance
            Object.values(groupes).forEach(g => g.sort((a: any, b: any) => (a.echeance || 0) - (b.echeance || 0)));

            const groupesList = Object.entries(groupes);

            return groupesList.length === 0 ? (
              <Card padding="lg" className="text-center">
                <CreditCard size={28} className="text-gray-300 mx-auto mb-3" />
                <p className="font-body text-sm text-gray-500">Aucun paiement échelonné. Les échéanciers sont créés automatiquement quand un forfait est souscrit en 3x ou 10x depuis le planning.</p>
              </Card>
            ) : (
              <div className="flex flex-col gap-4">
                {groupesList.map(([key, echs]) => {
                  const first = echs[0];
                  const totalForfait = echs.reduce((s, e) => s + (e.totalTTC || 0), 0);
                  const totalPaye = echs.reduce((s, e) => s + (e.paidAmount || 0), 0);
                  const nbPayes = echs.filter(e => e.status === "paid").length;
                  const nbTotal = echs.length;
                  const today = new Date().toISOString().split("T")[0];

                  return (
                    <Card key={key} padding="md">
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <div className="font-body text-sm font-semibold text-blue-800">{first.familyName}</div>
                          <div className="font-body text-xs text-gray-400">{(first as any).forfaitRef || (first.items || []).map((i: any) => i.activityTitle).join(", ")}</div>
                        </div>
                        <div className="text-right">
                          <div className="font-body text-base font-bold text-blue-500">{totalForfait.toFixed(2)}€</div>
                          <div className="font-body text-[10px] text-gray-400">{nbPayes}/{nbTotal} échéances payées</div>
                        </div>
                      </div>
                      {/* Détail des items du forfait (depuis la première échéance) */}
                      {(first.items || []).length > 0 && (
                        <div className="mb-3 bg-sand rounded-lg p-2">
                          {(first.items || []).map((item: any, idx: number) => (
                            <div key={idx} className="flex justify-between font-body text-[11px] py-0.5">
                              <span className="text-gray-600">{item.activityTitle}</span>
                              <span className="text-blue-500 font-semibold">{(item.priceTTC || 0).toFixed(2)}€</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Barre de progression */}
                      <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden mb-3">
                        <div className={`h-full rounded-full ${nbPayes === nbTotal ? "bg-green-500" : "bg-blue-400"}`} style={{ width: `${(nbPayes / nbTotal) * 100}%` }} />
                      </div>

                      {/* Grille des échéances */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {echs.map((e: any) => {
                          const isPaid = e.status === "paid";
                          const isOverdue = !isPaid && e.echeanceDate && e.echeanceDate < today;
                          const isCurrent = !isPaid && !isOverdue;
                          return (
                            <div key={e.id} className={`flex items-center justify-between px-3 py-2 rounded-lg ${isPaid ? "bg-green-50" : isOverdue ? "bg-red-50" : "bg-sand"}`}>
                              <div className="flex items-center gap-2">
                                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${isPaid ? "bg-green-500 text-white" : isOverdue ? "bg-red-500 text-white" : "bg-gray-200 text-gray-500"}`}>
                                  {isPaid ? <Check size={12} /> : e.echeance}
                                </div>
                                <div>
                                  <div className={`font-body text-xs font-semibold ${isPaid ? "text-green-700" : isOverdue ? "text-red-600" : "text-blue-800"}`}>
                                    Échéance {e.echeance}/{e.echeancesTotal}
                                  </div>
                                  <div className="font-body text-[10px] text-gray-400">
                                    {e.echeanceDate ? new Date(e.echeanceDate).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) : "—"}
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className={`font-body text-sm font-bold ${isPaid ? "text-green-600" : isOverdue ? "text-red-500" : "text-blue-500"}`}>{(e.totalTTC || 0).toFixed(2)}€</span>
                                {isPaid && <Badge color="green">Payé</Badge>}
                                {isOverdue && <Badge color="red">En retard</Badge>}
                                {isCurrent && !isPaid && (
                                  <div className="flex gap-1 flex-wrap">
                                    {[
                                      { id: "cb_terminal", label: "CB", color: "bg-blue-500" },
                                      { id: "cheque", label: "Chq", color: "bg-orange-500" },
                                      { id: "especes", label: "Esp", color: "bg-green-600" },
                                      { id: "virement", label: "Vir", color: "bg-purple-500" },
                                    ].map(m => (
                                      <button key={m.id} onClick={async () => {
                                        await enregistrerEncaissement(e.id, e, e.totalTTC || 0, m.id, "",
                                          (e as any).forfaitRef || (first as any).forfaitRef || (e.items || []).map((i: any) => i.activityTitle).join(", "));
                                        await refreshAll();
                                        toast(`${(e.totalTTC || 0).toFixed(2)}€ encaissé (${m.label})`, "success");
                                      }}
                                        className={`font-body text-[9px] font-semibold text-white ${m.color} px-2 py-1 rounded border-none cursor-pointer`}>
                                        {m.label}
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </Card>
                  );
                })}
              </div>
            );
          })()}
        </div>
      )}

      {/* ─── Impayés Tab ─── */}
      {tab === "impayes" && (
        <div>
          {loading ? <div className="text-center py-16"><Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto" /></div> :
          (() => {
            const unpaid = payments.filter(p => {
              if (p.status === "cancelled" || p.status === "paid") return false;
              if ((p.paidAmount || 0) >= (p.totalTTC || 0)) return false;
              // Exclure les échéances individuelles (elles sont dans l'onglet Échéances)
              if ((p as any).echeancesTotal > 1) return false;
              return true;
            });
            const totalDue = unpaid.reduce((s, p) => s + ((p.totalTTC || 0) - (p.paidAmount || 0)), 0);
            return unpaid.length === 0 ? (
              <Card padding="lg" className="text-center"><div className="w-14 h-14 rounded-2xl bg-green-50 flex items-center justify-center mx-auto mb-3"><Check size={28} className="text-green-400" /></div><p className="font-body text-sm text-gray-500">Aucun impayé ! Toutes les factures sont réglées.</p></Card>
            ) : (
              <div>
                <Card padding="sm" className="mb-4 flex items-center gap-3">
                  <span className="font-body text-2xl font-bold text-red-500">{totalDue.toFixed(2)}€</span>
                  <span className="font-body text-xs text-gray-400">total impayé sur {unpaid.length} facture{unpaid.length > 1 ? "s" : ""}</span>
                </Card>
                <div className="flex flex-col gap-3">
                  {unpaid.map(p => {
                    const date = p.date?.seconds ? new Date(p.date.seconds * 1000) : new Date();
                    const due = (p.totalTTC || 0) - (p.paidAmount || 0);
                    const daysLate = Math.floor((Date.now() - date.getTime()) / 86400000);
                    return (
                      <Card key={p.id} padding="md">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="font-body text-sm font-semibold text-blue-800">{p.familyName}</div>
                            <div className="font-body text-xs text-gray-400 truncate">{(p.items||[]).map((i:any)=>i.activityTitle).join(", ")} · {date.toLocaleDateString("fr-FR")}</div>
                            {daysLate > 30 && <div className="font-body text-xs text-red-500 mt-1">{daysLate} jours de retard</div>}
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <div>
                              <div className="font-body text-lg font-bold text-red-500">{due.toFixed(2)}€</div>
                              <div className="font-body text-[10px] text-gray-400">dû sur {(p.totalTTC || 0).toFixed(2)}€</div>
                            </div>
                            <Badge color={daysLate > 60 ? "red" : daysLate > 30 ? "orange" : "gray"}>
                              {daysLate > 60 ? "Urgent" : daysLate > 30 ? "Relance" : "Récent"}
                            </Badge>
                            <button onClick={async () => {
                              const fam = families.find(f => f.firestoreId === p.familyId);
                              const email = fam?.parentEmail || "";
                              if (!email) { toast("Pas d'email pour cette famille.", "warning"); return; }
                              const emailData = emailTemplates.rappelImpaye({
                                parentName: p.familyName || "",
                                montant: due,
                                prestations: (p.items||[]).map((i:any) => i.activityTitle).join(", "),
                              });
                              try {
                                fetch("/api/send-email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to: email, ...emailData }) }).catch(e => console.warn("Email:", e));
                                toast(`Relance envoyée à ${email}`);
                              } catch (e) { console.error(e); toast("Erreur envoi.", "error"); }
                            }}
                              className="font-body text-xs text-blue-500 bg-blue-50 px-3 py-1.5 rounded-lg border-none cursor-pointer hover:bg-blue-100 whitespace-nowrap">
                              Relancer
                            </button>
                          </div>
                        </div>
                        {/* Détail des lignes avec bouton retirer */}
                        {(p.items || []).length > 1 && (
                          <div className="mt-2 pt-2 border-t border-gray-100">
                            {(p.items || []).map((item: any, idx: number) => (
                              <div key={idx} className="flex items-center justify-between py-1 font-body text-xs">
                                <span className="text-gray-500 flex-1 min-w-0 truncate">{item.childName ? `${item.childName} — ` : ""}{item.activityTitle}{item.date ? ` · ${new Date(item.date).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })}` : ""}{item.startTime ? ` ${item.startTime}` : ""}</span>
                                <div className="flex items-center gap-2 flex-shrink-0">
                                  <span className="text-blue-500 font-semibold">{(item.priceTTC || 0).toFixed(2)}€</span>
                                  <button onClick={() => {
                                    if (!confirm(`Retirer "${item.childName || ""} — ${item.activityTitle}" (${(item.priceTTC||0).toFixed(2)}€) ?\n\nL'enfant sera désinscrit du créneau.`)) return;
                                    removePaymentItem(p, idx);
                                  }} title="Désinscrire et retirer cette prestation"
                                    className="text-red-400 hover:text-red-600 bg-transparent border-none cursor-pointer p-0.5"><X size={12} /></button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                        {/* Boutons actions commande */}
                        <div className="mt-2 pt-2 border-t border-gray-100 flex flex-wrap gap-1.5 justify-between">
                          <div className="flex gap-1.5">
                            <button onClick={async () => {
                              const items = p.items || [];
                              const totalHT = items.reduce((s: number, i: any) => s + (i.priceHT || 0), 0);
                              const totalTTC = p.totalTTC || 0;
                              const totalTVA = totalTTC - totalHT;
                              const invDate = p.date?.seconds ? new Date(p.date.seconds * 1000) : new Date();
                              const invoiceNumber = (p as any).orderId || `F-${invDate.getFullYear()}${String(invDate.getMonth()+1).padStart(2,"0")}-${(p.id || "").slice(-4).toUpperCase()}`;
                              try {
                                const res = await fetch("/api/invoice", {
                                  method: "POST", headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({
                                    invoiceNumber, date: invDate.toLocaleDateString("fr-FR"),
                                    familyName: p.familyName, familyEmail: families.find(f => f.firestoreId === p.familyId)?.parentEmail || "",
                                    items, totalHT, totalTVA, totalTTC,
                                    paidAmount: p.paidAmount || 0,
                                    paymentMode: p.paymentMode ? (paymentModes.find(m => m.id === p.paymentMode)?.label || p.paymentMode) : "",
                                    paymentDate: p.paidAmount > 0 ? invDate.toLocaleDateString("fr-FR") : "",
                                  }),
                                });
                                const data = await res.json();
                                if (data.html) {
                                  const w = window.open("", "_blank");
                                  if (w) { w.document.write(data.html); w.document.close(); w.print(); }
                                }
                              } catch (e) { console.error(e); toast("Erreur génération facture", "error"); }
                            }}
                              className="font-body text-[10px] text-green-600 bg-green-50 px-2.5 py-1 rounded border-none cursor-pointer hover:bg-green-100 flex items-center gap-1">
                              <Receipt size={10} /> Facture
                            </button>
                            <button onClick={() => setDuplicateTarget({ payment: p, targetFamilyId: "", targetSearch: "" })}
                              className="font-body text-[10px] text-blue-500 bg-blue-50 px-2.5 py-1 rounded border-none cursor-pointer hover:bg-blue-100 flex items-center gap-1">
                              <Plus size={10} /> Dupliquer
                            </button>
                          </div>
                          <button onClick={() => deletePaymentCommand(p)}
                            className="font-body text-[10px] text-red-500 bg-red-50 px-2.5 py-1 rounded border-none cursor-pointer hover:bg-red-100 flex items-center gap-1">
                            <Trash2 size={10} /> Annuler
                          </button>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              </div>
            );
          })()}
        </div>
      )}
      {/* Modale duplication commande */}
      {duplicateTarget && (() => {
        const p = duplicateTarget.payment;
        const searchLower = duplicateTarget.targetSearch.toLowerCase();
        const filteredFams = families.filter(f =>
          f.parentName?.toLowerCase().includes(searchLower) ||
          (f.children || []).some((c: any) => c.firstName?.toLowerCase().includes(searchLower))
        ).slice(0, 8);
        return (
          <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setDuplicateTarget(null)}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
              <div className="p-5 border-b border-gray-100">
                <h2 className="font-display text-lg font-bold text-blue-800">Dupliquer la commande</h2>
                <p className="font-body text-xs text-gray-400 mt-1">
                  {(p.items || []).map((i: any) => i.activityTitle).join(", ")} — {safeNumber(p.totalTTC).toFixed(2)}€
                </p>
              </div>
              <div className="p-5 flex flex-col gap-3">
                {/* Option 1 : même famille */}
                <button onClick={async () => { await duplicatePayment(p); }}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-lg border border-blue-200 bg-blue-50 cursor-pointer hover:bg-blue-100 text-left">
                  <div className="w-10 h-10 rounded-lg bg-blue-200 flex items-center justify-center font-body text-sm font-bold text-blue-700">
                    {(p.familyName || "?")[0]}
                  </div>
                  <div>
                    <div className="font-body text-sm font-semibold text-blue-800">{p.familyName}</div>
                    <div className="font-body text-xs text-gray-400">Même famille (mêmes enfants)</div>
                  </div>
                </button>

                {/* Séparateur */}
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-px bg-gray-200" />
                  <span className="font-body text-[10px] text-gray-400 uppercase">ou pour une autre famille</span>
                  <div className="flex-1 h-px bg-gray-200" />
                </div>

                {/* Recherche famille */}
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" />
                  <input value={duplicateTarget.targetSearch}
                    onChange={e => setDuplicateTarget({ ...duplicateTarget, targetSearch: e.target.value })}
                    placeholder="Chercher une famille..."
                    className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-blue-500/8 font-body text-sm bg-cream focus:border-blue-500 focus:outline-none" />
                </div>

                {duplicateTarget.targetSearch && (
                  <div className="flex flex-col gap-1 max-h-[200px] overflow-y-auto">
                    {filteredFams.length === 0 ? (
                      <p className="font-body text-xs text-gray-400 text-center py-2">Aucune famille trouvée</p>
                    ) : filteredFams.map(f => (
                      <button key={f.firestoreId} onClick={async () => { await duplicatePayment(p, f.firestoreId); }}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border border-gray-200 bg-white cursor-pointer hover:bg-blue-50 text-left">
                        <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center font-body text-xs font-bold text-gray-500">
                          {(f.parentName || "?")[0]}
                        </div>
                        <div>
                          <div className="font-body text-sm font-semibold text-blue-800">{f.parentName}</div>
                          <div className="font-body text-xs text-gray-400">{(f.children || []).map((c: any) => c.firstName).join(", ") || "Pas d'enfant"}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="p-5 border-t border-gray-100">
                <button onClick={() => setDuplicateTarget(null)}
                  className="w-full py-2.5 rounded-lg font-body text-sm text-gray-500 bg-gray-100 border-none cursor-pointer">Annuler</button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
