"use client";

import { useState, useEffect, useMemo } from "react";
import { collection, getDocs, addDoc, updateDoc, doc, query, where, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Card, Badge } from "@/components/ui";
import { Loader2, Search, Users, Plus, X, Check, Calendar   ClipboardList,
} from "lucide-react";
import type { Family } from "@/types";

interface Forfait {
  id: string;
  familyId: string;
  familyName: string;
  childId: string;
  childName: string;
  slotKey: string; // "Cours débutant — Mercredi 10:00"
  activityTitle: string;
  dayLabel: string;
  startTime: string;
  endTime: string;
  totalSessions: number;
  attendedSessions: number;
  licenceFFE: boolean;
  adhesion: boolean;
  forfaitPriceTTC: number;
  totalPaidTTC: number;
  paymentPlan: string; // "1x", "3x", "10x"
  status: "active" | "suspended" | "completed";
  createdAt: any;
}

export default function ForfaitsPage() {
  const [forfaits, setForfaits] = useState<Forfait[]>([]);
  const [families, setFamilies] = useState<(Family & { firestoreId: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  // Create form
  const [selFamily, setSelFamily] = useState("");
  const [selChild, setSelChild] = useState("");
  const [slotKey, setSlotKey] = useState("");
  const [priceTTC, setPriceTTC] = useState("650");
  const [payPlan, setPayPlan] = useState("1x");
  const [creating, setCreating] = useState(false);

  const fetchData = async () => {
    try {
      const [fSnap, famSnap] = await Promise.all([
        getDocs(collection(db, "forfaits")),
        getDocs(collection(db, "families")),
      ]);
      setForfaits(fSnap.docs.map(d => ({ id: d.id, ...d.data() })) as Forfait[]);
      setFamilies(famSnap.docs.map(d => ({ firestoreId: d.id, ...d.data() })) as any);
    } catch (e) { console.error(e); }
    setLoading(false);
  };
  useEffect(() => { fetchData(); }, []);

  const fam = families.find(f => f.firestoreId === selFamily);
  const children = fam?.children || [];

  const filtered = search
    ? forfaits.filter(f => f.childName.toLowerCase().includes(search.toLowerCase()) || f.familyName.toLowerCase().includes(search.toLowerCase()))
    : forfaits;

  const active = filtered.filter(f => f.status === "active");

  const handleCreate = async () => {
    if (!selFamily || !selChild || !slotKey || !fam) return;
    setCreating(true);
    const child = children.find((c: any) => c.id === selChild);
    await addDoc(collection(db, "forfaits"), {
      familyId: selFamily, familyName: fam.parentName || "—",
      childId: selChild, childName: (child as any)?.firstName || "—",
      slotKey, activityTitle: slotKey.split(" — ")[0] || slotKey,
      dayLabel: slotKey.split(" — ")[1]?.split(" ")[0] || "",
      startTime: "", endTime: "",
      totalSessions: 0, attendedSessions: 0,
      licenceFFE: true, adhesion: true,
      forfaitPriceTTC: parseFloat(priceTTC) || 0,
      totalPaidTTC: 0, paymentPlan: payPlan,
      status: "active", createdAt: serverTimestamp(),
    });
    setSelFamily(""); setSelChild(""); setSlotKey(""); setCreating(false); setShowCreate(false);
    fetchData();
  };

  const inp = "w-full px-3 py-2.5 rounded-lg border border-blue-500/8 font-body text-sm bg-cream focus:border-blue-500 focus:outline-none";

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-blue-800">Forfaits annuels</h1>
          <p className="font-body text-xs text-gray-400">Suivi des inscriptions à l&apos;année, licences, adhésions et paiements</p>
        </div>
        <button onClick={() => setShowCreate(!showCreate)}
          className="flex items-center gap-2 font-body text-sm font-semibold text-white bg-blue-500 px-5 py-2.5 rounded-lg border-none cursor-pointer hover:bg-blue-400">
          <Plus size={16} /> Nouveau forfait
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-6">
        <Card padding="sm"><div className="font-body text-2xl font-bold text-blue-500">{active.length}</div><div className="font-body text-xs text-gray-400">Forfaits actifs</div></Card>
        <Card padding="sm"><div className="font-body text-2xl font-bold text-green-600">{active.filter(f => f.licenceFFE).length}</div><div className="font-body text-xs text-gray-400">Licences FFE</div></Card>
        <Card padding="sm"><div className="font-body text-2xl font-bold text-gold-400">{active.reduce((s, f) => s + f.forfaitPriceTTC, 0).toFixed(0)}€</div><div className="font-body text-xs text-gray-400">CA forfaits</div></Card>
        <Card padding="sm"><div className="font-body text-2xl font-bold text-orange-500">{active.filter(f => f.totalPaidTTC < f.forfaitPriceTTC).length}</div><div className="font-body text-xs text-gray-400">Paiements en cours</div></Card>
      </div>

      {/* Create form */}
      {showCreate && (
        <Card padding="md" className="mb-6 border-blue-500/15">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-body text-base font-semibold text-blue-800">Nouveau forfait annuel</h3>
            <button onClick={() => setShowCreate(false)} className="text-gray-400 bg-transparent border-none cursor-pointer"><X size={18} /></button>
          </div>
          <div className="flex flex-col gap-3">
            <select value={selFamily} onChange={e => { setSelFamily(e.target.value); setSelChild(""); }} className={inp}>
              <option value="">Famille...</option>
              {families.map(f => {
                const n = (f.children || []).map((c: any) => c.firstName).join(", ");
                return <option key={f.firestoreId} value={f.firestoreId}>{f.parentName} {n ? `(${n})` : ""}</option>;
              })}
            </select>
            {fam && <div className="flex flex-wrap gap-2">{children.map((c: any) => <button key={c.id} onClick={() => setSelChild(c.id)} className={`px-4 py-2 rounded-lg border font-body text-sm cursor-pointer ${selChild === c.id ? "bg-blue-500 text-white border-blue-500" : "bg-white text-gray-500 border-gray-200"}`}>🧒 {c.firstName}</button>)}</div>}
            <input value={slotKey} onChange={e => setSlotKey(e.target.value)} placeholder="Créneau (ex: Cours débutant — Mercredi 10:00)" className={inp} />
            <div className="flex gap-3">
              <input type="number" value={priceTTC} onChange={e => setPriceTTC(e.target.value)} placeholder="Prix TTC" className={`${inp} w-32`} />
              <select value={payPlan} onChange={e => setPayPlan(e.target.value)} className={`${inp} w-32`}>
                <option value="1x">1 fois</option><option value="3x">3 fois</option><option value="10x">10 fois</option>
              </select>
            </div>
            <button onClick={handleCreate} disabled={!selFamily || !selChild || !slotKey || creating}
              className={`py-3 rounded-xl font-body text-sm font-semibold border-none cursor-pointer ${!selFamily || !selChild || !slotKey || creating ? "bg-gray-200 text-gray-400" : "bg-blue-500 text-white"}`}>
              {creating ? "..." : "Créer le forfait"}
            </button>
          </div>
        </Card>
      )}

      {/* Search */}
      <div className="relative mb-4">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher..." className={`${inp} !pl-9`} />
      </div>

      {/* List */}
      {loading ? <div className="text-center py-16"><Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto" /></div> :
      filtered.length === 0 ? (
        <Card padding="lg" className="text-center">
          <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto mb-3"><ClipboardList size={28} className="text-blue-300" /></div>
          <p className="font-body text-sm text-gray-500 mb-3">Aucun forfait annuel. Créez-en un !</p>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map(f => {
            const paidPct = f.forfaitPriceTTC > 0 ? (f.totalPaidTTC / f.forfaitPriceTTC) * 100 : 0;
            return (
              <Card key={f.id} padding="md">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center text-2xl">🧒</div>
                    <div>
                      <div className="font-body text-base font-semibold text-blue-800">{f.childName}</div>
                      <div className="font-body text-xs text-gray-400">{f.familyName}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge color={f.status === "active" ? "green" : f.status === "suspended" ? "orange" : "gray"}>
                      {f.status === "active" ? "Actif" : f.status === "suspended" ? "Suspendu" : "Terminé"}
                    </Badge>
                    <Badge color="blue">{f.paymentPlan}</Badge>
                  </div>
                </div>

                <div className="flex flex-wrap gap-4 mb-3 font-body text-xs text-gray-500">
                  <span>📅 {f.slotKey}</span>
                  {f.licenceFFE && <span className="text-green-600">✅ Licence FFE</span>}
                  {f.adhesion && <span className="text-green-600">✅ Adhésion</span>}
                </div>

                {/* Payment progress */}
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-2 rounded-full bg-gray-100">
                    <div className="h-2 rounded-full bg-gradient-to-r from-blue-400 to-gold-400" style={{ width: `${Math.min(paidPct, 100)}%` }} />
                  </div>
                  <span className="font-body text-xs font-semibold text-blue-500">{f.totalPaidTTC.toFixed(0)}€ / {f.forfaitPriceTTC.toFixed(0)}€</span>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
