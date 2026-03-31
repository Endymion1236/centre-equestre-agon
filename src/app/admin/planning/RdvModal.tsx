"use client";
import { Briefcase, Bell, X } from "lucide-react";

export interface RdvForm {
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  category: string;
  notes: string;
  reminderEmail: string;
  reminderDays: number;
}

export const RDV_CATEGORIES: Record<string, { label: string; color: string }> = {
  veterinaire:  { label: "Vétérinaire",   color: "#e74c3c" },
  marechal:     { label: "Maréchal",       color: "#e67e22" },
  osteopathe:   { label: "Ostéopathe",     color: "#9b59b6" },
  dentiste:     { label: "Dentiste",       color: "#3498db" },
  fournisseur:  { label: "Fournisseur",    color: "#27ae60" },
  administratif:{ label: "Administratif", color: "#95a5a6" },
  autre:        { label: "Autre",          color: "#7f8c8d" },
};

interface Props {
  form: RdvForm;
  onChange: (form: RdvForm) => void;
  onClose: () => void;
  onSave: () => void;
}

export default function RdvModal({ form, onChange, onClose, onSave }: Props) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md mx-4 shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center p-5 border-b border-gray-100">
          <h2 className="font-display text-lg font-bold text-blue-800">Nouveau RDV professionnel</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center cursor-pointer border-none"><X size={16} /></button>
        </div>
        <div className="p-5 space-y-3">
          <div>
            <label className="font-body text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1 block">Catégorie</label>
            <select className="w-full font-body text-sm border border-gray-200 rounded-lg px-3 py-2.5 bg-white focus:outline-none focus:border-blue-400"
              value={form.category} onChange={e => onChange({...form, category: e.target.value})}>
              {Object.entries(RDV_CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
          <div>
            <label className="font-body text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1 block">Titre *</label>
            <input className="w-full font-body text-sm border border-gray-200 rounded-lg px-3 py-2.5 bg-white focus:outline-none focus:border-blue-400"
              value={form.title} onChange={e => onChange({...form, title: e.target.value})}
              placeholder="Ex: Vaccins annuels, Parage cavalerie…" />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="font-body text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1 block">Date *</label>
              <input type="date" className="w-full font-body text-sm border border-gray-200 rounded-lg px-3 py-2.5 bg-white focus:outline-none focus:border-blue-400"
                value={form.date} onChange={e => onChange({...form, date: e.target.value})} />
            </div>
            <div>
              <label className="font-body text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1 block">Début</label>
              <input type="time" className="w-full font-body text-sm border border-gray-200 rounded-lg px-3 py-2.5 bg-white focus:outline-none focus:border-blue-400"
                value={form.startTime} onChange={e => onChange({...form, startTime: e.target.value})} />
            </div>
            <div>
              <label className="font-body text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1 block">Fin</label>
              <input type="time" className="w-full font-body text-sm border border-gray-200 rounded-lg px-3 py-2.5 bg-white focus:outline-none focus:border-blue-400"
                value={form.endTime} onChange={e => onChange({...form, endTime: e.target.value})} />
            </div>
          </div>
          <div>
            <label className="font-body text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1 block">Notes</label>
            <input className="w-full font-body text-sm border border-gray-200 rounded-lg px-3 py-2.5 bg-white focus:outline-none focus:border-blue-400"
              value={form.notes} onChange={e => onChange({...form, notes: e.target.value})}
              placeholder="Ex: Dr Martin, lot de 12 poneys…" />
          </div>
          <div className="border-t border-gray-100 pt-3">
            <div className="font-body text-xs font-semibold text-orange-500 uppercase tracking-wider mb-2 flex items-center gap-1"><Bell size={12} /> Rappel email</div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="font-body text-[10px] text-slate-600 block mb-1">Email de rappel</label>
                <input type="email" className="w-full font-body text-sm border border-gray-200 rounded-lg px-3 py-2.5 bg-white focus:outline-none focus:border-blue-400"
                  value={form.reminderEmail} onChange={e => onChange({...form, reminderEmail: e.target.value})}
                  placeholder="ceagon@orange.fr" />
              </div>
              <div>
                <label className="font-body text-[10px] text-slate-600 block mb-1">Combien de jours avant</label>
                <select className="w-full font-body text-sm border border-gray-200 rounded-lg px-3 py-2.5 bg-white focus:outline-none focus:border-blue-400"
                  value={form.reminderDays} onChange={e => onChange({...form, reminderDays: parseInt(e.target.value)})}>
                  <option value={1}>1 jour avant</option>
                  <option value={2}>2 jours avant</option>
                  <option value={3}>3 jours avant</option>
                  <option value={7}>1 semaine avant</option>
                  <option value={14}>2 semaines avant</option>
                </select>
              </div>
            </div>
            <p className="font-body text-[10px] text-slate-600 mt-1">Laissez l'email vide pour ne pas envoyer de rappel.</p>
          </div>
        </div>
        <div className="flex justify-end gap-3 p-5 border-t border-gray-100">
          <button onClick={onClose} className="font-body text-sm text-slate-600 bg-white px-4 py-2.5 rounded-lg border border-gray-200 cursor-pointer">Annuler</button>
          <button onClick={onSave} disabled={!form.title || !form.date}
            className={`flex items-center gap-2 font-body text-sm font-semibold text-white bg-orange-500 px-5 py-2.5 rounded-lg border-none cursor-pointer hover:bg-orange-600 ${!form.title || !form.date ? "opacity-50" : ""}`}>
            <Briefcase size={16} /> Créer le RDV
          </button>
        </div>
      </div>
    </div>
  );
}
