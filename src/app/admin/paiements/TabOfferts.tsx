"use client";
import { Card, Badge } from "@/components/ui";
import { Gift } from "lucide-react";

interface TabOffertsProps {
  payments: any[];
}

export function TabOfferts({ payments }: TabOffertsProps) {
  const freePayments = payments.filter(p => (p as any).isFree);
  const totalValeur = freePayments.reduce((s: any, p: any) => {
    const val = (p.items || []).reduce((ss: number, i: any) => ss + (i.originalPriceTTC || 0), 0);
    return s + val;
  }, 0);

  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-5">
        <Card padding="sm">
          <div className="font-body text-xl font-bold text-green-600">{freePayments.length}</div>
          <div className="font-body text-[10px] text-slate-500 uppercase">Séances offertes</div>
        </Card>
        <Card padding="sm">
          <div className="font-body text-xl font-bold text-orange-500">{totalValeur.toFixed(0)}€</div>
          <div className="font-body text-[10px] text-slate-500 uppercase">Valeur totale</div>
        </Card>
      </div>

      {freePayments.length === 0 ? (
        <Card padding="lg" className="text-center">
          <div className="w-14 h-14 rounded-2xl bg-green-50 flex items-center justify-center mx-auto mb-3">
            <Gift size={28} className="text-green-300" />
          </div>
          <p className="font-body text-sm text-slate-500">Aucune séance offerte enregistrée.</p>
        </Card>
      ) : (
        <Card className="!p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <div className="min-w-[600px]">
              <div className="px-5 py-3 bg-sand border-b border-blue-500/8 flex font-body text-[11px] font-semibold text-slate-600 uppercase tracking-wider">
                <span className="w-24">Date</span>
                <span className="flex-1">Client</span>
                <span className="w-40">Prestation</span>
                <span className="w-24">Motif</span>
                <span className="w-20 text-right">Valeur</span>
              </div>
              {freePayments
                .sort((a: any, b: any) => (b.date?.seconds || 0) - (a.date?.seconds || 0))
                .map((p: any) => {
                  const d = p.date?.seconds ? new Date(p.date.seconds * 1000) : new Date();
                  const items = p.items || [];
                  const valeur = items.reduce((s: number, i: any) => s + (i.originalPriceTTC || 0), 0);
                  return (
                    <div key={p.id} className="px-5 py-3 border-b border-blue-500/8 last:border-b-0 flex items-center hover:bg-green-50/30">
                      <span className="w-24 font-body text-xs text-slate-500">{d.toLocaleDateString("fr-FR")}</span>
                      <span className="flex-1 font-body text-sm font-semibold text-blue-800">{p.familyName}</span>
                      <span className="w-40 font-body text-xs text-slate-600 truncate">
                        {items.map((i: any) => `${i.activityTitle}${i.childName ? ` — ${i.childName}` : ""}`).join(", ")}
                      </span>
                      <span className="w-24"><Badge color="green">{p.freeReason || "Offert"}</Badge></span>
                      <span className="w-20 text-right font-body text-sm font-semibold text-orange-500">{valeur.toFixed(0)}€</span>
                    </div>
                  );
                })}
              <div className="px-5 py-3 bg-sand flex font-body text-sm font-bold">
                <span className="flex-1">TOTAL</span>
                <span className="w-40"></span>
                <span className="w-24"></span>
                <span className="w-20 text-right text-orange-500">{totalValeur.toFixed(0)}€</span>
              </div>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
