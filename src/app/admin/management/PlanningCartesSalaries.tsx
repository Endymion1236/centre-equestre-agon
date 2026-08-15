"use client";
import { Card } from "@/components/ui";
import type { Salarie, TachePlanifiee } from "./types";
import { fmtDuree } from "./types";

/**
 * Les vignettes de tête du semainier : une carte par salariée active, avec sa
 * charge de la semaine et sa barre d'avancement (tâches cochées / total).
 *
 * C'est le coup d'œil que l'admin donne en premier : qui est chargé, qui ne
 * l'est pas, où en est la semaine. Extrait pour que l'orchestrateur n'ait plus
 * à héberger ce bloc décoratif.
 */

interface Props {
  salaries: Salarie[];
  taches: TachePlanifiee[];
  chargeParSalarie: Record<string, number>;
}

export default function PlanningCartesSalaries({ salaries, taches, chargeParSalarie }: Props) {
  return (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {salaries.filter(s=>s.actif).map(sal => {
            const charge = chargeParSalarie[sal.id]||0;
            const done = taches.filter(t=>t.salarieId===sal.id&&t.done).length;
            const total = taches.filter(t=>t.salarieId===sal.id).length;
            const pct = total > 0 ? Math.round((done/total)*100) : 0;
            return (
              <Card key={sal.id} padding="sm">
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full flex-shrink-0" style={{background:sal.couleur}}/>
                    <span className="font-display text-sm font-bold text-blue-800 truncate">{sal.nom}</span>
                  </div>
                  <div className="font-body text-lg font-bold text-blue-800">{fmtDuree(charge)}</div>
                  {total > 0 ? (
                    <>
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{width:`${pct}%`, background:sal.couleur}}/>
                      </div>
                      <div className="font-body text-[10px] text-gray-400">{done}/{total} tâches ✓</div>
                    </>
                  ) : (
                    <div className="font-body text-[10px] text-gray-300">Aucune tâche</div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
  );
}
