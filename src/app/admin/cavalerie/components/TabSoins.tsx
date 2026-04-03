"use client";
import { useState } from "react";
import { collection, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Card, Badge } from "@/components/ui";
import {
  AlertTriangle, X, Save, Loader2, ClipboardList, Edit3, Trash2,
  Stethoscope, Pill, Syringe, Wrench, Bone, Heart, Scissors,
} from "lucide-react";
import type { Equide, SoinRecord, SoinType } from "../types";

const soinTypeOptions = [
  { value: "vermifuge" as SoinType, label: "Vermifuge",         icon: Pill,          recurrence: 90 },
  { value: "vaccin" as SoinType,    label: "Vaccin",            icon: Syringe,       recurrence: 365 },
  { value: "marechal" as SoinType,  label: "Maréchal-ferrant",  icon: Wrench,        recurrence: 42 },
  { value: "dentiste" as SoinType,  label: "Dentiste",          icon: Bone,          recurrence: 365 },
  { value: "osteopathe" as SoinType,label: "Ostéopathe",        icon: Heart,         recurrence: 180 },
  { value: "veterinaire" as SoinType,label: "Vétérinaire",      icon: Stethoscope,   recurrence: 0 },
  { value: "tonte" as SoinType,     label: "Tonte",             icon: Scissors,      recurrence: 0 },
  { value: "autre" as SoinType,     label: "Autre",             icon: ClipboardList, recurrence: 0 },
];

const formatDate = (d: any) => {
  if (!d) return "—";
  const dt = d?.toDate ? d.toDate() : new Date(d);
  if (isNaN(dt.getTime())) return "—";
  return dt.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
};

const daysUntil = (d: any) => {
  if (!d) return 9999;
  const target = d?.toDate ? d.toDate() : new Date(d);
  return Math.ceil((target.getTime() - Date.now()) / 86400000);
};

interface Props {
  equides: Equide[];
  soins: SoinRecord[];
  showForm: boolean;
  onCloseForm: () => void;
  onRefresh: () => void;
}

