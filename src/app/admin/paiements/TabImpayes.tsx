"use client";
import React, { useState } from "react";
import { updateDoc, getDoc, setDoc, doc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { safeNumber, generateOrderId } from "@/lib/utils";
import { Card, Badge } from "@/components/ui";
import { Loader2, Search, X, AlertTriangle, Receipt, Check, ChevronDown, Plus, Trash2 } from "lucide-react";
import { downloadInvoicePdf } from "@/lib/download-invoice";
import { emailTemplates } from "@/lib/email-templates";
import { paymentModes } from "./types";
import { NoteField } from "./NoteField";
import { authFetch } from "@/lib/auth-fetch";

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
  setEditItems: (val: any[]) => void;
  setEditRemisePct: (val: string) => void;
  setEditRemiseEuros: (val: string) => void;
  setPayLinkModal: (val: any) => void;
  setPayLinkEmail: (val: string) => void;
  setPayLinkAmount: (val: string) => void;
  setPayLinkMessage: (val: string) => void;
  removePaymentItem: (payment: any, itemIndex: number) => Promise<void>;
  setDuplicateTarget: (val: any) => void;
  deletePaymentCommand: (payment: any) => Promise<void>;
  enrollChildInForfait: (payment: any, familyId: string) => Promise<number>;
}

