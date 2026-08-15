"use client";
/**
 * src/app/admin/planning/FormulaireCompetition.tsx
 *
 * Engagement d'un cavalier sur une compétition : une ligne par épreuve (ou
 * passage), plus un coaching global.
 *
 * Les tarifs sont LIBRES et saisis à la main, contrairement au reste de
 * l'application : le montant d'un engagement est fixé par l'organisateur de
 * la compétition, pas par le club. C'est pourquoi il n'y a ici aucun calcul
 * de prix — seulement la somme de ce que l'admin a saisi, affichée avant
 * validation pour qu'une faute de frappe se voie.
 *
 * Un engagement par passage, mais le cavalier n'est inscrit qu'UNE fois au
 * créneau : ce sont des lignes de facture, pas des inscriptions.
 */

import { X, Plus } from "lucide-react";
import { payModes } from "./types";

export default function FormulaireCompetition({
  creneau, compEpreuves, setCompEpreuves, compCoaching, setCompCoaching,
  showPay, setShowPay, payMode, setPayMode,
}: {
  creneau: any;
  compEpreuves: { epreuve: string; montant: string }[];
  setCompEpreuves: React.Dispatch<React.SetStateAction<{ epreuve: string; montant: string }[]>>;
  compCoaching: string;
  setCompCoaching: (v: string) => void;
  showPay: boolean;
  setShowPay: (v: boolean) => void;
  payMode: string;
  setPayMode: (v: string) => void;
}) {
  const totalEngagement = compEpreuves.reduce((s, e) => s + (parseFloat(e.montant) || 0), 0);
  const totalCoaching = parseFloat(compCoaching) || 0;
  return (
              <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 flex flex-col gap-3">
                <div className="font-body text-sm font-semibold text-orange-800">🏆 Compétition — tarifs libres</div>

                <div className="flex flex-col gap-2">
                  <label className="font-body text-xs font-semibold text-slate-600">Épreuves / passages</label>
                  {compEpreuves.map((ep, i) => (
                    <div key={i} className="flex gap-2 items-center">
                      <input value={ep.epreuve}
                        onChange={e => setCompEpreuves(prev => prev.map((x, idx) => idx === i ? { ...x, epreuve: e.target.value } : x))}
                        placeholder="Ex: CSO 70cm, Pony Games..."
                        className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-orange-200 font-body text-sm bg-white focus:outline-none focus:border-orange-400" />
                      <input type="number" min="0" step="0.50" value={ep.montant}
                        onChange={e => setCompEpreuves(prev => prev.map((x, idx) => idx === i ? { ...x, montant: e.target.value } : x))}
                        placeholder="€"
                        className="w-20 shrink-0 px-2 py-2 rounded-lg border border-orange-200 font-body text-sm bg-white focus:outline-none focus:border-orange-400" />
                      <button onClick={() => setCompEpreuves(prev => prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev)}
                        disabled={compEpreuves.length === 1}
                        className="px-1 text-slate-300 hover:text-red-500 disabled:opacity-30 disabled:cursor-not-allowed shrink-0" title="Retirer cette épreuve">
                        <X size={16} />
                      </button>
                    </div>
                  ))}
                  <button onClick={() => setCompEpreuves(prev => [...prev, { epreuve: "", montant: "" }])}
                    className="self-start font-body text-xs text-orange-700 font-semibold inline-flex items-center gap-1 hover:underline">
                    <Plus size={13} /> épreuve
                  </button>
                  <div className="font-body text-[10px] text-slate-400">Un engagement par passage. Le cavalier reste inscrit une seule fois au créneau.</div>
                </div>

                <div>
                  <label className="font-body text-xs font-semibold text-slate-600 block mb-1">Coaching (€)</label>
                  <input type="number" min="0" step="0.50" value={compCoaching} onChange={e => setCompCoaching(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-3 py-2 rounded-lg border border-orange-200 font-body text-sm bg-white focus:outline-none focus:border-orange-400" />
                  <div className="font-body text-[10px] text-slate-400 mt-0.5">Accompagnement moniteur (global, une seule fois)</div>
                </div>

                {(totalEngagement > 0 || totalCoaching > 0) && (
                  <div className="bg-white rounded-lg px-3 py-2 border border-orange-100">
                    <div className="font-body text-xs text-slate-600 mb-1">Récapitulatif :</div>
                    {compEpreuves.filter(e => (parseFloat(e.montant) || 0) > 0).map((e, i) => (
                      <div key={i} className="font-body text-xs text-slate-700">Engagement{e.epreuve ? ` — ${e.epreuve}` : ""} : <strong>{(parseFloat(e.montant) || 0).toFixed(2)}€</strong></div>
                    ))}
                    {totalCoaching > 0 && <div className="font-body text-xs text-slate-700">Coaching : <strong>{totalCoaching.toFixed(2)}€</strong></div>}
                    <div className="font-body text-sm font-bold text-orange-700 mt-1">
                      Total : {(totalEngagement + totalCoaching).toFixed(2)}€
                    </div>
                  </div>
                )}
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={showPay} onChange={e => setShowPay(e.target.checked)} className="accent-orange-500 w-4 h-4" />
                  <span className="font-body text-sm text-orange-800 font-semibold">Encaisser maintenant</span>
                </label>
                {showPay && <div className="flex flex-wrap gap-1.5">{payModes.filter(m => m.id !== "carte" && m.id !== "avoir").map(m =>
                  <button key={m.id} onClick={() => setPayMode(m.id)}
                    className={`px-3 py-1.5 rounded-lg border font-body text-[11px] font-medium cursor-pointer ${payMode === m.id ? "bg-orange-500 text-white border-orange-500" : "bg-white text-slate-600 border-gray-200"}`}>
                    {m.icon} {m.label}
                  </button>
                )}</div>}
              </div>
  );
}