export default function TabSoins({ equides, soins, showForm, onCloseForm, onRefresh }: Props) {
  const [saving, setSaving] = useState(false);
  const [editingSoin, setEditingSoin] = useState<SoinRecord | null>(null);

  const emptySoin = {
    equideIds: [] as string[], type: "vermifuge" as SoinType, label: "",
    date: new Date().toISOString().split("T")[0], prochainRdv: "", praticien: "", cout: "", observations: "",
  };
  const [form, setForm] = useState(emptySoin);

  const inputStyle = "w-full px-3 py-2.5 rounded-xl border border-blue-500/8 font-body text-sm bg-cream focus:outline-none focus:border-blue-400";
  const labelStyle = "font-body text-[10px] font-semibold text-slate-600 uppercase block mb-1";

  // Alertes — soins avec prochainRdv dans les 14 jours ou dépassés
  const alertes = soins
    .filter(s => s.prochainRdv)
    .map(s => ({ ...s, daysUntil: daysUntil(s.prochainRdv), alertStatus: daysUntil(s.prochainRdv) < 0 ? "en_retard" : "bientot" }))
    .filter(s => s.daysUntil <= 14)
    .sort((a, b) => a.daysUntil - b.daysUntil);

  const saveSoin = async () => {
    if (form.equideIds.length === 0) return;
    setSaving(true);
    try {
      const isMasse = form.equideIds.length > 1;
      const batchId = isMasse ? `batch_${Date.now()}` : null;
      for (const eqId of form.equideIds) {
        const eq = equides.find(e => e.id === eqId);
        await addDoc(collection(db, "soins"), {
          equideId: eqId, equideName: eq?.name || "",
          type: form.type, label: form.label,
          date: Timestamp.fromDate(new Date(form.date)),
          prochainRdv: form.prochainRdv ? Timestamp.fromDate(new Date(form.prochainRdv)) : null,
          praticien: form.praticien,
          cout: form.cout ? Number(form.cout) : null,
          observations: form.observations,
          ...(batchId ? { batchId, batchCount: form.equideIds.length } : {}),
          createdAt: serverTimestamp(),
        });
      }
      setForm(emptySoin);
      onCloseForm();
      onRefresh();
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  const deleteSoin = async (id: string) => {
    if (!confirm("Supprimer ce soin ?")) return;
    await deleteDoc(doc(db, "soins", id));
    onRefresh();
  };

  // Grouper par batchId pour l'affichage
  const batches: Record<string, SoinRecord[]> = {};
  const singles: SoinRecord[] = [];
  soins.forEach(s => {
    if ((s as any).batchId) {
      const bid = (s as any).batchId;
      if (!batches[bid]) batches[bid] = [];
      batches[bid].push(s);
    } else { singles.push(s); }
  });
  const items = [
    ...singles.map(s => ({ key: s.id, date: (s as any).date?.toDate ? (s as any).date.toDate() : new Date((s as any).date), isBatch: false, soins: [s] })),
    ...Object.entries(batches).map(([bid, bs]) => ({ key: bid, date: (bs[0] as any).date?.toDate ? (bs[0] as any).date.toDate() : new Date((bs[0] as any).date), isBatch: true, soins: bs })),
  ].sort((a, b) => b.date.getTime() - a.date.getTime());

  return (
    <>
      {/* Modal formulaire soin */}
      {(showForm || editingSoin) && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center sm:p-4"
          onClick={() => { onCloseForm(); setEditingSoin(null); }}>
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-lg shadow-xl flex flex-col max-h-[92vh]"
            onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center p-5 border-b border-gray-100 flex-shrink-0">
              <h2 className="font-display text-lg font-bold text-blue-800">Enregistrer un soin</h2>
              <button onClick={() => { onCloseForm(); setEditingSoin(null); }} className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center cursor-pointer border-none"><X size={16}/></button>
            </div>
            <div className="p-5 space-y-4 overflow-y-auto flex-1">
              {/* Sélection équidés */}
              <div>
                <label className={labelStyle}>Équidés * ({form.equideIds.length} sélectionné{form.equideIds.length > 1 ? "s" : ""})</label>
                <div className="flex gap-2 mb-2">
                  {[
                    { label: "Tous", fn: () => equides.filter(e => e.status !== "sorti" && e.status !== "deces").map(e => e.id) },
                    { label: "Aucun", fn: () => [] },
                    { label: "Poneys", fn: () => equides.filter(e => e.type === "poney" && e.status !== "sorti" && e.status !== "deces").map(e => e.id) },
                  ].map(b => (
                    <button key={b.label} type="button" onClick={() => setForm(f => ({ ...f, equideIds: b.fn() }))}
                      className="font-body text-xs text-blue-500 bg-blue-50 px-3 py-1 rounded-lg border-none cursor-pointer hover:bg-blue-100">
                      {b.label}
                    </button>
                  ))}
                </div>
                <div className="max-h-36 overflow-y-auto border border-gray-200 rounded-lg p-2 flex flex-wrap gap-1.5">
                  {equides.filter(e => e.status !== "sorti" && e.status !== "deces").map(e => {
                    const selected = form.equideIds.includes(e.id);
                    return (
                      <button key={e.id} type="button"
                        onClick={() => setForm(f => ({ ...f, equideIds: selected ? f.equideIds.filter(id => id !== e.id) : [...f.equideIds, e.id] }))}
                        className={`font-body text-xs px-2.5 py-1 rounded-full border cursor-pointer transition-all ${selected ? "bg-blue-500 text-white border-blue-500" : "bg-white text-gray-500 border-gray-200 hover:border-blue-300"}`}>
                        {e.name}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelStyle}>Type de soin</label>
                  <select className={inputStyle} value={form.type} onChange={e => {
                    const t = e.target.value as SoinType;
                    const opt = soinTypeOptions.find(o => o.value === t);
                    const nextDate = opt && opt.recurrence > 0 ? new Date(Date.now() + opt.recurrence * 86400000).toISOString().split("T")[0] : "";
                    setForm(f => ({ ...f, type: t, label: opt?.label || "", prochainRdv: nextDate }));
                  }}>
                    {soinTypeOptions.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelStyle}>Date du soin</label>
                  <input type="date" className={inputStyle} value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))}/>
                </div>
              </div>
              <div>
                <label className={labelStyle}>Détail</label>
                <input className={inputStyle} value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} placeholder="Ex: Equest Pramox, Vaccin grippe…"/>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelStyle}>Prochain RDV</label>
                  <input type="date" className={inputStyle} value={form.prochainRdv} onChange={e => setForm(f => ({ ...f, prochainRdv: e.target.value }))}/>
                </div>
                <div>
                  <label className={labelStyle}>Praticien</label>
                  <input className={inputStyle} value={form.praticien} onChange={e => setForm(f => ({ ...f, praticien: e.target.value }))} placeholder="Véto, maréchal…"/>
                </div>
              </div>
              <div>
                <label className={labelStyle}>Coût (€)</label>
                <input type="number" className={inputStyle} value={form.cout} onChange={e => setForm(f => ({ ...f, cout: e.target.value }))} placeholder="0"/>
              </div>
              <div>
                <label className={labelStyle}>Observations</label>
                <textarea className={`${inputStyle} !h-16 resize-none`} value={form.observations} onChange={e => setForm(f => ({ ...f, observations: e.target.value }))} placeholder="Remarques…"/>
              </div>
            </div>
            <div className="flex justify-end gap-3 p-5 border-t border-gray-100 flex-shrink-0">
              <button onClick={() => { onCloseForm(); setEditingSoin(null); }} className="font-body text-sm text-slate-600 bg-white px-4 py-2.5 rounded-lg border border-gray-200 cursor-pointer">Annuler</button>
              <button onClick={saveSoin} disabled={saving || form.equideIds.length === 0}
                className="flex items-center gap-2 font-body text-sm font-semibold text-white bg-blue-500 px-5 py-2.5 rounded-lg border-none cursor-pointer hover:bg-blue-600 disabled:opacity-50">
                {saving ? <Loader2 size={14} className="animate-spin"/> : <Save size={14}/>}
                Enregistrer{form.equideIds.length > 1 ? ` (${form.equideIds.length})` : ""}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Alertes */}
      {alertes.length > 0 && (
        <div className="mb-6">
          <div className="font-body text-xs font-semibold text-red-500 uppercase tracking-wider mb-2 flex items-center gap-2">
            <AlertTriangle size={14}/> Alertes ({alertes.length})
          </div>
          <div className="flex flex-col gap-2">
            {alertes.map((a: any) => {
              const stOpt = soinTypeOptions.find(o => o.value === a.type);
              const SI = stOpt?.icon || ClipboardList;
              return (
                <Card key={a.id} padding="sm" className={`flex items-center gap-3 ${a.alertStatus === "en_retard" ? "!border-red-200 !bg-red-50/30" : "!border-orange-200 !bg-orange-50/30"}`}>
                  <SI size={18} className="text-blue-400"/>
                  <div className="flex-1">
                    <div className="font-body text-sm font-semibold text-blue-800">{(a as any).equideName} — {a.label || stOpt?.label}</div>
                    <div className="font-body text-xs text-gray-400">Prévu : {formatDate(a.prochainRdv)} · {a.praticien || "—"}</div>
                  </div>
                  <Badge color={a.alertStatus === "en_retard" ? "red" : "orange"}>
                    {a.daysUntil < 0 ? `${Math.abs(a.daysUntil)}j de retard` : `Dans ${a.daysUntil}j`}
                  </Badge>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Historique */}
      <div className="font-body text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
        Historique des soins ({soins.length})
      </div>
      {items.length === 0 ? (
        <Card padding="lg" className="text-center">
          <div className="w-14 h-14 rounded-2xl bg-green-50 flex items-center justify-center mx-auto mb-3"><Stethoscope size={28} className="text-green-400"/></div>
          <p className="font-body text-sm text-gray-500">Aucun soin enregistré.</p>
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {items.map(item => {
            const s = item.soins[0];
            const stOpt = soinTypeOptions.find(o => o.value === s.type);
            const SI = stOpt?.icon || ClipboardList;
            return (
              <Card key={item.key} padding="sm" className="flex items-start gap-3 group">
                <SI size={18} className="text-blue-400 mt-0.5 flex-shrink-0"/>
                <div className="flex-1 min-w-0">
                  {item.isBatch ? (
                    <>
                      <div className="font-body text-sm font-semibold text-blue-800">
                        {s.label || stOpt?.label} — <span className="text-blue-500">{item.soins.length} équidés</span>
                      </div>
                      <div className="font-body text-xs text-gray-400">
                        {formatDate((s as any).date)} · {s.praticien || "—"}
                        {s.cout && <> · {(s.cout * item.soins.length).toFixed(2)}€</>}
                        {s.prochainRdv && <> · Prochain : {formatDate(s.prochainRdv)}</>}
                      </div>
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {item.soins.map(bs => (
                          <span key={bs.id} className="font-body text-[10px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">{(bs as any).equideName}</span>
                        ))}
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="font-body text-sm font-semibold text-blue-800">{(s as any).equideName} — {s.label || stOpt?.label}</div>
                      <div className="font-body text-xs text-gray-400">
                        {formatDate((s as any).date)} · {s.praticien || "—"}
                        {s.cout && <> · {s.cout}€</>}
                        {s.prochainRdv && <> · Prochain : {formatDate(s.prochainRdv)}</>}
                      </div>
                    </>
                  )}
                  {s.observations && <div className="font-body text-xs text-gray-300 mt-0.5">{s.observations}</div>}
                </div>
                <div className="flex gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => deleteSoin(s.id)}
                    className="w-7 h-7 rounded-lg bg-red-50 text-red-300 hover:text-red-500 hover:bg-red-100 flex items-center justify-center border-none cursor-pointer">
                    <Trash2 size={12}/>
                  </button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
