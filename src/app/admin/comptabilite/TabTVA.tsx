"use client";

// Onglet "tva" de la page Comptabilité — extrait de page.tsx (refacto), logique inchangée.
import { modeLabels, accounts } from "./shared";
import { Card } from "@/components/ui";

export default function TabTVA(props: any) {
  const { byMode, totalHT, totalTTC, totalTVA, tvaByRate } = props;
  return (
(
        <div className="flex flex-col gap-5">
          <Card className="!p-0 overflow-hidden">
            <div className="px-5 py-3 bg-sand border-b border-blue-500/8 flex font-body text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              <span className="flex-1">Taux TVA</span>
              <span className="w-24 text-right">Base HT</span>
              <span className="w-24 text-right">TVA</span>
              <span className="w-24 text-right">TTC</span>
            </div>
            {tvaByRate.map(([rate, data]: any) => (
              <div key={rate} className="px-5 py-3 border-b border-blue-500/8 flex items-center">
                <span className="flex-1 font-body text-sm font-semibold text-blue-800">{rate}%</span>
                <span className="w-24 text-right font-body text-sm text-slate-600">{data.ht.toFixed(2)}€</span>
                <span className="w-24 text-right font-body text-sm font-semibold text-orange-500">{data.tva.toFixed(2)}€</span>
                <span className="w-24 text-right font-body text-sm font-semibold text-blue-500">{data.ttc.toFixed(2)}€</span>
              </div>
            ))}
            <div className="px-5 py-3 bg-sand flex font-body text-sm font-bold">
              <span className="flex-1">TOTAL</span>
              <span className="w-24 text-right">{totalHT.toFixed(2)}€</span>
              <span className="w-24 text-right text-orange-500">{totalTVA.toFixed(2)}€</span>
              <span className="w-24 text-right text-blue-500">{totalTTC.toFixed(2)}€</span>
            </div>
          </Card>

          <Card padding="md">
            <h3 className="font-body text-base font-semibold text-blue-800 mb-4">Répartition par mode de paiement</h3>
            <div className="flex flex-col gap-2">
              {byMode.map(([mode, amount]: any) => (
                <div key={mode} className="flex items-center justify-between py-2 border-b border-blue-500/8 last:border-b-0">
                  <span className="font-body text-sm text-slate-600">{modeLabels[mode] || mode}</span>
                  <span className="font-body text-sm font-semibold text-blue-500">{amount.toFixed(2)}€</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )
  );
}
