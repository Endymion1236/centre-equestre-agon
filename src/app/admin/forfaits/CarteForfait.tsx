"use client";
/**
 * src/app/admin/forfaits/CarteForfait.tsx
 *
 * Une ligne de la liste des forfaits : en-tête toujours visible (cavalier,
 * créneau, prix, statut) et, une fois dépliée, le détail — avancement du
 * paiement et des séances, créneaux réellement suivis, et les actions
 * (suspendre, réactiver, résilier, changer de créneau, désinscrire).
 *
 * Pourquoi séparé : c'est le bloc qui se répète pour chaque forfait, et le
 * seul endroit où l'on compare l'argent encaissé au prix du forfait. Le
 * sortir de la page rend visible ce dont une carte a besoin — et surtout ce
 * dont elle n'a pas besoin : elle ne lit ni n'écrit rien elle-même, tout
 * arrive par props et toutes les actions remontent à la page.
 */

import { Card, Badge } from "@/components/ui";
import {
  Loader2, Calendar, ChevronDown, ChevronUp, Pause, Play, XCircle, UserMinus, RefreshCw,
} from "lucide-react";
import { NOMS_JOURS_DEPUIS_DIMANCHE, statusConfig } from "./constantes";
import { detecteCreneauxReels, formateDate } from "./calculs";
import type { Creneau, CreneauReel, EtatChangementCreneau, Forfait } from "./types";

interface Props {
  f: Forfait;
  isExp: boolean;
  onToggleExpand: () => void;
  /** Montant réellement encaissé pour ce forfait (calculé depuis `payments`). */
  paid: number;
  creneaux: Creneau[];
  saving: boolean;
  slotChanging: boolean;
  /** Id du forfait en cours de désinscription, ou null. */
  unenrolling: string | null;
  onStatusChange: (id: string, newStatus: string) => void;
  onOuvrirChangementCreneau: (etat: EtatChangementCreneau) => void;
  onRemoveSlot: (f: Forfait, slot: CreneauReel) => void;
  onUnenrollAll: (f: Forfait) => void;
}

