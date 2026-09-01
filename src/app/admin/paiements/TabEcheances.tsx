"use client";
import React, { useMemo, useState } from "react";
import { deleteDoc, doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Card, Badge } from "@/components/ui";
import { Loader2, Check, X, AlertTriangle, CreditCard, Search } from "lucide-react";
import { authFetch } from "@/lib/auth-fetch";
import {
  computeDefaultDate,
  preparerEcheanciers,
  todayIso,
  type SortMode,
} from "./echeances-utils";

interface TabEcheancesProps {
  loading: boolean;
  payments: any[];
  toast: (message: string, type?: "error" | "success" | "warning" | "info", duration?: number) => void;
  setPayments: React.Dispatch<React.SetStateAction<any[]>>;
  refreshAll: () => Promise<void>;
  enregistrerEncaissement: (paymentId: string, paymentData: any, montant: number, mode: string, ref?: string, activityTitle?: string, customDate?: string) => Promise<any>;
}

export function TabEcheances({ loading, payments, toast, refreshAll, enregistrerEncaissement }: TabEcheancesProps) {
  const inputCls = "w-full px-3 py-2.5 rounded-lg border border-blue-500/8 font-body text-sm bg-cream focus:border-blue-500 focus:outline-none";

  const [search, setSearch] = useState("");
  const [onlyOverdue, setOnlyOverdue] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>("retard");

  // Date réellement utilisée lors du clic CB/Chq/Esp/Vir quand l'admin
  // choisit de déroger à la date par défaut de l'échéance.
  const [encaissementDates, setEncaissementDates] = useState<Record<string, string>>({});
  const [editingDate, setEditingDate] = useState<Set<string>>(new Set());
  // ID plutôt qu'un booléen : bloque les doubles clics sur UNE échéance sans
  // empêcher l'admin de travailler sur le reste de la liste.
  const [submittingId, setSubmittingId] = useState<string | null>(null);

  const { groupesList, statsRecap, hasOverdue } = useMemo(
    () => preparerEcheanciers(payments, { search, onlyOverdue, sortMode }),
    [payments, search, onlyOverdue, sortMode],
  );

  if (loading) {
    return (
      <div>
        <div className="text-center py-16"><Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto" /></div>
      </div>
    );
  }

  if (statsRecap.nbFamilies === 0) {
    return (
      <div>
        <Card padding="lg" className="text-center">
          <CreditCard size={28} className="text-slate-400 mx-auto mb-3" />
          <p className="font-body text-sm text-slate-600">Aucun paiement échelonné. Les échéanciers sont créés automatiquement quand un forfait est souscrit en 3x ou 10x depuis le planning.</p>
        </Card>
      </div>
    );
  }

  return (
  <div>
    <Card padding="md" className="mb-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div>
          <div className="font-body text-xs text-slate-500 uppercase tracking-wide font-semibold mb-1">Ce mois</div>
          <div className="font-display text-2xl font-bold text-blue-500">{statsRecap.totalThisMonth.toFixed(2)}€</div>
          <div className="font-body text-[11px] text-slate-500">{statsRecap.countThisMonth} échéance{statsRecap.countThisMonth > 1 ? "s" : ""}</div>
        </div>
        <div>
          <div className="font-body text-xs text-slate-500 uppercase tracking-wide font-semibold mb-1">En retard</div>
          <div className={`font-display text-2xl font-bold ${statsRecap.totalOverdue > 0 ? "text-red-500" : "text-slate-300"}`}>
            {statsRecap.totalOverdue.toFixed(2)}€
          </div>
          <div className="font-body text-[11px] text-slate-500">{statsRecap.countOverdue} échéance{statsRecap.countOverdue > 1 ? "s" : ""}</div>
        </div>
        <div>
          <div className="font-body text-xs text-slate-500 uppercase tracking-wide font-semibold mb-1">À 3 mois</div>
          <div className="font-display text-2xl font-bold text-blue-800">{statsRecap.totalThreeMonths.toFixed(2)}€</div>
          <div className="font-body text-[11px] text-slate-500">{statsRecap.countThreeMonths} échéance{statsRecap.countThreeMonths > 1 ? "s" : ""}</div>
        </div>
        <div>
          <div className="font-body text-xs text-slate-500 uppercase tracking-wide font-semibold mb-1">Familles</div>
          <div className="font-display text-2xl font-bold text-blue-800">{statsRecap.nbFamilies}</div>
          <div className="font-body text-[11px] text-slate-500">avec échéancier{statsRecap.nbFamilies > 1 ? "s" : ""}</div>
        </div>
      </div>
    </Card>

    <Card padding="md" className="mb-4">
      <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Rechercher une famille…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className={`${inputCls} pl-9`}
          />
        </div>
        {hasOverdue && (
          <button type="button"
            onClick={() => setOnlyOverdue(v => !v)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg font-body text-sm font-semibold border-none cursor-pointer ${onlyOverdue ? "bg-red-500 text-white" : "bg-red-50 text-red-600"}`}>
            <AlertTriangle size={14} />
            {onlyOverdue ? "Tous les échéanciers" : "Uniquement les retards"}
          </button>
        )}
        <select
          value={sortMode}
          onChange={e => setSortMode(e.target.value as SortMode)}
          className={`${inputCls} lg:w-56`}
          title="Ordre d'affichage">
          <option value="retard">Tri : Retards d&apos;abord</option>
          <option value="prochaine">Tri : Prochaine échéance</option>
          <option value="alpha">Tri : Famille A → Z</option>
        </select>
      </div>
      {(search || onlyOverdue) && (
        <div className="font-body text-xs text-slate-500 mt-2">
          {groupesList.length} famille{groupesList.length > 1 ? "s" : ""} affichée{groupesList.length > 1 ? "s" : ""} sur {statsRecap.nbFamilies}
        </div>
      )}
    </Card>

    {groupesList.length === 0 ? (
      <Card padding="lg" className="text-center">
        <Search size={28} className="text-slate-400 mx-auto mb-3" />
        <p className="font-body text-sm text-slate-600">Aucune famille ne correspond à votre recherche.</p>
        <button type="button"
          onClick={() => { setSearch(""); setOnlyOverdue(false); }}
          className="mt-3 font-body text-xs text-blue-500 bg-blue-50 px-3 py-1.5 rounded border-none cursor-pointer hover:bg-blue-100">
          Réinitialiser les filtres
        </button>
      </Card>
    ) : (
      <div className="flex flex-col gap-4">
        {groupesList.map(([key, echs]) => {
          const first = echs[0];
          const totalForfait = echs.reduce((s, e) => s + (e.totalTTC || 0), 0);
          const nbPayes = echs.filter(e => e.status === "paid").length;
          const nbTotal = echs.length;
          const today = todayIso();

          return (
            <Card key={key} padding="md">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <div className="font-body text-sm font-semibold text-blue-800">{first.familyName}</div>
                  <div className="font-body text-xs text-slate-600">{first.forfaitRef || (first.items || []).map((i: any) => i.activityTitle).join(", ")}</div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-right">
                    <div className="font-body text-base font-bold text-blue-500">{totalForfait.toFixed(2)}€</div>
                    <div className="font-body text-[10px] text-slate-600">{nbPayes}/{nbTotal} échéances payées</div>
                  </div>
                  {nbPayes < nbTotal && (
                    <button type="button"
                      onClick={async () => {
                        const childIdsSet = new Set<string>();
                        const childInfoMap = new Map<string, string>();
                        echs.forEach((e: any) => {
                          (e.items || []).forEach((it: any) => {
                            if (it.childId) {
                              childIdsSet.add(it.childId);
                              if (it.childName) childInfoMap.set(it.childId, it.childName);
                            }
                          });
                        });
                        const childIds = [...childIdsSet];
                        const childNames = childIds.map(id => childInfoMap.get(id) || "").filter(Boolean);

                        const lines: string[] = [
                          `Annuler l'échéancier de ${first.familyName} ?`,
                          "",
                          `• ${nbPayes} échéance${nbPayes > 1 ? "s" : ""} déjà payée${nbPayes > 1 ? "s" : ""} sur ${nbTotal} → CONSERVÉE${nbPayes > 1 ? "S" : ""} (cours déjà rendus)`,
                          `• ${nbTotal - nbPayes} échéance${(nbTotal - nbPayes) > 1 ? "s" : ""} non payée${(nbTotal - nbPayes) > 1 ? "s" : ""} → SUPPRIMÉE${(nbTotal - nbPayes) > 1 ? "S" : ""}`,
                        ];
                        if (childNames.length > 0) {
                          lines.push(`• ${childNames.join(", ")} → DÉSINSCRIT${childNames.length > 1 ? "S" : ""} des créneaux futurs`);
                        }
                        lines.push("", "Confirmer ?");

                        if (!confirm(lines.join("\n"))) return;

                        let unenrolledOk = 0;
                        let unenrolledErr = 0;
                        for (const childId of childIds) {
                          const childName = childInfoMap.get(childId) || "";
                          try {
                            await authFetch("/api/admin/unenroll-annual", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ childId, childName, familyId: first.familyId }),
                            });
                            unenrolledOk++;
                          } catch (err) {
                            console.error(`Erreur désinscription de ${childName}:`, err);
                            unenrolledErr++;
                          }
                        }

                        const unpaidEchs = echs.filter((e: any) => e.status !== "paid");
                        for (const e of unpaidEchs) {
                          await deleteDoc(doc(db, "payments", e.id));
                        }

                        await refreshAll();

                        const parts: string[] = [`Échéancier annulé — ${unpaidEchs.length} échéance(s) supprimée(s)`];
                        if (unenrolledOk > 0) parts.push(`${unenrolledOk} cavalier(s) désinscrit(s)`);
                        if (unenrolledErr > 0) parts.push(`${unenrolledErr} désinscription(s) échouée(s)`);
                        toast(parts.join(" — "), unenrolledErr > 0 ? "warning" : "success");
                      }}
                      className="font-body text-[10px] text-red-500 bg-red-50 px-2 py-1 rounded border-none cursor-pointer hover:bg-red-100 flex items-center gap-1"
                    >
                      <X size={10}/> Annuler
                    </button>
                  )}
                </div>
              </div>

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

              <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden mb-3">
                <div className={`h-full rounded-full ${nbPayes === nbTotal ? "bg-green-500" : "bg-blue-400"}`} style={{ width: `${(nbPayes / nbTotal) * 100}%` }} />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {echs.map((e: any) => {
                  const isPaid = e.status === "paid";
                  const isOverdue = !isPaid && e.echeanceDate && e.echeanceDate < today;
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
                        {!isPaid && (
                          <div className="flex flex-col gap-1 items-end">
                            <div className="flex gap-1 flex-wrap">
                              {[
                                { id: "cb_terminal", label: "CB", color: "bg-blue-500" },
                                { id: "cheque", label: "Chq", color: "bg-orange-500" },
                                { id: "especes", label: "Esp", color: "bg-green-600" },
                                { id: "virement", label: "Vir", color: "bg-purple-500" },
                              ].map(m => {
                                const isSubmitting = submittingId === e.id;
                                return (
                                <button key={m.id}
                                  type="button"
                                  disabled={isSubmitting}
                                  onClick={async () => {
                                  if (submittingId === e.id) return;
                                  setSubmittingId(e.id);
                                  try {
                                    const encDate = encaissementDates[e.id] || computeDefaultDate(e.echeanceDate);
                                    await enregistrerEncaissement(e.id, e, e.totalTTC || 0, m.id, "",
                                      e.forfaitRef || first.forfaitRef || (e.items || []).map((i: any) => i.activityTitle).join(", "),
                                      encDate);
                                    await refreshAll();
                                    const dateLabel = new Date(encDate + "T12:00:00").toLocaleDateString("fr-FR");
                                    toast(`${(e.totalTTC || 0).toFixed(2)}€ encaissé (${m.label}) le ${dateLabel}`, "success");
                                    setEncaissementDates(prev => { const c = { ...prev }; delete c[e.id]; return c; });
                                    setEditingDate(prev => { const n = new Set(prev); n.delete(e.id); return n; });
                                  } finally {
                                    setSubmittingId(null);
                                  }
                                }}
                                  className={`font-body text-[9px] font-semibold text-white ${m.color} px-2 py-1 rounded border-none cursor-pointer disabled:opacity-50 disabled:cursor-wait`}>
                                  {isSubmitting ? "…" : m.label}
                                </button>
                                );
                              })}
                            </div>
                            <div className="flex items-center gap-1.5 text-[9px]">
                              <span className="text-slate-400">📅</span>
                              {editingDate.has(e.id) ? (
                                <>
                                  <input
                                    type="date"
                                    value={encaissementDates[e.id] || computeDefaultDate(e.echeanceDate)}
                                    onChange={ev => setEncaissementDates(prev => ({ ...prev, [e.id]: ev.target.value }))}
                                    className="font-body text-[10px] text-slate-700 border border-blue-400 rounded px-1 py-0.5 bg-white focus:outline-none cursor-pointer"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingDate(prev => { const n = new Set(prev); n.delete(e.id); return n; });
                                      setEncaissementDates(prev => { const c = { ...prev }; delete c[e.id]; return c; });
                                    }}
                                    title="Annuler la date personnalisée"
                                    className="text-slate-400 hover:text-slate-600 bg-transparent border-none cursor-pointer p-0">
                                    <X size={10} />
                                  </button>
                                </>
                              ) : encaissementDates[e.id] ? (
                                <button
                                  type="button"
                                  onClick={() => setEditingDate(prev => { const n = new Set(prev); n.add(e.id); return n; })}
                                  className="font-body text-[10px] text-blue-600 underline bg-transparent border-none cursor-pointer p-0">
                                  Encaissé le {new Date(encaissementDates[e.id] + "T12:00:00").toLocaleDateString("fr-FR")}
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setEditingDate(prev => { const n = new Set(prev); n.add(e.id); return n; })}
                                  className="font-body text-[10px] text-slate-500 hover:text-blue-600 bg-transparent border-none cursor-pointer p-0 underline-offset-2 hover:underline"
                                  title={`Date d'encaissement par défaut : ${new Date(computeDefaultDate(e.echeanceDate) + "T12:00:00").toLocaleDateString("fr-FR")}`}>
                                  Modifier la date
                                </button>
                              )}
                            </div>
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
    )}
  </div>
  );
}
