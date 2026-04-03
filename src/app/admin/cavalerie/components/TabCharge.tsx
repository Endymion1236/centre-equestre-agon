"use client";
import { Card } from "@/components/ui";

interface ChargeItem {
  equideId: string;
  name: string;
  reprisesAujourdhui: number;
  maxReprises: number;
  heuresSemaine: number;
  maxHeuresHebdo: number;
}

export default function TabCharge({ chargeJour }: { chargeJour: ChargeItem[] }) {
  return (
    <>
      <p className="font-body text-xs text-gray-400 mb-4">
        Suivi de la charge de travail quotidienne et hebdomadaire. Les données se rempliront automatiquement à partir des reprises planifiées.
      </p>
      <div className="flex flex-col gap-2">
        {chargeJour.map(c => {
          const pctJour = c.maxReprises > 0 ? Math.round((c.reprisesAujourdhui / c.maxReprises) * 100) : 0;
          const pctSemaine = c.maxHeuresHebdo > 0 ? Math.round((c.heuresSemaine / c.maxHeuresHebdo) * 100) : 0;
          return (
            <Card key={c.equideId} padding="sm" className="flex items-center gap-4">
              <div className="font-body text-sm font-semibold text-blue-800 min-w-[100px]">{c.name}</div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-body text-xs text-gray-400 min-w-[80px]">Aujourd&apos;hui</span>
                  <div className="flex-1 h-4 bg-gray-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${pctJour > 80 ? "bg-red-400" : pctJour > 50 ? "bg-orange-400" : "bg-green-400"}`}
                      style={{ width: `${pctJour}%` }}/>
                  </div>
                  <span className="font-body text-xs font-medium text-gray-500 min-w-[70px] text-right">
                    {c.reprisesAujourdhui}/{c.maxReprises} reprises
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-body text-xs text-gray-400 min-w-[80px]">Semaine</span>
                  <div className="flex-1 h-4 bg-gray-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${pctSemaine > 80 ? "bg-red-400" : pctSemaine > 50 ? "bg-orange-400" : "bg-green-400"}`}
                      style={{ width: `${pctSemaine}%` }}/>
                  </div>
                  <span className="font-body text-xs font-medium text-gray-500 min-w-[70px] text-right">
                    {c.heuresSemaine}/{c.maxHeuresHebdo}h
                  </span>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </>
  );
}
