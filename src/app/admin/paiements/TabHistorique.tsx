"use client";
import React, { useState } from "react";
import { updateDoc, deleteDoc, doc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { safeNumber, generateOrderId } from "@/lib/utils";
import { Card, Badge } from "@/components/ui";
import { Loader2, ChevronDown, Receipt, Trash2, Search, X, Check, Copy, Pencil } from "lucide-react";
import { downloadInvoicePdf } from "@/lib/download-invoice";
import { downloadAvoirPdf } from "@/lib/download-avoir";
import { downloadFacturX, downloadFacturXPdf } from "@/lib/download-facturx";
import { paymentModes } from "./types";
import { NoteField } from "./NoteField";

interface TabHistoriqueProps {
  loading: boolean;
  payments: any[];
  avoirs: any[];
  encaissements: any[];
  families: any[];
  toast: (message: string, type?: "error" | "success" | "warning" | "info", duration?: number) => void;
  setPayments: React.Dispatch<React.SetStateAction<any[]>>;
  setDuplicateTarget: (val: any) => void;
  deletePaymentCommand: (payment: any) => Promise<void>;
  setEditPayment: (val: any) => void;
  setEditItems: (val: any[]) => void;
  setEditRemisePct: (val: string) => void;
  setEditRemiseEuros: (val: string) => void;
}

export function TabHistorique({ loading, payments, avoirs, encaissements, families, toast, setPayments, setDuplicateTarget, deletePaymentCommand, setEditPayment, setEditItems, setEditRemisePct, setEditRemiseEuros }: TabHistoriqueProps) {
  const [histSearch, setHistSearch] = useState("");
  const [histModeFilter, setHistModeFilter] = useState("all");
  const [histStatusFilter, setHistStatusFilter] = useState("all");
  const [histPeriod, setHistPeriod] = useState("");
  // Tri configurable (persisté en localStorage pour mémoriser le choix entre sessions).
  // Trois options : 'commande' (date fiscale = colonne DATE affichée), 'encaissement'
  // (heure du dernier paiement reçu), 'facture' (numéro de facture lexico).
  const [sortBy, setSortBy] = useState<"commande" | "encaissement" | "facture">(() => {
    if (typeof window === "undefined") return "commande";
    const saved = window.localStorage.getItem("histSortBy");
    return (saved === "encaissement" || saved === "facture") ? saved : "commande";
  });
  const updateSortBy = (v: "commande" | "encaissement" | "facture") => {
    setSortBy(v);
    if (typeof window !== "undefined") window.localStorage.setItem("histSortBy", v);
  };
  const inputCls = "w-full px-3 py-2.5 rounded-lg border border-blue-500/8 font-body text-sm bg-cream focus:border-blue-500 focus:outline-none";

  return (
  <div>
    {loading ? (
      <div className="text-center py-16"><Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto" /></div>
    ) : (() => {
      // Filtres
      const [modeFilter, setModeFilter] = [histModeFilter, setHistModeFilter];
      const [statusFilter, setStatusFilter] = [histStatusFilter, setHistStatusFilter];
      const [searchFilter, setSearchFilter] = [histSearch, setHistSearch];
      const [periodFilter, setPeriodFilter] = [histPeriod, setHistPeriod];

      // Filtrage — Historique = factures uniquement (paid, partial encaissé, cancelled)
      // Les pending/draft sont des proformas → visibles dans Impayés, pas ici
      // SAUF si une proforma a été convertie en facture définitive (invoiceNumber présent)
      let filtered = payments.filter(p => 
        p.status === "paid" || p.status === "partial" || p.status === "cancelled" || p.status === "sepa_scheduled" ||
        ((p as any).invoiceNumber)
      );
      // Inclure aussi les encaissements "avoir" qui n'ont pas de payment lié dans payments
      const avoirEncaissements = encaissements
        .filter((e: any) => e.mode === "avoir" && !payments.some(p => p.id === e.paymentId))
        .map((e: any) => ({
          id: e.id,
          familyId: e.familyId,
          familyName: e.familyName,
          date: e.date,
          createdAt: e.createdAt || e.date, // pour tri chronologique
          totalTTC: e.montant || 0,
          paidAmount: e.montant || 0,
          status: "paid",
          paymentMode: "avoir",
          items: [{ activityTitle: e.activityTitle || "Avoir utilisé" }],
          _fromEncaissement: true,
        }));
      filtered = [...filtered, ...avoirEncaissements] as any[];
      if (modeFilter !== "all") filtered = filtered.filter(p => p.paymentMode === modeFilter);
      if (statusFilter !== "all") filtered = filtered.filter(p => p.status === statusFilter);
      if (searchFilter) {
        const q = searchFilter.toLowerCase();
        filtered = filtered.filter(p => p.familyName?.toLowerCase().includes(q) || (p.items || []).some((i: any) => i.activityTitle?.toLowerCase().includes(q)));
      }
      if (periodFilter) {
        filtered = filtered.filter(p => {
          const d = p.date?.seconds ? new Date(p.date.seconds * 1000) : null;
          if (!d) return false;
          const m = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
          return m === periodFilter;
        });
      }

      // Tri configurable selon le choix utilisateur (sortBy ci-dessus).
      // - 'commande' : date fiscale (= colonne DATE affichée). Le plus intuitif
      //   visuellement, c'est ce qu'attendent la plupart des utilisateurs.
      // - 'encaissement' : heure du dernier encaissement reçu. Utile pour voir
      //   ce qui vient d'être payé en haut, même pour des factures anciennes.
      // - 'facture' : numéro de facture lexico desc. Utile pour la compta
      //   officielle (le n° suit l'ordre chronologique légal de validation).
      const getTsFromField = (src: any): number => {
        if (!src) return 0;
        if (src.seconds !== undefined) return src.seconds * 1000 + (src.nanoseconds || 0) / 1e6;
        if (src.toDate) return src.toDate().getTime();
        return 0;
      };
      // Index : paymentId → heure du dernier encaissement (utilisé en mode 'encaissement')
      const lastEncaissementByPayment = new Map<string, number>();
      for (const e of encaissements) {
        if (!e.paymentId) continue;
        const ts = getTsFromField(e.createdAt) || getTsFromField(e.date);
        const cur = lastEncaissementByPayment.get(e.paymentId) || 0;
        if (ts > cur) lastEncaissementByPayment.set(e.paymentId, ts);
      }
      const getTs = (p: any) => {
        if (sortBy === "encaissement") {
          // Priorité dernier encaissement, fallback createdAt puis date
          const encTs = lastEncaissementByPayment.get(p.id) || 0;
          if (encTs > 0) return encTs;
          return getTsFromField(p.createdAt) || getTsFromField(p.date);
        }
        // 'commande' (par défaut) : on prend la date fiscale (date), qui correspond
        // à la colonne DATE affichée. Fallback sur createdAt si date manquante.
        return getTsFromField(p.date) || getTsFromField(p.createdAt);
      };
      filtered = [...filtered].sort((a, b) => {
        if (sortBy === "facture") {
          // Tri par numéro de facture lexico desc. Les paiements sans n° passent en bas.
          const na = String((a as any).invoiceNumber || a.id || "");
          const nb = String((b as any).invoiceNumber || b.id || "");
          // Tri ASCII desc, mais on remonte les vrais n° "F-..." avant les ids type "PF-..." ou alphanumériques
          const aHasNum = /^F-/.test(na);
          const bHasNum = /^F-/.test(nb);
          if (aHasNum !== bHasNum) return aHasNum ? -1 : 1;
          return nb.localeCompare(na);
        }
        const diff = getTs(b) - getTs(a);
        if (diff !== 0) return diff;
        // Tie-break stable par id pour éviter les sauts d'ordre visuels
        return String(b.id || "").localeCompare(String(a.id || ""));
      });

      // Totaux par mode
      const totalsByMode: Record<string, number> = {};
      filtered.forEach(p => { totalsByMode[p.paymentMode] = (totalsByMode[p.paymentMode] || 0) + (p.totalTTC || 0); });
      const grandTotal = filtered.reduce((s, p) => s + (p.totalTTC || 0), 0);

      return (
        <>
          {/* KPIs par mode */}
          <div className="flex flex-wrap gap-3 mb-4">
            {Object.entries(totalsByMode).sort(([,a],[,b]) => b - a).map(([mode, total]) => {
              const modeObj = paymentModes.find(m => m.id === mode);
              return (
                <div key={mode} onClick={() => setHistModeFilter(modeFilter === mode ? "all" : mode as any)}
                  className={`flex flex-col items-center px-4 py-2.5 rounded-xl cursor-pointer transition-all ${modeFilter === mode ? "bg-blue-500 text-white ring-2 ring-blue-300" : "bg-sand hover:bg-blue-50"}`}>
                  <div className={`font-body text-[10px] uppercase font-semibold ${modeFilter === mode ? "text-white/70" : "text-slate-600"}`}>
                    {modeObj?.label || mode}
                  </div>
                  <div className={`font-body text-base font-bold ${modeFilter === mode ? "text-white" : "text-blue-800"}`}>{total.toFixed(2)}€</div>
                </div>
              );
            })}
            <div className="flex flex-col items-center px-4 py-2.5 rounded-xl bg-blue-50">
              <div className="font-body text-[10px] uppercase font-semibold text-blue-400">Total</div>
              <div className="font-body text-base font-bold text-blue-500">{grandTotal.toFixed(2)}€</div>
            </div>
          </div>

          {/* Filtres : statut + recherche + période */}
          <div className="flex flex-wrap gap-3 mb-4 items-center">
            <div className="flex gap-1.5">
              {([["all", "Tous"], ["paid", "Réglés"], ["pending", "À régler"], ["partial", "Partiels"], ["sepa_scheduled", "SEPA en cours"], ["cancelled", "Annulés"]] as const).map(([val, label]) => (
                <button key={val} onClick={() => setHistStatusFilter(val as any)}
                  className={`font-body text-xs px-3 py-1.5 rounded-lg border-none cursor-pointer transition-all ${histStatusFilter === val ? "bg-blue-500 text-white" : "bg-white text-slate-600 border border-gray-200"}`}>
                  {label}
                </button>
              ))}
            </div>
            <div className="relative flex-1 min-w-[200px]">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input placeholder="Rechercher par nom ou prestation…" value={histSearch} onChange={e => setHistSearch(e.target.value)}
                className="w-full font-body text-xs border border-gray-200 rounded-lg pl-9 pr-3 py-2 bg-white focus:outline-none focus:border-blue-400" />
            </div>
            <input type="month" value={histPeriod} onChange={e => setHistPeriod(e.target.value)}
              className="font-body text-xs border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-blue-400" />
            {(modeFilter !== "all" || statusFilter !== "all" || searchFilter || periodFilter) && (
              <button onClick={() => { setHistModeFilter("all"); setHistStatusFilter("all"); setHistSearch(""); setHistPeriod(""); }}
                className="font-body text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg border-none cursor-pointer hover:bg-red-100">
                Réinitialiser
              </button>
            )}
            <div className="flex items-center gap-1.5 ml-auto">
              <span className="font-body text-xs text-slate-500">Trier par :</span>
              <select
                value={sortBy}
                onChange={(e) => updateSortBy(e.target.value as any)}
                className="font-body text-xs px-2 py-1.5 rounded-lg border border-blue-500/8 bg-cream cursor-pointer focus:border-blue-500 focus:outline-none"
                title="Choix mémorisé entre sessions">
                <option value="commande">Date commande</option>
                <option value="encaissement">Date encaissement</option>
                <option value="facture">Numéro facture</option>
              </select>
            </div>
            <span className="font-body text-xs text-slate-600">{filtered.length} paiement{filtered.length > 1 ? "s" : ""}</span>
          </div>

          {/* Tableau */}
          {filtered.length === 0 ? (
            <Card padding="lg" className="text-center">
              <p className="font-body text-sm text-slate-600">Aucun paiement correspondant aux filtres.</p>
            </Card>
          ) : (
            <Card className="!p-0 overflow-hidden">
              <div className="overflow-x-auto">
              <div className="min-w-[780px]">
              <div className="px-5 py-3 bg-sand border-b border-blue-500/8 flex font-body text-[11px] font-semibold text-slate-600 uppercase tracking-wider">
                <span className="w-20">Date</span>
                <span className="w-20">N° Facture</span>
                <span className="flex-1">Client</span>
                <span className="w-32">Prestations</span>
                <span className="w-20 text-right">Montant</span>
                <span className="w-20 text-center">Mode</span>
                <span className="w-16 text-center">Statut</span>
                <span className="w-32 text-center">PDF / Factur-X</span>
                <span className="w-16 text-center">Copier</span>
                <span className="w-16 text-center">Modifier</span>
                <span className="w-16 text-center"></span>
              </div>
              {filtered.map((p, idx) => {
                const date = p.date?.seconds ? new Date(p.date.seconds * 1000) : new Date();
                const mode = paymentModes.find((m) => m.id === p.paymentMode);
                const invoiceNum = (p as any).invoiceNumber || `PF-${((p as any).orderId || p.id || "").slice(-6).toUpperCase()}`;
                const ht = (p.items || []).reduce((s: number, i: any) => s + (i.priceHT || 0), 0);
                const displayTTC = (p as any).originalTotalTTC || p.totalTTC || 0;
                const printInvoice = async () => {
                  const fam = families.find(f => f.firestoreId === p.familyId);
                  const civilite = fam?.civilite ? `${fam.civilite} ` : "";
                  const adresseLines = [fam?.address, [fam?.zipCode, fam?.city].filter(Boolean).join(" ")].filter(Boolean).join("\n");

                  // Récupérer le détail des encaissements associés à cette commande
                  // pour afficher chaque ligne (mode, montant, date) sur la facture
                  // plutôt qu'un simple "mixte".
                  const paymentDetails = encaissements
                    .filter((e: any) => e.paymentId === p.id && (e.montant || 0) > 0)
                    .sort((a: any, b: any) => {
                      const da = a.date?.seconds || 0;
                      const db = b.date?.seconds || 0;
                      return da - db;
                    })
                    .map((e: any) => {
                      const modeObj = paymentModes.find(m => m.id === e.mode);
                      const encDate = e.date?.seconds ? new Date(e.date.seconds * 1000) : null;
                      return {
                        mode: e.mode,
                        modeLabel: modeObj?.label || e.modeLabel || e.mode,
                        montant: Number(e.montant || 0),
                        date: encDate ? encDate.toLocaleDateString("fr-FR") : undefined,
                        ref: e.ref,
                      };
                    });

                  await downloadInvoicePdf({
                    invoiceNumber: invoiceNum, date: date.toLocaleDateString("fr-FR"),
                    familyName: `${civilite}${p.familyName}`, familyEmail: fam?.parentEmail || "",
                    familyAddress: adresseLines,
                    items: p.items || [], totalHT: ht,
                    totalTVA: (p.totalTTC || 0) - ht, totalTTC: p.totalTTC || 0,
                    paymentMode: mode?.label || p.paymentMode || "",
                    paymentDate: p.paidAmount > 0 ? date.toLocaleDateString("fr-FR") : "",
                    paymentId: p.id,
                    paidAmount: p.paidAmount || p.totalTTC || 0,
                    paymentDetails: paymentDetails.length > 0 ? paymentDetails : undefined,
                  });
                };
                // Trouver TOUS les avoirs liés pour les annulés
                const linkedAvoirs = p.status === "cancelled" ? avoirs.filter((a: any) => a.sourcePaymentId === p.id && a.type === "avoir") : [];
                const printAllAvoirs = linkedAvoirs.length > 0 ? async () => {
                  for (const av of linkedAvoirs) {
                    const avoirDate = av.createdAt?.toDate ? av.createdAt.toDate() : new Date();
                    const expDate = av.expiryDate?.toDate ? av.expiryDate.toDate() : null;
                    // Extraire l'item correspondant à cet avoir depuis le motif
                    const avoirItems = av.reason ? [{
                      activityTitle: av.reason.replace("Désinscription ", "").replace(" — ", " — "),
                      childName: "",
                      priceHT: Math.round(av.amount / 1.055 * 100) / 100,
                      priceTTC: av.amount,
                      tva: 5.5,
                      quantity: 1,
                    }] : (p.items || []).map((i: any) => ({ ...i, description: i.activityTitle }));
                    await downloadAvoirPdf({
                      avoirNumber: av.reference,
                      date: avoirDate.toLocaleDateString("fr-FR"),
                      familyName: p.familyName,
                      familyEmail: families.find(f => f.firestoreId === p.familyId)?.parentEmail || "",
                      sourceInvoiceNumber: invoiceNum,
                      reason: av.reason || `Annulation ${invoiceNum}`,
                      items: avoirItems,
                      totalHT: Math.round(av.amount / 1.055 * 100) / 100,
                      totalTVA: Math.round((av.amount - av.amount / 1.055) * 100) / 100,
                      totalTTC: av.amount,
                      type: "avoir",
                      expiryDate: expDate ? expDate.toLocaleDateString("fr-FR") : "—",
                    });
                  }
                } : null;
                return (
                  <div key={p.id || idx} className={`px-5 py-3 border-b border-blue-500/8 last:border-b-0 flex items-center hover:bg-blue-50/30 transition-colors ${p.status === "cancelled" ? "bg-red-50/30 opacity-70" : ""}`}>
                    <span className="w-20 font-body text-xs text-slate-600">{date.toLocaleDateString("fr-FR")}</span>
                    <span className="w-20 font-body text-xs font-semibold text-blue-800">{invoiceNum}</span>
                    <span className="flex-1"><div className={`font-body text-sm font-semibold ${p.status === "cancelled" ? "text-red-600 line-through" : "text-blue-800"}`}>{p.familyName}</div></span>
                    <span className="w-32 font-body text-xs text-slate-600 truncate">{(p.items || []).map((i: any) => i.activityTitle).join(", ")}</span>
                    <span className={`w-20 text-right font-body text-sm font-bold ${p.status === "cancelled" ? "text-red-500 line-through" : "text-blue-500"}`}>{displayTTC.toFixed(2)}€</span>
                    <span className="w-20 text-center"><Badge color={p.status === "cancelled" ? "red" : "blue"}>{(p.paymentMode as string) === "mixte" && (p as any).paymentModes ? (p as any).paymentModes.map((m: string) => paymentModes.find(pm => pm.id === m)?.label?.replace("(CAWL)", "").trim() || m).join(" + ") : mode?.label || p.paymentMode}</Badge></span>
                    <span className="w-16 text-center"><Badge color={p.status === "paid" ? "green" : p.status === "partial" ? "orange" : p.status === "cancelled" ? "red" : p.status === "sepa_scheduled" ? "blue" : p.status === "draft" ? "blue" : "gray"}>{p.status === "paid" ? "Réglé" : p.status === "partial" ? "Partiel" : p.status === "cancelled" ? "Annulé" : p.status === "sepa_scheduled" ? "SEPA" : p.status === "draft" ? "Brouillon" : "À régler"}</Badge></span>
                    <span className="w-32 text-center">
                      {p.status === "cancelled" && printAllAvoirs ? (
                        <button onClick={printAllAvoirs} title={`Télécharger ${linkedAvoirs.length} avoir(s) PDF`} className="font-body text-xs text-red-500 bg-red-50 px-2 py-1 rounded cursor-pointer border-none hover:bg-red-100 flex items-center gap-0.5 justify-center"><Receipt size={12} />{linkedAvoirs.length > 1 ? <span className="text-[9px]">×{linkedAvoirs.length}</span> : null}</button>
                      ) : (
                        <span className="inline-flex items-center justify-center gap-1 whitespace-nowrap">
                          <button onClick={printInvoice} className="font-body text-xs text-blue-500 bg-blue-50 px-2 py-1 rounded cursor-pointer border-none hover:bg-blue-100"><Receipt size={12} /></button>
                          {(p as any).invoiceNumber && (
                            <>
                              <button
                                onClick={() => downloadFacturX(p.id!, (p as any).invoiceNumber)}
                                title="XML Factur-X (EN 16931) — réforme facturation électronique"
                                className="font-body text-[9px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-1 rounded cursor-pointer border-none hover:bg-indigo-100 whitespace-nowrap leading-none">
                                XML
                              </button>
                              <button
                                onClick={() => downloadFacturXPdf(p.id!, (p as any).invoiceNumber)}
                                title="PDF Factur-X hybride (facture PDF + XML embarqué)"
                                className="font-body text-[9px] font-bold text-white bg-indigo-500 px-1.5 py-1 rounded cursor-pointer border-none hover:bg-indigo-600 whitespace-nowrap leading-none">
                                F-X
                              </button>
                            </>
                          )}
                        </span>
                      )}
                    </span>
                    <span className="w-16 text-center"><button onClick={() => setDuplicateTarget({ payment: p, targetFamilyId: "", targetSearch: "", mode: "choose" })} title="Dupliquer cette commande" className="font-body text-xs text-purple-500 bg-purple-50 px-2 py-1 rounded cursor-pointer border-none hover:bg-purple-100"><Copy size={12} /></button></span>
                    <span className="w-16 text-center">
                      {p.status !== "cancelled" && (
                        <button
                          onClick={() => {
                            if ((p as any).invoiceNumber) {
                              toast(`🔒 Facture ${(p as any).invoiceNumber} — modification impossible. Annulez-la via avoir pour la corriger.`, "warning", 5000);
                              return;
                            }
                            setEditPayment(p);
                            setEditItems((p.items || []).map((i: any) => ({ ...i })));
                            setEditRemisePct("");
                            setEditRemiseEuros("");
                          }}
                          title={(p as any).invoiceNumber ? "Facture définitive — non modifiable" : "Modifier la commande"}
                          className={`font-body text-xs px-2 py-1 rounded border-none ${(p as any).invoiceNumber ? "text-gray-400 bg-gray-100 cursor-not-allowed" : "text-amber-600 bg-amber-50 cursor-pointer hover:bg-amber-100"}`}>
                          <Pencil size={12} />
                        </button>
                      )}
                    </span>
                    <span className="w-16 text-center">
                      {p.status !== "cancelled" && !(p as any)._fromEncaissement && (
                        <button onClick={() => deletePaymentCommand(p)} title="Annuler + avoir" className="font-body text-xs text-red-500 bg-red-50 px-2 py-1 rounded cursor-pointer border-none hover:bg-red-100"><Trash2 size={12} /></button>
                      )}
                    </span>
                  </div>
                );
              })}
              </div>
              </div>
            </Card>
          )}
        </>
      );
    })()}
  </div>
  );
}
