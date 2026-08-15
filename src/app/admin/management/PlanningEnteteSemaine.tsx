"use client";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui";
import type { TachePlanifiee } from "./types";
import { JOURS_LABELS, formatDateCourte, getISOWeek } from "./types";
import type { JourDate } from "./planning-types";

/**
 * En-tête du semainier : navigation semaine précédente / suivante, saut à une
 * date, retour à aujourd'hui, bascule « inclure le dimanche », puis la bande
 * des jours de la semaine (jour du mois, jour courant surligné, pastille sur
 * les jours qui ont des tâches).
 *
 * Le sélecteur de date ne sert qu'à sauter à une semaine : on le vide juste
 * après pour qu'il n'ait pas l'air de mémoriser une date de travail.
 *
 * Extrait car c'est un bandeau autonome, sans autre effet que de changer la
 * semaine affichée.
 */

interface Props {
  semaine: string;
  setSemaine: (s: string) => void;
  lundi: Date;
  nbJours: number;
  jourDates: JourDate[];
  taches: TachePlanifiee[];
  inclureDimanche: boolean;
  setInclureDimanche: (v: boolean) => void;
  prevWeek: () => void;
  nextWeek: () => void;
}

export default function PlanningEnteteSemaine({
  semaine, setSemaine, lundi, nbJours, jourDates, taches,
  inclureDimanche, setInclureDimanche, prevWeek, nextWeek,
}: Props) {
  return (
        <Card padding="sm">
          <div className="flex items-center justify-between px-2 mb-3">
            <button onClick={prevWeek} className="flex items-center gap-1 font-body text-sm font-semibold text-blue-800 bg-transparent border-none cursor-pointer hover:text-blue-500 transition-colors px-2 py-1">
              <ChevronLeft size={16}/>Préc.
            </button>
            <div className="flex flex-col items-center gap-0.5">
              <div className="font-display text-lg font-bold text-blue-800 capitalize">
                {lundi.toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}
              </div>
              <div className="font-body text-xs text-gray-400">
                Du {formatDateCourte(lundi)} au {formatDateCourte(new Date(lundi.getTime() + (nbJours - 1) * 86400000))} · Semaine {semaine.split("-W")[1]}
              </div>
              <input type="date" title="Aller à cette date"
                className="font-body text-[10px] px-2 py-0.5 rounded-lg border border-gray-200 bg-white cursor-pointer focus:border-blue-400 focus:outline-none text-gray-400 mt-0.5"
                onChange={e => {
                  if (!e.target.value) return;
                  const [py, pm, pd] = e.target.value.split("-").map(Number);
                  const picked = new Date(py, pm - 1, pd, 12);
                  const targetIso = getISOWeek(picked);
                  setSemaine(targetIso);
                  e.target.value = "";
                }}/>
            </div>
            <div className="flex items-center gap-2">
              <label
                title="Inclure le dimanche dans la semaine"
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border font-body text-xs font-semibold cursor-pointer transition-all
                  ${inclureDimanche
                    ? "bg-blue-500 text-white border-blue-500"
                    : "bg-white text-slate-500 border-gray-200 hover:bg-gray-50"}`}>
                <input
                  type="checkbox"
                  checked={inclureDimanche}
                  onChange={e => setInclureDimanche(e.target.checked)}
                  className="hidden"
                />
                Dim.
              </label>
              <button onClick={() => setSemaine(getISOWeek(new Date()))}
                className="font-body text-xs font-semibold text-blue-500 bg-blue-50 px-3 py-1.5 rounded-lg border-none cursor-pointer hover:bg-blue-100 transition-colors">Auj.</button>
              <button onClick={nextWeek} className="flex items-center gap-1 font-body text-sm font-semibold text-blue-800 bg-transparent border-none cursor-pointer hover:text-blue-500 transition-colors px-2 py-1">
                Suiv.<ChevronRight size={16}/>
              </button>
            </div>
          </div>
          {/* Jours de la semaine */}
          <div className="grid gap-1.5 px-2" style={{gridTemplateColumns: `repeat(${nbJours}, 1fr)`}}>
            {jourDates.slice(0, nbJours).map(({ jour, date }) => {
              const isToday = (() => {
                const now = new Date();
                return date.getDate() === now.getDate() && date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
              })();
              const hasTaches = taches.some(t => t.jour === jour);
              return (
                <div key={jour}
                  className={`text-center py-2 rounded-xl font-body text-xs font-semibold transition-all
                    ${isToday
                      ? "bg-blue-500 text-white shadow-md shadow-blue-500/25"
                      : hasTaches
                        ? "bg-blue-50 text-blue-800 border border-blue-100"
                        : "bg-gray-50 text-gray-400 border border-gray-100"
                    }`}>
                  {JOURS_LABELS[jour].slice(0, 3)} {date.getDate()}{date.getMonth() !== lundi.getMonth() ? `/${date.getMonth() + 1}` : ""}
                  {hasTaches && !isToday && <span className="ml-1 inline-block w-1.5 h-1.5 rounded-full bg-blue-400 align-middle" />}
                </div>
              );
            })}
          </div>
        </Card>
  );
}
