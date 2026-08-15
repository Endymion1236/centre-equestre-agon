"use client";
/**
 * src/app/admin/forfaits/ModaleChangementCreneau.tsx
 *
 * La modale « Changer de créneau » : liste des créneaux hebdomadaires
 * disponibles à venir, avec recherche, pour déplacer un forfait.
 *
 * Pourquoi séparé : c'est le seul morceau de l'écran qui vit par-dessus la
 * page (portail visuel plein écran) et il ne partage aucun état avec la
 * liste ; il ne dépend que du forfait qu'on est en train de déplacer. Le
 * choix d'un créneau est simplement remonté à la page, qui déclenche
 * l'écriture Firestore.
 */

import { Loader2, Search, X } from "lucide-react";
import { construitCreneauxDisponibles } from "./calculs";
import type { Creneau, EtatChangementCreneau, WeeklySlot } from "./types";

interface Props {
  slotChange: EtatChangementCreneau;
  setSlotChange: (etat: EtatChangementCreneau | null) => void;
  creneaux: Creneau[];
  slotChanging: boolean;
  onChoisirCreneau: (forfait: EtatChangementCreneau["forfait"], newSlot: WeeklySlot, oldSlot?: EtatChangementCreneau["oldSlot"]) => void;
}

export default function ModaleChangementCreneau({ slotChange, setSlotChange, creneaux, slotChanging, onChoisirCreneau }: Props) {
  const f = slotChange.forfait;
  const availableSlots = construitCreneauxDisponibles(creneaux, f, slotChange.newSlotSearch);

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4" onClick={() => !slotChanging && setSlotChange(null)}>
      <div className="bg-white rounded-2xl w-full sm:max-w-lg max-h-[85vh] overflow-auto shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="p-5 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="font-display text-lg font-bold text-blue-800">Changer de créneau</h2>
            <p className="font-body text-xs text-slate-500">{f.childName} — actuellement : {f.slotKey}</p>
          </div>
          <button onClick={() => setSlotChange(null)} className="text-slate-400 bg-transparent border-none cursor-pointer"><X size={20}/></button>
        </div>
        <div className="p-5">
          <div className="mb-3">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={slotChange.newSlotSearch} onChange={e => setSlotChange({ ...slotChange, newSlotSearch: e.target.value })}
                placeholder="Rechercher cours, jour, horaire..."
                className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-blue-500/8 font-body text-sm bg-cream focus:border-blue-500 focus:outline-none" />
            </div>
          </div>
          <div className="flex flex-col gap-2 max-h-[50vh] overflow-auto">
            {availableSlots.length === 0 && <p className="font-body text-sm text-slate-500 text-center py-4">Aucun créneau disponible</p>}
            {availableSlots.map(s => (
              <button key={s.key} onClick={() => onChoisirCreneau(f, s, slotChange?.oldSlot)} disabled={slotChanging}
                className="flex items-center justify-between p-3 rounded-xl border border-gray-200 bg-white hover:bg-blue-50 hover:border-blue-300 cursor-pointer text-left disabled:opacity-50">
                <div>
                  <div className="font-body text-sm font-semibold text-blue-800">{s.activityTitle}</div>
                  <div className="font-body text-xs text-slate-500">{s.dayLabel} {s.startTime}–{s.endTime} · {s.monitor}</div>
                </div>
                <div className="text-right">
                  <div className="font-body text-xs font-semibold text-green-600">{s.totalSessions} séances</div>
                  <div className="font-body text-[10px] text-slate-400">{s.spotsAvailable > 0 ? `${s.spotsAvailable} place${s.spotsAvailable > 1 ? "s" : ""}` : "Complet"}</div>
                </div>
              </button>
            ))}
          </div>
          {slotChanging && <div className="flex items-center justify-center py-4"><Loader2 className="w-6 h-6 animate-spin text-blue-500" /><span className="font-body text-sm text-slate-500 ml-2">Changement en cours...</span></div>}
        </div>
      </div>
    </div>
  );
}
