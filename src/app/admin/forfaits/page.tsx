"use client";

import { useState, useEffect, useMemo } from "react";
import { collection, getDocs, addDoc, updateDoc, doc, getDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Card, Badge } from "@/components/ui";
import {
  Loader2, Search, Users, Plus, X, Check, Calendar, ClipboardList, Save, AlertTriangle, CreditCard,
} from "lucide-react";
import type { Family } from "@/types";

interface TarifItem {
  id: string;
  label: string;
  priceTTC: number;
  tvaRate: number;
  accountCode: string;
  obligatoire: boolean;
  category: "licence" | "adhesion" | "forfait" | "option";
}

interface ForfaitLine {
  tarifId: string;
  label: string;
  priceTTC: number;
  tvaRate: number;
  accountCode: string;
  included: boolean;
}

interface Forfait {
  id: string;
  familyId: string;
  familyName: string;
  childId: string;
  childName: string;
  slotKey: string;
  lines: ForfaitLine[];
  totalTTC: number;
  totalPaidTTC: number;
  paymentPlan: string;
  status: "active" | "suspended" | "completed";
  createdAt: any;
}

const payPlans = [
  { id: "1x", label: "1 fois" },
  { id: "3x", label: "3 fois sans frais" },
  { id: "10x", label: "10 fois sans frais" },
];

