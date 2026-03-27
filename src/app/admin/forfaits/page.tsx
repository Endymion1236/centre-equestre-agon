"use client";

import { useState, useEffect, useMemo } from "react";
import { collection, getDocs, updateDoc, doc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Card, Badge } from "@/components/ui";
import {
  Loader2, Search, Users, Calendar, ChevronDown, ChevronUp, Pause, Play, XCircle, CreditCard, TrendingUp,
} from "lucide-react";

interface Forfait {
  id: string;
  familyId: string;
  familyName: string;
  childId: string;
  childName: string;
  slotKey: string;
  activityTitle: string;
  dayLabel: string;
  startTime: string;
  endTime: string;
  totalSessions: number;
  attendedSessions: number;
  licenceFFE: boolean;
  licenceType: string;
  adhesion: boolean;
  forfaitPriceTTC: number;
  totalPaidTTC: number;
  paymentPlan: string;
  status: "active" | "suspended" | "completed" | "cancelled";
  createdAt: any;
}

interface Payment {
  id: string;
  familyId: string;
  totalTTC: number;
  paidAmount: number;
  status: string;
  items: any[];
  date: any;
}

const statusConfig: Record<string, { label: string; color: "green" | "orange" | "gray" | "red" }> = {
  active: { label: "Actif", color: "green" },
  suspended: { label: "Suspendu", color: "orange" },
  completed: { label: "Terminé", color: "gray" },
  cancelled: { label: "Résilié", color: "red" },
};

