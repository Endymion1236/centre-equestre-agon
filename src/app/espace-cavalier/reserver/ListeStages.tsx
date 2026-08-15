"use client";

/**
 * src/app/espace-cavalier/reserver/ListeStages.tsx
 *
 * La section « Stages » de la vue liste : elle ordonne les groupes de stages
 * dans le temps et intercale un en-tête à chaque changement de semaine.
 *
 * Séparée de la carte elle-même (CarteStage) parce que ce fichier ne répond
 * qu'à une question : dans quel ORDRE la famille voit les stages, et où
 * commence une nouvelle semaine. Le tri se fait sur le premier jour réel de
 * chaque groupe, pas sur la clé : deux stages d'une même semaine se suivent,
 * et « Semaine du ... au ... » n'apparaît qu'une fois par semaine.
 */

import CarteStage from "./CarteStage";
import type { Creneau } from "./types";
import { libelleSemaine } from "./utils-reservation";

type PropsCarteStage = React.ComponentProps<typeof CarteStage>;
type PropsCommunes = Omit<PropsCarteStage, "cleGroupe" | "stageCreneaux" | "showWeekHeader" | "weekLabel">;

export default function ListeStages({ stageGroups, ...commun }: { stageGroups: Record<string, Creneau[]> } & PropsCommunes) {
  return (
    <div>
      <h2 className="font-display text-lg font-bold text-green-700 mb-3">Stages</h2>
      <div className="flex flex-col gap-3">
        {(() => {
          // Tri chronologique par premier jour du stage, puis intercalage
          // d'un en-tête à chaque changement de semaine ("Semaine du ... au ...").
          const sorted = Object.entries(stageGroups).sort(([, a], [, b]) => {
            const da = [...a].map(c => c.date).sort()[0] || "";
            const db2 = [...b].map(c => c.date).sort()[0] || "";
            return da.localeCompare(db2);
          });
          let prevMonday = "";
          return sorted.map(([key, stageCreneaux]) => {
            // Lundi de la semaine = suffixe de la clé du groupe (YYYY-MM-DD)
            const monday = key.slice(-10);
            const showWeekHeader = monday !== prevMonday;
            prevMonday = monday;
            return (
              <CarteStage
                key={key}
                cleGroupe={key}
                stageCreneaux={stageCreneaux}
                showWeekHeader={showWeekHeader}
                weekLabel={libelleSemaine(monday)}
                {...commun}
              />
            );
          });
        })()}
      </div>
    </div>
  );
}
