"use client";
import React, { useState, useMemo } from "react";
import { updateDoc, deleteDoc, doc, getDocs, collection, query, where, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { safeNumber } from "@/lib/utils";
import { Card, Badge } from "@/components/ui";
import { Loader2, ChevronDown, Check, X, AlertTriangle, CreditCard, Search } from "lucide-react";
import { paymentModes } from "./types";

interface TabEcheancesProps {
  loading: boolean;
  payments: any[];
  toast: (message: string, type?: "error" | "success" | "warning" | "info", duration?: number) => void;
  setPayments: React.Dispatch<React.SetStateAction<any[]>>;
  refreshAll: () => Promise<void>;
  enregistrerEncaissement: (paymentId: string, paymentData: any, montant: number, mode: string, ref?: string, activityTitle?: string, customDate?: string) => Promise<any>;
}

type SortMode = "retard" | "prochaine" | "alpha";

export function TabEcheances({ loading, payments, toast, setPayments, refreshAll, enregistrerEncaissement }: TabEcheancesProps) {
  const inputCls = "w-full px-3 py-2.5 rounded-lg border border-blue-500/8 font-body text-sm bg-cream focus:border-blue-500 focus:outline-none";

  // ─── Filtres / tri / recherche ─────────────────────────────────────────
  const [search, setSearch] = useState("");
  const [onlyOverdue, setOnlyOverdue] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>("retard");

  // ─── Filtrage et regroupement (memoizé pour ne pas recalculer à chaque render) ──
  const { groupesList, statsRecap, hasOverdue } = useMemo(() => {
    const today = new Date().toISOString().split("T")[0];
    const todayDate = new Date(today);
    const monthEnd = new Date(todayDate.getFullYear(), todayDate.getMonth() + 1, 0).toISOString().split("T")[0];
    const threeMonthsEnd = new Date(todayDate.getFullYear(), todayDate.getMonth() + 3, todayDate.getDate()).toISOString().split("T")[0];

    // Tous les paiements faisant partie d'un échéancier (hors SEPA et annulés)
    const echeances = payments.filter(p =>
      (p as any).echeancesTotal > 1 &&
      p.status !== "sepa_scheduled" &&
      p.status !== "cancelled"
    );

    // Stats globales sur l'ENSEMBLE (avant filtrage par recherche/onlyOverdue)
    let totalThisMonth = 0;
    let countThisMonth = 0;
    let totalOverdue = 0;
    let countOverdue = 0;
    let totalThreeMonths = 0;
    let countThreeMonths = 0;
    for (const e of echeances) {
      if (e.status === "paid") continue;
      const d = e.echeanceDate;
      if (!d) continue;
      const amount = e.totalTTC || 0;
      if (d < today) {
        totalOverdue += amount;
        countOverdue++;
      } else if (d <= monthEnd) {
        totalThisMonth += amount;
        countThisMonth++;
      }
      if (d <= threeMonthsEnd && d >= today) {
        totalThreeMonths += amount;
        countThreeMonths++;
      }
    }

    // Regrouper par famille + forfaitRef
    const groupes: Record<string, typeof echeances> = {};
    echeances.forEach(p => {
      const key = `${p.familyId}_${(p as any).forfaitRef || ""}`;
      if (!groupes[key]) groupes[key] = [];
      groupes[key].push(p);
    });
    Object.values(groupes).forEach(g => g.sort((a: any, b: any) => (a.echeance || 0) - (b.echeance || 0)));

    // Construire des entrées enrichies pour le tri/filtrage
    type Entry = {
      key: string;
      echs: typeof echeances;
      familyName: string;
      hasOverdue: boolean;
      overdueCount: number;
      nextEchDate: string; // pour tri "prochaine échéance"
    };
    const entries: Entry[] = Object.entries(groupes).map(([key, echs]) => {
      const familyName = (echs[0]?.familyName || "").toString();
      const overdueCount = echs.filter(e => e.status !== "paid" && e.echeanceDate && e.echeanceDate < today).length;
      const nextNonPaid = echs.find(e => e.status !== "paid" && e.echeanceDate);
      const nextEchDate = nextNonPaid?.echeanceDate || "9999-12-31";
      return { key, echs, familyName, hasOverdue: overdueCount > 0, overdueCount, nextEchDate };
    });

    let hasOverdue = entries.some(e => e.hasOverdue);

    // Filtrage : recherche par nom de famille + onlyOverdue
    let filtered = entries;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      filtered = filtered.filter(e => e.familyName.toLowerCase().includes(q));
    }
    if (onlyOverdue) filtered = filtered.filter(e => e.hasOverdue);

    // Tri
    if (sortMode === "retard") {
      filtered.sort((a, b) => {
        // Retards en haut, puis par date de prochaine échéance
        if (a.hasOverdue !== b.hasOverdue) return a.hasOverdue ? -1 : 1;
        return a.nextEchDate.localeCompare(b.nextEchDate);
      });
    } else if (sortMode === "prochaine") {
      filtered.sort((a, b) => a.nextEchDate.localeCompare(b.nextEchDate));
    } else {
      filtered.sort((a, b) => a.familyName.localeCompare(b.familyName, "fr"));
    }

    return {
      groupesList: filtered.map(e => [e.key, e.echs] as [string, typeof echeances]),
      statsRecap: {
        totalThisMonth, countThisMonth,
        totalOverdue, countOverdue,
        totalThreeMonths, countThreeMonths,
        nbFamilies: entries.length,
      },
      hasOverdue,
    };
  }, [payments, search, onlyOverdue, sortMode]);

  if (loading) {
    return (
      <div>
        <div className="text-center py-16"><Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto" /></div>
      </div>
    );
  }

  // Aucune échéance : on garde le placeholder existant
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
    {/* ─── Cadre récap en haut ─────────────────────────────────────────── */}
    <Card padding="md" className="mb-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Ce mois */}
        <div>
          <div className="font-body text-xs text-slate-500 uppercase tracking-wide font-semibold mb-1">Ce mois</div>
          <div className="font-display text-2xl font-bold text-blue-500">{statsRecap.totalThisMonth.toFixed(2)}€</div>
          <div className="font-body text-[11px] text-slate-500">{statsRecap.countThisMonth} échéance{statsRecap.countThisMonth > 1 ? "s" : ""}</div>
        </div>
        {/* En retard */}
        <div>
          <div className="font-body text-xs text-slate-500 uppercase tracking-wide font-semibold mb-1">En retard</div>
          <div className={`font-display text-2xl font-bold ${statsRecap.totalOverdue > 0 ? "text-red-500" : "text-slate-300"}`}>
            {statsRecap.totalOverdue.toFixed(2)}€
          </div>
          <div className="font-body text-[11px] text-slate-500">{statsRecap.countOverdue} échéance{statsRecap.countOverdue > 1 ? "s" : ""}</div>
        </div>
        {/* À 3 mois */}
        <div>
          <div className="font-body text-xs text-slate-500 uppercase tracking-wide font-semibold mb-1">À 3 mois</div>
          <div className="font-display text-2xl font-bold text-blue-800">{statsRecap.totalThreeMonths.toFixed(2)}€</div>
          <div className="font-body text-[11px] text-slate-500">{statsRecap.countThreeMonths} échéance{statsRecap.countThreeMonths > 1 ? "s" : ""}</div>
        </div>
        {/* Familles */}
        <div>
          <div className="font-body text-xs text-slate-500 uppercase tracking-wide font-semibold mb-1">Familles</div>
          <div className="font-display text-2xl font-bold text-blue-800">{statsRecap.nbFamilies}</div>
          <div className="font-body text-[11px] text-slate-500">avec échéancier{statsRecap.nbFamilies > 1 ? "s" : ""}</div>
        </div>
      </div>
    </Card>

    {/* ─── Barre de recherche + filtres ────────────────────────────────── */}
    <Card padding="md" className="mb-4">
      <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-center">
        {/* Recherche */}
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
        {/* Toggle retards */}
        {hasOverdue && (
          <button
            onClick={() => setOnlyOverdue(v => !v)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg font-body text-sm font-semibold border-none cursor-pointer ${onlyOverdue ? "bg-red-500 text-white" : "bg-red-50 text-red-600"}`}>
            <AlertTriangle size={14} />
            {onlyOverdue ? "Tous les échéanciers" : "Uniquement les retards"}
          </button>
        )}
        {/* Tri */}
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
      {/* Compteur de résultats si filtré */}
      {(search || onlyOverdue) && (
        <div className="font-body text-xs text-slate-500 mt-2">
          {groupesList.length} famille{groupesList.length > 1 ? "s" : ""} affichée{groupesList.length > 1 ? "s" : ""} sur {statsRecap.nbFamilies}
        </div>
      )}
    </Card>

    {/* ─── Cas où le filtre ne renvoie rien ────────────────────────────── */}
    {groupesList.length === 0 ? (
      <Card padding="lg" className="text-center">
        <Search size={28} className="text-slate-400 mx-auto mb-3" />
        <p className="font-body text-sm text-slate-600">Aucune famille ne correspond à votre recherche.</p>
        <button
          onClick={() => { setSearch(""); setOnlyOverdue(false); }}
          className="mt-3 font-body text-xs text-blue-500 bg-blue-50 px-3 py-1.5 rounded border-none cursor-pointer hover:bg-blue-100">
          Réinitialiser les filtres
        </button>
      </Card>
    ) : (
      <div className="flex flex-col gap-4">
        {groupesList.map((entry) => {
          const [key, echs] = entry as [string, any[]];
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
                        {/* Boutons d'encaissement : sur TOUTE échéance non payée
                            (incluant les retards — c'est même prioritaire) */}
                        {!isPaid && (
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
    )}
  </div>
  );
}