export default function CarteForfait({
  f, isExp, onToggleExpand, paid, creneaux, saving, slotChanging, unenrolling,
  onStatusChange, onOuvrirChangementCreneau, onRemoveSlot, onUnenrollAll,
}: Props) {
  const sc = statusConfig[f.status] || statusConfig.active;
  const pctPaid = f.forfaitPriceTTC > 0 ? Math.min(100, Math.round((paid / f.forfaitPriceTTC) * 100)) : 0;
  const pctSessions = (f.totalSessions || 35) > 0 ? Math.round(((f.attendedSessions || 0) / (f.totalSessions || 35)) * 100) : 0;
  const installment = f.paymentPlan === "3x" ? f.forfaitPriceTTC / 3 : f.paymentPlan === "10x" ? f.forfaitPriceTTC / 10 : f.forfaitPriceTTC;

  return (
    <Card padding="md">
      <div className="flex items-center justify-between cursor-pointer" onClick={onToggleExpand}>
        <div className="flex items-center gap-4">
          <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${f.status === "active" ? "bg-green-50" : f.status === "suspended" ? "bg-orange-50" : "bg-gray-50"}`}>
            <Calendar size={18} className={f.status === "active" ? "text-green-600" : f.status === "suspended" ? "text-orange-500" : "text-slate-500"} />
          </div>
          <div>
            <div className="font-body text-sm font-semibold text-blue-800">
              {f.childName} <span className="text-slate-500 font-normal">— {f.familyName}</span>
            </div>
            <div className="font-body text-xs text-slate-500">
              {f.slotKey || f.activityTitle || "—"} · Créé le {formateDate(f.createdAt)}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="font-body text-base font-bold text-blue-500">{(f.forfaitPriceTTC || 0).toFixed(0)}€</div>
            <div className="font-body text-[10px] text-slate-500">{f.paymentPlan || "1x"}</div>
          </div>
          <Badge color={sc.color}>{sc.label}</Badge>
          {isExp ? <ChevronUp size={16} className="text-slate-500" /> : <ChevronDown size={16} className="text-slate-500" />}
        </div>
      </div>

      {isExp && (
        <div className="mt-4 pt-4 border-t border-blue-500/8 space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div><div className="font-body text-[10px] text-slate-500 uppercase">Activité</div><div className="font-body text-sm text-blue-800">{f.activityTitle || "—"}</div></div>
            <div><div className="font-body text-[10px] text-slate-500 uppercase">Créneau</div><div className="font-body text-sm text-blue-800">{f.dayLabel || "—"} {f.startTime}–{f.endTime}</div></div>
            <div><div className="font-body text-[10px] text-slate-500 uppercase">Adhésion</div><div className="font-body text-sm text-blue-800">{f.adhesion ? "Oui" : "Non"}</div></div>
            <div><div className="font-body text-[10px] text-slate-500 uppercase">Licence FFE</div><div className="font-body text-sm text-blue-800">{f.licenceFFE ? `Oui (${f.licenceType === "moins18" ? "-18" : "+18"})` : "Non"}</div></div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="flex justify-between mb-1">
                <span className="font-body text-[10px] text-slate-500 uppercase">Paiement</span>
                <span className="font-body text-xs font-semibold text-blue-500">{paid.toFixed(0)}€ / {(f.forfaitPriceTTC || 0).toFixed(0)}€</span>
              </div>
              <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${pctPaid >= 100 ? "bg-green-500" : pctPaid > 50 ? "bg-blue-400" : "bg-orange-400"}`} style={{ width: `${pctPaid}%` }} />
              </div>
              <div className="font-body text-[10px] text-slate-500 mt-0.5">
                {f.paymentPlan === "1x" ? "Paiement unique" : `${f.paymentPlan} · ${installment.toFixed(0)}€/échéance`}
              </div>
            </div>
            <div>
              <div className="flex justify-between mb-1">
                <span className="font-body text-[10px] text-slate-500 uppercase">Séances</span>
                <span className="font-body text-xs font-semibold text-blue-500">{f.attendedSessions || 0} / {f.totalSessions || 35}</span>
              </div>
              <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full rounded-full bg-blue-400" style={{ width: `${pctSessions}%` }} />
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 pt-2">
            {(() => {
              const slots = detecteCreneauxReels(f, creneaux);
              if (slots.length === 0) return null;
              return (
                <div className="w-full mb-2 bg-blue-50/50 border border-blue-200 rounded-lg p-3">
                  <div className="font-body text-[10px] uppercase text-slate-600 font-semibold mb-2">
                    Créneaux réels ({slots.length}{slots.length > 1 ? " — forfait multi-jours" : ""})
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {slots.map(slot => (
                      <div key={slot.key} className="flex items-center justify-between gap-2 bg-white rounded px-2 py-1.5 border border-gray-100">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          {slot.isPrincipal && (
                            <span className="font-body text-[9px] font-bold uppercase text-blue-500 bg-blue-100 px-1.5 py-0.5 rounded shrink-0">Principal</span>
                          )}
                          <span className="font-body text-xs text-blue-800 truncate">
                            <span className="capitalize">{slot.dayLabel}</span> {slot.startTime}–{slot.endTime} · {slot.activityTitle}
                          </span>
                          <span className="font-body text-[10px] text-slate-400 shrink-0">{slot.count} séances</span>
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <button
                            onClick={() => {
                              const dayNames = NOMS_JOURS_DEPUIS_DIMANCHE;
                              const dow = dayNames.indexOf(slot.dayLabel);
                              onOuvrirChangementCreneau({
                                forfait: f,
                                newSlotSearch: "",
                                oldSlot: {
                                  dayOfWeek: dow,
                                  startTime: slot.startTime,
                                  activityTitle: slot.activityTitle,
                                },
                              });
                            }}
                            disabled={slotChanging || saving}
                            title="Changer ce créneau pour un autre"
                            className="font-body text-[10px] text-blue-500 bg-blue-50 hover:bg-blue-100 px-2 py-1 rounded border-none cursor-pointer">
                            Changer
                          </button>
                          {slots.length > 1 && (
                            <button
                              onClick={() => onRemoveSlot(f, slot)}
                              disabled={slotChanging || saving}
                              title={slot.isPrincipal ? "Retirer le créneau principal (le forfait restera mais sans créneau principal)" : "Retirer ce créneau"}
                              className="font-body text-[10px] text-red-500 bg-red-50 hover:bg-red-100 px-2 py-1 rounded border-none cursor-pointer">
                              Retirer
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  {slots.length > 1 && (
                    <p className="font-body text-[10px] text-slate-500 italic mt-2">
                      💡 Les boutons "Changer de créneau" et "Désinscrire" en dessous agissent globalement sur tout le forfait. Pour modifier un seul créneau, utilisez les boutons ci-dessus.
                    </p>
                  )}
                </div>
              );
            })()}
            {(f.status === "active" || f.status === "actif") && (
              <button onClick={() => onStatusChange(f.id, "suspended")} disabled={saving}
                className="flex items-center gap-1.5 font-body text-xs text-orange-500 bg-orange-50 px-3 py-1.5 rounded-lg border-none cursor-pointer hover:bg-orange-100">
                <Pause size={12} /> Suspendre
              </button>
            )}
            {f.status === "suspended" && (
              <button onClick={() => onStatusChange(f.id, "active")} disabled={saving}
                className="flex items-center gap-1.5 font-body text-xs text-green-600 bg-green-50 px-3 py-1.5 rounded-lg border-none cursor-pointer hover:bg-green-100">
                <Play size={12} /> Réactiver
              </button>
            )}
            {(f.status === "active" || f.status === "actif" || f.status === "suspended") && (
              <button onClick={() => { if (confirm(`Résilier le forfait de ${f.childName} ?`)) onStatusChange(f.id, "cancelled"); }} disabled={saving}
                className="flex items-center gap-1.5 font-body text-xs text-red-500 bg-red-50 px-3 py-1.5 rounded-lg border-none cursor-pointer hover:bg-red-100">
                <XCircle size={12} /> Résilier
              </button>
            )}
            {(f.status === "active" || f.status === "actif" || f.status === "suspended") && (
              <button onClick={() => onOuvrirChangementCreneau({ forfait: f, newSlotSearch: "" })} disabled={saving}
                className="flex items-center gap-1.5 font-body text-xs text-blue-500 bg-blue-50 px-3 py-1.5 rounded-lg border-none cursor-pointer hover:bg-blue-100">
                <RefreshCw size={12} /> Changer de créneau
              </button>
            )}
            {(f.status === "active" || f.status === "actif" || f.status === "suspended") && (
              <button onClick={() => onUnenrollAll(f)} disabled={unenrolling === f.id || saving}
                className="flex items-center gap-1.5 font-body text-xs text-white bg-red-500 px-3 py-1.5 rounded-lg border-none cursor-pointer hover:bg-red-600 disabled:opacity-50">
                {unenrolling === f.id ? <Loader2 size={12} className="animate-spin" /> : <UserMinus size={12} />}
                {unenrolling === f.id ? "Désinscription..." : "Désinscrire de tous les cours"}
              </button>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
