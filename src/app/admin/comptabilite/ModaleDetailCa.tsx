"use client";

/**
 * src/app/admin/comptabilite/ModaleDetailCa.tsx
 *
 * Modale « Détail CA » : coller le détail d'une remise carte copié depuis le
 * site du Crédit Agricole pour la rapprocher transaction par transaction.
 *
 * C'est le chemin de secours officiel des remises CB depuis que le matching
 * automatique par sous-ensembles a été désactivé (cf. detail-ca.ts). L'écran
 * montre en direct ce qui a été extrait, ce qui a été retrouvé, et surtout ce
 * qui MANQUE : un montant sans encaissement correspondant signale une saisie
 * oubliée au TPE, pas un bug du rapprochement.
 *
 * Le total collé est comparé au montant du mouvement bancaire : s'il ne tombe
 * pas juste, l'écart est affiché — mais la validation reste possible, car une
 * remise partielle vaut mieux qu'une remise non traitée.
 */

import { parseCaText, chercherCorrespondancesDetailCa } from "./detail-ca";
import type { BankLine, CaDetailPreview } from "./types";

export function ModaleDetailCa({
  index, bankLines, encaissementsCompta,
  caDetailText, setCaDetailText,
  caDetailPreview, setCaDetailPreview,
  setShowCADetailModal, updateAndSaveBankLines,
}: {
  index: number;
  bankLines: BankLine[];
  encaissementsCompta: any[];
  caDetailText: string;
  setCaDetailText: (v: string) => void;
  caDetailPreview: CaDetailPreview | null;
  setCaDetailPreview: (v: CaDetailPreview | null) => void;
  setShowCADetailModal: (v: number | null) => void;
  updateAndSaveBankLines: (updated: BankLine[]) => Promise<void>;
}) {
  const bl = bankLines[index];
  if (!bl) return null;

  // Essai de matching : on cherche parmi les CB terminal NON CONSOMMÉS ceux
  // dont le montant correspond aux montants parsés (dans une fenêtre ±3j)
  const tryMatch = (text: string) => {
    setCaDetailPreview(chercherCorrespondancesDetailCa({
      text, bl, bankLines, indexCourant: index, encaissementsCompta,
    }));
  };
  const blAmount = bl.amount;
  const parsed = caDetailText ? parseCaText(caDetailText) : [];
  const parsedTotal = parsed.reduce((s, a) => s + a, 0);
  const totalMatches = Math.abs(parsedTotal - blAmount) < 0.02;

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center" onClick={() => setShowCADetailModal(null)}>
      <div className="bg-white rounded-2xl w-full max-w-2xl mx-4 shadow-xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center p-5 border-b border-gray-100">
          <div>
            <h2 className="font-display text-lg font-bold text-blue-800">Détail remise Crédit Agricole</h2>
            <p className="font-body text-xs text-slate-500">
              Mouvement : {bl.label} — <strong>{bl.amount.toFixed(2)}€</strong>
            </p>
          </div>
          <button onClick={() => setShowCADetailModal(null)} className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center cursor-pointer border-none">✕</button>
        </div>

        <div className="p-5 flex-1 overflow-y-auto">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
            <p className="font-body text-xs text-blue-800 leading-relaxed">
              <strong>Mode d'emploi :</strong><br />
              1. Connectez-vous au site Crédit Agricole → Comptes → Cliquer sur la remise CB<br />
              2. Sélectionner tout le tableau des transactions (ou juste la colonne "Montant")<br />
              3. Copier puis coller ci-dessous. Le système extrait automatiquement les montants en EUR.
            </p>
          </div>

          <label className="font-body text-xs font-semibold text-slate-600 block mb-1">Coller le détail copié depuis le site CA :</label>
          <textarea
            value={caDetailText}
            onChange={e => { setCaDetailText(e.target.value); tryMatch(e.target.value); }}
            placeholder="20/04/2026 17:02:34  95,00 EUR  497711******5900  ...&#10;20/04/2026 16:24:00  105,00 EUR  ..."
            rows={6}
            className="w-full font-mono text-xs border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-purple-400 resize-none"
          />

          {parsed.length > 0 && (
            <div className="mt-3 bg-slate-50 rounded-lg p-3">
              <div className="flex items-center justify-between font-body text-xs">
                <span className="text-slate-600">
                  <strong>{parsed.length}</strong> montant(s) extrait(s) — Total : <strong>{parsedTotal.toFixed(2)}€</strong>
                </span>
                <span className={totalMatches ? "text-green-600 font-semibold" : "text-orange-500 font-semibold"}>
                  {totalMatches ? "✓ correspond au mouvement" : `⚠ écart de ${(parsedTotal - blAmount).toFixed(2)}€`}
                </span>
              </div>
              {caDetailPreview && (
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div>
                    <div className="font-body text-xs font-semibold text-green-700 mb-1">✓ Trouvés ({caDetailPreview.found.length})</div>
                    <div className="flex flex-col gap-1 max-h-48 overflow-y-auto">
                      {caDetailPreview.found.map((e, idx) => (
                        <div key={idx} className="bg-green-50 rounded px-2 py-1 font-body text-[11px]">
                          <strong>{(e.montant || 0).toFixed(2)}€</strong> — {e.familyName || "?"} ({e.date?.seconds ? new Date(e.date.seconds * 1000).toLocaleDateString("fr-FR") : "?"})
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="font-body text-xs font-semibold text-orange-700 mb-1">⚠ Manquants ({caDetailPreview.missing.length})</div>
                    <div className="flex flex-col gap-1 max-h-48 overflow-y-auto">
                      {caDetailPreview.missing.map((amount, idx) => (
                        <div key={idx} className="bg-orange-50 rounded px-2 py-1 font-body text-[11px]">
                          <strong>{amount.toFixed(2)}€</strong> — pas d'encaissement CB correspondant
                        </div>
                      ))}
                      {caDetailPreview.missing.length === 0 && (
                        <div className="font-body text-[11px] text-slate-400 italic">Tous les montants matchent !</div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 p-4 border-t border-gray-100">
          <button onClick={() => setShowCADetailModal(null)}
            className="font-body text-sm text-slate-600 bg-white border border-gray-200 rounded-lg px-4 py-2 cursor-pointer hover:bg-gray-50">
            Annuler
          </button>
          <button
            disabled={!caDetailPreview || caDetailPreview.found.length === 0}
            onClick={() => {
              if (!caDetailPreview || caDetailPreview.found.length === 0) return;
              const updated = [...bankLines];
              const foundSum = caDetailPreview.found.reduce((s, e) => s + (e.montant || 0), 0);
              updated[index] = {
                ...updated[index],
                matched: true,
                matchType: "Manuel",
                matchDetail: `Détail CA : ${caDetailPreview.found.length}/${parsed.length} transactions trouvées = ${foundSum.toFixed(2)}€${caDetailPreview.missing.length > 0 ? ` (${caDetailPreview.missing.length} manquant(s))` : ""}`,
                matchedEncs: caDetailPreview.found.map((e: any) => ({
                  familyName: e.familyName || "",
                  montant: e.montant || 0,
                  date: e.date?.seconds ? new Date(e.date.seconds * 1000).toLocaleDateString("fr-FR") : "",
                  activityTitle: e.activityTitle || "",
                  mode: "CB Terminal",
                })),
                // Stocker les manquants pour les afficher au survol sur l'écran principal
                missingAmounts: caDetailPreview.missing.length > 0 ? caDetailPreview.missing : undefined,
              };
              updateAndSaveBankLines(updated);
              setShowCADetailModal(null);
            }}
            className="font-body text-sm text-white border-none rounded-lg px-4 py-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: "linear-gradient(135deg, #7c3aed, #2050A0)" }}>
            Valider le rapprochement
          </button>
        </div>
      </div>
    </div>
  );
}
