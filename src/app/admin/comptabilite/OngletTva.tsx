"use client";

/**
 * src/app/admin/comptabilite/OngletTva.tsx
 *
 * Onglet « TVA » : la base HT, la TVA et le TTC ventilés par taux, puis la
 * répartition des encaissements par mode de paiement.
 *
 * La ventilation par taux est ce que le comptable réclame chaque trimestre
 * pour la déclaration : au centre équestre cohabitent le 5,5 % (enseignement,
 * pensions, stages) et le 20 % (transport, ventes, locations). Le second
 * bloc, lui, ne sert pas à la déclaration mais au contrôle de caisse.
 */

import { Card } from "@/components/ui";
import { modeLabels } from "./constants";

export function OngletTva({
  tvaByRate, byMode, totalHT, totalTVA, totalTTC,
}: {
  tvaByRate: [string, { ht: number; tva: number; ttc: number }][];
  byMode: [string, number][];
  totalHT: number;
  totalTVA: number;
  totalTTC: number;
}) {
  return (
    <div className="flex flex-col gap-5">
      <Card className="!p-0 overflow-hidden">
        <div className="px-5 py-3 bg-sand border-b border-blue-500/8 flex font-body text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
          <span className="flex-1">Taux TVA</span>
          <span className="w-24 text-right">Base HT</span>
          <span className="w-24 text-right">TVA</span>
          <span className="w-24 text-right">TTC</span>
        </div>
        {tvaByRate.map(([rate, data]) => (
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
          {byMode.map(([mode, amount]) => (
            <div key={mode} className="flex items-center justify-between py-2 border-b border-blue-500/8 last:border-b-0">
              <span className="font-body text-sm text-slate-600">{modeLabels[mode] || mode}</span>
              <span className="font-body text-sm font-semibold text-blue-500">{amount.toFixed(2)}€</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
