"use client";

import { useState, useEffect, useMemo } from "react";
import { collection, getDocs, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Card, Badge } from "@/components/ui";
import {
  Loader2, Search, ShoppingCart, Receipt, Users, ChevronDown, ChevronUp,
  Check, X, AlertTriangle,
} from "lucide-react";
import type { Family } from "@/types";

interface PanierItem {
  id: string;
  source: string;
  sourceId: string;
  childName: string;
  label: string;
  priceHT: number;
  tvaTaux: number;
  priceTTC: number;
  date: string;
  invoiced: boolean;
}

interface FamilyPanier {
  familyId: string;
  familyName: string;
  items: PanierItem[];
  totalTTC: number;
  totalInvoiced: number;
  totalPending: number;
}

const payModes = [
  { id: "cb_terminal", label: "CB Terminal" },
  { id: "cheque", label: "Cheque" },
  { id: "especes", label: "Especes" },
  { id: "cb_online", label: "Stripe" },
  { id: "virement", label: "Virement" },
  { id: "cheque_vacances", label: "Cheques vacances" },
  { id: "pass_sport", label: "Pass Sport" },
  { id: "avoir", label: "Avoir" },
];

const sourceLabels: Record<string, string> = {
  reservation: "Reservation", forfait: "Forfait", carte: "Carte",
  passage: "Passage", licence: "Licence", pension: "Pension", autre: "Autre",
};
const sourceColors: Record<string, "blue" | "green" | "orange" | "purple" | "gray"> = {
  reservation: "blue", forfait: "green", carte: "orange",
  passage: "purple", licence: "gray", pension: "blue", autre: "gray",
};

