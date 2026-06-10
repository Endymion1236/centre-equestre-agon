"use client";

// Onglet "rapprochement_ignores" de la page Comptabilité — extrait de page.tsx (refacto), logique inchangée.
import { modeLabels, accounts } from "./shared";
import { EyeOff } from "lucide-react";
import { Card } from "@/components/ui";

export default function TabRapprochementIgnores(props: any) {
  const { bankLines, nbIgnores, updateAndSaveBankLines } = props;
  return (
(
        <div className="flex flex-col gap-5">
          <Card padding="md" className="bg-blue-50 border-blue-200">
            <div className="flex items-start gap-3">
              <EyeOff className="text-blue-600 mt-0.5 flex-shrink-0" size={20} />
              <div>
                <h3 className="font-body text-base font-semibold text-blue-800 mb-1">Lignes bancaires ignorées</h3>
                <p className="font-body text-sm text-slate-600">
                  Ces lignes ont été marquées comme volontairement écartées du rapprochement
                  (commissions, frais bancaires, virements personnels…). Elles restent stockées
                  pour traçabilité mais n'apparaissent plus dans l'onglet principal.
                </p>
                <p className="font-body text-xs text-slate-500 mt-2">
                  Cliquer sur <b>Restaurer</b> remet la ligne dans la liste des lignes à traiter.
                </p>
              </div>
            </div>
          </Card>

          {bankLines.filter((b: any) => b.matchType === "Ignoré").length === 0 ? (
            <Card padding="md" className="text-center">
              <p className="font-body text-sm text-slate-500 italic">
                Aucune ligne ignorée pour le moment.
              </p>
            </Card>
          ) : (
            <Card className="!p-0 overflow-hidden">
              <div className="overflow-x-auto">
                <div className="min-w-[800px]">
                  <div className="bg-blue-500/8 px-5 py-3 border-b border-blue-500/8 flex items-center font-body text-xs font-semibold text-blue-800 uppercase tracking-wide">
                    <span className="w-24">Date</span>
                    <span className="flex-1">Libellé bancaire</span>
                    <span className="w-24 text-right">Montant</span>
                    <span className="w-32 text-center">Action</span>
                  </div>
                  {bankLines
                    .map((bl: any, i: any) => ({ bl, i }))
                    .filter(({ bl }: any) => bl.matchType === "Ignoré")
                    .map(({ bl, i }: any) => (
                      <div key={i} className="px-5 py-3 border-b border-blue-500/8 flex items-center bg-slate-50/50">
                        <span className="w-24 font-body text-xs text-slate-500">{bl.date}</span>
                        <div className="flex-1">
                          <div className="font-body text-sm text-slate-700">{bl.label}</div>
                          {bl.matchDetail && (
                            <div className="font-body text-xs text-slate-500 mt-0.5">
                              ↳ {bl.matchDetail}
                            </div>
                          )}
                        </div>
                        <span className="w-24 text-right font-body text-sm font-semibold text-slate-600">
                          {bl.amount.toFixed(2)}€
                        </span>
                        <span className="w-32 text-center">
                          <button
                            onClick={() => {
                              const updated = [...bankLines];
                              updated[i] = { ...updated[i], matched: false, matchType: "", matchDetail: "" };
                              updateAndSaveBankLines(updated);
                            }}
                            className="px-3 py-1.5 rounded-lg font-body text-xs font-semibold text-white bg-blue-500 hover:bg-blue-600 border-none cursor-pointer">
                            Restaurer
                          </button>
                        </span>
                      </div>
                    ))}
                  <div className="px-5 py-3 bg-sand flex justify-between font-body text-sm">
                    <span className="font-semibold text-slate-600">
                      {nbIgnores} ligne{nbIgnores > 1 ? "s" : ""} ignorée{nbIgnores > 1 ? "s" : ""}
                    </span>
                    <span className="text-slate-500">
                      Total : {bankLines.filter((b: any) => b.matchType === "Ignoré").reduce((s: any, b: any) => s + b.amount, 0).toFixed(2)}€
                    </span>
                  </div>
                </div>
              </div>
            </Card>
          )}
        </div>
      )
  );
}
