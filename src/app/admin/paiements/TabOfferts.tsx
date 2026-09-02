"use client";
import { Card, Badge } from "@/components/ui";
import { Gift } from "lucide-react";
import { estValorise } from "@/lib/offerts";
import {
  resumerOfferts,
  trierOffertsRecents,
  valeurOfferte,
  type OffertPaymentLike,
} from "./offerts-utils";

interface TabOffertsProps {
  payments: OffertPaymentLike[];
}

export function TabOfferts({ payments }: TabOffertsProps) {
  const { gratuits, valorises, nonValorises, totalValeur } = resumerOfferts(payments);
  const freePayments = trierOffertsRecents(gratuits);

  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-5">
        <Card padding="sm">
          <div className="font-body text-xl font-bold text-green-600">{freePayments.length}</div>
          <div className="font-body text-[10px] text-slate-500 uppercase">Séances gratuites</div>
        </Card>
        <Card padding="sm">
          <div className="font-body text-xl font-bold text-orange-500">{totalValeur.toFixed(0)}€</div>
          <div className="font-body text-[10px] text-slate-500 uppercase">Manque à gagner</div>
          <div className="font-body text-[10px] text-slate-400">{valorises.length} séance{valorises.length > 1 ? "s" : ""}</div>
        </Card>
        <Card padding="sm">
          <div className="font-body text-xl font-bold text-slate-500">{nonValorises.length}</div>
          <div className="font-body text-[10px] text-slate-500 uppercase">Hors valorisation</div>
          <div className="font-body text-[10px] text-slate-400">monte, rattrapage…</div>
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
              {freePayments.map((payment) => {
                const date = payment.date?.seconds ? new Date(payment.date.seconds * 1000) : new Date();
                const items = payment.items || [];
                const valeur = valeurOfferte(payment);
                const compte = estValorise(payment.freeReason);
                return (
                  <div key={payment.id} className="px-5 py-3 border-b border-blue-500/8 last:border-b-0 flex items-center hover:bg-green-50/30">
                    <span className="w-24 font-body text-xs text-slate-500">{date.toLocaleDateString("fr-FR")}</span>
                    <span className="flex-1 font-body text-sm font-semibold text-blue-800">{payment.familyName}</span>
                    <span className="w-40 font-body text-xs text-slate-600 truncate">
                      {items.map((item) => `${item.activityTitle || ""}${item.childName ? ` — ${item.childName}` : ""}`).join(", ")}
                    </span>
                    <span className="w-24"><Badge color={compte ? "green" : "gray"}>{payment.freeReason || "Offert"}</Badge></span>
                    {/* Motif non valorisé : le montant reste consultable en
                        gris barré, mais il n'entre pas dans le total — sinon
                        une monte de jeune poney gonflerait le manque à gagner. */}
                    <span className={`w-20 text-right font-body text-sm ${compte ? "font-semibold text-orange-500" : "text-slate-300 line-through"}`}
                      title={compte ? undefined : "Hors valorisation — non compté dans le total"}>
                      {valeur.toFixed(0)}€
                    </span>
                  </div>
                );
              })}
              <div className="px-5 py-3 bg-sand flex font-body text-sm font-bold">
                <span className="flex-1">TOTAL <span className="font-normal text-slate-400 text-xs">(manque à gagner)</span></span>
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
