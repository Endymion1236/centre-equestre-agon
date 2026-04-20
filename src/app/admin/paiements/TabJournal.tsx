"use client";
import React, { useState } from "react";
import { collection, addDoc, getDoc, getDocs, updateDoc, doc, query, where, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { safeNumber } from "@/lib/utils";
import { Card, Badge } from "@/components/ui";
import { Loader2, ChevronDown, Receipt, AlertTriangle, Copy, Check, X, Search } from "lucide-react";
import { downloadInvoicePdf } from "@/lib/download-invoice";
import { openHtmlInTab } from "@/lib/open-html-tab";
import { paymentModes } from "./types";

interface TabJournalProps {
  loading: boolean;
  payments: any[];
  encaissements: any[];
  avoirs: any[];
  toast: (message: string, type?: "error" | "success" | "warning" | "info", duration?: number) => void;
  refreshAll: () => Promise<void>;
}

export function TabJournal({ loading, payments, encaissements, avoirs, toast, refreshAll }: TabJournalProps) {
  const [journalSearch, setJournalSearch] = useState("");
  const [journalDateFrom, setJournalDateFrom] = useState("");
  const [journalDateTo, setJournalDateTo] = useState("");
  const [journalMontantMin, setJournalMontantMin] = useState("");
  const [journalMontantMax, setJournalMontantMax] = useState("");
  const [journalMode, setJournalMode] = useState("all");
  const [journalStatus, setJournalStatus] = useState("all");
  const [correctionEnc, setCorrectionEnc] = useState<any | null>(null);
  const [correctionMontant, setCorrectionMontant] = useState("");
  const [correctionMode, setCorrectionMode] = useState("");
  const [correctionRef, setCorrectionRef] = useState("");
  const [correctionRaison, setCorrectionRaison] = useState("");
  const inputCls = "w-full px-3 py-2.5 rounded-lg border border-blue-500/8 font-body text-sm bg-cream focus:border-blue-500 focus:outline-none";

  return (
  <div>
    {loading ? <div className="text-center py-16"><Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto" /></div> :
    (() => {
      // Filtrage des encaissements
      // Construire le journal : encaissements réels + fallback anciens payments payés
      const encPaymentIds = new Set(encaissements.map((e: any) => e.paymentId));
      const fallbackLines = payments
        .filter(p => (p.status === "paid" || p.paidAmount > 0) && p.status !== "cancelled" && !encPaymentIds.has(p.id))
        .map(p => ({
          id: `fallback_${p.id}`,
          paymentId: p.id,
          familyId: p.familyId,
          familyName: p.familyName,
          montant: p.paidAmount || p.totalTTC || 0,
          mode: p.paymentMode || "",
          modeLabel: paymentModes.find(m => m.id === p.paymentMode)?.label || p.paymentMode || "—",
          ref: p.paymentRef || "",
          activityTitle: (p.items || []).map((i: any) => i.activityTitle).join(", "),
          date: p.date,
        }));
      
      let filtered = [...encaissements, ...fallbackLines];
      if (journalDateFrom) filtered = filtered.filter(e => { const d = e.date?.seconds ? new Date(e.date.seconds * 1000) : null; return d && d >= new Date(journalDateFrom); });
      if (journalDateTo) filtered = filtered.filter(e => { const d = e.date?.seconds ? new Date(e.date.seconds * 1000) : null; return d && d <= new Date(journalDateTo + "T23:59:59"); });
      if (journalMontantMin) filtered = filtered.filter(e => (e.montant || 0) >= safeNumber(journalMontantMin));
      if (journalMontantMax) filtered = filtered.filter(e => (e.montant || 0) <= safeNumber(journalMontantMax));
      if (journalMode !== "all") filtered = filtered.filter(e => e.mode === journalMode);
      if (journalSearch) { const q = journalSearch.toLowerCase(); filtered = filtered.filter(e => e.familyName?.toLowerCase().includes(q) || e.activityTitle?.toLowerCase().includes(q) || e.ref?.toLowerCase().includes(q)); }
      // Tri chronologique : plus récent en haut. Priorité à createdAt (heure
      // précise de l'encaissement), fallback sur date (fixée à 12h si date
      // manuelle), puis tie-break stable par id.
      const getJournalTs = (e: any): number => {
        const src = e.createdAt || e.date;
        if (!src) return 0;
        if (src.seconds !== undefined) return src.seconds * 1000 + (src.nanoseconds || 0) / 1e6;
        if (src.toDate) return src.toDate().getTime();
        return 0;
      };
      filtered.sort((a, b) => {
        const diff = getJournalTs(b) - getJournalTs(a);
        if (diff !== 0) return diff;
        return String(b.id || "").localeCompare(String(a.id || ""));
      });

      // Totaux par mode
      const totalsByMode: Record<string, number> = {};
      filtered.forEach(e => { totalsByMode[e.mode || "autre"] = (totalsByMode[e.mode || "autre"] || 0) + (e.montant || 0); });
      const grandTotal = filtered.reduce((s, e) => s + (e.montant || 0), 0);

      return (
        <>
          {/* Totaux par mode — style Céléris */}
          <div className="flex flex-wrap gap-3 mb-4">
            {Object.entries(totalsByMode).sort(([,a],[,b]) => b - a).map(([mode, total]) => {
              const modeObj = paymentModes.find(m => m.id === mode);
              return (
                <div key={mode} onClick={() => setJournalMode(journalMode === mode ? "all" : mode)}
                  className={`flex flex-col items-center px-4 py-2.5 rounded-xl cursor-pointer transition-all ${journalMode === mode ? "bg-blue-500 text-white ring-2 ring-blue-300" : "bg-sand hover:bg-blue-50"}`}>
                  <div className={`font-body text-[10px] uppercase font-semibold ${journalMode === mode ? "text-white/70" : "text-slate-600"}`}>{modeObj?.label || mode}</div>
                  <div className={`font-body text-lg font-bold ${journalMode === mode ? "text-white" : "text-blue-800"}`}>{total.toFixed(2)}€</div>
                </div>
              );
            })}
            <div className="flex flex-col items-center px-4 py-2.5 rounded-xl bg-green-50">
              <div className="font-body text-[10px] uppercase font-semibold text-green-600">Total encaissé</div>
              <div className="font-body text-lg font-bold text-green-600">{grandTotal.toFixed(2)}€</div>
            </div>
          </div>

          {/* Filtres */}
          <Card padding="sm" className="mb-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2">
              <div><label className="font-body text-[10px] text-slate-600 uppercase block mb-0.5">Date de</label><input type="date" value={journalDateFrom} onChange={e => setJournalDateFrom(e.target.value)} className={inputCls} /></div>
              <div><label className="font-body text-[10px] text-slate-600 uppercase block mb-0.5">Date à</label><input type="date" value={journalDateTo} onChange={e => setJournalDateTo(e.target.value)} className={inputCls} /></div>
              <div><label className="font-body text-[10px] text-slate-600 uppercase block mb-0.5">Montant min</label><input type="number" step="0.01" placeholder="0" value={journalMontantMin} onChange={e => setJournalMontantMin(e.target.value)} className={inputCls} /></div>
              <div><label className="font-body text-[10px] text-slate-600 uppercase block mb-0.5">Montant max</label><input type="number" step="0.01" placeholder="9999" value={journalMontantMax} onChange={e => setJournalMontantMax(e.target.value)} className={inputCls} /></div>
            </div>
            <div className="flex flex-wrap gap-2 items-center">
              <select value={journalMode} onChange={e => setJournalMode(e.target.value)} className={`${inputCls} w-40`}>
                <option value="all">Tous les modes</option>
                {paymentModes.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
              <div className="relative flex-1 min-w-[150px]">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input placeholder="Nom, prestation, référence…" value={journalSearch} onChange={e => setJournalSearch(e.target.value)} className={`${inputCls} !pl-9`} />
              </div>
              {(journalDateFrom || journalDateTo || journalMontantMin || journalMontantMax || journalMode !== "all" || journalSearch) && (
                <button onClick={() => { setJournalDateFrom(""); setJournalDateTo(""); setJournalMontantMin(""); setJournalMontantMax(""); setJournalMode("all"); setJournalSearch(""); }}
                  className="font-body text-xs text-red-500 bg-red-50 px-3 py-1.5 rounded-lg border-none cursor-pointer hover:bg-red-100">Effacer</button>
              )}
              <span className="font-body text-xs text-slate-600">{filtered.length} mouvement{filtered.length > 1 ? "s" : ""}</span>
            </div>
          </Card>

          {/* Tableau des encaissements — 1 ligne = 1 mouvement réel */}
          {filtered.length === 0 ? (
            <Card padding="lg" className="text-center"><p className="font-body text-sm text-slate-600">{encaissements.length === 0 ? "Aucun encaissement enregistré." : "Aucun encaissement correspondant aux filtres."}</p></Card>
          ) : (
            <Card className="!p-0 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-sand border-b border-blue-500/8">
                      {["Date", "Client", "Prestation", "Montant", "Mode", "Référence", ""].map(h => (
                        <th key={h} className="px-3 py-2.5 font-body text-[10px] font-semibold text-slate-600 uppercase tracking-wider text-left">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(enc => {
                      const d = enc.date?.seconds ? new Date(enc.date.seconds * 1000) : null;
                      return (
                        <tr key={enc.id} className={`border-b border-blue-500/5 hover:bg-blue-50/30 ${(enc.montant || 0) < 0 ? "bg-red-50/30" : ""}`}>
                          <td className="px-3 py-2.5 font-body text-xs text-slate-600">{d ? d.toLocaleDateString("fr-FR") : "—"}</td>
                          <td className="px-3 py-2.5 font-body text-sm font-semibold text-blue-800">{enc.familyName || "—"}</td>
                          <td className="px-3 py-2.5 font-body text-xs text-slate-600 max-w-[250px] truncate">
                            {enc.activityTitle || "—"}
                            {enc.correctionDe && <span className="text-red-400 ml-1">(annule #{enc.correctionDe.slice(-4)})</span>}
                            {enc.raison && <span className="text-orange-400 ml-1">— {enc.raison}</span>}
                          </td>
                          <td className={`px-3 py-2.5 font-body text-sm font-bold ${(enc.montant || 0) < 0 ? "text-red-500" : "text-green-600"}`}>{(enc.montant || 0).toFixed(2)}€</td>
                          <td className="px-3 py-2.5"><Badge color={(enc.montant || 0) < 0 ? "red" : "blue"}>{enc.modeLabel || enc.mode || "—"}</Badge></td>
                          <td className="px-3 py-2.5 font-body text-xs text-slate-600">{enc.ref || "—"}</td>
                          <td className="px-3 py-2.5">
                            {!enc.id?.startsWith("fallback_") && (enc.montant || 0) > 0 && !enc.correctionDe && (
                              <button onClick={() => { setCorrectionEnc(enc); setCorrectionMontant(enc.montant?.toString() || ""); setCorrectionMode(enc.mode || ""); setCorrectionRef(enc.ref || ""); setCorrectionRaison(""); }}
                                className="font-body text-[10px] text-orange-500 bg-orange-50 px-2 py-1 rounded border-none cursor-pointer hover:bg-orange-100">Corriger</button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* Modale correction encaissement */}
          {correctionEnc && (
            <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setCorrectionEnc(null)}>
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
                <div className="p-5 border-b border-gray-100">
                  <h2 className="font-display text-lg font-bold text-blue-800">Corriger un encaissement</h2>
                  <p className="font-body text-xs text-slate-600 mt-1">
                    Une contre-passation sera créée (écriture négative), puis le bon encaissement sera enregistré. Les deux écritures restent visibles pour la traçabilité.
                  </p>
                </div>
                <div className="p-5">
                  <div className="bg-red-50 rounded-lg p-3 mb-4">
                    <div className="font-body text-xs text-red-500 font-semibold mb-1">Encaissement à corriger</div>
                    <div className="font-body text-sm text-blue-800">{correctionEnc.familyName} — {correctionEnc.activityTitle}</div>
                    <div className="font-body text-sm font-bold text-red-500">{(correctionEnc.montant || 0).toFixed(2)}€ ({correctionEnc.modeLabel || correctionEnc.mode})</div>
                  </div>

                  <div className="font-body text-xs font-semibold text-blue-800 mb-2">Raison de la correction *</div>
                  <input value={correctionRaison} onChange={e => setCorrectionRaison(e.target.value)} placeholder="Ex: erreur de montant, mauvais mode de paiement..."
                    className="w-full px-3 py-2 rounded-lg border border-blue-500/8 font-body text-sm bg-cream mb-3" />

                  <div className="font-body text-xs font-semibold text-blue-800 mb-2">Nouveau montant (0 = annulation pure)</div>
                  <input type="number" step="0.01" value={correctionMontant} onChange={e => setCorrectionMontant(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-blue-500/8 font-body text-sm bg-cream mb-3" />

                  <div className="font-body text-xs font-semibold text-blue-800 mb-2">Mode de paiement</div>
                  <select value={correctionMode} onChange={e => setCorrectionMode(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-blue-500/8 font-body text-sm bg-cream mb-3">
                    {paymentModes.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                  </select>

                  <div className="font-body text-xs font-semibold text-blue-800 mb-2">Référence</div>
                  <input value={correctionRef} onChange={e => setCorrectionRef(e.target.value)} placeholder="N° chèque, réf virement..."
                    className="w-full px-3 py-2 rounded-lg border border-blue-500/8 font-body text-sm bg-cream mb-4" />
                </div>
                <div className="p-5 border-t border-gray-100 flex gap-3">
                  <button onClick={() => setCorrectionEnc(null)}
                    className="flex-1 py-2.5 rounded-lg font-body text-sm text-slate-600 bg-gray-100 border-none cursor-pointer">Annuler</button>
                  <button onClick={async () => {
                    if (!correctionRaison) { toast("Indiquez la raison de la correction.", "warning"); return; }
                    const newMontant = safeNumber(correctionMontant);

                    // 1. Contre-passation (écriture négative)
                    await addDoc(collection(db, "encaissements"), {
                      paymentId: correctionEnc.paymentId,
                      familyId: correctionEnc.familyId,
                      familyName: correctionEnc.familyName,
                      montant: -(correctionEnc.montant || 0),
                      mode: correctionEnc.mode,
                      modeLabel: `ANNUL. ${correctionEnc.modeLabel || correctionEnc.mode}`,
                      ref: correctionEnc.ref || "",
                      activityTitle: correctionEnc.activityTitle,
                      raison: `Correction : ${correctionRaison}`,
                      correctionDe: correctionEnc.id,
                      date: serverTimestamp(),
                    });

                    // 2. Nouvel encaissement correct (si montant > 0)
                    if (newMontant > 0) {
                      await addDoc(collection(db, "encaissements"), {
                        paymentId: correctionEnc.paymentId,
                        familyId: correctionEnc.familyId,
                        familyName: correctionEnc.familyName,
                        montant: newMontant,
                        mode: correctionMode,
                        modeLabel: paymentModes.find(m => m.id === correctionMode)?.label || correctionMode,
                        ref: correctionRef,
                        activityTitle: correctionEnc.activityTitle,
                        raison: `Remplacement : ${correctionRaison}`,
                        date: serverTimestamp(),
                      });
                    }

                    // 3. Recalculer paidAmount du payment
                    if (correctionEnc.paymentId) {
                      const encSnap = await getDocs(query(collection(db, "encaissements"), where("paymentId", "==", correctionEnc.paymentId)));
                      const totalEnc = encSnap.docs.reduce((s, d) => s + (d.data().montant || 0), 0);
                      const payDocRef = doc(db, "payments", correctionEnc.paymentId);
                      const paySnap2 = await getDoc(payDocRef);
                      if (paySnap2.exists()) {
                        const totalTTC = paySnap2.data().totalTTC || 0;
                        await updateDoc(payDocRef, {
                          paidAmount: Math.max(0, totalEnc),
                          status: totalEnc >= totalTTC ? "paid" : totalEnc > 0 ? "partial" : "pending",
                        });
                      }
                    }

                    setCorrectionEnc(null);
                    await refreshAll();
                  }}
                    className="flex-1 py-2.5 rounded-lg font-body text-sm font-semibold text-white bg-orange-500 border-none cursor-pointer hover:bg-orange-600">
                    Contre-passer et corriger
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      );
    })()}
  </div>
  );
}