export default function PaniersPage() {
  const [families, setFamilies] = useState<(Family & { firestoreId: string })[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [reservations, setReservations] = useState<any[]>([]);
  const [cartes, setCartes] = useState<any[]>([]);
  const [forfaits, setForfaits] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [expandedFamily, setExpandedFamily] = useState<string | null>(null);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [invoicingFamily, setInvoicingFamily] = useState<FamilyPanier | null>(null);
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [payMode, setPayMode] = useState("cb_terminal");
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<"all" | "pending" | "invoiced">("pending");

  const fetchData = async () => {
    try {
      const [fSnap, pSnap, rSnap, cSnap, foSnap] = await Promise.all([
        getDocs(collection(db, "families")),
        getDocs(collection(db, "payments")),
        getDocs(collection(db, "reservations")),
        getDocs(collection(db, "cartes")),
        getDocs(collection(db, "forfaits")),
      ]);
      setFamilies(fSnap.docs.map(d => ({ firestoreId: d.id, ...d.data() } as any)));
      setPayments(pSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setReservations(rSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setCartes(cSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setForfaits(foSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const familyPaniers = useMemo((): FamilyPanier[] => {
    const paidIds = new Set<string>();
    payments.forEach((p: any) => (p.items || []).forEach((i: any) => { if (i.reservationId) paidIds.add(i.reservationId); }));

    return families.map(fam => {
      const items: PanierItem[] = [];

      reservations.filter((r: any) => r.familyId === fam.firestoreId && r.status === "confirmed").forEach((r: any) => {
        const ttc = r.priceTTC || 0;
        items.push({ id: "res-" + r.id, source: "reservation", sourceId: r.id, childName: r.childName || "", label: r.activityTitle || "Reservation", priceHT: ttc / 1.055, tvaTaux: 5.5, priceTTC: ttc, date: r.date || "", invoiced: paidIds.has(r.id) });
      });

      cartes.filter((c: any) => c.familyId === fam.firestoreId).forEach((c: any) => {
        items.push({ id: "carte-" + c.id, source: "carte", sourceId: c.id, childName: c.childName || "", label: "Carte " + (c.totalSessions || "?") + " seances", priceHT: (c.priceTTC || 0) / 1.055, tvaTaux: 5.5, priceTTC: c.priceTTC || 0, date: c.createdAt?.seconds ? new Date(c.createdAt.seconds * 1000).toISOString().split("T")[0] : "", invoiced: c.status === "paid" });
      });

      forfaits.filter((f: any) => f.familyId === fam.firestoreId).forEach((f: any) => {
        const ttc = f.totalTTC || f.forfaitPriceTTC || 0;
        const paid = (f.totalPaidTTC || 0) >= ttc;
        const label = f.lines && f.lines.length > 0
          ? f.lines.map((l: any) => l.label).join(" + ")
          : (f.slotKey || "Forfait annuel");
        items.push({ id: "forfait-" + f.id, source: "forfait", sourceId: f.id, childName: f.childName || "", label, priceHT: ttc / 1.055, tvaTaux: 5.5, priceTTC: ttc, date: f.createdAt?.seconds ? new Date(f.createdAt.seconds * 1000).toISOString().split("T")[0] : "", invoiced: paid });
      });

      const totalTTC = items.reduce((s, i) => s + i.priceTTC, 0);
      const totalInvoiced = items.filter(i => i.invoiced).reduce((s, i) => s + i.priceTTC, 0);
      return { familyId: fam.firestoreId, familyName: fam.parentName, items, totalTTC, totalInvoiced, totalPending: totalTTC - totalInvoiced };
    }).filter(fp => fp.items.length > 0);
  }, [families, payments, reservations, cartes, forfaits]);

  const filteredPaniers = useMemo(() => {
    let list = familyPaniers;
    if (filter === "pending") list = list.filter(fp => fp.totalPending > 0);
    if (filter === "invoiced") list = list.filter(fp => fp.totalPending === 0);
    if (search) { const q = search.toLowerCase(); list = list.filter(fp => fp.familyName.toLowerCase().includes(q)); }
    return list.sort((a, b) => b.totalPending - a.totalPending);
  }, [familyPaniers, filter, search]);

  const totalPendingGlobal = familyPaniers.reduce((s, fp) => s + fp.totalPending, 0);
  const totalInvoicedGlobal = familyPaniers.reduce((s, fp) => s + fp.totalInvoiced, 0);
  const familiesWithPending = familyPaniers.filter(fp => fp.totalPending > 0).length;

  const openInvoice = (fp: FamilyPanier) => { setInvoicingFamily(fp); setSelectedItems(fp.items.filter(i => !i.invoiced).map(i => i.id)); setShowInvoiceModal(true); };

  const handleInvoice = async () => {
    if (!invoicingFamily || selectedItems.length === 0) return;
    setSaving(true);
    try {
      const items = invoicingFamily.items.filter(i => selectedItems.includes(i.id));
      const totalTTC = items.reduce((s, i) => s + i.priceTTC, 0);
      const ref = "F" + new Date().getFullYear() + "-" + Date.now().toString(36).toUpperCase().slice(-4);
      await addDoc(collection(db, "payments"), {
        familyId: invoicingFamily.familyId, familyName: invoicingFamily.familyName, invoiceRef: ref,
        items: items.map(i => ({ activityTitle: i.label, childName: i.childName, priceHT: Math.round(i.priceHT * 100) / 100, tva: i.tvaTaux, priceTTC: Math.round(i.priceTTC * 100) / 100, reservationId: i.source === "reservation" ? i.sourceId : null })),
        totalTTC: Math.round(totalTTC * 100) / 100, paymentMode: payMode, paymentRef: "", status: "paid", paidAmount: Math.round(totalTTC * 100) / 100, date: serverTimestamp(),
      });
      setShowInvoiceModal(false); fetchData();
    } catch (e) { console.error(e); alert("Erreur."); }
    setSaving(false);
  };

  const inputStyle = "w-full font-body text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:border-blue-400 bg-white";

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-blue-500" /></div>;

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-blue-800">Paniers clients</h1>
          <p className="font-body text-xs text-gray-400">Vue centralisée des prestations par famille — facturation collective</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mb-6">
        <Card padding="sm" className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center"><Users size={18} className="text-blue-500" /></div>
          <div><div className="font-body text-xl font-bold text-blue-500">{familyPaniers.length}</div><div className="font-body text-xs text-gray-400">familles</div></div>
        </Card>
        <Card padding="sm" className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center"><AlertTriangle size={18} className="text-orange-500" /></div>
          <div><div className="font-body text-xl font-bold text-orange-500">{familiesWithPending}</div><div className="font-body text-xs text-gray-400">à facturer</div></div>
        </Card>
        <Card padding="sm" className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center"><ShoppingCart size={18} className="text-red-500" /></div>
          <div><div className="font-body text-xl font-bold text-red-500">{totalPendingGlobal.toFixed(0)}€</div><div className="font-body text-xs text-gray-400">en attente</div></div>
        </Card>
        <Card padding="sm" className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center"><Check size={18} className="text-green-600" /></div>
          <div><div className="font-body text-xl font-bold text-green-600">{totalInvoicedGlobal.toFixed(0)}€</div><div className="font-body text-xs text-gray-400">facture</div></div>
        </Card>
      </div>

      <div className="flex flex-wrap gap-3 mb-5">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" />
          <input type="text" placeholder="Rechercher une famille..." value={search} onChange={e => setSearch(e.target.value)} className={`${inputStyle} !pl-9`} />
        </div>
        <div className="flex gap-1.5">
          {([["pending", "À facturer"], ["all", "Tous"], ["invoiced", "Factures"]] as const).map(([id, label]) => (
            <button key={id} onClick={() => setFilter(id)} className={`font-body text-sm px-4 py-2.5 rounded-lg border cursor-pointer transition-all ${filter === id ? "bg-blue-500 text-white border-blue-500" : "bg-white text-gray-500 border-gray-200"}`}>{label}</button>
          ))}
        </div>
      </div>

      {filteredPaniers.length === 0 ? (
        <Card padding="lg" className="text-center">
          <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto mb-3"><ShoppingCart size={28} className="text-blue-300" /></div>
          <p className="font-body text-sm text-gray-500">Aucun panier à afficher.</p>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {filteredPaniers.map(fp => {
            const expanded = expandedFamily === fp.familyId;
            const pendingItems = fp.items.filter(i => !i.invoiced);
            return (
              <Card key={fp.familyId} padding="md" className={expanded ? "ring-2 ring-blue-200" : ""}>
                <div className="flex items-center gap-3 cursor-pointer" onClick={() => setExpandedFamily(expanded ? null : fp.familyId)}>
                  <div className="w-10 h-10 rounded-xl bg-blue-500 flex items-center justify-center flex-shrink-0">
                    <span className="font-display text-sm font-bold text-white">{fp.familyName.charAt(0)}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-display text-sm font-bold text-blue-800">{fp.familyName}</span>
                      <Badge color="gray">{fp.items.length} prestation{fp.items.length > 1 ? "s" : ""}</Badge>
                      {pendingItems.length > 0 && <Badge color="orange">{pendingItems.length} à facturer</Badge>}
                    </div>
                    <div className="font-body text-xs text-gray-400 mt-0.5">
                      {fp.items.map(i => i.childName).filter((v, i, a) => a.indexOf(v) === i && v).join(", ")}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    {fp.totalPending > 0 && (
                      <>
                        <div className="text-right">
                          <div className="font-body text-lg font-bold text-orange-500">{fp.totalPending.toFixed(2)}€</div>
                          <div className="font-body text-[10px] text-gray-400">à facturer</div>
                        </div>
                        <button onClick={(e) => { e.stopPropagation(); openInvoice(fp); }}
                          className="flex items-center gap-1.5 font-body text-xs font-semibold text-white bg-blue-500 px-3 py-2 rounded-lg border-none cursor-pointer hover:bg-blue-600">
                          <Receipt size={14} /> Facturer
                        </button>
                      </>
                    )}
                    {expanded ? <ChevronUp size={16} className="text-gray-300" /> : <ChevronDown size={16} className="text-gray-300" />}
                  </div>
                </div>

                {expanded && (
                  <div className="mt-4 pt-4 border-t border-gray-100">
                    <div className="flex flex-col gap-2">
                      {fp.items.map(item => (
                        <div key={item.id} className={`flex items-center gap-3 py-2 px-3 rounded-lg ${item.invoiced ? "bg-gray-50 opacity-60" : "bg-white"}`}>
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <Badge color={sourceColors[item.source] || "gray"}>{sourceLabels[item.source] || item.source}</Badge>
                              <span className="font-body text-sm text-blue-800">{item.label}</span>
                              {item.childName && <span className="font-body text-xs text-gray-400">({item.childName})</span>}
                            </div>
                            {item.date && <div className="font-body text-xs text-gray-300 mt-0.5">{item.date}</div>}
                          </div>
                          <span className="font-body text-sm font-semibold text-blue-800">{item.priceTTC.toFixed(2)}€</span>
                          <Badge color={item.invoiced ? "green" : "orange"}>{item.invoiced ? "Facturé" : "En attente"}</Badge>
                        </div>
                      ))}
                    </div>
                    <div className="flex justify-between mt-3 pt-3 border-t border-gray-100 font-body text-sm">
                      <span className="text-gray-500">Total : {fp.totalTTC.toFixed(2)}€ | Facture : {fp.totalInvoiced.toFixed(2)}€</span>
                      <span className="font-semibold text-orange-500">Reste : {fp.totalPending.toFixed(2)}€</span>
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {showInvoiceModal && invoicingFamily && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center pt-12 overflow-y-auto" onClick={() => setShowInvoiceModal(false)}>
          <div className="bg-white rounded-2xl w-full max-w-lg mx-4 mb-8 shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center p-5 border-b border-gray-100">
              <div>
                <h2 className="font-display text-lg font-bold text-blue-800">Facturer — {invoicingFamily.familyName}</h2>
                <p className="font-body text-xs text-gray-400">{selectedItems.length} prestation{selectedItems.length > 1 ? "s" : ""}</p>
              </div>
              <button onClick={() => setShowInvoiceModal(false)} className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center cursor-pointer border-none"><X size={16} /></button>
            </div>
            <div className="p-5">
              <div className="mb-4">
                <div className="flex justify-between items-center mb-2">
                  <span className="font-body text-xs font-semibold text-gray-500 uppercase tracking-wider">Prestations</span>
                  <div className="flex gap-2">
                    <button onClick={() => setSelectedItems(invoicingFamily.items.filter(i => !i.invoiced).map(i => i.id))} className="font-body text-xs text-blue-500 bg-blue-50 px-2 py-1 rounded border-none cursor-pointer">Tout</button>
                    <button onClick={() => setSelectedItems([])} className="font-body text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded border-none cursor-pointer">Aucun</button>
                  </div>
                </div>
                <div className="flex flex-col gap-1.5 max-h-60 overflow-y-auto">
                  {invoicingFamily.items.filter(i => !i.invoiced).map(item => {
                    const sel = selectedItems.includes(item.id);
                    return (
                      <button key={item.id} onClick={() => setSelectedItems(sel ? selectedItems.filter(id => id !== item.id) : [...selectedItems, item.id])}
                        className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer text-left transition-all ${sel ? "border-blue-500 bg-blue-50" : "border-gray-200 bg-white"}`}>
                        <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${sel ? "border-blue-500 bg-blue-500" : "border-gray-300"}`}>
                          {sel && <Check size={12} className="text-white" />}
                        </div>
                        <div className="flex-1">
                          <div className="font-body text-sm text-blue-800">{item.label}</div>
                          {item.childName && <div className="font-body text-xs text-gray-400">{item.childName}</div>}
                        </div>
                        <span className="font-body text-sm font-semibold text-blue-500">{item.priceTTC.toFixed(2)}€</span>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="mb-4">
                <span className="font-body text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-2">Mode de paiement</span>
                <div className="flex flex-wrap gap-1.5">
                  {payModes.map(m => (
                    <button key={m.id} onClick={() => setPayMode(m.id)} className={`font-body text-xs px-3 py-1.5 rounded-lg border cursor-pointer transition-all ${payMode === m.id ? "bg-blue-500 text-white border-blue-500" : "bg-white text-gray-500 border-gray-200"}`}>{m.label}</button>
                  ))}
                </div>
              </div>
              <div className="flex justify-between items-center p-4 bg-blue-50 rounded-xl mb-4">
                <span className="font-body text-sm font-semibold text-blue-800">Total</span>
                <span className="font-body text-2xl font-bold text-blue-500">{invoicingFamily.items.filter(i => selectedItems.includes(i.id)).reduce((s, i) => s + i.priceTTC, 0).toFixed(2)}€</span>
              </div>
              <button onClick={handleInvoice} disabled={saving || selectedItems.length === 0}
                className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl font-body text-sm font-semibold border-none cursor-pointer ${saving || selectedItems.length === 0 ? "bg-gray-200 text-gray-400" : "bg-blue-500 text-white hover:bg-blue-600"}`}>
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Receipt size={16} />} Facturer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
