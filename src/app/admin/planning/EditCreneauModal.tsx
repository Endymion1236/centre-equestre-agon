"use client";
import { X, Loader2 } from "lucide-react";
import type { Creneau } from "./types";

export interface EditForm {
  activityTitle: string;
  monitor: string;
  startTime: string;
  endTime: string;
  maxPlaces: number | string;
  priceTTC: number | string;
  color: string;
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
}

const PRESET_COLORS = ["#2050A0","#27ae60","#e67e22","#7c3aed","#D63031","#16a085","#F0A010","#0ea5e9","#db2777","#64748b"];

export default function EditCreneauModal({
  creneau, form, saving, applyAll, onFormChange, onApplyAllChange, onClose, onSave
}: Props) {
  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="p-5 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="font-display text-lg font-bold text-blue-800">Modifier le créneau</h2>
            <p className="font-body text-xs text-slate-500 mt-0.5">{creneau.date} · {creneau.activityTitle}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 bg-transparent border-none cursor-pointer"><X size={20}/></button>
        </div>
        <div className="p-5 flex flex-col gap-4">
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
            <input value={form.monitor}
              onChange={e => onFormChange({...form, monitor: e.target.value})}
              className="w-full px-3 py-2 rounded-lg border border-blue-500/8 font-body text-sm bg-cream focus:border-blue-500 focus:outline-none"/>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-body text-xs font-semibold text-blue-800 block mb-1">Heure début</label>
              <input type="time" value={form.startTime}
                onChange={e => onFormChange({...form, startTime: e.target.value})}
                className="w-full px-3 py-2 rounded-lg border border-blue-500/8 font-body text-sm bg-cream focus:border-blue-500 focus:outline-none"/>
            </div>
            <div>
              <label className="font-body text-xs font-semibold text-blue-800 block mb-1">Heure fin</label>
              <input type="time" value={form.endTime}
                onChange={e => onFormChange({...form, endTime: e.target.value})}
                className="w-full px-3 py-2 rounded-lg border border-blue-500/8 font-body text-sm bg-cream focus:border-blue-500 focus:outline-none"/>
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

          <label className="flex items-start gap-3 bg-blue-50 rounded-xl p-3 cursor-pointer">
            <input type="checkbox" checked={applyAll} onChange={e => onApplyAllChange(e.target.checked)}
              className="accent-blue-500 w-4 h-4 mt-0.5"/>
            <div>
              <div className="font-body text-sm font-semibold text-blue-800">Appliquer à tous les créneaux similaires</div>
              <div className="font-body text-xs text-slate-500 mt-0.5">Même titre · même jour de la semaine · même heure de départ</div>
            </div>
          </label>

          <div className="flex gap-3">
            <button onClick={onClose}
              className="px-5 py-2.5 rounded-xl font-body text-sm text-slate-500 bg-gray-100 border-none cursor-pointer">Annuler</button>
            <button onClick={onSave} disabled={saving}
              className="flex-1 py-2.5 rounded-xl font-body text-sm font-semibold text-white bg-blue-500 hover:bg-blue-400 border-none cursor-pointer disabled:opacity-50">
              {saving ? <Loader2 size={16} className="animate-spin inline mr-2"/> : null}
              Enregistrer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
