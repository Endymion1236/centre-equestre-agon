"use client";
import { useState } from "react";
import { collection, getDoc, getDocs, updateDoc, doc, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { safeNumber } from "@/lib/utils";
import { createEncaissement } from "@/lib/compta-encaissement";
import { Card, Badge } from "@/components/ui";
import { Loader2, Search } from "lucide-react";
import { paymentModes } from "./types";
import { preparerJournal } from "./journal-utils";

interface TabJournalProps {
  loading: boolean;
  payments: any[];
  encaissements: any[];
  avoirs: any[];
  toast: (message: string, type?: "error" | "success" | "warning" | "info", duration?: number) => void;
  refreshAll: () => Promise<void>;
}

export function TabJournal({ loading, payments, encaissements, toast, refreshAll }: TabJournalProps) {
  const [journalSearch, setJournalSearch] = useState("");
  const [journalDateFrom, setJournalDateFrom] = useState("");
  const [journalDateTo, setJournalDateTo] = useState("");
  const [journalMontantMin, setJournalMontantMin] = useState("");
  const [journalMontantMax, setJournalMontantMax] = useState("");
  const [journalMode, setJournalMode] = useState("all");
  const [correctionEnc, setCorrectionEnc] = useState<any | null>(null);
  const [correctionMontant, setCorrectionMontant] = useState("");
  const [correctionMode, setCorrectionMode] = useState("");
  const [correctionRef, setCorrectionRef] = useState("");
  const [correctionRaison, setCorrectionRaison] = useState("");
  const inputCls = "w-full px-3 py-2.5 rounded-lg border border-blue-500/8 font-body text-sm bg-cream focus:border-blue-500 focus:outline-none";

  const { filtered, totalsByMode, grandTotal } = preparerJournal(payments, encaissements, {
    dateFrom: journalDateFrom,
    dateTo: journalDateTo,
    montantMin: journalMontantMin,
    montantMax: journalMontantMax,
    mode: journalMode,
    search: journalSearch,
  });

  const hasFilters = Boolean(
    journalDateFrom || journalDateTo || journalMontantMin || journalMontantMax || journalMode !== "all" || journalSearch,
  );

  const resetFilters = () => {
    setJournalDateFrom("");
    setJournalDateTo("");
    setJournalMontantMin("");
    setJournalMontantMax("");
    setJournalMode("all");
    setJournalSearch("");
  };

  if (loading) {
    return <div className="text-center py-16"><Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto" /></div>;
  }

  return (
    <div>
      <div className="flex flex-wrap gap-3 mb-4">
        {Object.entries(totalsByMode).sort(([, a], [, b]) => b - a).map(([mode, total]) => {
          const modeObj = paymentModes.find((item) => item.id === mode);
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

      <Card padding="sm" className="mb-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2">
          <div><label className="font-body text-[10px] text-slate-600 uppercase block mb-0.5">Date de</label><input type="date" value={journalDateFrom} onChange={(event) => setJournalDateFrom(event.target.value)} className={inputCls} /></div>
          <div><label className="font-body text-[10px] text-slate-600 uppercase block mb-0.5">Date à</label><input type="date" value={journalDateTo} onChange={(event) => setJournalDateTo(event.target.value)} className={inputCls} /></div>
          <div><label className="font-body text-[10px] text-slate-600 uppercase block mb-0.5">Montant min</label><input type="number" step="0.01" placeholder="0" value={journalMontantMin} onChange={(event) => setJournalMontantMin(event.target.value)} className={inputCls} /></div>
          <div><label className="font-body text-[10px] text-slate-600 uppercase block mb-0.5">Montant max</label><input type="number" step="0.01" placeholder="9999" value={journalMontantMax} onChange={(event) => setJournalMontantMax(event.target.value)} className={inputCls} /></div>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <select value={journalMode} onChange={(event) => setJournalMode(event.target.value)} className={`${inputCls} w-40`}>
            <option value="all">Tous les modes</option>
            {paymentModes.map((mode) => <option key={mode.id} value={mode.id}>{mode.label}</option>)}
          </select>
          <div className="relative flex-1 min-w-[150px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input placeholder="Nom, prestation, référence…" value={journalSearch} onChange={(event) => setJournalSearch(event.target.value)} className={`${inputCls} !pl-9`} />
          </div>
          {hasFilters && (
            <button type="button" onClick={resetFilters}
              className="font-body text-xs text-red-500 bg-red-50 px-3 py-1.5 rounded-lg border-none cursor-pointer hover:bg-red-100">Effacer</button>
          )}
          <span className="font-body text-xs text-slate-600">{filtered.length} mouvement{filtered.length > 1 ? "s" : ""}</span>
        </div>
      </Card>

      {filtered.length === 0 ? (
        <Card padding="lg" className="text-center"><p className="font-body text-sm text-slate-600">{encaissements.length === 0 ? "Aucun encaissement enregistré." : "Aucun encaissement correspondant aux filtres."}</p></Card>
      ) : (
        <Card className="!p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-sand border-b border-blue-500/8">
                  {["Date", "Client", "Prestation", "Montant", "Mode", "Référence", ""].map((heading) => (
                    <th key={heading} className="px-2 py-2.5 font-body text-[10px] font-semibold text-slate-600 uppercase tracking-wider text-left whitespace-nowrap">{heading}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((encaissement) => {
                  const date = encaissement.date?.seconds ? new Date(encaissement.date.seconds * 1000) : null;
                  return (
                    <tr key={encaissement.id} className={`border-b border-blue-500/5 hover:bg-blue-50/30 ${(encaissement.montant || 0) < 0 ? "bg-red-50/30" : ""}`}>
                      <td className="px-2 py-2.5 font-body text-xs text-slate-600 whitespace-nowrap">{date ? date.toLocaleDateString("fr-FR") : "—"}</td>
                      <td className="px-2 py-2.5 font-body text-sm font-semibold text-blue-800">{encaissement.familyName || "—"}</td>
                      <td className="px-2 py-2.5 font-body text-xs text-slate-600 max-w-[180px] truncate" title={`${encaissement.activityTitle || ""}${encaissement.raison ? ` — ${encaissement.raison}` : ""}`}>
                        {encaissement.activityTitle || "—"}
                        {encaissement.correctionDe && <span className="text-red-400 ml-1">(annule #{encaissement.correctionDe.slice(-4)})</span>}
                        {encaissement.raison && <span className="text-orange-400 ml-1">— {encaissement.raison}</span>}
                      </td>
                      <td className={`px-2 py-2.5 font-body text-sm font-bold whitespace-nowrap ${(encaissement.montant || 0) < 0 ? "text-red-500" : "text-green-600"}`}>{(encaissement.montant || 0).toFixed(2)}€</td>
                      <td className="px-2 py-2.5 whitespace-nowrap"><Badge color={(encaissement.montant || 0) < 0 ? "red" : "blue"}>{encaissement.modeLabel || encaissement.mode || "—"}</Badge></td>
                      <td className="px-2 py-2.5 font-body text-xs text-slate-600 max-w-[120px] truncate" title={encaissement.ref || ""}>{encaissement.ref || "—"}</td>
                      <td className="px-2 py-2.5 whitespace-nowrap">
                        {!encaissement.id?.startsWith("fallback_") && (encaissement.montant || 0) > 0 && !encaissement.correctionDe && (
                          <button type="button" onClick={() => {
                            setCorrectionEnc(encaissement);
                            setCorrectionMontant(encaissement.montant?.toString() || "");
                            setCorrectionMode(encaissement.mode || "");
                            setCorrectionRef(encaissement.ref || "");
                            setCorrectionRaison("");
                          }} className="font-body text-[10px] text-orange-500 bg-orange-50 px-2 py-1 rounded border-none cursor-pointer hover:bg-orange-100">Corriger</button>
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

      {correctionEnc && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setCorrectionEnc(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={(event) => event.stopPropagation()}>
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
              <input value={correctionRaison} onChange={(event) => setCorrectionRaison(event.target.value)} placeholder="Ex: erreur de montant, mauvais mode de paiement..."
                className="w-full px-3 py-2 rounded-lg border border-blue-500/8 font-body text-sm bg-cream mb-3" />

              <div className="font-body text-xs font-semibold text-blue-800 mb-2">Nouveau montant (0 = annulation pure)</div>
              <input type="number" step="0.01" value={correctionMontant} onChange={(event) => setCorrectionMontant(event.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-blue-500/8 font-body text-sm bg-cream mb-3" />

              <div className="font-body text-xs font-semibold text-blue-800 mb-2">Mode de paiement</div>
              <select value={correctionMode} onChange={(event) => setCorrectionMode(event.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-blue-500/8 font-body text-sm bg-cream mb-3">
                {paymentModes.map((mode) => <option key={mode.id} value={mode.id}>{mode.label}</option>)}
              </select>

              <div className="font-body text-xs font-semibold text-blue-800 mb-2">Référence</div>
              <input value={correctionRef} onChange={(event) => setCorrectionRef(event.target.value)} placeholder="N° chèque, réf virement..."
                className="w-full px-3 py-2 rounded-lg border border-blue-500/8 font-body text-sm bg-cream mb-4" />
            </div>
            <div className="p-5 border-t border-gray-100 flex gap-3">
              <button type="button" onClick={() => setCorrectionEnc(null)}
                className="flex-1 py-2.5 rounded-lg font-body text-sm text-slate-600 bg-gray-100 border-none cursor-pointer">Annuler</button>
              <button type="button" onClick={async () => {
                if (!correctionRaison) {
                  toast("Indiquez la raison de la correction.", "warning");
                  return;
                }
                const newMontant = safeNumber(correctionMontant);

                await createEncaissement({
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
                });

                if (newMontant > 0) {
                  await createEncaissement({
                    paymentId: correctionEnc.paymentId,
                    familyId: correctionEnc.familyId,
                    familyName: correctionEnc.familyName,
                    montant: newMontant,
                    mode: correctionMode,
                    modeLabel: paymentModes.find((mode) => mode.id === correctionMode)?.label || correctionMode,
                    ref: correctionRef,
                    activityTitle: correctionEnc.activityTitle,
                    raison: `Remplacement : ${correctionRaison}`,
                  });
                }

                if (correctionEnc.paymentId) {
                  const encSnap = await getDocs(query(collection(db, "encaissements"), where("paymentId", "==", correctionEnc.paymentId)));
                  const totalEnc = encSnap.docs.reduce((total, snapshot) => total + (snapshot.data().montant || 0), 0);
                  const paymentRef = doc(db, "payments", correctionEnc.paymentId);
                  const paymentSnapshot = await getDoc(paymentRef);
                  if (paymentSnapshot.exists()) {
                    const totalTTC = paymentSnapshot.data().totalTTC || 0;
                    await updateDoc(paymentRef, {
                      paidAmount: Math.max(0, totalEnc),
                      status: totalEnc >= totalTTC ? "paid" : totalEnc > 0 ? "partial" : "pending",
                    });
                  }
                }

                setCorrectionEnc(null);
                await refreshAll();
              }} className="flex-1 py-2.5 rounded-lg font-body text-sm font-semibold text-white bg-orange-500 border-none cursor-pointer hover:bg-orange-600">
                Contre-passer et corriger
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
