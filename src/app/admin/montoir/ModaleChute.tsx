/**
 * src/app/admin/montoir/ModaleChute.tsx
 *
 * Le formulaire de declaration d'une chute, ouvert depuis la ligne d'un
 * cavalier. Seules les circonstances sont obligatoires : c'est le recit qui
 * fait foi si la famille ou l'assurance revient dessus des mois plus tard.
 * Gravite, consequence et suites restent facultatives pour que la monitrice
 * puisse declarer en trente secondes, entre deux reprises.
 *
 * Pourquoi ce fichier : 50 lignes de modale purement presentationnelles au
 * milieu de la feuille d'appel. L'etat de saisie et l'ecriture Firestore
 * restent a la page (voir montoir-chutes.ts) — le composant ne fait
 * qu'afficher et remonter les intentions.
 *
 * JSX DEPLACE tel quel : libelles, exemples de saisie et classes inchanges.
 */

"use client";

import { Loader2, AlertTriangle, Trash2, X } from "lucide-react";
import { chuteKey } from "./montoir-helpers";
import type { ChuteForm, ChuteModal as ChuteModalState } from "./types";

export default function ModaleChute({
  chuteModal, chuteForm, setChuteForm, chutes, chuteSaving,
  displayFromHorseName, setChuteModal, saveChute, deleteChute,
}: {
  chuteModal: ChuteModalState;
  chuteForm: ChuteForm;
  setChuteForm: (fn: (f: ChuteForm) => ChuteForm) => void;
  chutes: Record<string, any>;
  chuteSaving: boolean;
  displayFromHorseName: (horseName: string) => string;
  setChuteModal: (v: ChuteModalState | null) => void;
  saveChute: () => void;
  deleteChute: () => void;
}) {
  return (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center" onClick={() => setChuteModal(null)}>
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[92vh] overflow-auto shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-red-600"><AlertTriangle size={16} className="text-white" /></div>
                <div>
                  <h2 className="font-display text-lg font-bold text-blue-800">Signaler une chute</h2>
                  <p className="font-body text-xs text-slate-600">{chuteModal.e.childName}{chuteModal.e.horseName ? ` — 🐴 ${displayFromHorseName(chuteModal.e.horseName)}` : ""} · {chuteModal.c.activityTitle} ({chuteModal.c.startTime})</p>
                </div>
              </div>
              <button onClick={() => setChuteModal(null)} className="text-slate-400 hover:text-slate-600 bg-transparent border-none cursor-pointer"><X size={20} /></button>
            </div>
            <div className="p-4 flex flex-col gap-4">
              <div>
                <label className="block font-body text-xs font-semibold text-blue-800 mb-1">Circonstances de la chute <span className="text-red-600">*</span></label>
                <textarea autoFocus value={chuteForm.circonstances} onChange={ev => setChuteForm(f => ({ ...f, circonstances: ev.target.value }))} rows={4} placeholder="Ex : refus à l'obstacle, le cavalier a basculé par-dessus l'encolure. Réception sur le côté, pas de perte de connaissance." className="w-full px-3 py-2 rounded-lg border border-gray-200 font-body text-sm resize-y" />
              </div>
              <div>
                <label className="block font-body text-xs font-semibold text-blue-800 mb-1">Gravité <span className="font-normal text-slate-400">(facultatif)</span></label>
                <div className="flex gap-2">
                  {([["legere","Légère","bg-green-100 text-green-800 border-green-300"],["moderee","Modérée","bg-amber-100 text-amber-800 border-amber-300"],["grave","Grave","bg-red-100 text-red-800 border-red-300"]] as const).map(([val,lbl,cls]) => (
                    <button key={val} type="button" onClick={() => setChuteForm(f => ({ ...f, gravite: f.gravite === val ? "" : val }))} className={`flex-1 font-body text-xs font-semibold px-3 py-2 rounded-lg border cursor-pointer ${chuteForm.gravite === val ? cls : "bg-white text-slate-500 border-gray-200 hover:bg-gray-50"}`}>{lbl}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block font-body text-xs font-semibold text-blue-800 mb-1">Conséquence <span className="font-normal text-slate-400">(facultatif)</span></label>
                <div className="flex flex-col sm:flex-row gap-2">
                  {([["remonte","Est remonté","bg-green-100 text-green-800 border-green-300"],["refuse","A refusé de remonter","bg-amber-100 text-amber-800 border-amber-300"],["arret","Arrête l'équitation","bg-red-100 text-red-800 border-red-300"]] as const).map(([val,lbl,cls]) => (
                    <button key={val} type="button" onClick={() => setChuteForm(f => ({ ...f, consequence: f.consequence === val ? "" : val }))} className={`flex-1 font-body text-xs font-semibold px-3 py-2 rounded-lg border cursor-pointer ${chuteForm.consequence === val ? cls : "bg-white text-slate-500 border-gray-200 hover:bg-gray-50"}`}>{lbl}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block font-body text-xs font-semibold text-blue-800 mb-1">Suites / actions <span className="font-normal text-slate-400">(facultatif)</span></label>
                <textarea value={chuteForm.suites} onChange={ev => setChuteForm(f => ({ ...f, suites: ev.target.value }))} rows={2} placeholder="Ex : parents prévenus, pas de suite / passage chez le médecin conseillé." className="w-full px-3 py-2 rounded-lg border border-gray-200 font-body text-sm resize-y" />
              </div>
            </div>
            <div className="p-4 border-t border-gray-100 flex items-center justify-between gap-2">
              {chutes[chuteKey(chuteModal.c.id, chuteModal.e.childId)] ? (
                <button onClick={deleteChute} disabled={chuteSaving} className="flex items-center gap-1.5 font-body text-sm font-semibold text-red-600 bg-red-50 px-3 py-2 rounded-lg border-none cursor-pointer hover:bg-red-100 disabled:opacity-50"><Trash2 size={15} /> Retirer</button>
              ) : <span />}
              <div className="flex gap-2">
                <button onClick={() => setChuteModal(null)} disabled={chuteSaving} className="font-body text-sm text-slate-600 bg-white px-4 py-2 rounded-lg border border-gray-200 cursor-pointer disabled:opacity-50">Annuler</button>
                <button onClick={saveChute} disabled={chuteSaving} className="flex items-center gap-1.5 font-body text-sm font-semibold text-white bg-red-600 px-4 py-2 rounded-lg border-none cursor-pointer hover:bg-red-500 disabled:opacity-50">{chuteSaving ? <Loader2 size={15} className="animate-spin" /> : <AlertTriangle size={15} />} Enregistrer</button>
              </div>
            </div>
          </div>
        </div>
  );
}
