"use client";
import { Trash2, Loader2 } from "lucide-react";
import type { Creneau } from "./types";

interface Props {
  creneau: Creneau & { id: string };
  deleting: boolean;
  deleteCount: number;
  deleteWeekCount: number;
  isStageType: (c: any) => boolean;
  onClose: () => void;
  onConfirm: (mode: "single" | "similar" | "week") => void;
}

export default function DeleteCreneauModal({
  creneau, deleting, deleteCount, deleteWeekCount, isStageType, onClose, onConfirm
}: Props) {
  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center sm:p-4"
      onClick={() => !deleting && onClose()}>
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="p-5">
          <div className="w-12 h-12 rounded-2xl bg-red-50 flex items-center justify-center mx-auto mb-4">
            <Trash2 size={22} className="text-red-500"/>
          </div>
          <h2 className="font-display text-lg font-bold text-blue-800 text-center mb-1">Supprimer ce créneau ?</h2>
          <p className="font-body text-sm text-slate-600 text-center mb-1">
            <strong>{creneau.activityTitle}</strong>
          </p>
          <p className="font-body text-xs text-slate-400 text-center mb-4">
            {new Date(creneau.date).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })} · {creneau.startTime}–{creneau.endTime}
          </p>

          {isStageType(creneau) && deleteWeekCount > 1 && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-3 mb-3 text-center">
              <p className="font-body text-xs text-green-700">
                <strong>{deleteWeekCount} créneaux</strong> pour ce stage cette semaine
              </p>
            </div>
          )}

          {!isStageType(creneau) && deleteCount > 1 && (
            <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 mb-3 text-center">
              <p className="font-body text-xs text-orange-700">
                <strong>{deleteCount} créneaux similaires</strong> dans toute l'année<br/>
                (même titre · même jour · même heure)
              </p>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <button onClick={() => onConfirm("single")} disabled={deleting}
              className="w-full py-3 rounded-xl font-body text-sm font-semibold text-white bg-red-500 hover:bg-red-600 border-none cursor-pointer disabled:opacity-50">
              {deleting ? <Loader2 size={16} className="animate-spin inline mr-2"/> : null}
              Supprimer ce créneau uniquement
            </button>
            {isStageType(creneau) && deleteWeekCount > 1 && (
              <button onClick={() => onConfirm("week")} disabled={deleting}
                className="w-full py-3 rounded-xl font-body text-sm font-semibold text-red-600 bg-red-50 hover:bg-red-100 border-none cursor-pointer disabled:opacity-50">
                🗓️ Supprimer toute la semaine de stage ({deleteWeekCount} créneaux)
              </button>
            )}
            {!isStageType(creneau) && deleteCount > 1 && (
              <button onClick={() => onConfirm("similar")} disabled={deleting}
                className="w-full py-3 rounded-xl font-body text-sm font-semibold text-red-600 bg-red-50 hover:bg-red-100 border-none cursor-pointer disabled:opacity-50">
                Supprimer les {deleteCount} créneaux similaires
              </button>
            )}
            <button onClick={onClose} disabled={deleting}
              className="w-full py-2.5 rounded-xl font-body text-sm text-slate-500 bg-gray-100 border-none cursor-pointer">
              Annuler
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
