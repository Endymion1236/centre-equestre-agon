"use client";
import { useState } from "react";
import { doc, updateDoc, addDoc, collection, serverTimestamp, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Card, Badge } from "@/components/ui";
import { AlertTriangle, Check, X, Save, Loader2 } from "lucide-react";
import type { Equide } from "../types";

const formatDate = (d: any) => {
  if (!d) return "—";
  const dt = d?.toDate ? d.toDate() : new Date(d);
  if (isNaN(dt.getTime())) return "—";
  return dt.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
};

const MOTIF_LABELS: Record<string, string> = {
  blessure: "Blessure", maladie: "Maladie", repos: "Repos", marechal: "Maréchal",
  veterinaire: "Vétérinaire", formation: "Formation", competition_ext: "Compétition ext.", autre: "Autre",
};
const MOTIF_COLORS: Record<string, any> = {
  blessure: "red", maladie: "red", repos: "blue", marechal: "orange",
  veterinaire: "orange", formation: "blue", competition_ext: "purple", autre: "gray",
};

interface Props {
  equides: Equide[];
  indispos: any[];
  showForm: boolean;
  onCloseForm: () => void;
  onRefresh: () => void;
}

export default function TabIndispos({ equides, indispos, showForm, onCloseForm, onRefresh }: Props) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    equideId: "", motif: "blessure", details: "",
    dateDebut: new Date().toISOString().split("T")[0], dateFin: "",
  });

  const inputStyle = "w-full px-3 py-2.5 rounded-xl border border-blue-500/8 font-body text-sm bg-cream focus:outline-none focus:border-blue-400";

  const activeIndispos = indispos.filter((i: any) => i.active);
  const pastIndispos = indispos.filter((i: any) => !i.active);

  const handleSave = async () => {
    if (!form.equideId) return;
    setSaving(true);
    try {
      const eq = equides.find(e => e.id === form.equideId);
      await addDoc(collection(db, "indisponibilites"), {
        equideId: form.equideId,
        equideName: eq?.name || "",
        motif: form.motif,
        details: form.details,
        dateDebut: Timestamp.fromDate(new Date(form.dateDebut)),
        dateFin: form.dateFin ? Timestamp.fromDate(new Date(form.dateFin)) : null,
        active: true,
        createdAt: serverTimestamp(),
      });
      // Marquer l'équidé comme indisponible
      await updateDoc(doc(db, "equides", form.equideId), {
        available: false, status: "indisponible", updatedAt: serverTimestamp(),
      });
      setForm({ equideId: "", motif: "blessure", details: "", dateDebut: new Date().toISOString().split("T")[0], dateFin: "" });
      onCloseForm();
      onRefresh();
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  return (
    <>
      {/* Modal formulaire */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onCloseForm}>
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center p-5 border-b border-gray-100">
              <h2 className="font-display text-lg font-bold text-blue-800">Déclarer une indisponibilité</h2>
              <button onClick={onCloseForm} className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center cursor-pointer border-none"><X size={16}/></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="font-body text-xs font-semibold text-slate-600 block mb-1">Équidé *</label>
                <select value={form.equideId} onChange={e => setForm(f => ({ ...f, equideId: e.target.value }))} className={inputStyle}>
                  <option value="">Sélectionner...</option>
                  {equides.filter(e => e.status === "actif" || e.status === "en_formation").map(e => (
                    <option key={e.id} value={e.id}>{e.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="font-body text-xs font-semibold text-slate-600 block mb-1">Motif *</label>
                <select value={form.motif} onChange={e => setForm(f => ({ ...f, motif: e.target.value }))} className={inputStyle}>
                  {Object.entries(MOTIF_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-body text-xs font-semibold text-slate-600 block mb-1">Début</label>
                  <input type="date" value={form.dateDebut} onChange={e => setForm(f => ({ ...f, dateDebut: e.target.value }))} className={inputStyle}/>
                </div>
                <div>
                  <label className="font-body text-xs font-semibold text-slate-600 block mb-1">Fin prévue</label>
                  <input type="date" value={form.dateFin} onChange={e => setForm(f => ({ ...f, dateFin: e.target.value }))} className={inputStyle}/>
                </div>
              </div>
              <div>
                <label className="font-body text-xs font-semibold text-slate-600 block mb-1">Détails</label>
                <textarea value={form.details} onChange={e => setForm(f => ({ ...f, details: e.target.value }))}
                  rows={2} placeholder="Précisions..." className={`${inputStyle} resize-none`}/>
              </div>
            </div>
            <div className="flex justify-end gap-3 p-5 border-t border-gray-100">
              <button onClick={onCloseForm} className="font-body text-sm text-slate-600 bg-white px-4 py-2.5 rounded-lg border border-gray-200 cursor-pointer">Annuler</button>
              <button onClick={handleSave} disabled={saving || !form.equideId}
                className="flex items-center gap-2 font-body text-sm font-semibold text-white bg-red-500 px-5 py-2.5 rounded-lg border-none cursor-pointer hover:bg-red-600 disabled:opacity-50">
                {saving ? <Loader2 size={14} className="animate-spin"/> : <Save size={14}/>} Déclarer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Actives */}
      {activeIndispos.length > 0 && (
        <div className="mb-6">
          <div className="font-body text-xs font-semibold text-red-500 uppercase tracking-wider mb-2 flex items-center gap-2">
            <AlertTriangle size={14}/> Indisponibilités en cours ({activeIndispos.length})
          </div>
          <div className="flex flex-col gap-2">
            {activeIndispos.map((ind: any) => (
              <Card key={ind.id} padding="sm" className="flex items-center gap-3 !border-red-200 !bg-red-50/30">
                <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center">
                  <AlertTriangle size={18} className="text-red-500"/>
                </div>
                <div className="flex-1">
                  <div className="font-body text-sm font-semibold text-blue-800">{ind.equideName}</div>
                  <div className="font-body text-xs text-gray-400">
                    Depuis {formatDate(ind.dateDebut)}
                    {ind.dateFin ? ` — jusqu'au ${formatDate(ind.dateFin)}` : " — durée indéterminée"}
                  </div>
                  {ind.details && <div className="font-body text-xs text-gray-400 mt-0.5">{ind.details}</div>}
                </div>
                <Badge color={MOTIF_COLORS[ind.motif] || "gray"}>{MOTIF_LABELS[ind.motif] || ind.motif}</Badge>
                <button onClick={async () => {
                  if (!confirm("Terminer cette indisponibilité ?")) return;
                  await updateDoc(doc(db, "indisponibilites", ind.id), { active: false, dateFin: Timestamp.now() });
                  await updateDoc(doc(db, "equides", ind.equideId), { available: true, status: "actif", updatedAt: serverTimestamp() });
                  onRefresh();
                }} className="font-body text-xs text-green-600 bg-green-50 px-3 py-1.5 rounded-lg border-none cursor-pointer hover:bg-green-100">
                  Terminer
                </button>
              </Card>
            ))}
          </div>
        </div>
      )}

      {activeIndispos.length === 0 && pastIndispos.length === 0 && (
        <Card padding="lg" className="text-center">
          <div className="w-14 h-14 rounded-2xl bg-green-50 flex items-center justify-center mx-auto mb-3">
            <Check size={28} className="text-green-400"/>
          </div>
          <p className="font-body text-sm text-gray-500">Aucune indisponibilité. Tous les équidés sont disponibles.</p>
        </Card>
      )}

      {/* Historique */}
      {pastIndispos.length > 0 && (
        <div>
          <div className="font-body text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
            Historique ({pastIndispos.length})
          </div>
          <div className="flex flex-col gap-2">
            {[...pastIndispos].sort((a: any, b: any) => {
              const da = a.dateDebut?.toDate ? a.dateDebut.toDate() : new Date(a.dateDebut);
              const db2 = b.dateDebut?.toDate ? b.dateDebut.toDate() : new Date(b.dateDebut);
              return db2.getTime() - da.getTime();
            }).slice(0, 20).map((ind: any) => (
              <Card key={ind.id} padding="sm" className="flex items-center gap-3 opacity-60">
                <div className="flex-1">
                  <div className="font-body text-sm font-semibold text-blue-800">{ind.equideName}</div>
                  <div className="font-body text-xs text-gray-400">
                    {formatDate(ind.dateDebut)} → {formatDate(ind.dateFin)}
                  </div>
                </div>
                <Badge color="gray">{MOTIF_LABELS[ind.motif] || ind.motif}</Badge>
              </Card>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