export default function ForfaitsPage() {
  const [forfaits, setForfaits] = useState<Forfait[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchData = async () => {
    try {
      const [fSnap, pSnap] = await Promise.all([
        getDocs(collection(db, "forfaits")),
        getDocs(collection(db, "payments")),
      ]);
      setForfaits(fSnap.docs.map(d => ({ id: d.id, ...d.data() })) as Forfait[]);
      setPayments(pSnap.docs.map(d => ({ id: d.id, ...d.data() })) as Payment[]);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const activeCount = forfaits.filter(f => f.status === "active").length;
  const suspendedCount = forfaits.filter(f => f.status === "suspended").length;
  const totalCA = forfaits.filter(f => f.status !== "cancelled").reduce((s, f) => s + (f.forfaitPriceTTC || 0), 0);
  const totalPaid = forfaits.reduce((s, f) => s + (f.totalPaidTTC || 0), 0);
  const totalDue = totalCA - totalPaid;

  const getPaidForForfait = (f: Forfait) => {
    const related = payments.filter(p =>
      p.familyId === f.familyId && p.status === "paid" &&
      (p.items || []).some((i: any) => i.activityTitle?.includes("Forfait") && i.activityTitle?.includes(f.activityTitle || ""))
    );
    return related.reduce((s, p) => s + (p.paidAmount || p.totalTTC || 0), 0);
  };

  const filtered = useMemo(() => {
    let result = [...forfaits];
    if (filterStatus !== "all") result = result.filter(f => f.status === filterStatus);
    if (search) {
      const terms = search.toLowerCase().trim().split(/\s+/);
      result = result.filter(f => {
        const searchable = [
          f.familyName || "",
          f.childName || "",
          f.activityTitle || "",
          f.slotKey || "",
        ].join(" ").toLowerCase();
        return terms.every(t => searchable.includes(t));
      });
    }
    return result.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
  }, [forfaits, filterStatus, search]);

  const handleStatusChange = async (id: string, newStatus: string) => {
    setSaving(true);
    try {
      await updateDoc(doc(db, "forfaits", id), { status: newStatus, updatedAt: serverTimestamp() });
      fetchData();
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  const formatDate = (d: any) => {
    if (!d) return "—";
    const date = d.toDate ? d.toDate() : new Date(d.seconds ? d.seconds * 1000 : d);
    return date.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
  };

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-blue-500" /></div>;

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-blue-800">Forfaits annuels</h1>
          <p className="font-body text-xs text-slate-500">Suivi des abonnements — les forfaits se créent depuis le planning</p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-6">
        <Card padding="sm" className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center"><Users size={18} className="text-green-600" /></div>
          <div><div className="font-body text-xl font-bold text-green-600">{activeCount}</div><div className="font-body text-xs text-slate-500">forfaits actifs</div></div>
        </Card>
        <Card padding="sm" className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center"><TrendingUp size={18} className="text-blue-500" /></div>
          <div><div className="font-body text-xl font-bold text-blue-500">{totalCA.toFixed(0)}€</div><div className="font-body text-xs text-slate-500">CA forfaits</div></div>
        </Card>
        <Card padding="sm" className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center"><CreditCard size={18} className="text-green-600" /></div>
          <div><div className="font-body text-xl font-bold text-green-600">{totalPaid.toFixed(0)}€</div><div className="font-body text-xs text-slate-500">encaissé</div></div>
        </Card>
        <Card padding="sm" className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl ${totalDue > 0 ? "bg-red-50" : "bg-gray-50"} flex items-center justify-center`}>
            <CreditCard size={18} className={totalDue > 0 ? "text-red-500" : "text-slate-500"} />
          </div>
          <div><div className={`font-body text-xl font-bold ${totalDue > 0 ? "text-red-500" : "text-slate-500"}`}>{totalDue.toFixed(0)}€</div><div className="font-body text-xs text-slate-500">reste à encaisser</div></div>
        </Card>
      </div>

      {/* Filtres */}
      <div className="flex flex-wrap gap-3 mb-5 items-center">
        <div className="flex gap-1.5">
          {[
            { id: "all", label: `Tous (${forfaits.length})` },
            { id: "active", label: `Actifs (${activeCount})` },
            { id: "suspended", label: `Suspendus (${suspendedCount})` },
            { id: "completed", label: "Terminés" },
            { id: "cancelled", label: "Résiliés" },
          ].map(f => (
            <button key={f.id} onClick={() => setFilterStatus(f.id)}
              className={`font-body text-xs px-3 py-1.5 rounded-lg border-none cursor-pointer transition-all ${
                filterStatus === f.id ? "bg-blue-500 text-white" : "bg-white text-slate-600 border border-gray-200"
              }`}>
              {f.label}
            </button>
          ))}
        </div>
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input placeholder="Rechercher : prénom + nom cavalier, famille, activité..." value={search} onChange={e => setSearch(e.target.value)}
            className="w-full font-body text-xs border border-gray-200 rounded-lg pl-9 pr-3 py-2 bg-white focus:outline-none focus:border-blue-400" />
        </div>
      </div>

      {/* Liste */}
      {filtered.length === 0 ? (
        <Card padding="lg" className="text-center">
          <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto mb-3"><Calendar size={28} className="text-blue-300" /></div>
          <p className="font-body text-sm text-slate-600">
            {forfaits.length === 0
              ? "Aucun forfait. Pour inscrire un cavalier à l'année, allez dans le Planning, cliquez sur un créneau et choisissez « Forfait à l'année »."
              : "Aucun forfait correspondant aux filtres."
            }
          </p>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map(f => {
            const isExp = expanded === f.id;
            const sc = statusConfig[f.status] || statusConfig.active;
            const paid = getPaidForForfait(f);
            const pctPaid = f.forfaitPriceTTC > 0 ? Math.min(100, Math.round((paid / f.forfaitPriceTTC) * 100)) : 0;
            const pctSessions = (f.totalSessions || 35) > 0 ? Math.round(((f.attendedSessions || 0) / (f.totalSessions || 35)) * 100) : 0;
            const installment = f.paymentPlan === "3x" ? f.forfaitPriceTTC / 3 : f.paymentPlan === "10x" ? f.forfaitPriceTTC / 10 : f.forfaitPriceTTC;

            return (
              <Card key={f.id} padding="md">
                <div className="flex items-center justify-between cursor-pointer" onClick={() => setExpanded(isExp ? null : f.id)}>
                  <div className="flex items-center gap-4">
                    <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${f.status === "active" ? "bg-green-50" : f.status === "suspended" ? "bg-orange-50" : "bg-gray-50"}`}>
                      <Calendar size={18} className={f.status === "active" ? "text-green-600" : f.status === "suspended" ? "text-orange-500" : "text-slate-500"} />
                    </div>
                    <div>
                      <div className="font-body text-sm font-semibold text-blue-800">
                        {f.childName} <span className="text-slate-500 font-normal">— {f.familyName}</span>
                      </div>
                      <div className="font-body text-xs text-slate-500">
                        {f.slotKey || f.activityTitle || "—"} · Créé le {formatDate(f.createdAt)}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <div className="font-body text-base font-bold text-blue-500">{(f.forfaitPriceTTC || 0).toFixed(0)}€</div>
                      <div className="font-body text-[10px] text-slate-500">{f.paymentPlan || "1x"}</div>
                    </div>
                    <Badge color={sc.color}>{sc.label}</Badge>
                    {isExp ? <ChevronUp size={16} className="text-slate-500" /> : <ChevronDown size={16} className="text-slate-500" />}
                  </div>
                </div>

                {isExp && (
                  <div className="mt-4 pt-4 border-t border-blue-500/8 space-y-4">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div><div className="font-body text-[10px] text-slate-500 uppercase">Activité</div><div className="font-body text-sm text-blue-800">{f.activityTitle || "—"}</div></div>
                      <div><div className="font-body text-[10px] text-slate-500 uppercase">Créneau</div><div className="font-body text-sm text-blue-800">{f.dayLabel || "—"} {f.startTime}–{f.endTime}</div></div>
                      <div><div className="font-body text-[10px] text-slate-500 uppercase">Adhésion</div><div className="font-body text-sm text-blue-800">{f.adhesion ? "Oui" : "Non"}</div></div>
                      <div><div className="font-body text-[10px] text-slate-500 uppercase">Licence FFE</div><div className="font-body text-sm text-blue-800">{f.licenceFFE ? `Oui (${f.licenceType === "moins18" ? "-18" : "+18"})` : "Non"}</div></div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <div className="flex justify-between mb-1">
                          <span className="font-body text-[10px] text-slate-500 uppercase">Paiement</span>
                          <span className="font-body text-xs font-semibold text-blue-500">{paid.toFixed(0)}€ / {(f.forfaitPriceTTC || 0).toFixed(0)}€</span>
                        </div>
                        <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${pctPaid >= 100 ? "bg-green-500" : pctPaid > 50 ? "bg-blue-400" : "bg-orange-400"}`} style={{ width: `${pctPaid}%` }} />
                        </div>
                        <div className="font-body text-[10px] text-slate-500 mt-0.5">
                          {f.paymentPlan === "1x" ? "Paiement unique" : `${f.paymentPlan} · ${installment.toFixed(0)}€/échéance`}
                        </div>
                      </div>
                      <div>
                        <div className="flex justify-between mb-1">
                          <span className="font-body text-[10px] text-slate-500 uppercase">Séances</span>
                          <span className="font-body text-xs font-semibold text-blue-500">{f.attendedSessions || 0} / {f.totalSessions || 35}</span>
                        </div>
                        <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full rounded-full bg-blue-400" style={{ width: `${pctSessions}%` }} />
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-2 pt-2">
                      {f.status === "active" && (
                        <button onClick={() => handleStatusChange(f.id, "suspended")} disabled={saving}
                          className="flex items-center gap-1.5 font-body text-xs text-orange-500 bg-orange-50 px-3 py-1.5 rounded-lg border-none cursor-pointer hover:bg-orange-100">
                          <Pause size={12} /> Suspendre
                        </button>
                      )}
                      {f.status === "suspended" && (
                        <button onClick={() => handleStatusChange(f.id, "active")} disabled={saving}
                          className="flex items-center gap-1.5 font-body text-xs text-green-600 bg-green-50 px-3 py-1.5 rounded-lg border-none cursor-pointer hover:bg-green-100">
                          <Play size={12} /> Réactiver
                        </button>
                      )}
                      {(f.status === "active" || f.status === "suspended") && (
                        <button onClick={() => { if (confirm(`Résilier le forfait de ${f.childName} ?`)) handleStatusChange(f.id, "cancelled"); }} disabled={saving}
                          className="flex items-center gap-1.5 font-body text-xs text-red-500 bg-red-50 px-3 py-1.5 rounded-lg border-none cursor-pointer hover:bg-red-100">
                          <XCircle size={12} /> Résilier
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
