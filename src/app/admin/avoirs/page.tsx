"use client";

import { useState, useEffect, useMemo } from "react";
import { collection, getDocs, addDoc, updateDoc, doc, serverTimestamp, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Card, Badge } from "@/components/ui";
import {
  Plus, Search, Loader2, X, Save, Wallet, CreditCard, TrendingDown, TrendingUp, Check, BadgeEuro,
} from "lucide-react";
import type { Family } from "@/types";

// ─── Types ───
type AvoirType = "avoir" | "avance";
type AvoirStatus = "actif" | "utilise" | "expire" | "annule";

interface Avoir {
  id: string;
  familyId: string;
  familyName: string;
  type: AvoirType;
  amount: number;
  usedAmount: number;
  remainingAmount: number;
  reason: string;
  reference: string; // N° avoir ou référence paiement
  expiryDate: any;
  status: AvoirStatus;
  usageHistory: { date: string; amount: number; invoiceRef: string }[];
  createdAt: any;
  updatedAt: any;
}

const statusColors: Record<AvoirStatus, "green" | "blue" | "orange" | "gray" | "red"> = {
  actif: "green", utilise: "gray", expire: "orange", annule: "red",
};

export default function AvoirsPage() {
  const [tab, setTab] = useState<"actifs" | "creer" | "historique">("actifs");
  const [avoirs, setAvoirs] = useState<Avoir[]>([]);
  const [families, setFamilies] = useState<(Family & { firestoreId: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // Create form
  const [selFamily, setSelFamily] = useState("");
  const [avoirType, setAvoirType] = useState<AvoirType>("avoir");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [expiryMonths, setExpiryMonths] = useState("12");
  const [saving, setSaving] = useState(false);

  // Use avoir
  const [showUseModal, setShowUseModal] = useState(false);
  const [useAvoirId, setUseAvoirId] = useState<string | null>(null);
  const [useAmount, setUseAmount] = useState("");
  const [useInvoiceRef, setUseInvoiceRef] = useState("");

  const fetchData = async () => {
    try {
      const [aSnap, fSnap] = await Promise.all([
        getDocs(collection(db, "avoirs")),
        getDocs(collection(db, "families")),
      ]);
      setAvoirs(aSnap.docs.map(d => ({ id: d.id, ...d.data() } as Avoir)));
      setFamilies(fSnap.docs.map(d => ({ firestoreId: d.id, ...d.data() } as any)));
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  // ─── Computed ───
  const activeAvoirs = useMemo(() => avoirs.filter(a => a.status === "actif"), [avoirs]);
  const usedAvoirs = useMemo(() => avoirs.filter(a => a.status === "utilise"), [avoirs]);
  const expiredAvoirs = useMemo(() => avoirs.filter(a => a.status === "expire" || a.status === "annule"), [avoirs]);

  const totalActif = activeAvoirs.reduce((s, a) => s + (a.remainingAmount || 0), 0);
  const totalAvoirs = activeAvoirs.filter(a => a.type === "avoir").reduce((s, a) => s + (a.remainingAmount || 0), 0);
  const totalAvances = activeAvoirs.filter(a => a.type === "avance").reduce((s, a) => s + (a.remainingAmount || 0), 0);

  const filtered = useMemo(() => {
    const list = tab === "actifs" ? activeAvoirs : tab === "historique" ? [...usedAvoirs, ...expiredAvoirs] : [];
    if (!search) return list;
    const q = search.toLowerCase();
    return list.filter(a => a.familyName?.toLowerCase().includes(q) || a.reference?.toLowerCase().includes(q));
  }, [tab, activeAvoirs, usedAvoirs, expiredAvoirs, search]);

  // ─── Create ───
  const createAvoir = async () => {
    if (!selFamily || !amount) return;
    setSaving(true);
    const fam = families.find(f => f.firestoreId === selFamily);
    const amt = parseFloat(amount);
    const expiry = new Date();
    expiry.setMonth(expiry.getMonth() + parseInt(expiryMonths));
    const ref = `${avoirType === "avoir" ? "AV" : "AVA"}-${Date.now().toString(36).toUpperCase()}`;

    try {
      await addDoc(collection(db, "avoirs"), {
        familyId: selFamily,
        familyName: fam?.parentName || "",
        type: avoirType,
        amount: amt,
        usedAmount: 0,
        remainingAmount: amt,
        reason,
        reference: ref,
        expiryDate: Timestamp.fromDate(expiry),
        status: "actif",
        usageHistory: [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setSelFamily("");
      setAmount("");
      setReason("");
      setTab("actifs");
      fetchData();
    } catch (e) {
      console.error(e);
      alert("Erreur lors de la création.");
    }
    setSaving(false);
  };

  // ─── Use avoir ───
  const handleUseAvoir = async () => {
    if (!useAvoirId || !useAmount) return;
    setSaving(true);
    const avoir = avoirs.find(a => a.id === useAvoirId);
    if (!avoir) return;
    const amt = parseFloat(useAmount);
    const newUsed = (avoir.usedAmount || 0) + amt;
    const newRemaining = avoir.amount - newUsed;
    const newHistory = [...(avoir.usageHistory || []), {
      date: new Date().toISOString(),
      amount: amt,
      invoiceRef: useInvoiceRef || "—",
    }];
    try {
      await updateDoc(doc(db, "avoirs", useAvoirId), {
        usedAmount: newUsed,
        remainingAmount: Math.max(0, newRemaining),
        status: newRemaining <= 0 ? "utilise" : "actif",
        usageHistory: newHistory,
        updatedAt: serverTimestamp(),
      });
      setShowUseModal(false);
      setUseAvoirId(null);
      setUseAmount("");
      setUseInvoiceRef("");
      fetchData();
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  // ─── Helpers ───
  const formatDate = (d: any): string => {
    if (!d) return "—";
    const date = d.toDate ? d.toDate() : new Date(d);
    return date.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
  };
  const daysUntilExpiry = (d: any): number => {
    if (!d) return 9999;
    const target = d.toDate ? d.toDate() : new Date(d);
    return Math.ceil((target.getTime() - Date.now()) / 86400000);
  };

  const inputStyle = "w-full font-body text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 bg-white";
  const labelStyle = "font-body text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 block";

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-blue-500" /></div>;

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-blue-800">Avoirs & avances</h1>
          <p className="font-body text-xs text-gray-400">Gérer les avoirs clients et les avances versées</p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <Card padding="sm" className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center"><Wallet size={18} className="text-blue-500" /></div>
          <div>
            <div className="font-body text-xl font-bold text-blue-500">{totalActif.toFixed(2)}€</div>
            <div className="font-body text-xs text-gray-400">solde total actif</div>
          </div>
        </Card>
        <Card padding="sm" className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center"><TrendingDown size={18} className="text-orange-500" /></div>
          <div>
            <div className="font-body text-xl font-bold text-orange-500">{totalAvoirs.toFixed(2)}€</div>
            <div className="font-body text-xs text-gray-400">{activeAvoirs.filter(a => a.type === "avoir").length} avoir{activeAvoirs.filter(a => a.type === "avoir").length > 1 ? "s" : ""}</div>
          </div>
        </Card>
        <Card padding="sm" className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center"><TrendingUp size={18} className="text-green-600" /></div>
          <div>
            <div className="font-body text-xl font-bold text-green-600">{totalAvances.toFixed(2)}€</div>
            <div className="font-body text-xs text-gray-400">{activeAvoirs.filter(a => a.type === "avance").length} avance{activeAvoirs.filter(a => a.type === "avance").length > 1 ? "s" : ""}</div>
          </div>
        </Card>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        {[
          { id: "actifs" as const, label: `Actifs (${activeAvoirs.length})` },
          { id: "creer" as const, label: "Créer un avoir / avance" },
          { id: "historique" as const, label: `Historique (${usedAvoirs.length + expiredAvoirs.length})` },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`font-body text-sm font-semibold px-5 py-2.5 rounded-xl border-none cursor-pointer transition-colors ${
              tab === t.id ? "bg-blue-500 text-white" : "bg-white text-gray-500 border border-gray-200"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Search */}
      {(tab === "actifs" || tab === "historique") && (
        <div className="relative mb-5">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" />
          <input type="text" placeholder="Rechercher par famille ou référence…" value={search} onChange={e => setSearch(e.target.value)}
            className={`${inputStyle} !pl-9`} />
        </div>
      )}

      {/* ─── Actifs / Historique ─── */}
      {(tab === "actifs" || tab === "historique") && (
        <>
          {filtered.length === 0 ? (
            <Card padding="lg" className="text-center">
              <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto mb-3">
                <Wallet size={28} className="text-blue-300" />
              </div>
              <p className="font-body text-sm text-gray-500">
                {tab === "actifs" ? "Aucun avoir ou avance actif." : "Aucun historique."}
              </p>
            </Card>
          ) : (
            <div className="flex flex-col gap-3">
              {filtered.map(a => {
                const pctUsed = a.amount > 0 ? Math.round((a.usedAmount / a.amount) * 100) : 0;
                const daysLeft = daysUntilExpiry(a.expiryDate);
                const expiringSoon = daysLeft > 0 && daysLeft <= 30;
                return (
                  <Card key={a.id} padding="md">
                    <div className="flex items-center gap-4">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${a.type === "avoir" ? "bg-orange-50" : "bg-green-50"}`}>
                        {a.type === "avoir" ? <TrendingDown size={18} className="text-orange-500" /> : <TrendingUp size={18} className="text-green-600" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-body text-sm font-semibold text-blue-800">{a.familyName}</span>
                          <Badge color={a.type === "avoir" ? "orange" : "green"}>{a.type === "avoir" ? "Avoir" : "Avance"}</Badge>
                          <Badge color={statusColors[a.status]}>{a.status}</Badge>
                          {expiringSoon && <Badge color="red">Expire dans {daysLeft}j</Badge>}
                        </div>
                        <div className="font-body text-xs text-gray-400 mt-0.5">
                          Réf. {a.reference} · Créé le {formatDate(a.createdAt)} · Expire le {formatDate(a.expiryDate)}
                          {a.reason && <> · {a.reason}</>}
                        </div>
                        {/* Progress bar */}
                        <div className="flex items-center gap-2 mt-2">
                          <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${pctUsed > 80 ? "bg-gray-300" : "bg-blue-300"}`} style={{ width: `${pctUsed}%` }} />
                          </div>
                          <span className="font-body text-xs text-gray-400">{a.usedAmount.toFixed(2)}€ / {a.amount.toFixed(2)}€ utilisé</span>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className={`font-body text-xl font-bold ${a.remainingAmount > 0 ? "text-blue-500" : "text-gray-300"}`}>
                          {a.remainingAmount.toFixed(2)}€
                        </div>
                        <div className="font-body text-[10px] text-gray-400">restant</div>
                        {a.status === "actif" && (
                          <button onClick={() => { setUseAvoirId(a.id); setUseAmount(""); setUseInvoiceRef(""); setShowUseModal(true); }}
                            className="mt-2 font-body text-xs text-blue-500 bg-blue-50 px-3 py-1 rounded-lg border-none cursor-pointer hover:bg-blue-100">
                            Utiliser
                          </button>
                        )}
                      </div>
                    </div>
                    {/* Usage history */}
                    {(a.usageHistory || []).length > 0 && (
                      <div className="mt-3 pt-3 border-t border-gray-100">
                        <div className="font-body text-[10px] text-gray-400 uppercase tracking-wider mb-1">Utilisations</div>
                        {(a.usageHistory || []).map((u: any, i: number) => (
                          <div key={i} className="flex justify-between font-body text-xs text-gray-500 py-0.5">
                            <span>{new Date(u.date).toLocaleDateString("fr-FR")} · {u.invoiceRef}</span>
                            <span className="font-semibold">-{u.amount.toFixed(2)}€</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ─── Créer ─── */}
      {tab === "creer" && (
        <Card padding="md">
          <h3 className="font-body text-base font-semibold text-blue-800 mb-4">Créer un avoir ou une avance</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelStyle}>Type</label>
              <div className="flex gap-2">
                {([["avoir", "Avoir (remboursement)"], ["avance", "Avance (acompte)"]] as const).map(([v, l]) => (
                  <button key={v} onClick={() => setAvoirType(v)}
                    className={`flex-1 py-2.5 rounded-lg font-body text-sm font-medium border cursor-pointer transition-all
                      ${avoirType === v ? "bg-blue-500 text-white border-blue-500" : "bg-white text-gray-500 border-gray-200"}`}>
                    {l}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className={labelStyle}>Famille *</label>
              <select className={inputStyle} value={selFamily} onChange={e => setSelFamily(e.target.value)}>
                <option value="">— Sélectionner —</option>
                {families.map(f => <option key={f.firestoreId} value={f.firestoreId}>{f.parentName}</option>)}
              </select>
            </div>
            <div>
              <label className={labelStyle}>Montant (€) *</label>
              <input type="number" step="0.01" className={inputStyle} value={amount} onChange={e => setAmount(e.target.value)} placeholder="Ex: 57.00" />
            </div>
            <div>
              <label className={labelStyle}>Validité (mois)</label>
              <select className={inputStyle} value={expiryMonths} onChange={e => setExpiryMonths(e.target.value)}>
                <option value="3">3 mois</option>
                <option value="6">6 mois</option>
                <option value="12">12 mois</option>
                <option value="24">24 mois</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className={labelStyle}>Motif</label>
              <input className={inputStyle} value={reason} onChange={e => setReason(e.target.value)}
                placeholder="Ex: Annulation balade pour météo, Trop-perçu stage avril..." />
            </div>
          </div>
          <div className="flex justify-end mt-5">
            <button onClick={createAvoir} disabled={saving || !selFamily || !amount}
              className={`flex items-center gap-2 font-body text-sm font-semibold text-white bg-blue-500 px-6 py-2.5 rounded-lg border-none cursor-pointer hover:bg-blue-600
                ${(saving || !selFamily || !amount) ? "opacity-50 cursor-not-allowed" : ""}`}>
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
              Créer {avoirType === "avoir" ? "l'avoir" : "l'avance"}
            </button>
          </div>
        </Card>
      )}

      {/* ─── Modal : Utiliser un avoir ─── */}
      {showUseModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center" onClick={() => setShowUseModal(false)}>
          <div className="bg-white rounded-2xl w-full max-w-sm mx-4 shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center p-5 border-b border-gray-100">
              <h2 className="font-display text-lg font-bold text-blue-800">Utiliser un avoir</h2>
              <button onClick={() => setShowUseModal(false)} className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center cursor-pointer border-none"><X size={16} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className={labelStyle}>Montant à déduire (€) *</label>
                <input type="number" step="0.01" className={inputStyle} value={useAmount} onChange={e => setUseAmount(e.target.value)}
                  placeholder={`Max : ${avoirs.find(a => a.id === useAvoirId)?.remainingAmount.toFixed(2) || "0"}€`} />
              </div>
              <div>
                <label className={labelStyle}>Référence facture</label>
                <input className={inputStyle} value={useInvoiceRef} onChange={e => setUseInvoiceRef(e.target.value)} placeholder="Ex: F2026-042" />
              </div>
            </div>
            <div className="flex justify-end gap-3 p-5 border-t border-gray-100">
              <button onClick={() => setShowUseModal(false)}
                className="font-body text-sm text-gray-500 bg-white px-4 py-2.5 rounded-lg border border-gray-200 cursor-pointer">Annuler</button>
              <button onClick={handleUseAvoir} disabled={saving || !useAmount}
                className={`flex items-center gap-2 font-body text-sm font-semibold text-white bg-blue-500 px-5 py-2.5 rounded-lg border-none cursor-pointer
                  ${(saving || !useAmount) ? "opacity-50" : ""}`}>
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} Valider
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
