"use client";
import React, { useMemo, useState } from "react";
import { updateDoc, getDoc, setDoc, doc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { safeNumber, generateOrderId } from "@/lib/utils";
import { Card, Badge } from "@/components/ui";
import { Loader2, Search, X, Receipt, Check, ChevronDown, Plus, Trash2, FileText, Calendar } from "lucide-react";
import { downloadInvoicePdf } from "@/lib/download-invoice";
import { downloadFacturX, downloadFacturXPdf } from "@/lib/download-facturx";
import { emailTemplates } from "@/lib/email-templates";
import { paymentModes } from "./types";
import { NoteField } from "./NoteField";
import { authFetch } from "@/lib/auth-fetch";
import { useConfirm } from "@/components/ui/Confirm";
import {
  calculerResumeImpayes,
  filtrerImpayes,
  grouperImpayesParEvenement,
  listerImpayes,
  preparerMultiEncaissements,
  soldeRestant,
  type ImpayeTypeFilter,
} from "./impayes-utils";

interface TabImpayesProps {
  loading: boolean;
  payments: any[];
  families: any[];
  toast: (message: string, type?: "error" | "success" | "warning" | "info", duration?: number) => void;
  setPayments: React.Dispatch<React.SetStateAction<any[]>>;
  setQuickEncaisser: (val: any) => void;
  setQuickMontant: (val: string) => void;
  setQuickDate: (val: string) => void;
  setQuickRef: (val: string) => void;
  setQuickMode: (val: string) => void;
  setEditPayment: (val: any) => void;
  setPayLinkModal: (val: any) => void;
  setPayLinkEmail: (val: string) => void;
  setPayLinkAmount: (val: string) => void;
  setPayLinkMessage: (val: string) => void;
  removePaymentItem: (payment: any, itemIndex: number) => Promise<void>;
  setDuplicateTarget: (val: any) => void;
  deletePaymentCommand: (payment: any) => Promise<void>;
  enrollChildInForfait: (payment: any, familyId: string) => Promise<number>;
  onMultiEncaisser: (familyId: string, familyName: string, payments: any[]) => void;
  initialSearch?: string;
  familyFilterId?: string;
}

export function TabImpayes({
  loading, payments, families, toast, setPayments,
  setQuickEncaisser, setQuickMontant, setQuickDate, setQuickRef, setQuickMode,
  setEditPayment,
  setPayLinkModal, setPayLinkEmail, setPayLinkAmount, setPayLinkMessage,
  removePaymentItem, setDuplicateTarget, deletePaymentCommand, enrollChildInForfait,
  onMultiEncaisser, initialSearch, familyFilterId,
}: TabImpayesProps) {
  const confirmer = useConfirm();
  const [verdictMit, setVerdictMit] = useState<Record<string, { ok: boolean; bloquants: string[] } | "chargement">>({});

  const verifierPrelevementSolde = async (paymentId: string) => {
    if (verdictMit[paymentId]) return;
    setVerdictMit(prev => ({ ...prev, [paymentId]: "chargement" }));
    try {
      const res = await authFetch("/api/admin/test-mit-charge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentId, dryRun: true }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d?.error || "Erreur");
      const bloquants: string[] = d?.bloquantsAvantDebitReel || [];
      setVerdictMit(prev => ({ ...prev, [paymentId]: { ok: bloquants.length === 0, bloquants } }));
    } catch (e: any) {
      setVerdictMit(prev => ({ ...prev, [paymentId]: { ok: false, bloquants: [e?.message || "Vérification impossible"] } }));
    }
  };

  const [impayesSearch, setImpayesSearch] = useState(initialSearch || "");
  const [familyFilter, setFamilyFilter] = useState(familyFilterId || "");
  const [impayesExpanded, setImpayesExpanded] = useState<Set<string>>(new Set());
  const [typeFilter, setTypeFilter] = useState<ImpayeTypeFilter>("all");

  const todayStr = new Date().toISOString().split("T")[0];
  const unpaid = useMemo(() => listerImpayes(payments, todayStr), [payments, todayStr]);
  const filtered = useMemo(
    () => filtrerImpayes(unpaid, { familyFilter, typeFilter, search: impayesSearch }),
    [unpaid, familyFilter, typeFilter, impayesSearch],
  );
  const groups = useMemo(() => grouperImpayesParEvenement(filtered), [filtered]);
  const multiEncaissements = useMemo(() => preparerMultiEncaissements(unpaid), [unpaid]);
  const { totalDue, totalFiltre, nbInvoice, nbEcheance } = useMemo(
    () => calculerResumeImpayes(unpaid, filtered),
    [unpaid, filtered],
  );

  const familyFilterLabel = !familyFilter ? "" : (
    families.find((f: any) => f.firestoreId === familyFilter)?.parentName
    || unpaid.find(p => p.familyId === familyFilter)?.familyName
    || "cette famille"
  );

  const toggle = (id: string) => setImpayesExpanded(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  if (loading) {
    return <div><div className="text-center py-16"><Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto" /></div></div>;
  }

  if (unpaid.length === 0) {
    return (
      <Card padding="lg" className="text-center">
        <div className="w-14 h-14 rounded-2xl bg-green-50 flex items-center justify-center mx-auto mb-3"><Check size={28} className="text-green-400" /></div>
        <p className="font-body text-sm text-slate-600">Aucun impayé ! Toutes les factures sont réglées.</p>
      </Card>
    );
  }

  const search = impayesSearch;
  const setSearch = setImpayesSearch;
  const expanded = impayesExpanded;

  return (
    <div>
      <Card padding="sm" className="mb-4 flex items-center gap-3">
        <span className="font-body text-2xl font-bold text-red-500">{totalDue.toFixed(2)}€</span>
        <span className="font-body text-xs text-slate-600">total impayé sur {unpaid.length} facture{unpaid.length > 1 ? "s" : ""}</span>
      </Card>

      {multiEncaissements.length > 0 && (
        <Card padding="sm" className="mb-4 !bg-blue-50/50 !border-blue-200">
          <div className="font-body text-[11px] font-semibold text-blue-700 uppercase tracking-wider mb-2">
            💳 Encaisser ensemble — familles avec plusieurs factures réglables
          </div>
          <div className="flex flex-col gap-1.5">
            {multiEncaissements.map((entry) => (
              <div key={entry.familyId} className="flex items-center justify-between gap-3 bg-white rounded-lg px-3 py-2">
                <div className="font-body text-sm text-slate-700 min-w-0">
                  <a
                    href={entry.familyId
                      ? `/admin/cavaliers?id=${encodeURIComponent(entry.familyId)}`
                      : `/admin/cavaliers?search=${encodeURIComponent(entry.name || "")}`}
                    target="_blank" rel="noopener noreferrer"
                    title="Ouvrir la fiche famille dans un nouvel onglet"
                    className="font-semibold text-blue-800 no-underline hover:text-blue-500 hover:underline"
                  >
                    {entry.name}
                  </a>
                  <span className="text-slate-500"> · {entry.pays.length} factures · {entry.total.toFixed(2)}€</span>
                </div>
                <button type="button" onClick={() => onMultiEncaisser(entry.familyId, entry.name, entry.pays)}
                  className="shrink-0 font-body text-xs font-semibold text-white bg-blue-500 hover:bg-blue-600 px-3 py-1.5 rounded-lg border-none cursor-pointer">
                  💳 Tout encaisser
                </button>
              </div>
            ))}
          </div>
          <p className="font-body text-[10px] text-slate-400 mt-2">
            Les chèques différés, prélèvements SEPA programmés et échéanciers en cours sont exclus (ils ont déjà un règlement en cours).
          </p>
        </Card>
      )}

      {familyFilter && (
        <Card padding="sm" className="mb-3 flex items-center justify-between gap-3 !bg-blue-50/50 !border-blue-200">
          <div className="font-body text-sm text-slate-700 min-w-0">
            Impayés de <span className="font-semibold text-blue-800">{familyFilterLabel}</span>
            <span className="text-slate-500"> · {filtered.length} facture{filtered.length > 1 ? "s" : ""} · {totalFiltre.toFixed(2)}€</span>
          </div>
          <button type="button" data-testid="impaye-family-filter-clear" onClick={() => setFamilyFilter("")}
            className="shrink-0 flex items-center gap-1.5 font-body text-xs font-semibold text-blue-700 bg-white hover:bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-200 cursor-pointer">
            <X size={13}/> Tous les impayés
          </button>
        </Card>
      )}

      <div className="relative mb-3">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
        <input data-testid="impaye-search-input" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Rechercher par nom, activité, date..."
          className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-blue-500/8 font-body text-sm bg-white focus:border-blue-400 focus:outline-none"/>
        {search && <button type="button" onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 bg-transparent border-none cursor-pointer"><X size={14}/></button>}
      </div>

      {nbInvoice > 0 && nbEcheance > 0 && (
        <div className="flex gap-2 mb-4 flex-wrap">
          <button type="button"
            onClick={() => setTypeFilter("all")}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg font-body text-xs font-semibold border-none cursor-pointer ${typeFilter === "all" ? "bg-blue-500 text-white" : "bg-blue-50 text-blue-700 hover:bg-blue-100"}`}>
            Tous <span className="bg-white/20 px-1.5 py-0.5 rounded text-[10px]">{unpaid.length}</span>
          </button>
          <button type="button"
            onClick={() => setTypeFilter("invoice")}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg font-body text-xs font-semibold border-none cursor-pointer ${typeFilter === "invoice" ? "bg-red-500 text-white" : "bg-red-50 text-red-600 hover:bg-red-100"}`}>
            <FileText size={12} /> Factures <span className={`px-1.5 py-0.5 rounded text-[10px] ${typeFilter === "invoice" ? "bg-white/20" : "bg-white/60"}`}>{nbInvoice}</span>
          </button>
          <button type="button"
            onClick={() => setTypeFilter("echeance")}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg font-body text-xs font-semibold border-none cursor-pointer ${typeFilter === "echeance" ? "bg-orange-500 text-white" : "bg-orange-50 text-orange-600 hover:bg-orange-100"}`}>
            <Calendar size={12} /> Échéances en retard <span className={`px-1.5 py-0.5 rounded text-[10px] ${typeFilter === "echeance" ? "bg-white/20" : "bg-white/60"}`}>{nbEcheance}</span>
          </button>
        </div>
      )}

      {filtered.length === 0 && (
        <p className="font-body text-sm text-slate-500 text-center py-8">
          {search ? `Aucun résultat pour "${search}"` :
            familyFilter ? `Aucun impayé pour ${familyFilterLabel}.` :
            typeFilter === "invoice" ? "Aucune facture impayée." :
            typeFilter === "echeance" ? "Aucune échéance en retard." :
            "Aucun impayé."}
        </p>
      )}

      <div className="flex flex-col gap-5">
        {groups.map(g => (
          <div key={g.key}>
            {!(groups.length === 1 && g.isOrphan) && (
              <div className="flex items-baseline gap-2 mb-2 px-1">
                <span className={`font-display text-sm font-bold ${g.isOrphan ? "text-slate-400" : "text-blue-800"}`}>
                  {g.label}
                </span>
                <span className="font-body text-[11px] text-slate-500">
                  · {g.payments.length} commande{g.payments.length > 1 ? "s" : ""}
                  {g.payments.length > 1 && (
                    <> · {g.payments.reduce((s, p) => s + soldeRestant(p), 0).toFixed(2)}€</>
                  )}
                </span>
              </div>
            )}
            <div className="flex flex-col gap-2">
              {g.payments.map(p => {
                const date = p.date?.seconds ? new Date(p.date.seconds * 1000) : new Date();
                const due = soldeRestant(p);
                const daysLate = Math.floor((Date.now() - date.getTime()) / 86400000);
                const isOpen = expanded.has(p.id);
                const isEcheance = Number(p.echeancesTotal || 0) > 1;
                const echeanceDateStr = p.echeanceDate;
                const echeanceDaysLate = echeanceDateStr
                  ? Math.floor((Date.now() - new Date(echeanceDateStr).getTime()) / 86400000)
                  : daysLate;
                return (
                  <Card key={p.id} padding="md" className={`overflow-hidden border-l-4 ${isEcheance ? "border-l-orange-400" : "border-l-red-400"}`}>
                    <div role="button" tabIndex={0}
                      onClick={() => toggle(p.id)}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(p.id); } }}
                      className="w-full flex items-center justify-between gap-3 bg-transparent border-none cursor-pointer text-left p-0">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          {isEcheance ? (
                            <Calendar size={14} className="text-orange-500 flex-shrink-0" aria-label="Échéance d'un échéancier" />
                          ) : (
                            <FileText size={14} className="text-red-500 flex-shrink-0" aria-label="Facture impayée" />
                          )}
                          <a
                            href={p.familyId
                              ? `/admin/cavaliers?id=${encodeURIComponent(p.familyId)}`
                              : `/admin/cavaliers?search=${encodeURIComponent(p.familyName || "")}`}
                            target="_blank" rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            title="Ouvrir la fiche famille dans un nouvel onglet"
                            className="font-body text-sm font-semibold text-blue-800 no-underline hover:text-blue-500 hover:underline"
                          >
                            {p.familyName}
                          </a>
                          {isEcheance ? (
                            <Badge color="orange">Échéance {p.echeance}/{p.echeancesTotal}</Badge>
                          ) : (
                            <Badge color={daysLate > 60 ? "red" : daysLate > 30 ? "orange" : "gray"}>
                              {daysLate > 60 ? "Urgent" : daysLate > 30 ? "Relance" : "Récent"}
                            </Badge>
                          )}
                          {isEcheance && echeanceDaysLate > 0 && (
                            <Badge color={echeanceDaysLate > 30 ? "red" : "orange"}>
                              {echeanceDaysLate}j de retard
                            </Badge>
                          )}
                        </div>
                        <div className="font-body text-xs text-slate-500 truncate mt-0.5">
                          {(() => {
                            if (isEcheance) {
                              return `${p.forfaitRef || (p.items||[]).map((i:any)=>i.activityTitle).join(", ")} · Échéance du ${echeanceDateStr ? new Date(echeanceDateStr).toLocaleDateString("fr-FR") : "—"}`;
                            }
                            const items = p.items || [];
                            const firstItemWithDate = items.find((i: any) => i.date);
                            const displayDate = firstItemWithDate?.date
                              ? new Date(firstItemWithDate.date + "T12:00:00").toLocaleDateString("fr-FR")
                              : date.toLocaleDateString("fr-FR");
                            return `${items.map((i:any)=>i.activityTitle).join(", ")} · ${displayDate}`;
                          })()}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <div className="text-right">
                          <div className="font-body text-lg font-bold text-red-500">{due.toFixed(2)}€</div>
                          <div className="font-body text-[10px] text-slate-400">/{(p.totalTTC||0).toFixed(0)}€</div>
                        </div>
                        <ChevronDown size={16} className={`text-slate-400 transition-transform ${isOpen ? "rotate-180" : ""}`}/>
                      </div>
                    </div>

                    {isOpen && (
                      <div className="mt-3 pt-3 border-t border-gray-100">
                        {p.stageDate && due > 0 && (
                          <div className="mb-3 p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                            {!verdictMit[p.id] ? (
                              <button type="button" onClick={() => verifierPrelevementSolde(p.id)}
                                className="font-body text-xs text-blue-600 bg-transparent border-none cursor-pointer p-0 underline">
                                Le solde sera-t-il prélevé automatiquement ?
                              </button>
                            ) : verdictMit[p.id] === "chargement" ? (
                              <span className="font-body text-xs text-gray-400">Vérification…</span>
                            ) : (verdictMit[p.id] as any).ok ? (
                              <div className="font-body text-xs text-green-700">
                                <strong>Prélèvement automatique armé.</strong> Le solde de {due.toFixed(2)} € sera
                                débité sur la carte enregistrée, 7 jours avant le stage. Rien à faire.
                              </div>
                            ) : (
                              <div className="font-body text-xs text-orange-700">
                                <strong>Pas de prélèvement automatique</strong> — la famille recevra un email
                                avec un lien de paiement, 7 jours avant le stage. Elle paiera, mais elle devra agir.
                                <ul className="mt-1 mb-0 pl-4 text-gray-600">
                                  {(verdictMit[p.id] as any).bloquants.map((b: string, i: number) => <li key={i}>{b}</li>)}
                                </ul>
                              </div>
                            )}
                          </div>
                        )}
                        <div className="flex flex-wrap gap-2 mb-3">
                          <button type="button" onClick={() => { setQuickEncaisser({ payment: p }); setQuickMontant(due.toFixed(2)); setQuickDate(new Date().toISOString().split("T")[0]); setQuickRef(""); setQuickMode("cheque"); }}
                            className="font-body text-xs text-white bg-green-600 hover:bg-green-700 px-3 py-1.5 rounded-lg border-none cursor-pointer font-semibold">💶 Encaisser</button>
                          <button type="button" onClick={async () => {
                            const fam = families.find(f => f.firestoreId === p.familyId);
                            const email = fam?.parentEmail || "";
                            if (!email) { toast("Pas d'email pour cette famille.", "warning"); return; }
                            const emailData = emailTemplates.rappelImpaye({ parentName: p.familyName || "", montant: due, prestations: (p.items||[]).map((i:any) => i.activityTitle).join(", ") });
                            authFetch("/api/send-email", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                to: email,
                                ...emailData,
                                context: "admin_rappel_impaye",
                                template: "rappelImpaye",
                                familyId: p.familyId,
                                paymentId: p.id,
                              }),
                            }).catch(e => console.warn("Email:", e));
                            toast(`Relance envoyée à ${email}`);
                          }} className="font-body text-xs text-blue-500 bg-blue-50 px-3 py-1.5 rounded-lg border-none cursor-pointer hover:bg-blue-100">Relancer</button>
                          <button type="button"
                            onClick={() => {
                              const fam = families.find(f => f.firestoreId === p.familyId);
                              setPayLinkModal(p);
                              setPayLinkEmail(fam?.parentEmail || "");
                              setPayLinkAmount(due.toFixed(2));
                              setPayLinkMessage("");
                            }}
                            className="font-body text-xs text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-lg border-none cursor-pointer hover:bg-indigo-100 flex items-center gap-1">
                            💳 Envoyer lien de paiement
                          </button>
                          <button type="button" onClick={() => { setEditPayment(p); }}
                            className="font-body text-xs text-slate-600 bg-gray-100 px-3 py-1.5 rounded-lg border-none cursor-pointer hover:bg-gray-200">✏️ Modifier</button>
                        </div>
                        {(p.items || []).map((item: any, idx: number) => {
                          let planning = "";
                          if (item.stageSchedule) {
                            planning = item.stageSchedule;
                          } else if (Array.isArray(item.stageDates) && item.stageDates.length > 0) {
                            const fmt = (d: string) => {
                              const dt = new Date(d);
                              return isNaN(dt.getTime()) ? d : dt.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
                            };
                            const first = item.stageDates[0];
                            const last = item.stageDates[item.stageDates.length - 1];
                            const range = item.stageDates.length === 1 ? fmt(first.date) : `${fmt(first.date)} → ${fmt(last.date)}`;
                            const hours = first.startTime && first.endTime ? ` · ${first.startTime}–${first.endTime}` : "";
                            planning = `${range}${hours}`;
                          } else if (item.date && item.startTime) {
                            const dt = new Date(item.date);
                            const d = isNaN(dt.getTime()) ? item.date : dt.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
                            planning = `${d} · ${item.startTime}${item.endTime ? `–${item.endTime}` : ""}`;
                          }
                          const cleanTitle = item.childName
                            ? String(item.activityTitle || "").replace(` — ${item.childName}`, "")
                            : (item.activityTitle || "");
                          return (
                            <div key={idx} className="py-1.5 font-body text-xs border-b border-gray-50 last:border-0">
                              <div className="flex items-center justify-between">
                                <span className="text-slate-600 flex-1 min-w-0 truncate">{item.childName ? `${item.childName} — ` : ""}{cleanTitle}{item.startTime && !planning ? ` ${item.startTime}` : ""}</span>
                                <div className="flex items-center gap-2 flex-shrink-0">
                                  <span className="text-blue-500 font-semibold">{(item.priceTTC || 0) === 0 ? <span className="text-slate-400 text-[10px]">Inclus</span> : `${(item.priceTTC || 0).toFixed(2)}€`}</span>
                                  <button type="button" onClick={() => { if (!confirm(`Retirer "${item.activityTitle}" ?\n\nL'enfant sera désinscrit.`)) return; removePaymentItem(p, idx); }} className="text-red-400 hover:text-red-600 bg-transparent border-none cursor-pointer p-0.5"><X size={12}/></button>
                                </div>
                              </div>
                              {planning && (
                                <div className="text-[10px] text-slate-400 ml-0 mt-0.5">📅 {planning}</div>
                              )}
                            </div>
                          );
                        })}
                        <div className="mt-2">
                          <NoteField paymentId={p.id} initialNote={p.note || ""} onSave={(note) => setPayments(prev => prev.map(x => x.id === p.id ? { ...x, note } : x))} />
                        </div>
                        <div className="mt-2 pt-2 border-t border-gray-100 flex flex-wrap gap-1.5 justify-between">
                          <div className="flex gap-1.5">
                            <button type="button" onClick={async () => {
                              const items = p.items || [];
                              const totalHT = items.reduce((s: number, i: any) => s + (i.priceHT || 0), 0);
                              const totalTTC = p.totalTTC || 0;
                              const invDate = p.date?.seconds ? new Date(p.date.seconds * 1000) : new Date();
                              const invoiceNumber = p.invoiceNumber || `PF-${(p.orderId || p.id || "").slice(-6).toUpperCase()}`;
                              const fam = families.find(f => f.firestoreId === p.familyId);
                              const civilite = fam?.civilite ? `${fam.civilite} ` : "";
                              const adresseLines = [fam?.address, [fam?.zipCode, fam?.city].filter(Boolean).join(" ")].filter(Boolean).join("\n");
                              await downloadInvoicePdf({ invoiceNumber, date: invDate.toLocaleDateString("fr-FR"), familyName: `${civilite}${p.familyName}`, familyEmail: fam?.parentEmail || "", familyAddress: adresseLines, serviceFacture: p.serviceFacture || undefined, items, totalHT, totalTVA: totalTTC - totalHT, totalTTC, paidAmount: p.paidAmount || 0, paymentMode: p.paymentMode ? (paymentModes.find(m => m.id === p.paymentMode)?.label || p.paymentMode) : "", paymentDate: p.paidAmount > 0 ? invDate.toLocaleDateString("fr-FR") : "", paymentId: p.id });
                            }} className="font-body text-[10px] text-green-600 bg-green-50 px-2.5 py-1 rounded border-none cursor-pointer hover:bg-green-100 flex items-center gap-1"><Receipt size={10}/> {p.invoiceNumber ? "Facture" : "Proforma"}</button>
                            {p.invoiceNumber && (
                              <>
                                <button type="button" onClick={() => downloadFacturX(p.id!, p.invoiceNumber)}
                                  title="XML Factur-X (EN 16931) — réforme facturation électronique"
                                  className="font-body text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded border-none cursor-pointer hover:bg-indigo-100 whitespace-nowrap leading-none">XML</button>
                                <button type="button" onClick={() => downloadFacturXPdf(p.id!, p.invoiceNumber)}
                                  title="PDF Factur-X hybride (facture PDF + XML embarqué)"
                                  className="font-body text-[10px] font-bold text-white bg-indigo-500 px-2 py-1 rounded border-none cursor-pointer hover:bg-indigo-600 whitespace-nowrap leading-none">F-X</button>
                              </>
                            )}
                            {!p.invoiceNumber && (
                              <button type="button" onClick={async () => {
                                if (!(await confirmer({
                                  titre: `Convertir en facture définitive — ${p.familyName} ?`,
                                  details: [
                                    "Un numéro séquentiel définitif sera attribué (F-AAAA-NNNN).",
                                    "La facture ne pourra plus être supprimée : la numérotation doit rester continue.",
                                  ],
                                  libelleConfirmer: "Convertir",
                                  danger: true,
                                }))) return;
                                try {
                                  const res = await authFetch("/api/invoice/next-number", {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ paymentId: p.id }),
                                  });
                                  if (!res.ok) throw new Error(`HTTP ${res.status}`);
                                  const { invoiceNumber } = await res.json();
                                  if (!invoiceNumber) throw new Error("numéro absent de la réponse");
                                  await updateDoc(doc(db, "payments", p.id!), { invoiceNumber, invoiceDate: serverTimestamp(), updatedAt: serverTimestamp() });
                                  setPayments(prev => prev.map(x => x.id === p.id ? { ...x, invoiceNumber } as any : x));
                                  toast(`Facture ${invoiceNumber} créée pour ${p.familyName}`, "success");
                                } catch (e) { console.error(e); toast("Erreur conversion", "error"); }
                              }} className="font-body text-[10px] text-orange-600 bg-orange-50 px-2.5 py-1 rounded border-none cursor-pointer hover:bg-orange-100 flex items-center gap-1"><Receipt size={10}/> → Facture définitive</button>
                            )}
                            <button type="button" onClick={() => setDuplicateTarget({ payment: p, targetFamilyId: "", targetSearch: "", mode: "choose" })} className="font-body text-[10px] text-blue-500 bg-blue-50 px-2.5 py-1 rounded border-none cursor-pointer hover:bg-blue-100 flex items-center gap-1"><Plus size={10}/> Dupliquer</button>
                            {(p.items||[]).some((i:any) => i.activityType === "cours" || i.activityTitle?.includes("Forfait")) && (
                              <button type="button" onClick={async () => {
                                let paymentToUse = p;
                                if (p.sourcePaymentId) {
                                  try {
                                    const { getDoc: gd, doc: dc } = await import("firebase/firestore");
                                    const { db: database } = await import("@/lib/firebase");
                                    const srcSnap = await gd(dc(database, "payments", p.sourcePaymentId));
                                    if (srcSnap.exists()) paymentToUse = { id: srcSnap.id, ...srcSnap.data() };
                                  } catch {}
                                }
                                const n = await enrollChildInForfait(paymentToUse, p.familyId);
                                toast(n > 0 ? `✅ ${n} séance(s) inscrite(s)` : "⚠️ Aucune séance inscrite — vérifiez le planning", n > 0 ? "success" : "error");
                              }} className="font-body text-[10px] text-green-600 bg-green-50 px-2.5 py-1 rounded border-none cursor-pointer hover:bg-green-100 flex items-center gap-1">
                                📅 Inscrire créneaux
                              </button>
                            )}
                          </div>
                          <button type="button" onClick={() => deletePaymentCommand(p)} className="font-body text-[10px] text-red-500 bg-red-50 px-2.5 py-1 rounded border-none cursor-pointer hover:bg-red-100 flex items-center gap-1"><Trash2 size={10}/> Annuler</button>
                        </div>
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
