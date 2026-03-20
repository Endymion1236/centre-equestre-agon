"use client";

import { useState, useEffect } from "react";
import { collection, getDocs, addDoc, deleteDoc, doc, getDoc, serverTimestamp, query, orderBy, limit } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Card, Badge, Button } from "@/components/ui";
import { Plus, Trash2, ShoppingCart, CreditCard, Check, Loader2, Search, X, Receipt } from "lucide-react";
import type { Family, Activity } from "@/types";

type PaymentMode = "cb_terminal" | "cb_online" | "cheque" | "especes" | "cheque_vacances" | "pass_sport" | "ancv" | "virement" | "avoir";

interface BasketItem {
  id: string;
  activityTitle: string;
  childName: string;
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
  status: "paid" | "pending" | "partial";
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
  const [tab, setTab] = useState<"encaisser" | "historique" | "echeances" | "impayes">("encaisser");
  const [families, setFamilies] = useState<(Family & { firestoreId: string })[]>([]);
  const [activities, setActivities] = useState<(Activity & { firestoreId: string })[]>([]);
  const [payments, setPayments] = useState<(Payment & { id: string })[]>([]);
  const [loading, setLoading] = useState(true);

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
      getDocs(query(collection(db, "payments"), orderBy("date", "desc"), limit(50))),
      getDoc(doc(db, "settings", "promos")),
    ]).then(([famSnap, actSnap, paySnap, promoSnap]) => {
      setFamilies(famSnap.docs.map((d) => ({ firestoreId: d.id, ...d.data() })) as any);
      setActivities(actSnap.docs.map((d) => ({ firestoreId: d.id, ...d.data() })) as any);
      setPayments(paySnap.docs.map((d) => ({ id: d.id, ...d.data() })) as any);
      if (promoSnap.exists() && promoSnap.data().items) setPromos(promoSnap.data().items);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const family = families.find((f) => f.firestoreId === selectedFamily);
  const children = family?.children || [];
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
      childName: child?.firstName || "—",
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

    await addDoc(collection(db, "payments"), {
      familyId: selectedFamily,
      familyName: family?.parentName || "—",
      items: basket,
      totalTTC: basketTotal,
      paymentMode,
      paymentRef,
      status: paid >= basketTotal ? "paid" : "partial",
      paidAmount: paid,
      date: serverTimestamp(),
    });

    setBasket([]);
    setPaymentRef("");
    setPaidAmount("");
    setSaving(false);
    setSuccess(true);
    setTimeout(() => setSuccess(false), 3000);

    // Refresh payments
    const paySnap = await getDocs(query(collection(db, "payments"), orderBy("date", "desc"), limit(50)));
    setPayments(paySnap.docs.map((d) => ({ id: d.id, ...d.data() })) as any);
  };

  const inputCls = "w-full px-3 py-2.5 rounded-lg border border-blue-500/8 font-body text-sm bg-cream focus:border-blue-500 focus:outline-none";

  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-blue-800 mb-6">Paiements & facturation</h1>

      <div className="flex gap-2 mb-6">
        {([["encaisser", "Encaisser", ShoppingCart], ["historique", "Historique", Receipt], ["echeances", "Échéances", Receipt], ["impayes", "Impayés", Receipt]] as const).map(([id, label, Icon]) => (
          <button key={id} onClick={() => setTab(id as any)}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-lg border font-body text-sm font-medium cursor-pointer transition-all
              ${tab === id ? "bg-blue-500 text-white border-blue-500" : "bg-white text-gray-500 border-gray-200"}`}>
            <Icon size={16} /> {label}
            {id === "impayes" && payments.filter(p => p.status === "partial" || (p.paidAmount || 0) < (p.totalTTC || 0)).length > 0 && (
              <span className="bg-red-500 text-white text-[10px] w-5 h-5 rounded-full flex items-center justify-center">{payments.filter(p => p.status === "partial" || ((p.paidAmount || 0) < (p.totalTTC || 0) && p.status !== "paid")).length}</span>
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

      {/* ─── Historique Tab ─── */}
      {tab === "historique" && (
        <div>
          {loading ? (
            <div className="text-center py-16"><Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto" /></div>
          ) : payments.length === 0 ? (
            <Card padding="lg" className="text-center">
              <div className="w-14 h-14 rounded-2xl bg-green-50 flex items-center justify-center mx-auto mb-3"><CreditCard size={28} className="text-green-400" /></div>
              <p className="font-body text-sm text-gray-500">Aucun paiement enregistré.</p>
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
              {payments.map((p, idx) => {
                const date = p.date?.seconds ? new Date(p.date.seconds * 1000) : new Date();
                const mode = paymentModes.find((m) => m.id === p.paymentMode);
                const invoiceNum = `F${date.getFullYear()}-${String(payments.length - idx).padStart(3, "0")}`;
                const ht = (p.items || []).reduce((s: number, i: any) => s + (i.priceHT || 0), 0);
                const printInvoice = async () => {
                  const res = await fetch("/api/facture", {
                    method: "POST", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      invoiceNumber: invoiceNum,
                      date: date.toLocaleDateString("fr-FR"),
                      familyName: p.familyName,
                      familyAddress: "",
                      items: p.items || [],
                      totalHT: ht,
                      totalTVA: (p.totalTTC || 0) - ht,
                      totalTTC: p.totalTTC || 0,
                      paymentMode: mode?.label || p.paymentMode,
                      paymentRef: p.paymentRef || "",
                      paidAmount: p.paidAmount || p.totalTTC || 0,
                      status: p.status,
                    }),
                  });
                  const html = await res.text();
                  const w = window.open("", "_blank");
                  if (w) { w.document.write(html); w.document.close(); setTimeout(() => w.print(), 500); }
                };
                return (
                  <div key={p.id} className="px-5 py-3 border-b border-blue-500/8 last:border-b-0 flex items-center hover:bg-blue-50/30 transition-colors">
                    <span className="w-20 font-body text-xs text-gray-400">{date.toLocaleDateString("fr-FR")}</span>
                    <span className="w-20 font-body text-xs font-semibold text-blue-800">{invoiceNum}</span>
                    <span className="flex-1">
                      <div className="font-body text-sm font-semibold text-blue-800">{p.familyName}</div>
                    </span>
                    <span className="w-32 font-body text-xs text-gray-500 truncate">
                      {(p.items || []).map((i: any) => i.activityTitle).join(", ")}
                    </span>
                    <span className="w-20 text-right font-body text-sm font-bold text-blue-500">{p.totalTTC?.toFixed(2)}€</span>
                    <span className="w-20 text-center">
                      <Badge color="blue">{mode?.label?.split(" ")[0] || p.paymentMode}</Badge>
                    </span>
                    <span className="w-16 text-center">
                      <Badge color={p.status === "paid" ? "green" : p.status === "partial" ? "orange" : "gray"}>
                        {p.status === "paid" ? "Payé" : p.status === "partial" ? "Partiel" : "—"}
                      </Badge>
                    </span>
                    <span className="w-16 text-center">
                      <button onClick={printInvoice} className="font-body text-xs text-blue-500 bg-blue-50 px-2 py-1 rounded cursor-pointer border-none hover:bg-blue-100">📄</button>
                    </span>
                  </div>
                );
              })}
            </Card>
          )}
        </div>
      )}
      {/* ─── Échéances Tab ─── */}
      {tab === "echeances" && (
        <div>
          <Card padding="md" className="mb-4 bg-blue-50 border-blue-500/8">
            <div className="font-body text-sm text-blue-800">💡 <strong>Tableau des échéances :</strong> Suivi des paiements en 3x ou 10x. Les échéances Stripe sont prélevées automatiquement. Les échéances manuelles doivent être relancées.</div>
          </Card>
          {loading ? <div className="text-center py-16"><Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto" /></div> :
          (() => {
            const installments = payments.filter(p => p.paymentRef?.includes("x") || (p.totalTTC || 0) > (p.paidAmount || 0));
            return installments.length === 0 ? (
              <Card padding="lg" className="text-center"><p className="font-body text-sm text-gray-500">Aucun paiement échelonné.</p></Card>
            ) : (
              <Card className="!p-0 overflow-hidden">
                <div className="px-5 py-3 bg-sand border-b border-blue-500/8 flex font-body text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                  <span className="flex-1">Client</span>
                  <span className="w-32">Prestation</span>
                  <span className="w-20 text-right">Total</span>
                  <span className="w-20 text-right">Payé</span>
                  <span className="w-20 text-right">Reste</span>
                  <span className="w-24 text-center">Progression</span>
                </div>
                {installments.map(p => {
                  const paid = p.paidAmount || 0;
                  const total = p.totalTTC || 0;
                  const rest = total - paid;
                  const pct = total > 0 ? (paid / total) * 100 : 0;
                  return (
                    <div key={p.id} className="px-5 py-3 border-b border-blue-500/8 flex items-center">
                      <span className="flex-1 font-body text-sm font-semibold text-blue-800">{p.familyName}</span>
                      <span className="w-32 font-body text-xs text-gray-500 truncate">{(p.items||[]).map((i:any)=>i.activityTitle).join(", ")}</span>
                      <span className="w-20 text-right font-body text-sm text-gray-500">{total.toFixed(2)}€</span>
                      <span className="w-20 text-right font-body text-sm font-semibold text-green-600">{paid.toFixed(2)}€</span>
                      <span className="w-20 text-right font-body text-sm font-semibold text-orange-500">{rest.toFixed(2)}€</span>
                      <span className="w-24 flex items-center gap-2"><div className="flex-1 h-2 rounded-full bg-gray-100"><div className="h-2 rounded-full bg-blue-500" style={{width:`${pct}%`}}/></div><span className="font-body text-[10px] text-gray-400">{Math.round(pct)}%</span></span>
                    </div>
                  );
                })}
              </Card>
            );
          })()}
        </div>
      )}

      {/* ─── Impayés Tab ─── */}
      {tab === "impayes" && (
        <div>
          {loading ? <div className="text-center py-16"><Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto" /></div> :
          (() => {
            const unpaid = payments.filter(p => p.status === "partial" || p.status === "pending" || ((p.paidAmount || 0) < (p.totalTTC || 0) && p.status !== "paid"));
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
