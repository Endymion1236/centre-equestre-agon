"use client";
import { useState } from "react";
import { collection, addDoc, serverTimestamp, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { X, Save, Loader2 } from "lucide-react";
import type { Equide } from "../types";

const inputStyle = "w-full px-3 py-2.5 rounded-xl border border-blue-500/8 font-body text-sm bg-cream focus:outline-none focus:border-blue-400";
const labelStyle = "font-body text-[10px] font-semibold text-slate-600 uppercase block mb-1";

interface Props {
  equides: Equide[];
  defaultEquideId?: string;
  onClose: () => void;
  onDone: () => void;
}

export default function MouvementModal({ equides, defaultEquideId, onClose, onDone }: Props) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    equideId: defaultEquideId || equides[0]?.id || "",
    type: "entree" as "entree" | "sortie",
    date: new Date().toISOString().split("T")[0],
    motif: "Achat",
    temporaire: false,
    dateRetour: "",
    provenance: "",
    destination: "",
    prixAchat: "",
    prixVente: "",
    observations: "",
  });

  const handleSave = async () => {
    setSaving(true);
    try {
      const eq = equides.find(e => e.id === form.equideId);
      await addDoc(collection(db, "mouvements_registre"), {
        equideId: form.equideId,
        equideName: eq?.name || "",
        type: form.type,
        date: Timestamp.fromDate(new Date(form.date)),
        motif: form.motif,
        temporaire: form.temporaire,
        dateRetour: form.dateRetour ? form.dateRetour : null,
        provenance: form.provenance,
        destination: form.destination,
        prixAchat: form.prixAchat ? Number(form.prixAchat) : null,
        prixVente: form.prixVente ? Number(form.prixVente) : null,
        observations: form.observations,
        createdAt: serverTimestamp(),
      });
      onDone();
      onClose();
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  const entreesMotifs = ["Achat", "Naissance", "Retour de prêt", "Retour concours", "Retour pension", "Demi-pension", "Don", "Autre"];
  const sortiesMotifs = ["Vente", "Départ définitif", "Retraite", "Décès", "Prêt extérieur", "Concours", "Pension extérieure", "Fin demi-pension", "Autre"];

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center sm:p-4" onClick={onClose}>
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-lg shadow-xl flex flex-col max-h-[92vh]" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center p-5 border-b border-gray-100 flex-shrink-0">
          <h2 className="font-display text-lg font-bold text-blue-800">Nouveau mouvement</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center cursor-pointer border-none"><X size={16}/></button>
        </div>
        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelStyle}>Équidé</label>
              <select className={inputStyle} value={form.equideId} onChange={e => setForm(f => ({ ...f, equideId: e.target.value }))}>
                {equides.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </div>
            <div>
              <label className={labelStyle}>Type</label>
              <select className={inputStyle} value={form.type}
                onChange={e => setForm(f => ({ ...f, type: e.target.value as "entree" | "sortie", motif: e.target.value === "entree" ? "Achat" : "Vente" }))}>
                <option value="entree">Entrée</option>
                <option value="sortie">Sortie</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelStyle}>Date</label>
              <input type="date" className={inputStyle} value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))}/>
            </div>
            <div>
              <label className={labelStyle}>Motif</label>
              <select className={inputStyle} value={form.motif} onChange={e => setForm(f => ({ ...f, motif: e.target.value }))}>
                {(form.type === "entree" ? entreesMotifs : sortiesMotifs).map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          </div>
          {form.type === "sortie" && (
            <div className="flex items-center gap-4">
              {[{ label: "Sortie définitive", val: false }, { label: "Sortie temporaire", val: true }].map(opt => (
                <label key={String(opt.val)} className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" checked={form.temporaire === opt.val} onChange={() => setForm(f => ({ ...f, temporaire: opt.val }))} className="accent-blue-500"/>
                  <span className={`font-body text-sm font-semibold ${opt.val ? "text-orange-500" : "text-red-500"}`}>{opt.label}</span>
                </label>
              ))}
            </div>
          )}
          {form.temporaire && (
            <div>
              <label className={labelStyle}>Date de retour prévue</label>
              <input type="date" className={inputStyle} value={form.dateRetour} onChange={e => setForm(f => ({ ...f, dateRetour: e.target.value }))}/>
            </div>
          )}
          {form.type === "entree" && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelStyle}>Provenance</label>
                <input className={inputStyle} value={form.provenance} onChange={e => setForm(f => ({ ...f, provenance: e.target.value }))} placeholder="D'où vient-il ?"/>
              </div>
              <div>
                <label className={labelStyle}>Prix d&apos;achat (€)</label>
                <input type="number" className={inputStyle} value={form.prixAchat} onChange={e => setForm(f => ({ ...f, prixAchat: e.target.value }))}/>
              </div>
            </div>
          )}
          {form.type === "sortie" && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelStyle}>Destination</label>
                <input className={inputStyle} value={form.destination} onChange={e => setForm(f => ({ ...f, destination: e.target.value }))} placeholder="Où va-t-il ?"/>
              </div>
              <div>
                <label className={labelStyle}>Prix de vente (€)</label>
                <input type="number" className={inputStyle} value={form.prixVente} onChange={e => setForm(f => ({ ...f, prixVente: e.target.value }))}/>
              </div>
            </div>
          )}
          <div>
            <label className={labelStyle}>Observations</label>
            <textarea className={`${inputStyle} !h-16 resize-none`} value={form.observations} onChange={e => setForm(f => ({ ...f, observations: e.target.value }))}/>
          </div>
        </div>
        <div className="flex justify-end gap-3 p-5 border-t border-gray-100 flex-shrink-0">
          <button onClick={onClose} className="font-body text-sm text-slate-600 bg-white px-4 py-2.5 rounded-lg border border-gray-200 cursor-pointer">Annuler</button>
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-2 font-body text-sm font-semibold text-white bg-blue-500 px-5 py-2.5 rounded-lg border-none cursor-pointer hover:bg-blue-600 disabled:opacity-50">
            {saving ? <Loader2 size={14} className="animate-spin"/> : <Save size={14}/>} Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}
