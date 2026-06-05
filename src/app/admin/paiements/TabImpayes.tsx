"use client";
import React, { useState } from "react";
import { updateDoc, getDoc, setDoc, doc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { safeNumber, generateOrderId } from "@/lib/utils";
import { Card, Badge } from "@/components/ui";
import { Loader2, Search, X, AlertTriangle, Receipt, Check, ChevronDown, Plus, Trash2, FileText, Calendar } from "lucide-react";
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
  // Filtre par type : 'all' = tout, 'invoice' = factures simples, 'echeance' = échéances en retard
  const [typeFilter, setTypeFilter] = useState<"all" | "invoice" | "echeance">("all");
  const inputCls = "w-full px-3 py-2.5 rounded-lg border border-blue-500/8 font-body text-sm bg-cream focus:border-blue-500 focus:outline-none";

  return (
  <div>
    {loading ? <div className="text-center py-16"><Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto" /></div> :
    (() => {
      const todayStr = new Date().toISOString().split("T")[0];
      const unpaid = payments.filter(p => {
        if (p.status === "cancelled" || p.status === "paid" || p.status === "sepa_scheduled") return false;
        if ((p.paidAmount || 0) >= (p.totalTTC || 0)) return false;
        // Paiement converti en chèques différés : plus dans les impayés, il est
        // suivi dans l'onglet dédié "Chèques différés" (chaque chèque y est déposé
        // individuellement le jour venu).
        if (p.paymentMode === "cheque_differe") return false;
        // Échéances : inclure uniquement celles en retard (date dépassée)
        if ((p as any).echeancesTotal > 1) {
          return (p as any).echeanceDate && (p as any).echeanceDate < todayStr;
        }
        return true;
      });
      const totalDue = unpaid.reduce((s, p) => s + ((p.totalTTC || 0) - (p.paidAmount || 0)), 0);

      // ── Compteurs par type (avant filtrage par recherche/type) ──
      const nbInvoice = unpaid.filter(p => !((p as any).echeancesTotal > 1)).length;
      const nbEcheance = unpaid.filter(p => (p as any).echeancesTotal > 1).length;

      // ── Recherche ──
      const search = impayesSearch;
      const setSearch = setImpayesSearch;
      const expanded = impayesExpanded;

      const filtered = unpaid
        .filter(p => {
          // Filtre par type
          const isEch = (p as any).echeancesTotal > 1;
          if (typeFilter === "invoice" && isEch) return false;
          if (typeFilter === "echeance" && !isEch) return false;
          return true;
        })
        .filter(p => {
          // Filtre recherche texte
          if (!search.trim()) return true;
          const q = search.toLowerCase();
          const inName = (p.familyName || "").toLowerCase().includes(q);
          const inItems = (p.items || []).some((i: any) => (i.activityTitle || "").toLowerCase().includes(q) || (i.childName || "").toLowerCase().includes(q));
          const inDate = p.date?.seconds ? new Date(p.date.seconds * 1000).toLocaleDateString("fr-FR").includes(q) : false;
          return inName || inItems || inDate;
        });

      // ─── Regroupement par événement ─────────────────────────────────────
      // Critère : même date de créneau (items[0].date) + même activityTitle.
      // Permet d'avoir cote a cote toutes les commandes d'un même événement
      // (typiquement les commandes broadcastées d'un concours, d'une balade...).
      //
      // Les commandes sans date de créneau (factures classiques) tombent dans
      // un groupe "_orphan_" trié en bas par date de création.
      type Group = { key: string; label: string; eventDate: string; payments: typeof filtered; isOrphan: boolean };
      const groupsMap = new Map<string, Group>();
      for (const p of filtered) {
        const firstItem = (p.items || []).find((i: any) => i.date);
        if (firstItem?.date) {
          // Plusieurs items dans une commande peuvent référer à des dates différentes
          // (ex: stage 3 jours). On groupe sur la 1ère date trouvée + activityTitle 1er item.
          const activityTitle = (p.items?.[0]?.activityTitle || "").trim();
          const key = `${firstItem.date}_${activityTitle}`;
          if (!groupsMap.has(key)) {
            const dt = new Date(firstItem.date + "T12:00:00");
            const dateLabel = dt.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
            groupsMap.set(key, {
              key,
              label: `${activityTitle} · ${dateLabel}`,
              eventDate: firstItem.date,
              payments: [],
              isOrphan: false,
            });
          }
          groupsMap.get(key)!.payments.push(p);
        } else {
          // Commande sans date de créneau → groupe orphelin
          if (!groupsMap.has("_orphan_")) {
            groupsMap.set("_orphan_", { key: "_orphan_", label: "Autres factures", eventDate: "9999-99-99", payments: [], isOrphan: true });
          }
          groupsMap.get("_orphan_")!.payments.push(p);
        }
      }
      // Tri inter-groupes : par date d'événement DÉCROISSANTE (plus récent en haut),
      // orphelins en dernier (eventDate = "9999-99-99" donc déjà en dernier en desc inverse,
      // on les force quand même pour être explicite).
      const groups = [...groupsMap.values()].sort((a, b) => {
        if (a.isOrphan !== b.isOrphan) return a.isOrphan ? 1 : -1;
        return b.eventDate.localeCompare(a.eventDate);
      });
      // Tri intra-groupe : par nom de famille A→Z (orphelins : par date de création desc)
      for (const g of groups) {
        if (g.isOrphan) {
          g.payments.sort((a: any, b: any) => (b.date?.seconds || 0) - (a.date?.seconds || 0));
        } else {
          g.payments.sort((a: any, b: any) => (a.familyName || "").localeCompare(b.familyName || "", "fr"));
        }
      }

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
          <div className="relative mb-3">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
            <input data-testid="impaye-search-input" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Rechercher par nom, activité, date..."
              className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-blue-500/8 font-body text-sm bg-white focus:border-blue-400 focus:outline-none"/>
            {search && <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 bg-transparent border-none cursor-pointer"><X size={14}/></button>}
          </div>

          {/* Filtres par type — n'apparaissent que si on a au moins un de chaque type */}
          {nbInvoice > 0 && nbEcheance > 0 && (
            <div className="flex gap-2 mb-4 flex-wrap">
              <button
                onClick={() => setTypeFilter("all")}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg font-body text-xs font-semibold border-none cursor-pointer ${typeFilter === "all" ? "bg-blue-500 text-white" : "bg-blue-50 text-blue-700 hover:bg-blue-100"}`}>
                Tous <span className="bg-white/20 px-1.5 py-0.5 rounded text-[10px]">{unpaid.length}</span>
              </button>
              <button
                onClick={() => setTypeFilter("invoice")}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg font-body text-xs font-semibold border-none cursor-pointer ${typeFilter === "invoice" ? "bg-red-500 text-white" : "bg-red-50 text-red-600 hover:bg-red-100"}`}>
                <FileText size={12} /> Factures <span className={`px-1.5 py-0.5 rounded text-[10px] ${typeFilter === "invoice" ? "bg-white/20" : "bg-white/60"}`}>{nbInvoice}</span>
              </button>
              <button
                onClick={() => setTypeFilter("echeance")}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg font-body text-xs font-semibold border-none cursor-pointer ${typeFilter === "echeance" ? "bg-orange-500 text-white" : "bg-orange-50 text-orange-600 hover:bg-orange-100"}`}>
                <Calendar size={12} /> Échéances en retard <span className={`px-1.5 py-0.5 rounded text-[10px] ${typeFilter === "echeance" ? "bg-white/20" : "bg-white/60"}`}>{nbEcheance}</span>
              </button>
            </div>
          )}

          {filtered.length === 0 && (
            <p className="font-body text-sm text-slate-500 text-center py-8">
              {search ? `Aucun résultat pour "${search}"` :
                typeFilter === "invoice" ? "Aucune facture impayée." :
                typeFilter === "echeance" ? "Aucune échéance en retard." :
                "Aucun impayé."}
            </p>
          )}

          <div className="flex flex-col gap-5">
            {groups.map(g => (
              <div key={g.key}>
                {/* En-tête de groupe — pas de header si tout est dans 'Autres factures' seul */}
                {!(groups.length === 1 && g.isOrphan) && (
                  <div className="flex items-baseline gap-2 mb-2 px-1">
                    <span className={`font-display text-sm font-bold ${g.isOrphan ? "text-slate-400" : "text-blue-800"}`}>
                      {g.label}
                    </span>
                    <span className="font-body text-[11px] text-slate-500">
                      · {g.payments.length} commande{g.payments.length > 1 ? "s" : ""}
                      {g.payments.length > 1 && (
                        <> · {g.payments.reduce((s, p) => s + ((p.totalTTC || 0) - (p.paidAmount || 0)), 0).toFixed(2)}€</>
                      )}
                    </span>
                  </div>
                )}
                <div className="flex flex-col gap-2">
                  {g.payments.map(p => {
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
                <Card key={p.id} padding="md" className={`overflow-hidden border-l-4 ${isEcheance ? "border-l-orange-400" : "border-l-red-400"}`}>
                  {/* ── En-tête accordéon (toujours visible) ── */}
                  <button onClick={() => toggle(p.id)} className="w-full flex items-center justify-between gap-3 bg-transparent border-none cursor-pointer text-left p-0">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        {isEcheance ? (
                          <Calendar size={14} className="text-orange-500 flex-shrink-0" aria-label="Échéance d'un échéancier" />
                        ) : (
                          <FileText size={14} className="text-red-500 flex-shrink-0" aria-label="Facture impayée" />
                        )}
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
                        {(() => {
                          // Date à afficher en sous-titre :
                          // - Pour une échéance : date d'échéance (= date de prélèvement)
                          // - Pour une commande "événement" (concours, stage, balade...) :
                          //     date du 1er item si elle existe (= date du créneau)
                          // - Sinon : fallback sur la date de création
                          if (isEcheance) {
                            return `${(p as any).forfaitRef || (p.items||[]).map((i:any)=>i.activityTitle).join(", ")} · Échéance du ${echeanceDateStr ? new Date(echeanceDateStr).toLocaleDateString("fr-FR") : "—"}`;
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
                      {(p.items || []).map((item: any, idx: number) => {
                        // Construire le planning du stage si disponible
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
                        // Le titre des stages/réservations contient parfois le nom collé
                        // ("Stage X (3j) — Eliot"). On le retire pour éviter le doublon,
                        // puis on préfixe childName une seule fois → "Eliot — Stage X (3j)".
                        const cleanTitle = item.childName
                          ? String(item.activityTitle || "").replace(` — ${item.childName}`, "")
                          : (item.activityTitle || "");
                        return (
                          <div key={idx} className="py-1.5 font-body text-xs border-b border-gray-50 last:border-0">
                            <div className="flex items-center justify-between">
                              <span className="text-slate-600 flex-1 min-w-0 truncate">{item.childName ? `${item.childName} — ` : ""}{cleanTitle}{item.startTime && !planning ? ` ${item.startTime}` : ""}</span>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                <span className="text-blue-500 font-semibold">{(item.priceTTC || 0) === 0 ? <span className="text-slate-400 text-[10px]">Inclus</span> : `${(item.priceTTC || 0).toFixed(2)}€`}</span>
                                <button onClick={() => { if (!confirm(`Retirer "${item.activityTitle}" ?\n\nL'enfant sera désinscrit.`)) return; removePaymentItem(p, idx); }} className="text-red-400 hover:text-red-600 bg-transparent border-none cursor-pointer p-0.5"><X size={12}/></button>
                              </div>
                            </div>
                            {planning && (
                              <div className="text-[10px] text-slate-400 ml-0 mt-0.5">📅 {planning}</div>
                            )}
                          </div>
                        );
                      })}
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
                            const fam = families.find(f => f.firestoreId === p.familyId);
                            const civilite = fam?.civilite ? `${fam.civilite} ` : "";
                            const adresseLines = [fam?.address, [fam?.zipCode, fam?.city].filter(Boolean).join(" ")].filter(Boolean).join("\n");
                            await downloadInvoicePdf({ invoiceNumber, date: invDate.toLocaleDateString("fr-FR"), familyName: `${civilite}${p.familyName}`, familyEmail: fam?.parentEmail || "", familyAddress: adresseLines, items, totalHT, totalTVA: totalTTC - totalHT, totalTTC, paidAmount: p.paidAmount || 0, paymentMode: p.paymentMode ? (paymentModes.find(m => m.id === p.paymentMode)?.label || p.paymentMode) : "", paymentDate: p.paidAmount > 0 ? invDate.toLocaleDateString("fr-FR") : "", paymentId: p.id });
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
            ))}
          </div>
        </div>
      );
    })()}
  </div>
  );
}
