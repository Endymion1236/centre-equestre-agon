"use client";

// Onglet "Journal des ventes" de la page Comptabilité.
// Extrait de page.tsx (refactorisation) — logique inchangée.
import { Card, Badge } from "@/components/ui";
import { modeLabels } from "./shared";

export default function TabJournal(props: any) {
  const { filteredPayments, totalHT, totalTVA, totalTTC, period, encaissementsCompta } = props;
  return (
      <Card className="!p-0 overflow-hidden">
        <div className="overflow-x-auto">
        <div className="min-w-[700px]">
        <div className="px-5 py-3 bg-sand border-b border-blue-500/8 flex font-body text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
          <span className="w-20">Date</span>
          <span className="flex-1">Client</span>
          <span className="w-40">Prestation</span>
          <span className="w-20 text-center">Mode</span>
          <span className="w-16 text-right">HT</span>
          <span className="w-16 text-right">TVA</span>
          <span className="w-16 text-right">TTC</span>
        </div>
        {filteredPayments.length === 0 ? (
          <div className="p-8 text-center font-body text-sm text-slate-500">Aucun paiement sur cette période.</div>
        ) : (
          <>
            {filteredPayments.map((p: any) => {
              const d = p.date?.seconds ? new Date(p.date.seconds * 1000) : new Date();
              const ht = (p.items || []).reduce((s: number, i: any) => s + (i.priceHT || 0), 0);
              const tva = (p.totalTTC || 0) - ht;
              return (
                <div key={p.id} className="px-5 py-3 border-b border-blue-500/8 last:border-b-0 flex items-center hover:bg-blue-50/30">
                  <span className="w-20 font-body text-xs text-slate-500">{d.toLocaleDateString("fr-FR")}</span>
                  <span className="flex-1 font-body text-sm font-semibold text-blue-800">{p.familyName}</span>
                  <span className="w-40 font-body text-xs text-slate-600 truncate">{(p.items || []).map((i: any) => i.activityTitle).join(", ")}</span>
                  <span className="w-20 text-center"><Badge color="blue">{modeLabels[p.paymentMode] || p.paymentMode}</Badge></span>
                  <span className="w-16 text-right font-body text-xs text-slate-600">{ht.toFixed(2)}€</span>
                  <span className="w-16 text-right font-body text-xs text-orange-500">{tva.toFixed(2)}€</span>
                  <span className="w-16 text-right font-body text-sm font-semibold text-blue-500">{(p.totalTTC || 0).toFixed(2)}€</span>
                </div>
              );
            })}

            {/* ── Avoirs (encaissements négatifs) ── */}
            {(() => {
              const avoirEncaissements = encaissementsCompta.filter((e: any) => {
                if (!e.isAvoir) return false;
                const d = e.date?.seconds ? new Date(e.date.seconds * 1000) : null;
                if (!d) return false;
                const pm = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
                return pm === period;
              });
              if (avoirEncaissements.length === 0) return null;
              const totalAvoirs = avoirEncaissements.reduce((s: number, e: any) => s + Math.abs(e.montant || 0), 0);
              return (
                <>
                  <div className="px-5 py-2 bg-red-50/50 border-b border-red-200/50 flex font-body text-[10px] font-semibold text-red-500 uppercase tracking-wider">
                    <span>Avoirs émis sur la période</span>
                  </div>
                  {avoirEncaissements.map((e: any) => {
                    const d = e.date?.seconds ? new Date(e.date.seconds * 1000) : new Date();
                    return (
                      <div key={e.id} className="px-5 py-3 border-b border-red-100/50 last:border-b-0 flex items-center hover:bg-red-50/20 bg-red-50/10">
                        <span className="w-20 font-body text-xs text-slate-500">{d.toLocaleDateString("fr-FR")}</span>
                        <span className="flex-1 font-body text-sm font-semibold text-red-700">{e.familyName}</span>
                        <span className="w-40 font-body text-xs text-red-500 truncate">{e.activityTitle || e.modeLabel || "Avoir"}</span>
                        <span className="w-20 text-center"><Badge color="red">{e.avoirRef || "Avoir"}</Badge></span>
                        <span className="w-16 text-right font-body text-xs text-red-400">—</span>
                        <span className="w-16 text-right font-body text-xs text-red-400">—</span>
                        <span className="w-16 text-right font-body text-sm font-semibold text-red-600">-{Math.abs(e.montant || 0).toFixed(2)}€</span>
                      </div>
                    );
                  })}
                  <div className="px-5 py-2 bg-red-50/30 flex font-body text-xs font-semibold text-red-600">
                    <span className="flex-1">Total avoirs</span>
                    <span className="w-40"></span><span className="w-20"></span>
                    <span className="w-16"></span><span className="w-16"></span>
                    <span className="w-16 text-right">-{totalAvoirs.toFixed(2)}€</span>
                  </div>
                </>
              );
            })()}

            <div className="px-5 py-3 bg-sand flex font-body text-sm font-bold">
              <span className="flex-1">TOTAL</span>
              <span className="w-40"></span><span className="w-20"></span>
              <span className="w-16 text-right text-blue-800">{totalHT.toFixed(2)}€</span>
              <span className="w-16 text-right text-orange-500">{totalTVA.toFixed(2)}€</span>
              <span className="w-16 text-right text-blue-500">{totalTTC.toFixed(2)}€</span>
            </div>
          </>
        )}
        </div>
        </div>
      </Card>
  );
}
