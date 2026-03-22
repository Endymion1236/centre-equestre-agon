"use client";

import { useState, useEffect } from "react";
import { collection, getDocs, addDoc, deleteDoc, updateDoc, doc, getDoc, serverTimestamp, query, where, orderBy, limit } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Card, Badge, Button } from "@/components/ui";
import { Plus, Trash2, ShoppingCart, CreditCard, Check, Loader2, Search, X, Receipt, AlertTriangle } from "lucide-react";
import type { Family, Activity } from "@/types";

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
      setPayments(paySnap.docs.map((d) => ({ id: d.id, ...d.data() })) as any);
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
    const encSnap = await getDocs(query(collection(db, "encaissements"), where("paymentId", "==", paymentId)));
    const totalEncaisse = encSnap.docs.reduce((s, d) => s + (d.data().montant || 0), 0) + montant;
    // Note : le doc qu'on vient de créer n'est peut-être pas encore dans le snapshot, donc on ajoute montant
    const realTotal = Math.round(totalEncaisse * 100) / 100;
    const totalTTC = paymentData.totalTTC || 0;
    const newStatus = realTotal >= totalTTC ? "paid" : realTotal > 0 ? "partial" : "pending";

    // 3. Mettre à jour le payment avec paidAmount calculé
    await updateDoc(doc(db, "payments", paymentId), {
      paidAmount: realTotal,
      status: newStatus,
      updatedAt: serverTimestamp(),
    });

    return { paidAmount: realTotal, status: newStatus };
  };

  // Rafraîchir les données
  const refreshAll = async () => {
    const [paySnap, encSnap, avoirsSnap] = await Promise.all([
      getDocs(query(collection(db, "payments"), orderBy("date", "desc"), limit(200))),
      getDocs(query(collection(db, "encaissements"), orderBy("date", "desc"), limit(500))),
      getDocs(collection(db, "avoirs")),
    ]);
    setPayments(paySnap.docs.map((d) => ({ id: d.id, ...d.data() })) as any);
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

  const deletePaymentCommand = async (payment: any) => {
    const totalEnc = getTotalEncaisse(payment);

    if (totalEnc === 0) {
      // Non encaissé → suppression libre
      if (!confirm(`Supprimer cette commande de ${(payment.totalTTC || 0).toFixed(2)}€ pour ${payment.familyName} ?\n\nAucun encaissement — suppression simple.`)) return;
      await deleteDoc(doc(db, "payments", payment.id));
      alert("Commande supprimée.");
    } else {
      // Encaissé → avoir automatique
      if (!confirm(`${totalEnc.toFixed(2)}€ ont déjà été encaissés.\n\nUn avoir de ${totalEnc.toFixed(2)}€ sera créé automatiquement pour ${payment.familyName}.\n\nConfirmer l'annulation ?`)) return;

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

      alert(`Commande annulée.\nAvoir créé : ${totalEnc.toFixed(2)}€ (réf. ${ref})`);
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
      // Non encaissé → modification libre
      if (!confirm(`Retirer "${itemToRemove.activityTitle}" (${(itemToRemove.priceTTC || 0).toFixed(2)}€) ?`)) return;

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
      const msg = tropPercu > 0
        ? `Retirer "${itemToRemove.activityTitle}" ?\n\n${tropPercu.toFixed(2)}€ de trop-perçu → un avoir sera créé.`
        : `Retirer "${itemToRemove.activityTitle}" ?`;
      if (!confirm(msg)) return;

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

  const basketSubtotal = basket.reduce((s, i) => s + i.priceTTC, 0);
  const promoDiscount = appliedPromo
    ? (appliedPromo.discountMode === "percent" ? basketSubtotal * appliedPromo.discountValue / 100 : appliedPromo.discountValue)
    : (parseFloat(manualDiscount) || 0);
  const basketTotal = Math.max(0, basketSubtotal - promoDiscount);

  const applyPromoCode = () => {
    const found = promos.find((p: any) => p.type === "code" && p.code === promoCode.toUpperCase() && p.active && (p.appliesTo === "paiement" || p.appliesTo === "tout"));
    if (found) {
      if (found.maxUses > 0 && found.usedCount >= found.maxUses) { alert("Ce code a atteint son nombre max d'utilisations."); return; }
      if (found.validUntil && new Date(found.validUntil) < new Date()) { alert("Ce code a expiré."); return; }
      setAppliedPromo({ label: found.label, discountMode: found.discountMode, discountValue: found.discountValue });
      setManualDiscount("");
    } else {
      alert("Code promo invalide ou non applicable aux paiements.");
    }
  };

  const filteredFamilies = familySearch
    ? families.filter((f) => f.parentName?.toLowerCase().includes(familySearch.toLowerCase()) || f.parentEmail?.toLowerCase().includes(familySearch.toLowerCase()))
    : families;

  const addToBasket = () => {
    if (customLabel && customPrice) {
      const price = parseFloat(customPrice);
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
    const paid = paidAmount ? parseFloat(paidAmount) : basketTotal;

    const payRef = await addDoc(collection(db, "payments"), {
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

      <div className="flex gap-2 mb-6">
        {([["encaisser", "Encaisser", ShoppingCart], ["journal", "Journal", Receipt], ["historique", "Historique", Receipt], ["echeances", "Échéances", Receipt], ["impayes", "Impayés", Receipt]] as const).map(([id, label, Icon]) => (
          <button key={id} onClick={() => setTab(id as any)}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-lg border font-body text-sm font-medium cursor-pointer transition-all
              ${tab === id ? "bg-blue-500 text-white border-blue-500" : "bg-white text-gray-500 border-gray-200"}`}>
            <Icon size={16} /> {label}
            {id === "impayes" && payments.filter(p => p.status !== "cancelled" && (p.status === "partial" || (p.paidAmount || 0) < (p.totalTTC || 0))).length > 0 && (
              <span className="bg-red-500 text-white text-[10px] w-5 h-5 rounded-full flex items-center justify-center">{payments.filter(p => p.status !== "cancelled" && (p.status === "partial" || ((p.paidAmount || 0) < (p.totalTTC || 0) && p.status !== "paid"))).length}</span>
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

              const encaisserTout = async (payModeId: string) => {
                try {
                  for (const p of familyPending) {
                    await updateDoc(doc(db, "payments", p.id!), {
                      status: "paid",
                      paidAmount: p.totalTTC || 0,
                      paymentMode: payModeId,
                      date: serverTimestamp(),
                    });
                  }
                  alert(`${totalPending.toFixed(2)}€ encaissé pour ${family.parentName} (${familyPending.length} prestation${familyPending.length > 1 ? "s" : ""}) !`);
                  const paySnap = await getDocs(query(collection(db, "payments"), orderBy("date", "desc"), limit(200)));
                  setPayments(paySnap.docs.map((d) => ({ id: d.id, ...d.data() })) as any);
                } catch (e) { console.error(e); alert("Erreur."); }
              };

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
                              alert(`${toUse.toFixed(2)}€ d'avoir utilisé !`);
                              await refreshAll();
                            } catch (e) { console.error(e); alert("Erreur."); }
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
                      {paidAmount && parseFloat(paidAmount) < totalPending && parseFloat(paidAmount) > 0 && (
                        <div className="font-body text-xs text-orange-500 mt-1">
                          Paiement partiel — reste dû après : {(totalPending - parseFloat(paidAmount)).toFixed(2)}€
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
                      const montant = paidAmount ? parseFloat(paidAmount) : totalPending;
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
                        alert(`${montant.toFixed(2)}€ encaissé (${paymentModes.find(m => m.id === paymentMode)?.label || paymentMode}) pour ${family.parentName} !${resteFinal > 0 ? `\nReste dû : ${resteFinal.toFixed(2)}€` : "\nTout est réglé !"}`);
                        setPaidAmount("");
                        setPaymentRef("");
                        await refreshAll();
                      } catch (e) { console.error(e); alert("Erreur."); }
                    }}
                      className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-body text-base font-semibold text-white bg-green-600 border-none cursor-pointer hover:bg-green-500 transition-colors">
                      <Check size={18} />
                      Encaisser {(paidAmount ? parseFloat(paidAmount) : totalPending).toFixed(2)}€
                      {paidAmount && parseFloat(paidAmount) < totalPending ? " (partiel)" : ` (${familyPending.length} prestation${familyPending.length > 1 ? "s" : ""})`}
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
                <select value={selectedActivity} onChange={(e) => setSelectedActivity(e.target.value)} className={`${inputCls} flex-1`}>
                  <option value="">Choisir une activité...</option>
                  {activities.filter((a) => a.active !== false).map((a, idx) => {
                    const ttc = (a as any).priceTTC || (a.priceHT || 0) * (1 + (a.tvaTaux || 5.5) / 100);
                    return <option key={`${a.firestoreId}-${idx}`} value={a.firestoreId}>{a.title} — {ttc.toFixed(2)}€ TTC</option>;
                  })}
                </select>
                <button onClick={addToBasket} disabled={!selectedActivity}
                  className={`px-4 py-2 rounded-lg font-body text-sm font-semibold border-none cursor-pointer
                    ${selectedActivity ? "bg-blue-500 text-white" : "bg-gray-200 text-gray-400"}`}>
                  <Plus size={16} />
                </button>
              </div>

              {/* Custom item */}
              <div className="font-body text-xs text-gray-400 mb-2">— ou saisie libre —</div>
              <div className="flex gap-2">
                <input value={customLabel} onChange={(e) => setCustomLabel(e.target.value)} placeholder="Libellé (ex: Licence FFE)" className={`${inputCls} flex-1`} />
                <input value={customPrice} onChange={(e) => setCustomPrice(e.target.value)} placeholder="Prix TTC" type="number" step="0.01" className={`${inputCls} w-24`} />
                <button onClick={addToBasket} disabled={!customLabel || !customPrice}
                  className={`px-4 py-2 rounded-lg font-body text-sm font-semibold border-none cursor-pointer
                    ${customLabel && customPrice ? "bg-gold-400 text-blue-800" : "bg-gray-200 text-gray-400"}`}>
                  <Plus size={16} />
                </button>
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
                  {paidAmount && parseFloat(paidAmount) < basketTotal && (
                    <div className="font-body text-xs text-orange-500 mt-1">
                      Paiement partiel — reste dû : {(basketTotal - parseFloat(paidAmount)).toFixed(2)}€
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
            if (journalMontantMin) filtered = filtered.filter(e => (e.montant || 0) >= parseFloat(journalMontantMin));
            if (journalMontantMax) filtered = filtered.filter(e => (e.montant || 0) <= parseFloat(journalMontantMax));
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
                            {["Date", "Client", "Prestation", "Montant", "Mode", "Référence"].map(h => (
                              <th key={h} className="px-3 py-2.5 font-body text-[10px] font-semibold text-gray-400 uppercase tracking-wider text-left">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {filtered.map(enc => {
                            const d = enc.date?.seconds ? new Date(enc.date.seconds * 1000) : null;
                            return (
                              <tr key={enc.id} className="border-b border-blue-500/5 hover:bg-blue-50/30">
                                <td className="px-3 py-2.5 font-body text-xs text-gray-500">{d ? d.toLocaleDateString("fr-FR") : "—"}</td>
                                <td className="px-3 py-2.5 font-body text-sm font-semibold text-blue-800">{enc.familyName || "—"}</td>
                                <td className="px-3 py-2.5 font-body text-xs text-gray-500 max-w-[250px] truncate">{enc.activityTitle || "—"}</td>
                                <td className="px-3 py-2.5 font-body text-sm font-bold text-green-600">{(enc.montant || 0).toFixed(2)}€</td>
                                <td className="px-3 py-2.5"><Badge color="blue">{enc.modeLabel || enc.mode || "—"}</Badge></td>
                                <td className="px-3 py-2.5 font-body text-xs text-gray-400">{enc.ref || "—"}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </Card>
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

            // Filtrage
            let filtered = [...payments];
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
                    {([["all", "Tous"], ["paid", "Encaissé"], ["pending", "En attente"], ["partial", "Partiel"]] as const).map(([val, label]) => (
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
                          <span className="w-20 text-center"><Badge color="blue">{mode?.label?.split(" ")[0] || p.paymentMode}</Badge></span>
                          <span className="w-16 text-center"><Badge color={p.status === "paid" ? "green" : p.status === "partial" ? "orange" : "gray"}>{p.status === "paid" ? "Payé" : p.status === "partial" ? "Partiel" : "Att."}</Badge></span>
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
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <div className="font-body text-sm font-semibold text-blue-800">{first.familyName}</div>
                          <div className="font-body text-xs text-gray-400">{(first as any).forfaitRef || (first.items || []).map((i: any) => i.activityTitle).join(", ")}</div>
                        </div>
                        <div className="text-right">
                          <div className="font-body text-base font-bold text-blue-500">{totalForfait.toFixed(2)}€</div>
                          <div className="font-body text-[10px] text-gray-400">{nbPayes}/{nbTotal} échéances payées</div>
                        </div>
                      </div>

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
                                  <button onClick={async () => {
                                    const mode = prompt(`Encaisser ${(e.totalTTC || 0).toFixed(2)}€\n\n1=CB  2=Chèque  3=Espèces  4=Virement`);
                                    if (!mode) return;
                                    const modeMap: Record<string,string> = {"1":"cb_terminal","2":"cheque","3":"especes","4":"virement"};
                                    await enregistrerEncaissement(e.id, e, e.totalTTC || 0, modeMap[mode] || "cb_terminal", "",
                                      (e as any).forfaitRef || (first as any).forfaitRef || (e.items || []).map((i: any) => i.activityTitle).join(", "));
                                    await refreshAll();
                                  }}
                                    className="font-body text-[10px] font-semibold text-white bg-green-600 px-2 py-1 rounded border-none cursor-pointer hover:bg-green-500">
                                    Encaisser
                                  </button>
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
            const unpaid = payments.filter(p => p.status !== "cancelled" && (p.status === "partial" || p.status === "pending" || ((p.paidAmount || 0) < (p.totalTTC || 0) && p.status !== "paid")));
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
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="font-body text-sm font-semibold text-blue-800">{p.familyName}</div>
                            <div className="font-body text-xs text-gray-400">{(p.items||[]).map((i:any)=>i.activityTitle).join(", ")} · {date.toLocaleDateString("fr-FR")}</div>
                            {daysLate > 30 && <div className="font-body text-xs text-red-500 mt-1">{daysLate} jours de retard</div>}
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="text-right">
                              <div className="font-body text-lg font-bold text-red-500">{due.toFixed(2)}€</div>
                              <div className="font-body text-[10px] text-gray-400">dû sur {(p.totalTTC || 0).toFixed(2)}€</div>
                            </div>
                            <Badge color={daysLate > 60 ? "red" : daysLate > 30 ? "orange" : "gray"}>
                              {daysLate > 60 ? "Urgent" : daysLate > 30 ? "Relance" : "Récent"}
                            </Badge>
                            <button onClick={() => {
                              const fam = families.find(f => f.firestoreId === p.familyId);
                              const email = fam?.parentEmail || "";
                              const subject = encodeURIComponent(`Rappel de paiement — Centre Équestre d'Agon-Coutainville`);
                              const body = encodeURIComponent(
                                `Bonjour ${p.familyName},\n\nNous nous permettons de vous rappeler qu'un solde de ${due.toFixed(2)}€ reste dû pour les prestations suivantes :\n${(p.items||[]).map((i:any) => `- ${i.activityTitle} (${i.priceTTC?.toFixed(2) || "—"}€)`).join("\n")}\n\nMerci de régulariser votre situation à votre convenance.\n\nCordialement,\nCentre Équestre d'Agon-Coutainville\n02 44 84 99 96`
                              );
                              window.open(`mailto:${email}?subject=${subject}&body=${body}`, "_blank");
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
                                <span className="text-gray-500">{item.activityTitle}</span>
                                <div className="flex items-center gap-2">
                                  <span className="text-blue-500 font-semibold">{(item.priceTTC || 0).toFixed(2)}€</span>
                                  <button onClick={() => removePaymentItem(p, idx)}
                                    className="text-red-400 hover:text-red-600 bg-transparent border-none cursor-pointer p-0.5"><X size={12} /></button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                        {/* Bouton supprimer la commande */}
                        <div className="mt-2 pt-2 border-t border-gray-100 flex justify-end">
                          <button onClick={() => deletePaymentCommand(p)}
                            className="font-body text-[10px] text-red-500 bg-red-50 px-2.5 py-1 rounded border-none cursor-pointer hover:bg-red-100 flex items-center gap-1">
                            <Trash2 size={10} /> Annuler la commande
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
    </div>
  );
}
