"use client";
import { X, Loader2, Copy } from "lucide-react";
import { useState, useEffect } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Creneau } from "./types";

// Créneaux horaires disponibles de 7h à 21h par tranches de 15min
const TIME_OPTIONS = Array.from({ length: (21 - 7) * 4 + 1 }, (_, i) => {
  const totalMinutes = 7 * 60 + i * 15;
  const h = Math.floor(totalMinutes / 60).toString().padStart(2, "0");
  const m = (totalMinutes % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
});

export interface EditForm {
  activityTitle: string;
  monitor: string;
  startTime: string;
  endTime: string;
  maxPlaces: number | string;
  priceTTC: number | string;
  color: string;
  allowDayBooking?: boolean;
  priceTTCDay?: number | string;
  themeStage?: string;
}

interface Props {
  creneau: Creneau & { id: string };
  form: EditForm;
  saving: boolean;
  applyAll: boolean;
  onFormChange: (form: EditForm) => void;
  onApplyAllChange: (v: boolean) => void;
  onClose: () => void;
  onSave: () => void;
  onDuplicate?: () => void;
}

const PRESET_COLORS = ["#2050A0","#27ae60","#e67e22","#7c3aed","#D63031","#16a085","#F0A010","#0ea5e9","#db2777","#64748b"];

export default function EditCreneauModal({
  creneau, form, saving, applyAll, onFormChange, onApplyAllChange, onClose, onSave, onDuplicate
}: Props) {
  const [moniteurs, setMoniteurs] = useState<string[]>([]);
  const [themes, setThemes] = useState<{ id: string; label: string }[]>([]);

  useEffect(() => {
    getDocs(collection(db, "moniteurs")).then(snap => {
      setMoniteurs(snap.docs.map(d => (d.data() as any).name).filter(Boolean).sort());
    });
    getDocs(collection(db, "themes-stage")).then(snap => {
      setThemes(snap.docs.map(d => ({ id: d.id, label: (d.data() as any).label }))
        .sort((a, b) => a.label.localeCompare(b.label)));
    });
  }, []);
  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center sm:p-4" onClick={onClose}>
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-md shadow-2xl flex flex-col max-h-[92vh]" onClick={e => e.stopPropagation()}>
        {/* Header fixe */}
        <div className="p-5 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="font-display text-lg font-bold text-blue-800">Modifier le créneau</h2>
            <p className="font-body text-xs text-slate-500 mt-0.5">{creneau.date} · {creneau.activityTitle}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 bg-transparent border-none cursor-pointer"><X size={20}/></button>
        </div>
        {/* Contenu scrollable */}
        <div className="p-5 flex flex-col gap-4 overflow-y-auto flex-1">
          <div>
            <label className="font-body text-xs font-semibold text-blue-800 block mb-1">Titre</label>
            <input value={form.activityTitle}
              onChange={e => onFormChange({...form, activityTitle: e.target.value})}
              className="w-full px-3 py-2 rounded-lg border border-blue-500/8 font-body text-sm bg-cream focus:border-blue-500 focus:outline-none"/>
          </div>
          <div>
            <label className="font-body text-xs font-semibold text-blue-800 block mb-1">Couleur du créneau</label>
            <div className="flex items-center gap-3">
              <input type="color" value={form.color || "#2050A0"}
                onChange={e => onFormChange({...form, color: e.target.value})}
                className="w-10 h-10 rounded-lg border border-gray-200 cursor-pointer p-0.5"/>
              <div className="flex flex-wrap gap-1.5">
                {PRESET_COLORS.map(color => (
                  <button key={color} onClick={() => onFormChange({...form, color})}
                    className={`w-6 h-6 rounded-full border-2 cursor-pointer ${form.color === color ? "border-blue-500 scale-125" : "border-white"}`}
                    style={{background: color}}/>
                ))}
              </div>
            </div>
          </div>
          <div>
            <label className="font-body text-xs font-semibold text-blue-800 block mb-1">Moniteur</label>
            <select value={form.monitor}
              onChange={e => onFormChange({...form, monitor: e.target.value})}
              className="w-full px-3 py-2 rounded-lg border border-blue-500/8 font-body text-sm bg-cream focus:border-blue-500 focus:outline-none cursor-pointer">
              <option value="">— Choisir un moniteur —</option>
              {moniteurs.map(m => <option key={m} value={m}>{m}</option>)}
              {/* Si valeur actuelle pas dans la liste, l'ajouter */}
              {form.monitor && !moniteurs.includes(form.monitor) && (
                <option value={form.monitor}>{form.monitor}</option>
              )}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-body text-xs font-semibold text-blue-800 block mb-1">Heure début</label>
              <select value={form.startTime}
                onChange={e => onFormChange({...form, startTime: e.target.value})}
                className="w-full px-3 py-2.5 rounded-lg border border-blue-500/8 font-body text-sm bg-cream focus:border-blue-500 focus:outline-none cursor-pointer">
                {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="font-body text-xs font-semibold text-blue-800 block mb-1">Heure fin</label>
              <select value={form.endTime}
                onChange={e => onFormChange({...form, endTime: e.target.value})}
                className="w-full px-3 py-2.5 rounded-lg border border-blue-500/8 font-body text-sm bg-cream focus:border-blue-500 focus:outline-none cursor-pointer">
                {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-body text-xs font-semibold text-blue-800 block mb-1">Places max</label>
              <input type="number" min="1" value={form.maxPlaces}
                onChange={e => onFormChange({...form, maxPlaces: e.target.value})}
                className="w-full px-3 py-2 rounded-lg border border-blue-500/8 font-body text-sm bg-cream focus:border-blue-500 focus:outline-none"/>
            </div>
            <div>
              <label className="font-body text-xs font-semibold text-blue-800 block mb-1">Prix TTC (€)</label>
              <input type="number" min="0" step="0.5" value={form.priceTTC}
                onChange={e => onFormChange({...form, priceTTC: e.target.value})}
                className="w-full px-3 py-2 rounded-lg border border-blue-500/8 font-body text-sm bg-cream focus:border-blue-500 focus:outline-none"/>
            </div>
          </div>

          {/* Thème narratif (stages uniquement) */}
          {(creneau.activityType === "stage" || creneau.activityType === "stage_journee") && (
            <div className="bg-purple-50 rounded-xl p-3 flex flex-col gap-2">
              <label className="font-body text-xs font-semibold text-purple-800 block">🎭 Thème narratif</label>
              <select value={form.themeStage || ""}
                onChange={e => onFormChange({ ...form, themeStage: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-purple-200 font-body text-sm bg-white focus:border-purple-500 focus:outline-none cursor-pointer">
                <option value="">— Non défini —</option>
                {themes.map(t => <option key={t.id} value={t.label}>{t.label}</option>)}
              </select>
              <div className="font-body text-[10px] text-purple-500">
                Utilisé par l'IA pour recommander les thèmes non encore vus par les cavaliers.
              </div>
            </div>
          )}

          {/* Option inscription à la journée (stages uniquement) */}
          {(creneau.activityType === "stage" || creneau.activityType === "stage_journee") && (
            <div className="bg-green-50 rounded-xl p-3 flex flex-col gap-3">
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={!!form.allowDayBooking} onChange={e => onFormChange({...form, allowDayBooking: e.target.checked})}
                  className="accent-green-600 w-4 h-4"/>
                <div>
                  <div className="font-body text-sm font-semibold text-green-800">Autoriser l'inscription à la journée</div>
                  <div className="font-body text-xs text-slate-500 mt-0.5">Les cavaliers pourront choisir des jours individuels au lieu de la semaine complète</div>
                </div>
              </label>
              {form.allowDayBooking && (
                <div>
                  <label className="font-body text-xs font-semibold text-green-800 block mb-1">Prix TTC par journée (€)</label>
                  <input type="number" min="0" step="0.5" value={form.priceTTCDay || ""}
                    onChange={e => onFormChange({...form, priceTTCDay: e.target.value})}
                    placeholder="Ex: 35"
                    className="w-full px-3 py-2 rounded-lg border border-green-200 font-body text-sm bg-white focus:border-green-500 focus:outline-none"/>
                  <div className="font-body text-[10px] text-slate-500 mt-1">Si vide, le tarif sera calculé au prorata du prix semaine</div>
                </div>
              )}
            </div>
          )}

          <label className="flex items-start gap-3 bg-blue-50 rounded-xl p-3 cursor-pointer">
            <input type="checkbox" checked={applyAll} onChange={e => onApplyAllChange(e.target.checked)}
              className="accent-blue-500 w-4 h-4 mt-0.5"/>
            <div>
              <div className="font-body text-sm font-semibold text-blue-800">Appliquer à tous les créneaux similaires</div>
              <div className="font-body text-xs text-slate-500 mt-0.5">Même titre · même jour de la semaine · même heure de départ</div>
            </div>
          </label>
        </div>
        {/* Footer fixe avec les boutons */}
        <div className="flex gap-3 p-5 border-t border-gray-100 flex-shrink-0">
          <button onClick={onClose}
            className="px-5 py-3 rounded-xl font-body text-sm text-slate-500 bg-gray-100 border-none cursor-pointer">Annuler</button>
          {onDuplicate && (
            <button onClick={onDuplicate}
              className="px-4 py-3 rounded-xl font-body text-sm font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 border-none cursor-pointer flex items-center gap-1.5">
              <Copy size={14}/>Dupliquer
            </button>
          )}
          <button onClick={onSave} disabled={saving}
            className="flex-1 py-3 rounded-xl font-body text-sm font-semibold text-white bg-blue-500 hover:bg-blue-400 border-none cursor-pointer disabled:opacity-50">
            {saving ? <Loader2 size={16} className="animate-spin inline mr-2"/> : null}
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}