export default function ForfaitsPage() {
  const [forfaits, setForfaits] = useState<Forfait[]>([]);
  const [families, setFamilies] = useState<(Family & { firestoreId: string })[]>([]);
  const [tarifs, setTarifs] = useState<TarifItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);

  // Form
  const [selFamily, setSelFamily] = useState("");
  const [selChild, setSelChild] = useState("");
  const [slotKey, setSlotKey] = useState("");
  const [selForfait, setSelForfait] = useState("");
  const [selectedOptions, setSelectedOptions] = useState<string[]>([]);
  const [payPlan, setPayPlan] = useState("10x");

  const fetchData = async () => {
    try {
      const [fSnap, famSnap, tSnap] = await Promise.all([
        getDocs(collection(db, "forfaits")),
        getDocs(collection(db, "families")),
        getDoc(doc(db, "settings", "tarifs")),
      ]);
      setForfaits(fSnap.docs.map(d => ({ id: d.id, ...d.data() } as Forfait)));
      setFamilies(famSnap.docs.map(d => ({ firestoreId: d.id, ...d.data() })) as any);
      if (tSnap.exists() && tSnap.data().items) {
        setTarifs(tSnap.data().items);
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  };
  useEffect(() => { fetchData(); }, []);

  const fam = families.find(f => f.firestoreId === selFamily);
  const children = fam?.children || [];

  // Calcul des lignes du forfait
  const forfaitLines = useMemo((): ForfaitLine[] => {
    const lines: ForfaitLine[] = [];
    // 1. Lignes obligatoires (licence + adhésion)
    tarifs.filter(t => t.obligatoire).forEach(t => {
      lines.push({ tarifId: t.id, label: t.label, priceTTC: t.priceTTC, tvaRate: t.tvaRate, accountCode: t.accountCode, included: true });
    });
    // 2. Forfait cours sélectionné
    if (selForfait) {
      const f = tarifs.find(t => t.id === selForfait);
      if (f) lines.push({ tarifId: f.id, label: f.label, priceTTC: f.priceTTC, tvaRate: f.tvaRate, accountCode: f.accountCode, included: true });
    }
    // 3. Options sélectionnées
    selectedOptions.forEach(optId => {
      const o = tarifs.find(t => t.id === optId);
      if (o) lines.push({ tarifId: o.id, label: o.label, priceTTC: o.priceTTC, tvaRate: o.tvaRate, accountCode: o.accountCode, included: true });
    });
    return lines;
  }, [tarifs, selForfait, selectedOptions]);

  const totalTTC = forfaitLines.reduce((s, l) => s + l.priceTTC, 0);
  const forfaitTarifs = tarifs.filter(t => t.category === "forfait");
  const optionTarifs = tarifs.filter(t => t.category === "option");
  const obligatoireTarifs = tarifs.filter(t => t.obligatoire);

  const handleCreate = async () => {
    if (!selFamily || !selChild || !selForfait || !fam) return;
    setCreating(true);
    const child = children.find((c: any) => c.id === selChild);
    try {
      await addDoc(collection(db, "forfaits"), {
        familyId: selFamily,
        familyName: fam.parentName || "—",
        childId: selChild,
        childName: (child as any)?.firstName || "—",
        slotKey: slotKey || "—",
        lines: forfaitLines,
        totalTTC,
        totalPaidTTC: 0,
        paymentPlan: payPlan,
        status: "active",
        createdAt: serverTimestamp(),
      });
      setSelFamily(""); setSelChild(""); setSlotKey(""); setSelForfait(""); setSelectedOptions([]);
      setShowCreate(false);
      fetchData();
    } catch (e) { console.error(e); alert("Erreur"); }
    setCreating(false);
  };

  const filtered = search
    ? forfaits.filter(f => f.childName?.toLowerCase().includes(search.toLowerCase()) || f.familyName?.toLowerCase().includes(search.toLowerCase()))
    : forfaits;
  const active = filtered.filter(f => f.status === "active");

  const inputStyle = "w-full px-3 py-2.5 rounded-lg border border-gray-200 font-body text-sm bg-white focus:border-blue-500 focus:outline-none";

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-blue-500" /></div>;

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-blue-800">Forfaits annuels</h1>
          <p className="font-body text-xs text-gray-400">Inscriptions à l&apos;année : forfait + licence FFE + adhésion</p>
        </div>
        <button onClick={() => setShowCreate(!showCreate)}
          className="flex items-center gap-2 font-body text-sm font-semibold text-white bg-blue-500 px-5 py-2.5 rounded-lg border-none cursor-pointer hover:bg-blue-400">
          <Plus size={16} /> Nouvelle inscription
        </button>
      </div>

      {/* Alerte si tarifs pas configurés */}
      {tarifs.length === 0 && (
        <Card padding="sm" className="mb-4 !border-orange-200 !bg-orange-50/30 flex items-center gap-3">
          <AlertTriangle size={18} className="text-orange-500" />
          <div className="font-body text-sm text-orange-800">
            Les tarifs ne sont pas configurés. Allez dans <strong>Paramètres → Tarifs annuels</strong> pour définir les prix de la licence, adhésion et forfaits.
          </div>
        </Card>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-6">
        <Card padding="sm"><div className="font-body text-2xl font-bold text-blue-500">{active.length}</div><div className="font-body text-xs text-gray-400">Forfaits actifs</div></Card>
        <Card padding="sm"><div className="font-body text-2xl font-bold text-green-600">{forfaits.length}</div><div className="font-body text-xs text-gray-400">Total inscrits</div></Card>
        <Card padding="sm"><div className="font-body text-2xl font-bold text-amber-500">{active.reduce((s, f) => s + (f.totalTTC || 0), 0).toFixed(0)}€</div><div className="font-body text-xs text-gray-400">CA forfaits</div></Card>
        <Card padding="sm"><div className="font-body text-2xl font-bold text-orange-500">{active.filter(f => (f.totalPaidTTC || 0) < (f.totalTTC || 0)).length}</div><div className="font-body text-xs text-gray-400">Paiements en cours</div></Card>
      </div>

      {/* ─── Formulaire de création ─── */}
      {showCreate && (
        <Card padding="md" className="mb-6 border-blue-500/15">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-body text-base font-semibold text-blue-800">Nouvelle inscription annuelle</h3>
            <button onClick={() => setShowCreate(false)} className="text-gray-400 bg-transparent border-none cursor-pointer"><X size={18} /></button>
          </div>

          <div className="flex flex-col gap-4">
            {/* Famille + enfant */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-body text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 block">Famille *</label>
                <select value={selFamily} onChange={e => { setSelFamily(e.target.value); setSelChild(""); }} className={inputStyle}>
                  <option value="">Sélectionner...</option>
                  {families.map(f => {
                    const n = (f.children || []).map((c: any) => c.firstName).join(", ");
                    return <option key={f.firestoreId} value={f.firestoreId}>{f.parentName} {n ? `(${n})` : ""}</option>;
                  })}
                </select>
              </div>
              <div>
                <label className="font-body text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 block">Cavalier *</label>
                {fam ? (
                  <div className="flex flex-wrap gap-2">
                    {children.map((c: any) => (
                      <button key={c.id} onClick={() => setSelChild(c.id)}
                        className={`px-4 py-2.5 rounded-lg border font-body text-sm cursor-pointer transition-all ${selChild === c.id ? "bg-blue-500 text-white border-blue-500" : "bg-white text-gray-500 border-gray-200"}`}>
                        {c.firstName} {c.galopLevel && c.galopLevel !== "—" ? `(${c.galopLevel})` : ""}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="font-body text-xs text-gray-400 py-2">Sélectionnez d&apos;abord une famille</p>
                )}
              </div>
            </div>

            {/* Créneau */}
            <div>
              <label className="font-body text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 block">Créneau hebdomadaire</label>
              <input value={slotKey} onChange={e => setSlotKey(e.target.value)} placeholder="Ex: Cours débutant — Mercredi 10:00" className={inputStyle} />
            </div>

            {/* Forfait cours */}
            <div>
              <label className="font-body text-xs font-semibold text-blue-500 uppercase tracking-wider mb-2 block">Choix du forfait cours *</label>
              {forfaitTarifs.length === 0 ? (
                <p className="font-body text-xs text-orange-500">Aucun forfait configuré. Allez dans Paramètres → Tarifs annuels.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {forfaitTarifs.map(t => (
                    <button key={t.id} onClick={() => setSelForfait(t.id)}
                      className={`px-4 py-3 rounded-lg border font-body text-sm cursor-pointer transition-all flex flex-col items-center ${
                        selForfait === t.id ? "bg-blue-500 text-white border-blue-500" : "bg-white text-gray-600 border-gray-200 hover:border-blue-300"
                      }`}>
                      <span className="font-semibold">{t.label}</span>
                      <span className={`text-lg font-bold ${selForfait === t.id ? "text-white" : "text-blue-500"}`}>{t.priceTTC}€</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Options facultatives */}
            {optionTarifs.length > 0 && (
              <div>
                <label className="font-body text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 block">Options (facultatif)</label>
                <div className="flex flex-wrap gap-2">
                  {optionTarifs.map(t => {
                    const sel = selectedOptions.includes(t.id);
                    return (
                      <button key={t.id} onClick={() => setSelectedOptions(sel ? selectedOptions.filter(id => id !== t.id) : [...selectedOptions, t.id])}
                        className={`px-3 py-2 rounded-lg border font-body text-xs cursor-pointer transition-all ${
                          sel ? "bg-green-500 text-white border-green-500" : "bg-white text-gray-500 border-gray-200"
                        }`}>
                        {t.label} — {t.priceTTC}€
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Récapitulatif avec lignes obligatoires */}
            {selForfait && (
              <Card padding="sm" className="bg-blue-50/50 border-blue-200">
                <div className="font-body text-xs font-semibold text-blue-800 uppercase tracking-wider mb-2">Récapitulatif de l&apos;inscription</div>
                <div className="flex flex-col gap-1">
                  {forfaitLines.map((l, i) => {
                    const isObligatoire = obligatoireTarifs.some(t => t.id === l.tarifId);
                    return (
                      <div key={i} className="flex justify-between items-center font-body text-sm">
                        <div className="flex items-center gap-2">
                          <span className="text-blue-800">{l.label}</span>
                          {isObligatoire && <Badge color="red">Obligatoire</Badge>}
                        </div>
                        <span className="font-semibold text-blue-800">{l.priceTTC.toFixed(2)}€</span>
                      </div>
                    );
                  })}
                  <div className="flex justify-between items-center font-body text-base font-bold text-blue-500 pt-2 mt-2 border-t border-blue-200">
                    <span>Total TTC</span>
                    <span>{totalTTC.toFixed(2)}€</span>
                  </div>
                </div>
              </Card>
            )}

            {/* Plan de paiement */}
            <div>
              <label className="font-body text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 block">Plan de paiement</label>
              <div className="flex gap-2">
                {payPlans.map(pp => (
                  <button key={pp.id} onClick={() => setPayPlan(pp.id)}
                    className={`flex-1 py-2.5 rounded-lg border font-body text-sm cursor-pointer transition-all text-center ${
                      payPlan === pp.id ? "bg-blue-500 text-white border-blue-500" : "bg-white text-gray-500 border-gray-200"
                    }`}>
                    {pp.label}
                    {selForfait && totalTTC > 0 && (
                      <div className={`text-xs mt-0.5 ${payPlan === pp.id ? "text-blue-200" : "text-gray-400"}`}>
                        {pp.id === "1x" ? `${totalTTC.toFixed(0)}€` : `${(totalTTC / parseInt(pp.id)).toFixed(0)}€ × ${parseInt(pp.id)}`}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>

            <button onClick={handleCreate} disabled={!selFamily || !selChild || !selForfait || creating}
              className={`py-3 rounded-xl font-body text-sm font-semibold border-none cursor-pointer transition-all ${
                !selFamily || !selChild || !selForfait || creating ? "bg-gray-200 text-gray-400" : "bg-blue-500 text-white hover:bg-blue-400"
              }`}>
              {creating ? <Loader2 size={16} className="inline animate-spin mr-2" /> : <Check size={16} className="inline mr-2" />}
              Inscrire — {totalTTC.toFixed(0)}€ en {payPlan}
            </button>
          </div>
        </Card>
      )}

      {/* Recherche */}
      <div className="relative mb-4">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher..." className={`${inputStyle} !pl-9`} />
      </div>

      {/* Liste */}
      {filtered.length === 0 ? (
        <Card padding="lg" className="text-center">
          <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto mb-3"><ClipboardList size={28} className="text-blue-300" /></div>
          <p className="font-body text-sm text-gray-500">{search ? "Aucun résultat." : "Aucun forfait annuel."}</p>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map(f => {
            const paidPct = f.totalTTC > 0 ? (f.totalPaidTTC / f.totalTTC) * 100 : 0;
            const lines = f.lines || [];
            return (
              <Card key={f.id} padding="md">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-blue-500 flex items-center justify-center">
                      <Users size={20} className="text-white" />
                    </div>
                    <div>
                      <div className="font-body text-base font-semibold text-blue-800">{f.childName}</div>
                      <div className="font-body text-xs text-gray-400">{f.familyName} · {f.slotKey || "—"}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge color={f.status === "active" ? "green" : f.status === "suspended" ? "orange" : "gray"}>
                      {f.status === "active" ? "Actif" : f.status === "suspended" ? "Suspendu" : "Terminé"}
                    </Badge>
                    <Badge color="blue">{f.paymentPlan}</Badge>
                  </div>
                </div>

                {/* Détail des lignes */}
                {lines.length > 0 && (
                  <div className="mb-3 flex flex-wrap gap-2">
                    {lines.map((l, i) => (
                      <span key={i} className="font-body text-xs bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full">
                        {l.label} — {l.priceTTC}€
                      </span>
                    ))}
                  </div>
                )}

                {/* Barre de paiement */}
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-2 rounded-full bg-gray-100">
                    <div className={`h-2 rounded-full transition-all ${paidPct >= 100 ? "bg-green-400" : "bg-blue-400"}`} style={{ width: `${Math.min(paidPct, 100)}%` }} />
                  </div>
                  <span className="font-body text-xs font-semibold text-blue-500">
                    {(f.totalPaidTTC || 0).toFixed(0)}€ / {(f.totalTTC || 0).toFixed(0)}€
                  </span>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
