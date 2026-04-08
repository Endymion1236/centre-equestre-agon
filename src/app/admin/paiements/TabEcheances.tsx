"use client";
import React from "react";
import { updateDoc, deleteDoc, doc, getDocs, collection, query, where, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { safeNumber } from "@/lib/utils";
import { Card, Badge } from "@/components/ui";
import { Loader2, ChevronDown, Check, X, AlertTriangle, CreditCard } from "lucide-react";
import { paymentModes } from "./types";

interface TabEcheancesProps {
  loading: boolean;
  payments: any[];
  toast: (message: string, type?: "error" | "success" | "warning" | "info", duration?: number) => void;
  setPayments: React.Dispatch<React.SetStateAction<any[]>>;
  refreshAll: () => Promise<void>;
  enregistrerEncaissement: (paymentId: string, paymentData: any, montant: number, mode: string, ref?: string, activityTitle?: string, customDate?: string) => Promise<any>;
}

export function TabEcheances({ loading, payments, toast, setPayments, refreshAll, enregistrerEncaissement }: TabEcheancesProps) {
  const inputCls = "w-full px-3 py-2.5 rounded-lg border border-blue-500/8 font-body text-sm bg-cream focus:border-blue-500 focus:outline-none";

  return (
  <div>
    {loading ? <div className="text-center py-16"><Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto" /></div> :
    (() => {
      // Filtrer les paiements qui font partie d'un échéancier (hors SEPA géré séparément)
      const echeances = payments.filter(p =>
        (p as any).echeancesTotal > 1 &&
        p.status !== "sepa_scheduled" &&
        p.status !== "cancelled"
      );
      
      // Grouper par famille + forfaitRef
      const groupes: Record<string, typeof echeances> = {};
      echeances.forEach(p => {
        const key = `${p.familyId}_${(p as any).forfaitRef || ""}`;
        if (!groupes[key]) groupes[key] = [];
        groupes[key].push(p);
      });

      // Trier chaque groupe par numéro d'échéance
      Object.values(groupes).forEach(g => g.sort((a: any, b: any) => (a.echeance || 0) - (b.echeance || 0)));

      const groupesList = Object.entries(groupes);

      return groupesList.length === 0 ? (
        <Card padding="lg" className="text-center">
          <CreditCard size={28} className="text-slate-400 mx-auto mb-3" />
          <p className="font-body text-sm text-slate-600">Aucun paiement échelonné. Les échéanciers sont créés automatiquement quand un forfait est souscrit en 3x ou 10x depuis le planning.</p>
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {groupesList.map(([key, echs]) => {
            const first = echs[0];
            const totalForfait = echs.reduce((s, e) => s + (e.totalTTC || 0), 0);
            const totalPaye = echs.reduce((s, e) => s + (e.paidAmount || 0), 0);
            const nbPayes = echs.filter(e => e.status === "paid").length;
            const nbTotal = echs.length;
            const today = new Date().toISOString().split("T")[0];

            return (
              <Card key={key} padding="md">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <div className="font-body text-sm font-semibold text-blue-800">{first.familyName}</div>
                    <div className="font-body text-xs text-slate-600">{(first as any).forfaitRef || (first.items || []).map((i: any) => i.activityTitle).join(", ")}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-right">
                      <div className="font-body text-base font-bold text-blue-500">{totalForfait.toFixed(2)}€</div>
                      <div className="font-body text-[10px] text-slate-600">{nbPayes}/{nbTotal} échéances payées</div>
                    </div>
                    {nbPayes < nbTotal && (
                      <button
                        onClick={async () => {
                          if (!confirm(`Annuler l'échéancier de ${first.familyName} ?\n\n${nbPayes} échéance(s) déjà payée(s) sur ${nbTotal}.\nLes échéances non payées seront supprimées.\n\nConfirmer ?`)) return;
                          const unpaidEchs = echs.filter((e: any) => e.status !== "paid");
                          for (const e of unpaidEchs) {
                            await deleteDoc(doc(db, "payments", e.id));
                          }
                          await refreshAll();
                          toast(`Échéancier annulé — ${unpaidEchs.length} échéance(s) supprimée(s)`, "success");
                        }}
                        className="font-body text-[10px] text-red-500 bg-red-50 px-2 py-1 rounded border-none cursor-pointer hover:bg-red-100 flex items-center gap-1"
                      >
                        <X size={10}/> Annuler
                      </button>
                    )}
                  </div>
                </div>
                {/* Détail des items du forfait (depuis la première échéance) */}
                {(first.items || []).length > 0 && (
                  <div className="mb-3 bg-sand rounded-lg p-2">
                    {(first.items || []).map((item: any, idx: number) => (
                      <div key={idx} className="flex justify-between font-body text-[11px] py-0.5">
                        <span className="text-gray-600">{item.activityTitle}</span>
                        <span className="text-blue-500 font-semibold">{(item.priceTTC || 0).toFixed(2)}€</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Barre de progression */}
                <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden mb-3">
                  <div className={`h-full rounded-full ${nbPayes === nbTotal ? "bg-green-500" : "bg-blue-400"}`} style={{ width: `${(nbPayes / nbTotal) * 100}%` }} />
                </div>

                {/* Grille des échéances */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {echs.map((e: any) => {
                    const isPaid = e.status === "paid";
                    const isOverdue = !isPaid && e.echeanceDate && e.echeanceDate < today;
                    const isCurrent = !isPaid && !isOverdue;
                    return (
                      <div key={e.id} className={`flex items-center justify-between px-3 py-2 rounded-lg ${isPaid ? "bg-green-50" : isOverdue ? "bg-red-50" : "bg-sand"}`}>
                        <div className="flex items-center gap-2">
                          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${isPaid ? "bg-green-500 text-white" : isOverdue ? "bg-red-500 text-white" : "bg-gray-200 text-slate-600"}`}>
                            {isPaid ? <Check size={12} /> : e.echeance}
                          </div>
                          <div>
                            <div className={`font-body text-xs font-semibold ${isPaid ? "text-green-700" : isOverdue ? "text-red-600" : "text-blue-800"}`}>
                              Échéance {e.echeance}/{e.echeancesTotal}
                            </div>
                            {!isPaid ? (
                              <input
                                type="date"
                                defaultValue={e.echeanceDate || ""}
                                onBlur={async (ev) => {
                                  const newDate = ev.target.value;
                                  if (newDate && newDate !== e.echeanceDate) {
                                    await updateDoc(doc(db, "payments", e.id), { echeanceDate: newDate, updatedAt: serverTimestamp() });
                                    await refreshAll();
                                    toast("Date de prélèvement mise à jour", "success");
                                  }
                                }}
                                className="font-body text-[10px] text-slate-600 border border-gray-200 rounded px-1 py-0.5 bg-white focus:outline-none focus:border-blue-400 cursor-pointer"
                              />
                            ) : (
                              <div className="font-body text-[10px] text-slate-600">
                                {e.echeanceDate ? new Date(e.echeanceDate).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) : "—"}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`font-body text-sm font-bold ${isPaid ? "text-green-600" : isOverdue ? "text-red-500" : "text-blue-500"}`}>{(e.totalTTC || 0).toFixed(2)}€</span>
                          {isPaid && <Badge color="green">Payé</Badge>}
                          {isOverdue && <Badge color="red">En retard</Badge>}
                          {isCurrent && !isPaid && (
                            <div className="flex gap-1 flex-wrap">
                              {[
                                { id: "cb_terminal", label: "CB", color: "bg-blue-500" },
                                { id: "cheque", label: "Chq", color: "bg-orange-500" },
                                { id: "especes", label: "Esp", color: "bg-green-600" },
                                { id: "virement", label: "Vir", color: "bg-purple-500" },
                              ].map(m => (
                                <button key={m.id} onClick={async () => {
                                  await enregistrerEncaissement(e.id, e, e.totalTTC || 0, m.id, "",
                                    (e as any).forfaitRef || (first as any).forfaitRef || (e.items || []).map((i: any) => i.activityTitle).join(", "));
                                  await refreshAll();
                                  toast(`${(e.totalTTC || 0).toFixed(2)}€ encaissé (${m.label})`, "success");
                                }}
                                  className={`font-body text-[9px] font-semibold text-white ${m.color} px-2 py-1 rounded border-none cursor-pointer`}>
                                  {m.label}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            );
          })}
        </div>
      );
    })()}
  </div>
  );
}
