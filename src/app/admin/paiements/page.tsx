"use client";

import { useState, useEffect } from "react";
import { collection, getDocs, addDoc, deleteDoc, doc, serverTimestamp, query, orderBy, limit } from "firebase/firestore";
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

const paymentModes: { id: PaymentMode; label: string; icon: string }[] = [
  { id: "cb_terminal", label: "CB (terminal)", icon: "💳" },
  { id: "cb_online", label: "CB en ligne (Stripe)", icon: "🌐" },
  { id: "cheque", label: "Chèque", icon: "📝" },
  { id: "especes", label: "Espèces", icon: "💶" },
  { id: "cheque_vacances", label: "Chèques vacances", icon: "🏖️" },
  { id: "pass_sport", label: "Pass'Sport", icon: "🎽" },
  { id: "ancv", label: "ANCV", icon: "🎫" },
  { id: "virement", label: "Virement", icon: "🏦" },
  { id: "avoir", label: "Avoir", icon: "🔄" },
];

export default function PaiementsPage() {
  const [tab, setTab] = useState<"encaisser" | "historique">("encaisser");
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

  useEffect(() => {
    Promise.all([
      getDocs(collection(db, "families")),
      getDocs(collection(db, "activities")),
      getDocs(query(collection(db, "payments"), orderBy("date", "desc"), limit(50))),
    ]).then(([famSnap, actSnap, paySnap]) => {
      setFamilies(famSnap.docs.map((d) => ({ firestoreId: d.id, ...d.data() })) as any);
      setActivities(actSnap.docs.map((d) => ({ firestoreId: d.id, ...d.data() })) as any);
      setPayments(paySnap.docs.map((d) => ({ id: d.id, ...d.data() })) as any);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const family = families.find((f) => f.firestoreId === selectedFamily);
  const children = family?.children || [];
  const basketTotal = basket.reduce((s, i) => s + i.priceTTC, 0);

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
        {([["encaisser", "Encaisser", ShoppingCart], ["historique", "Historique", Receipt]] as const).map(([id, label, Icon]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-lg border font-body text-sm font-medium cursor-pointer transition-all
              ${tab === id ? "bg-blue-500 text-white border-blue-500" : "bg-white text-gray-500 border-gray-200"}`}>
            <Icon size={16} /> {label}
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
                      <span>{m.icon}</span> {m.label}
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
                      ⚠️ Paiement partiel — reste dû : {(basketTotal - parseFloat(paidAmount)).toFixed(2)}€
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

                  {/* Totals */}
                  <div className="border-t border-blue-500/8 pt-3">
                    <div className="flex justify-between mb-1">
                      <span className="font-body text-xs text-gray-400">Total HT</span>
                      <span className="font-body text-xs text-gray-500">{basket.reduce((s, i) => s + i.priceHT, 0).toFixed(2)}€</span>
                    </div>
                    <div className="flex justify-between mb-1">
                      <span className="font-body text-xs text-gray-400">TVA</span>
                      <span className="font-body text-xs text-gray-500">{(basketTotal - basket.reduce((s, i) => s + i.priceHT, 0)).toFixed(2)}€</span>
                    </div>
                    <div className="flex justify-between pt-2 border-t border-blue-500/8">
                      <span className="font-body text-base font-bold text-blue-800">Total TTC</span>
                      <span className="font-body text-xl font-bold text-blue-500">{basketTotal.toFixed(2)}€</span>
                    </div>
                  </div>

                  <div className="mt-3 flex gap-2">
                    <button onClick={() => setBasket([])}
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
              <span className="text-4xl block mb-3">💳</span>
              <p className="font-body text-sm text-gray-500">Aucun paiement enregistré.</p>
            </Card>
          ) : (
            <Card className="!p-0 overflow-hidden">
              <div className="px-5 py-3 bg-sand border-b border-blue-500/8 flex font-body text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                <span className="w-20">Date</span>
                <span className="flex-1">Client</span>
                <span className="w-32">Prestations</span>
                <span className="w-20 text-right">Montant</span>
                <span className="w-24 text-center">Mode</span>
                <span className="w-20 text-center">Statut</span>
              </div>
              {payments.map((p) => {
                const date = p.date?.seconds ? new Date(p.date.seconds * 1000) : new Date();
                const mode = paymentModes.find((m) => m.id === p.paymentMode);
                return (
                  <div key={p.id} className="px-5 py-3 border-b border-blue-500/8 last:border-b-0 flex items-center hover:bg-blue-50/30 transition-colors">
                    <span className="w-20 font-body text-xs text-gray-400">{date.toLocaleDateString("fr-FR")}</span>
                    <span className="flex-1">
                      <div className="font-body text-sm font-semibold text-blue-800">{p.familyName}</div>
                    </span>
                    <span className="w-32 font-body text-xs text-gray-500">
                      {(p.items || []).map((i: any) => i.activityTitle).join(", ")}
                    </span>
                    <span className="w-20 text-right font-body text-sm font-bold text-blue-500">{p.totalTTC?.toFixed(2)}€</span>
                    <span className="w-24 text-center">
                      <Badge color="blue">{mode?.icon} {mode?.label?.split(" ")[0] || p.paymentMode}</Badge>
                    </span>
                    <span className="w-20 text-center">
                      <Badge color={p.status === "paid" ? "green" : p.status === "partial" ? "orange" : "gray"}>
                        {p.status === "paid" ? "Payé" : p.status === "partial" ? "Partiel" : "En attente"}
                      </Badge>
                    </span>
                  </div>
                );
              })}
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
