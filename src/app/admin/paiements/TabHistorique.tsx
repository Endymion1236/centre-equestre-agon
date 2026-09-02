"use client";
import React, { useState } from "react";
import { Card, Badge } from "@/components/ui";
import { Loader2, Receipt, Trash2, Search, X, Copy, Pencil, CalendarCheck } from "lucide-react";
import { authFetch } from "@/lib/auth-fetch";
import { downloadInvoicePdf } from "@/lib/download-invoice";
import { downloadAvoirPdf } from "@/lib/download-avoir";
import { downloadFacturX, downloadFacturXPdf } from "@/lib/download-facturx";
import { paymentModes } from "./types";
import { verrouCommande } from "./commande-verrou";
import {
  preparerHistorique,
  type HistoriqueSort,
} from "./historique-utils";

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
  /** Recherche texte initiale (paramètre `search` de l'URL). */
  initialSearch?: string;
  /** Identifiant exact de la famille à afficher. */
  familyFilterId?: string;
}

export function TabHistorique({
  loading,
  payments,
  avoirs,
  encaissements,
  families,
  toast,
  setDuplicateTarget,
  deletePaymentCommand,
  setEditPayment,
  initialSearch,
  familyFilterId,
}: TabHistoriqueProps) {
  const [histSearch, setHistSearch] = useState(initialSearch || "");
  const [familyFilter, setFamilyFilter] = useState(familyFilterId || "");
  const [histModeFilter, setHistModeFilter] = useState("all");
  const [histStatusFilter, setHistStatusFilter] = useState("all");
  const [histPeriod, setHistPeriod] = useState("");
  const [sortBy, setSortBy] = useState<HistoriqueSort>(() => {
    if (typeof window === "undefined") return "commande";
    const saved = window.localStorage.getItem("histSortBy");
    return saved === "encaissement" || saved === "facture" ? saved : "commande";
  });

  const updateSortBy = (value: HistoriqueSort) => {
    setSortBy(value);
    if (typeof window !== "undefined") window.localStorage.setItem("histSortBy", value);
  };

  const { filtered, totalsByMode, grandTotal } = preparerHistorique(payments, encaissements, {
    familyId: familyFilter,
    mode: histModeFilter,
    status: histStatusFilter,
    search: histSearch,
    period: histPeriod,
    sortBy,
  });

  const resetFilters = () => {
    setHistModeFilter("all");
    setHistStatusFilter("all");
    setHistSearch("");
    setHistPeriod("");
    setFamilyFilter("");
  };

  if (loading) {
    return <div className="text-center py-16"><Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto" /></div>;
  }

  return (
    <div>
      {familyFilter && (
        <Card padding="sm" className="mb-4 flex items-center justify-between gap-3 !bg-blue-50/50 !border-blue-200">
          <div className="font-body text-sm text-slate-700 min-w-0">
            Historique de <span className="font-semibold text-blue-800">{
              families.find((family: any) => family.firestoreId === familyFilter)?.parentName
              || filtered[0]?.familyName
              || "cette famille"
            }</span>
            <span className="text-slate-500"> · {filtered.length} ligne{filtered.length > 1 ? "s" : ""}</span>
          </div>
          <button type="button" data-testid="historique-family-filter-clear" onClick={() => setFamilyFilter("")}
            className="shrink-0 flex items-center gap-1.5 font-body text-xs font-semibold text-blue-700 bg-white hover:bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-200 cursor-pointer">
            <X size={13}/> Tout l&apos;historique
          </button>
        </Card>
      )}

      <div className="flex flex-wrap gap-3 mb-4">
        {Object.entries(totalsByMode).sort(([, a], [, b]) => b - a).map(([mode, total]) => {
          const modeObj = paymentModes.find((item) => item.id === mode);
          return (
            <div key={mode} onClick={() => setHistModeFilter(histModeFilter === mode ? "all" : mode)}
              className={`flex flex-col items-center px-4 py-2.5 rounded-xl cursor-pointer transition-all ${histModeFilter === mode ? "bg-blue-500 text-white ring-2 ring-blue-300" : "bg-sand hover:bg-blue-50"}`}>
              <div className={`font-body text-[10px] uppercase font-semibold ${histModeFilter === mode ? "text-white/70" : "text-slate-600"}`}>
                {modeObj?.label || mode}
              </div>
              <div className={`font-body text-base font-bold ${histModeFilter === mode ? "text-white" : "text-blue-800"}`}>{total.toFixed(2)}€</div>
            </div>
          );
        })}
        <div className="flex flex-col items-center px-4 py-2.5 rounded-xl bg-blue-50">
          <div className="font-body text-[10px] uppercase font-semibold text-blue-400">Total</div>
          <div className="font-body text-base font-bold text-blue-500">{grandTotal.toFixed(2)}€</div>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 mb-4 items-center">
        <div className="flex gap-1.5">
          {([["all", "Tous"], ["paid", "Réglés"], ["pending", "À régler"], ["partial", "Partiels"], ["sepa_scheduled", "SEPA en cours"], ["cancelled", "Annulés"]] as const).map(([value, label]) => (
            <button type="button" key={value} onClick={() => setHistStatusFilter(value)}
              className={`font-body text-xs px-3 py-1.5 rounded-lg border-none cursor-pointer transition-all ${histStatusFilter === value ? "bg-blue-500 text-white" : "bg-white text-slate-600 border border-gray-200"}`}>
              {label}
            </button>
          ))}
        </div>
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input placeholder="Rechercher par nom ou prestation…" value={histSearch} onChange={(event) => setHistSearch(event.target.value)}
            className="w-full font-body text-xs border border-gray-200 rounded-lg pl-9 pr-3 py-2 bg-white focus:outline-none focus:border-blue-400" />
        </div>
        <input type="month" value={histPeriod} onChange={(event) => setHistPeriod(event.target.value)}
          className="font-body text-xs border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-blue-400" />
        {(histModeFilter !== "all" || histStatusFilter !== "all" || histSearch || histPeriod || familyFilter) && (
          <button type="button" onClick={resetFilters}
            className="font-body text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg border-none cursor-pointer hover:bg-red-100">
            Réinitialiser
          </button>
        )}
        <div className="flex items-center gap-1.5 ml-auto">
          <span className="font-body text-xs text-slate-500">Trier par :</span>
          <select
            value={sortBy}
            onChange={(event) => updateSortBy(event.target.value as HistoriqueSort)}
            className="font-body text-xs px-2 py-1.5 rounded-lg border border-blue-500/8 bg-cream cursor-pointer focus:border-blue-500 focus:outline-none"
            title="Choix mémorisé entre sessions">
            <option value="commande">Date commande</option>
            <option value="encaissement">Date encaissement</option>
            <option value="facture">Numéro facture</option>
          </select>
        </div>
        <span className="font-body text-xs text-slate-600">{filtered.length} paiement{filtered.length > 1 ? "s" : ""}</span>
      </div>

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
                <span className="w-24 text-center">Mode</span>
                <span className="w-16 text-center">Statut</span>
                <span className="w-32 text-center">PDF / Factur-X</span>
                <span className="w-16 text-center">Copier</span>
                <span className="w-16 text-center">Modifier</span>
                <span className="w-16 text-center"></span>
              </div>
              {filtered.map((payment, index) => {
                const date = payment.date?.seconds ? new Date(payment.date.seconds * 1000) : new Date();
                const mode = paymentModes.find((item) => item.id === payment.paymentMode);
                const invoiceNum = payment.invoiceNumber || `PF-${(payment.orderId || payment.id || "").slice(-6).toUpperCase()}`;
                const ht = (payment.items || []).reduce((sum: number, item: any) => sum + (item.priceHT || 0), 0);
                const displayTTC = payment.originalTotalTTC || payment.totalTTC || 0;
                // Une commande mixte peut cumuler trois ou quatre modes. Les
                // concaténer dans une colonne fixe faisait passer le texte sous
                // le statut et les boutons. La pastille reste courte ; le titre
                // natif conserve le détail complet au survol.
                const idsModesMixtes: string[] = payment.paymentMode === "mixte" && Array.isArray(payment.paymentModes)
                  ? [...new Set(payment.paymentModes.map((id: unknown) => String(id)).filter(Boolean))]
                  : [];
                const libellesModesMixtes = idsModesMixtes.map((id) =>
                  paymentModes.find((item) => item.id === id)?.label?.replace("(CAWL)", "").trim() || id
                );
                const libelleModeComplet = libellesModesMixtes.length > 0
                  ? libellesModesMixtes.join(" + ")
                  : mode?.label || payment.paymentMode || "—";
                const libelleModeCourt = libellesModesMixtes.length > 1
                  ? `Mixte (${libellesModesMixtes.length})`
                  : libelleModeComplet;

                const printInvoice = async () => {
                  const family = families.find((item: any) => item.firestoreId === payment.familyId);
                  const civilite = family?.civilite ? `${family.civilite} ` : "";
                  const adresseLines = [family?.address, [family?.zipCode, family?.city].filter(Boolean).join(" ")].filter(Boolean).join("\n");
                  const paymentDetails = encaissements
                    .filter((encaissement: any) => encaissement.paymentId === payment.id && (encaissement.montant || 0) > 0)
                    .sort((a: any, b: any) => (a.date?.seconds || 0) - (b.date?.seconds || 0))
                    .map((encaissement: any) => {
                      const modeObj = paymentModes.find((item) => item.id === encaissement.mode);
                      const encDate = encaissement.date?.seconds ? new Date(encaissement.date.seconds * 1000) : null;
                      return {
                        mode: encaissement.mode,
                        modeLabel: modeObj?.label || encaissement.modeLabel || encaissement.mode,
                        montant: Number(encaissement.montant || 0),
                        date: encDate ? encDate.toLocaleDateString("fr-FR") : undefined,
                        ref: encaissement.ref,
                      };
                    });

                  await downloadInvoicePdf({
                    invoiceNumber: invoiceNum,
                    date: date.toLocaleDateString("fr-FR"),
                    familyName: `${civilite}${payment.familyName}`,
                    familyEmail: family?.parentEmail || "",
                    familyAddress: adresseLines,
                    serviceFacture: payment.serviceFacture || undefined,
                    items: payment.items || [],
                    totalHT: ht,
                    totalTVA: (payment.totalTTC || 0) - ht,
                    totalTTC: payment.totalTTC || 0,
                    paymentMode: mode?.label || payment.paymentMode || "",
                    paymentDate: payment.paidAmount > 0 ? date.toLocaleDateString("fr-FR") : "",
                    paymentId: payment.id,
                    paidAmount: payment.paidAmount || payment.totalTTC || 0,
                    paymentDetails: paymentDetails.length > 0 ? paymentDetails : undefined,
                  });
                };

                const linkedAvoirs = payment.status === "cancelled"
                  ? avoirs.filter((avoir: any) => avoir.sourcePaymentId === payment.id && avoir.type === "avoir")
                  : [];

                const printAllAvoirs = linkedAvoirs.length > 0 ? async () => {
                  for (const avoir of linkedAvoirs) {
                    const avoirDate = avoir.createdAt?.toDate ? avoir.createdAt.toDate() : new Date();
                    const expDate = avoir.expiryDate?.toDate ? avoir.expiryDate.toDate() : null;
                    const avoirItems = avoir.reason ? [{
                      activityTitle: avoir.reason.replace("Désinscription ", "").replace(" — ", " — "),
                      childName: "",
                      priceHT: Math.round(avoir.amount / 1.055 * 100) / 100,
                      priceTTC: avoir.amount,
                      tva: 5.5,
                      quantity: 1,
                    }] : (payment.items || []).map((item: any) => ({ ...item, description: item.activityTitle }));
                    await downloadAvoirPdf({
                      avoirNumber: avoir.reference,
                      date: avoirDate.toLocaleDateString("fr-FR"),
                      familyName: payment.familyName,
                      familyEmail: families.find((family: any) => family.firestoreId === payment.familyId)?.parentEmail || "",
                      sourceInvoiceNumber: invoiceNum,
                      reason: avoir.reason || `Annulation ${invoiceNum}`,
                      items: avoirItems,
                      totalHT: Math.round(avoir.amount / 1.055 * 100) / 100,
                      totalTVA: Math.round((avoir.amount - avoir.amount / 1.055) * 100) / 100,
                      totalTTC: avoir.amount,
                      type: "avoir",
                      expiryDate: expDate ? expDate.toLocaleDateString("fr-FR") : "—",
                    });
                  }
                } : null;

                return (
                  <div key={payment.id || index} className={`px-5 py-3 border-b border-blue-500/8 last:border-b-0 flex items-center hover:bg-blue-50/30 transition-colors ${payment.status === "cancelled" ? "bg-red-50/30 opacity-70" : ""}`}>
                    <span className="w-20 font-body text-xs text-slate-600">{date.toLocaleDateString("fr-FR")}</span>
                    <span className="w-20 font-body text-xs font-semibold text-blue-800">{invoiceNum}</span>
                    <span className="flex-1"><div className={`font-body text-sm font-semibold ${payment.status === "cancelled" ? "text-red-600 line-through" : "text-blue-800"}`}>{payment.familyName}</div></span>
                    <span className="w-32 font-body text-xs text-slate-600 truncate">{(payment.items || []).map((item: any) => item.activityTitle).join(", ")}</span>
                    <span className={`w-20 text-right font-body text-sm font-bold ${payment.status === "cancelled" ? "text-red-500 line-through" : "text-blue-500"}`}>{displayTTC.toFixed(2)}€</span>
                    <span className="w-24 min-w-0 px-1 text-center overflow-hidden" title={libelleModeComplet}>
                      <Badge color={payment.status === "cancelled" ? "red" : "blue"} className="max-w-full overflow-hidden text-ellipsis">
                        {libelleModeCourt}
                      </Badge>
                    </span>
                    <span className="w-16 text-center"><Badge color={payment.status === "paid" ? "green" : payment.status === "partial" ? "orange" : payment.status === "cancelled" ? "red" : payment.status === "sepa_scheduled" ? "blue" : payment.status === "draft" ? "blue" : "gray"}>{payment.status === "paid" ? "Réglé" : payment.status === "partial" ? "Partiel" : payment.status === "cancelled" ? "Annulé" : payment.status === "sepa_scheduled" ? "SEPA" : payment.status === "draft" ? "Brouillon" : "À régler"}</Badge></span>
                    <span className="w-32 text-center">
                      {payment.status === "cancelled" && printAllAvoirs ? (
                        <button type="button" onClick={printAllAvoirs} title={`Télécharger ${linkedAvoirs.length} avoir(s) PDF`} className="font-body text-xs text-red-500 bg-red-50 px-2 py-1 rounded cursor-pointer border-none hover:bg-red-100 flex items-center gap-0.5 justify-center"><Receipt size={12} />{linkedAvoirs.length > 1 ? <span className="text-[9px]">×{linkedAvoirs.length}</span> : null}</button>
                      ) : (
                        <span className="inline-flex items-center justify-center gap-1 whitespace-nowrap">
                          <button type="button" onClick={printInvoice} className="font-body text-xs text-blue-500 bg-blue-50 px-2 py-1 rounded cursor-pointer border-none hover:bg-blue-100"><Receipt size={12} /></button>
                          {(payment.paidAmount || 0) > 0 && (
                            <button type="button"
                              title="Replacer les cavaliers au planning (place perdue avant le paiement)"
                              onClick={async () => {
                                try {
                                  const response = await authFetch("/api/admin/confirmer-places", {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ paymentId: payment.id }),
                                  });
                                  const data = await response.json().catch(() => null);
                                  if (!response.ok) {
                                    toast(data?.error || "Échec", "error");
                                    return;
                                  }
                                  const reinscrites = Number(data?.reinscrites || 0);
                                  const confirmees = Number(data?.confirmees || 0);
                                  toast(
                                    reinscrites > 0 ? `${reinscrites} place(s) rétablie(s) au planning`
                                      : confirmees > 0 ? `${confirmees} créneau(x) confirmé(s)`
                                      : "Rien à replacer : les cavaliers sont déjà au planning",
                                    reinscrites > 0 || confirmees > 0 ? "success" : "info",
                                  );
                                } catch (error: any) {
                                  toast(`Échec : ${error?.message || error}`, "error");
                                }
                              }}
                              className="font-body text-xs text-emerald-600 bg-emerald-50 px-2 py-1 rounded cursor-pointer border-none hover:bg-emerald-100">
                              <CalendarCheck size={12} />
                            </button>
                          )}
                          {payment.invoiceNumber && (
                            <>
                              <button type="button"
                                onClick={() => downloadFacturX(payment.id!, payment.invoiceNumber)}
                                title="XML Factur-X (EN 16931) — réforme facturation électronique"
                                className="font-body text-[9px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-1 rounded cursor-pointer border-none hover:bg-indigo-100 whitespace-nowrap leading-none">
                                XML
                              </button>
                              <button type="button"
                                onClick={() => downloadFacturXPdf(payment.id!, payment.invoiceNumber)}
                                title="PDF Factur-X hybride (facture PDF + XML embarqué)"
                                className="font-body text-[9px] font-bold text-white bg-indigo-500 px-1.5 py-1 rounded cursor-pointer border-none hover:bg-indigo-600 whitespace-nowrap leading-none">
                                F-X
                              </button>
                            </>
                          )}
                        </span>
                      )}
                    </span>
                    <span className="w-16 text-center"><button type="button" onClick={() => setDuplicateTarget({ payment, targetFamilyId: "", targetSearch: "", mode: "choose" })} title="Dupliquer cette commande" className="font-body text-xs text-purple-500 bg-purple-50 px-2 py-1 rounded cursor-pointer border-none hover:bg-purple-100"><Copy size={12} /></button></span>
                    <span className="w-16 text-center">
                      {payment.status !== "cancelled" && (
                        <button type="button"
                          onClick={() => {
                            const verrou = verrouCommande(payment);
                            if (verrou.verrouillee) {
                              toast(`🔒 ${verrou.titre}. Corrigez via un avoir.`, "warning", 5000);
                              return;
                            }
                            setEditPayment(payment);
                          }}
                          title={verrouCommande(payment).verrouillee ? verrouCommande(payment).titre : "Modifier la commande"}
                          className={`font-body text-xs px-2 py-1 rounded border-none ${verrouCommande(payment).verrouillee ? "text-gray-400 bg-gray-100 cursor-not-allowed" : "text-amber-600 bg-amber-50 cursor-pointer hover:bg-amber-100"}`}>
                          <Pencil size={12} />
                        </button>
                      )}
                    </span>
                    <span className="w-16 text-center">
                      {payment.status !== "cancelled" && !payment._fromEncaissement && (
                        <button type="button" onClick={() => deletePaymentCommand(payment)} title="Annuler + avoir" className="font-body text-xs text-red-500 bg-red-50 px-2 py-1 rounded cursor-pointer border-none hover:bg-red-100"><Trash2 size={12} /></button>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
