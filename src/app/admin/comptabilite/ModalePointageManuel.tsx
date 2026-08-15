"use client";

/**
 * src/app/admin/comptabilite/ModalePointageManuel.tsx
 *
 * Modale « Pointer manuellement » : relier à la main une ligne du relevé à une
 * facture, quand aucune stratégie automatique n'a su le faire.
 *
 * Le tri n'est pas alphabétique : les factures dont le montant tombe juste
 * sont surlignées en vert, parce que dans 90 % des cas c'est celle-là qu'on
 * cherche. La liste est bridée à 50 lignes — au-delà, c'est le champ de
 * recherche qu'il faut utiliser.
 *
 * Cas particulier traité ici : pointer un VIREMENT en attente vaut
 * encaissement. On passe donc la facture en `paid`, sinon elle resterait dans
 * l'alerte « virements attendus depuis plus de 7 jours » alors que l'argent
 * est arrivé.
 */

import { doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Search } from "lucide-react";
import { modeLabels } from "./constants";
import type { BankLine, Payment } from "./types";

export function ModalePointageManuel({
  index, bankLines, manualSearch, setManualSearch, setShowManualMatch,
  filteredPayments, updateAndSaveBankLines, fetchData,
}: {
  index: number;
  bankLines: BankLine[];
  manualSearch: string;
  setManualSearch: (v: string) => void;
  setShowManualMatch: (v: number | null) => void;
  filteredPayments: Payment[];
  updateAndSaveBankLines: (updated: BankLine[]) => Promise<void>;
  fetchData: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center" onClick={() => setShowManualMatch(null)}>
      <div className="bg-white rounded-2xl w-full max-w-lg mx-4 shadow-xl max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center p-5 border-b border-gray-100">
          <div>
            <h2 className="font-display text-lg font-bold text-blue-800">Pointer manuellement</h2>
            <p className="font-body text-xs text-slate-500">
              Mouvement : {bankLines[index]?.label} — {bankLines[index]?.amount.toFixed(2)}€
            </p>
          </div>
          <button onClick={() => setShowManualMatch(null)} className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center cursor-pointer border-none">✕</button>
        </div>
        <div className="p-4">
          <div className="relative mb-3">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input placeholder="Filtrer par client, montant…" value={manualSearch} onChange={e => setManualSearch(e.target.value)}
              className="w-full font-body text-sm border border-gray-200 rounded-lg pl-9 pr-3 py-2 bg-white focus:outline-none focus:border-blue-400" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          <div className="flex flex-col gap-1.5">
            {filteredPayments
              .filter(p => {
                if (!manualSearch) return true;
                const q = manualSearch.toLowerCase();
                return p.familyName?.toLowerCase().includes(q) ||
                  (p.totalTTC || 0).toFixed(2).includes(q) ||
                  (modeLabels[p.paymentMode] || "").toLowerCase().includes(q);
              })
              .slice(0, 50)
              .map(p => {
                const d = p.date?.seconds ? new Date(p.date.seconds * 1000) : null;
                const amountMatch = bankLines[index] && Math.abs((p.totalTTC || 0) - bankLines[index].amount) < 0.02;
                return (
                  <div key={p.id}
                    className={`flex items-center justify-between px-3 py-2.5 rounded-lg border cursor-pointer hover:border-blue-300 ${amountMatch ? "border-green-300 bg-green-50/30" : "border-gray-100"}`}
                    onClick={async () => {
                      const updated = [...bankLines];
                      updated[index] = {
                        ...updated[index],
                        matched: true,
                        matchType: "Manuel",
                        matchDetail: `${p.familyName} — ${(p.totalTTC || 0).toFixed(2)}€ (${modeLabels[p.paymentMode] || p.paymentMode})`,
                        manualPaymentId: p.id,
                      };
                      await updateAndSaveBankLines(updated);

                      // Bug #8 : si le paiement pointé est un virement pending/partial,
                      // on le marque comme encaissé pour sortir de l'alerte "virements attendus"
                      if (p.paymentMode === "virement" && (p.status === "pending" || p.status === "partial")) {
                        try {
                          await updateDoc(doc(db, "payments", p.id), {
                            status: "paid",
                            paidAmount: p.totalTTC || 0,
                            paidAt: serverTimestamp(),
                            reconciledByBank: true,
                          });
                          fetchData();
                        } catch (e) {
                          console.error("Erreur mise à jour paiement:", e);
                        }
                      }
                      setShowManualMatch(null);
                    }}>
                    <div>
                      <div className="font-body text-sm font-semibold text-blue-800">{p.familyName || "—"}</div>
                      <div className="font-body text-xs text-slate-500">
                        {d?.toLocaleDateString("fr-FR")} · {(p.items || []).map(i => i.activityTitle).join(", ") || "—"} · {modeLabels[p.paymentMode] || p.paymentMode}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`font-body text-sm font-bold ${amountMatch ? "text-green-600" : "text-blue-500"}`}>{(p.totalTTC || 0).toFixed(2)}€</div>
                      {amountMatch && <div className="font-body text-[10px] text-green-500">Montant exact</div>}
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      </div>
    </div>
  );
}