export function TabImpayes({
  loading, payments, families, toast, setPayments,
  setQuickEncaisser, setQuickMontant, setQuickDate, setQuickRef, setQuickMode,
  setEditPayment, setEditItems, setEditRemisePct, setEditRemiseEuros,
  setPayLinkModal, setPayLinkEmail, setPayLinkAmount, setPayLinkMessage,
  removePaymentItem, setDuplicateTarget, deletePaymentCommand, enrollChildInForfait,
}: TabImpayesProps) {
  const [impayesSearch, setImpayesSearch] = useState("");
  const [impayesExpanded, setImpayesExpanded] = useState<Set<string>>(new Set());
  const inputCls = "w-full px-3 py-2.5 rounded-lg border border-blue-500/8 font-body text-sm bg-cream focus:border-blue-500 focus:outline-none";

  return (
  <div>
    {loading ? <div className="text-center py-16"><Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto" /></div> :
    (() => {
      const todayStr = new Date().toISOString().split("T")[0];
      const unpaid = payments.filter(p => {
        if (p.status === "cancelled" || p.status === "paid" || p.status === "sepa_scheduled") return false;
        if ((p.paidAmount || 0) >= (p.totalTTC || 0)) return false;
        // Échéances : inclure uniquement celles en retard (date dépassée)
        if ((p as any).echeancesTotal > 1) {
          return (p as any).echeanceDate && (p as any).echeanceDate < todayStr;
        }
        return true;
      });
      const totalDue = unpaid.reduce((s, p) => s + ((p.totalTTC || 0) - (p.paidAmount || 0)), 0);

      // ── Recherche ──
      const search = impayesSearch;
      const setSearch = setImpayesSearch;
      const expanded = impayesExpanded;

      const filtered = search.trim()
        ? unpaid.filter(p => {
            const q = search.toLowerCase();
            const inName = (p.familyName || "").toLowerCase().includes(q);
            const inItems = (p.items || []).some((i: any) => (i.activityTitle || "").toLowerCase().includes(q) || (i.childName || "").toLowerCase().includes(q));
            const inDate = p.date?.seconds ? new Date(p.date.seconds * 1000).toLocaleDateString("fr-FR").includes(q) : false;
            return inName || inItems || inDate;
          })
        : unpaid;

      const toggle = (id: string) => setImpayesExpanded(prev => {
        const next = new Set(prev);
        next.has(id) ? next.delete(id) : next.add(id);
        return next;
      });

      return unpaid.length === 0 ? (
        <Card padding="lg" className="text-center"><div className="w-14 h-14 rounded-2xl bg-green-50 flex items-center justify-center mx-auto mb-3"><Check size={28} className="text-green-400" /></div><p className="font-body text-sm text-slate-600">Aucun impayé ! Toutes les factures sont réglées.</p></Card>
      ) : (
        <div>
          <Card padding="sm" className="mb-4 flex items-center gap-3">
            <span className="font-body text-2xl font-bold text-red-500">{totalDue.toFixed(2)}€</span>
            <span className="font-body text-xs text-slate-600">total impayé sur {unpaid.length} facture{unpaid.length > 1 ? "s" : ""}</span>
          </Card>

          {/* Barre de recherche */}
          <div className="relative mb-4">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
            <input data-testid="impaye-search-input" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Rechercher par nom, activité, date..."
              className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-blue-500/8 font-body text-sm bg-white focus:border-blue-400 focus:outline-none"/>
            {search && <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 bg-transparent border-none cursor-pointer"><X size={14}/></button>}
          </div>

          {filtered.length === 0 && <p className="font-body text-sm text-slate-500 text-center py-8">Aucun résultat pour "{search}"</p>}

          <div className="flex flex-col gap-2">
            {filtered.map(p => {
              const date = p.date?.seconds ? new Date(p.date.seconds * 1000) : new Date();
              const due = (p.totalTTC || 0) - (p.paidAmount || 0);
              const daysLate = Math.floor((Date.now() - date.getTime()) / 86400000);
              const isOpen = expanded.has(p.id);
              const isEcheance = (p as any).echeancesTotal > 1;
              const echeanceDateStr = (p as any).echeanceDate;
              const echeanceDaysLate = echeanceDateStr
                ? Math.floor((Date.now() - new Date(echeanceDateStr).getTime()) / 86400000)
                : daysLate;
              return (
                <Card key={p.id} padding="md" className="overflow-hidden">
                  {/* ── En-tête accordéon (toujours visible) ── */}
                  <button onClick={() => toggle(p.id)} className="w-full flex items-center justify-between gap-3 bg-transparent border-none cursor-pointer text-left p-0">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-body text-sm font-semibold text-blue-800">{p.familyName}</span>
                        {isEcheance ? (
                          <Badge color="orange">Échéance {(p as any).echeance}/{(p as any).echeancesTotal}</Badge>
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
                        {isEcheance
                          ? `${(p as any).forfaitRef || (p.items||[]).map((i:any)=>i.activityTitle).join(", ")} · Échéance du ${echeanceDateStr ? new Date(echeanceDateStr).toLocaleDateString("fr-FR") : "—"}`
                          : `${(p.items||[]).map((i:any)=>i.activityTitle).join(", ")} · ${date.toLocaleDateString("fr-FR")}`
                        }
                      </div>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <div className="text-right">
                        <div className="font-body text-lg font-bold text-red-500">{due.toFixed(2)}€</div>
                        <div className="font-body text-[10px] text-slate-400">/{(p.totalTTC||0).toFixed(0)}€</div>
                      </div>
                      <ChevronDown size={16} className={`text-slate-400 transition-transform ${isOpen ? "rotate-180" : ""}`}/>
                    </div>
                  </button>

                  {/* ── Détail déplié ── */}
                  {isOpen && (
                    <div className="mt-3 pt-3 border-t border-gray-100">
                      <div className="flex flex-wrap gap-2 mb-3">
                        <button onClick={() => { setQuickEncaisser({ payment: p }); setQuickMontant(due.toFixed(2)); setQuickDate(new Date().toISOString().split("T")[0]); setQuickRef(""); setQuickMode("cheque"); }}
                          className="font-body text-xs text-white bg-green-600 hover:bg-green-700 px-3 py-1.5 rounded-lg border-none cursor-pointer font-semibold">💶 Encaisser</button>
                        <button onClick={async () => {
                          const fam = families.find(f => f.firestoreId === p.familyId);
                          const email = fam?.parentEmail || "";
                          if (!email) { toast("Pas d'email pour cette famille.", "warning"); return; }
                          const emailData = emailTemplates.rappelImpaye({ parentName: p.familyName || "", montant: due, prestations: (p.items||[]).map((i:any) => i.activityTitle).join(", ") });
                          authFetch("/api/send-email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to: email, ...emailData }) }).catch(e => console.warn("Email:", e));
                          toast(`Relance envoyée à ${email}`);
                        }} className="font-body text-xs text-blue-500 bg-blue-50 px-3 py-1.5 rounded-lg border-none cursor-pointer hover:bg-blue-100">Relancer</button>
                        {/* Bouton lien de paiement personnalisé */}
                        <button
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
                        <button onClick={() => { setEditPayment(p); setEditItems((p.items || []).map((i: any) => ({ ...i }))); setEditRemisePct(""); setEditRemiseEuros(""); }}
                          className="font-body text-xs text-slate-600 bg-gray-100 px-3 py-1.5 rounded-lg border-none cursor-pointer hover:bg-gray-200">✏️ Modifier</button>
                      </div>
                      {(p.items || []).map((item: any, idx: number) => (
                        <div key={idx} className="flex items-center justify-between py-1.5 font-body text-xs border-b border-gray-50 last:border-0">
                          <span className="text-slate-600 flex-1 min-w-0 truncate">{item.childName ? `${item.childName} — ` : ""}{item.activityTitle}{item.startTime ? ` ${item.startTime}` : ""}</span>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <span className="text-blue-500 font-semibold">{(item.priceTTC || 0) === 0 ? <span className="text-slate-400 text-[10px]">Inclus</span> : `${(item.priceTTC || 0).toFixed(2)}€`}</span>
                            <button onClick={() => { if (!confirm(`Retirer "${item.activityTitle}" ?\n\nL'enfant sera désinscrit.`)) return; removePaymentItem(p, idx); }} className="text-red-400 hover:text-red-600 bg-transparent border-none cursor-pointer p-0.5"><X size={12}/></button>
                          </div>
                        </div>
                      ))}
                      <div className="mt-2">
                        <NoteField paymentId={p.id} initialNote={(p as any).note || ""} onSave={(note) => setPayments(prev => prev.map(x => x.id === p.id ? { ...x, note } : x))} />
                      </div>
                      <div className="mt-2 pt-2 border-t border-gray-100 flex flex-wrap gap-1.5 justify-between">
                        <div className="flex gap-1.5">
                          <button onClick={async () => {
                            const items = p.items || [];
                            const totalHT = items.reduce((s: number, i: any) => s + (i.priceHT || 0), 0);
                            const totalTTC = p.totalTTC || 0;
                            const invDate = p.date?.seconds ? new Date(p.date.seconds * 1000) : new Date();
                            const invoiceNumber = (p as any).invoiceNumber || `PF-${((p as any).orderId || p.id || "").slice(-6).toUpperCase()}`;
                            await downloadInvoicePdf({ invoiceNumber, date: invDate.toLocaleDateString("fr-FR"), familyName: p.familyName, familyEmail: families.find(f => f.firestoreId === p.familyId)?.parentEmail || "", items, totalHT, totalTVA: totalTTC - totalHT, totalTTC, paidAmount: p.paidAmount || 0, paymentMode: p.paymentMode ? (paymentModes.find(m => m.id === p.paymentMode)?.label || p.paymentMode) : "", paymentDate: p.paidAmount > 0 ? invDate.toLocaleDateString("fr-FR") : "" });
                          }} className="font-body text-[10px] text-green-600 bg-green-50 px-2.5 py-1 rounded border-none cursor-pointer hover:bg-green-100 flex items-center gap-1"><Receipt size={10}/> {(p as any).invoiceNumber ? "Facture" : "Proforma"}</button>
                          {!(p as any).invoiceNumber && (
                            <button onClick={async () => {
                              if (!confirm(`Convertir cette proforma en facture définitive pour ${p.familyName} ?\n\nUne fois convertie, la facture aura un numéro séquentiel et ne pourra plus être supprimée.`)) return;
                              try {
                                const year = new Date().getFullYear();
                                const counterRef = doc(db, "settings", "invoiceCounter");
                                const counterSnap = await getDoc(counterRef);
                                const currentNum = counterSnap.exists() ? (counterSnap.data()?.[`year_${year}`] || 0) : 0;
                                const nextNum = currentNum + 1;
                                await setDoc(counterRef, { [`year_${year}`]: nextNum }, { merge: true });
                                const invoiceNumber = `F-${year}-${String(nextNum).padStart(4, "0")}`;
                                await updateDoc(doc(db, "payments", p.id!), { invoiceNumber, updatedAt: serverTimestamp() });
                                setPayments(prev => prev.map(x => x.id === p.id ? { ...x, invoiceNumber } as any : x));
                                toast(`Facture ${invoiceNumber} créée pour ${p.familyName}`, "success");
                              } catch (e) { console.error(e); toast("Erreur conversion", "error"); }
                            }} className="font-body text-[10px] text-orange-600 bg-orange-50 px-2.5 py-1 rounded border-none cursor-pointer hover:bg-orange-100 flex items-center gap-1"><Receipt size={10}/> → Facture définitive</button>
                          )}
                          <button onClick={() => setDuplicateTarget({ payment: p, targetFamilyId: "", targetSearch: "", mode: "choose" })} className="font-body text-[10px] text-blue-500 bg-blue-50 px-2.5 py-1 rounded border-none cursor-pointer hover:bg-blue-100 flex items-center gap-1"><Plus size={10}/> Dupliquer</button>
                          {(p.items||[]).some((i:any) => i.activityType === "cours" || i.activityTitle?.includes("Forfait")) && (
                            <button onClick={async () => {
                              // Charger le paiement source si dupliqué, sinon utiliser le paiement lui-même
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
                        <button onClick={() => deletePaymentCommand(p)} className="font-body text-[10px] text-red-500 bg-red-50 px-2.5 py-1 rounded border-none cursor-pointer hover:bg-red-100 flex items-center gap-1"><Trash2 size={10}/> Annuler</button>
                      </div>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        </div>
      );
    })()}
  </div>
  );
}
