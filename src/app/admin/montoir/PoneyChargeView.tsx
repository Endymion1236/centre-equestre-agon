"use client";
import { Card } from "@/components/ui";

/**
 * Vue timeline charge journalière des poneys
 * Affiche chaque poney sur une ligne horizontale avec ses créneaux colorés
 */

interface PoneyChargeViewProps {
  creneaux: any[];
  equides: any[];
  availableHorses: any[];
}

export default function PoneyChargeView({ creneaux, equides, availableHorses }: PoneyChargeViewProps) {
  // Collecter toutes les attributions poney → [{poney, childName, créneau, startTime, endTime, activityTitle, activityType}]
  const attributions: {
    poney: string;
    childName: string;
    activityTitle: string;
    activityType: string;
    startTime: string;
    endTime: string;
    creneauId: string;
  }[] = [];

  creneaux.forEach(c => {
    (c.enrolled || []).forEach((e: any) => {
      if (!e.horseName) return;
      attributions.push({
        poney: e.horseName,
        childName: e.childName || "",
        activityTitle: c.activityTitle || "",
        activityType: c.activityType || "cours",
        startTime: c.startTime || "10:00",
        endTime: c.endTime || "11:00",
        creneauId: c.id,
      });
    });
  });

  if (attributions.length === 0) {
    return (
      <Card padding="md" className="text-center">
        <p className="font-body text-sm text-slate-500">Aucun poney attribué pour l'instant.</p>
        <p className="font-body text-[10px] text-slate-400 mt-1">Attribuez des poneys dans les reprises ci-dessus.</p>
      </Card>
    );
  }

  // Trouver la plage horaire de la journée
  const allTimes = creneaux.flatMap(c => [c.startTime, c.endTime]).filter(Boolean);
  const toMinutes = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
  const minMin = Math.min(...allTimes.map(toMinutes));
  const maxMin = Math.max(...allTimes.map(toMinutes));
  const startMin = Math.floor(minMin / 60) * 60; // arrondir à l'heure
  const endMin = Math.ceil(maxMin / 60) * 60;
  const totalMin = endMin - startMin;
  if (totalMin <= 0) return null;

  // Grouper par poney
  const poneys = [...new Set(attributions.map(a => a.poney))].sort();

  // Heures pour la grille
  const gridHours: string[] = [];
  for (let m = startMin; m <= endMin; m += 60) {
    gridHours.push(`${Math.floor(m / 60)}:00`);
  }

  // Couleurs par type d'activité
  const typeColors: Record<string, { bg: string; border: string; text: string }> = {
    stage: { bg: "bg-green-100", border: "border-green-300", text: "text-green-800" },
    stage_journee: { bg: "bg-green-100", border: "border-green-300", text: "text-green-800" },
    cours: { bg: "bg-blue-100", border: "border-blue-300", text: "text-blue-800" },
    balade: { bg: "bg-orange-100", border: "border-orange-300", text: "text-orange-800" },
    competition: { bg: "bg-purple-100", border: "border-purple-300", text: "text-purple-800" },
  };

  return (
    <Card padding="md">
      <div className="font-body text-sm font-semibold text-blue-800 mb-3 flex items-center gap-2">
        📊 Charge journalière des poneys
        <span className="font-body text-[10px] text-slate-400 font-normal">({poneys.length} poney{poneys.length > 1 ? "s" : ""} attribué{poneys.length > 1 ? "s" : ""})</span>
      </div>

      <div className="overflow-x-auto">
        <div style={{ minWidth: "500px" }}>
          {/* Grille horaire en-tête */}
          <div className="flex items-end mb-1 ml-24">
            {gridHours.map((h, i) => (
              <div key={h} className="font-body text-[10px] text-slate-400" style={{ width: `${100 / (gridHours.length - 1)}%` }}>
                {i < gridHours.length - 1 ? h : ""}
              </div>
            ))}
          </div>

          {/* Lignes poney */}
          {poneys.map(poney => {
            const attrs = attributions.filter(a => a.poney === poney);
            const totalHeures = attrs.reduce((s, a) => {
              return s + (toMinutes(a.endTime) - toMinutes(a.startTime)) / 60;
            }, 0);
            const isOverloaded = totalHeures >= 4;
            const isWarning = totalHeures >= 3;

            return (
              <div key={poney} className="flex items-center gap-2 mb-1.5">
                {/* Nom du poney + total */}
                <div className="w-24 flex-shrink-0 text-right pr-2">
                  <div className={`font-body text-xs font-semibold truncate ${isOverloaded ? "text-red-600" : isWarning ? "text-orange-600" : "text-slate-700"}`}>
                    {poney}
                  </div>
                  <div className={`font-body text-[9px] ${isOverloaded ? "text-red-500 font-bold" : isWarning ? "text-orange-500" : "text-slate-400"}`}>
                    {totalHeures.toFixed(1)}h · {attrs.length}s
                    {isOverloaded ? " ⚠️" : ""}
                  </div>
                </div>

                {/* Barre timeline */}
                <div className="flex-1 relative h-8 bg-gray-50 rounded-lg border border-gray-100 overflow-hidden">
                  {/* Lignes horaires */}
                  {gridHours.slice(0, -1).map((_, i) => (
                    <div key={i} className="absolute top-0 bottom-0 border-l border-gray-200/50"
                      style={{ left: `${(i / (gridHours.length - 1)) * 100}%` }} />
                  ))}

                  {/* Blocs d'activité */}
                  {attrs.map((a, idx) => {
                    const left = ((toMinutes(a.startTime) - startMin) / totalMin) * 100;
                    const width = ((toMinutes(a.endTime) - toMinutes(a.startTime)) / totalMin) * 100;
                    const colors = typeColors[a.activityType] || typeColors.cours;

                    return (
                      <div key={idx}
                        className={`absolute top-0.5 bottom-0.5 rounded border ${colors.bg} ${colors.border} flex items-center px-1 overflow-hidden cursor-default group`}
                        style={{ left: `${left}%`, width: `${Math.max(width, 3)}%` }}
                        title={`${a.activityTitle}\n${a.startTime}–${a.endTime}\n${a.childName}`}>
                        <span className={`text-[8px] font-semibold ${colors.text} truncate`}>
                          {a.childName.split(" ")[0]}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* Poneys sans attribution */}
          {availableHorses
            .filter(h => !poneys.includes(h.name))
            .slice(0, 5) // max 5 pour ne pas surcharger
            .map(h => (
              <div key={h.id} className="flex items-center gap-2 mb-1.5 opacity-40">
                <div className="w-24 flex-shrink-0 text-right pr-2">
                  <div className="font-body text-xs text-slate-400 truncate">{h.name}</div>
                  <div className="font-body text-[9px] text-slate-300">0h · repos</div>
                </div>
                <div className="flex-1 h-8 bg-gray-50 rounded-lg border border-gray-100" />
              </div>
            ))
          }
        </div>
      </div>

      {/* Légende */}
      <div className="flex flex-wrap gap-3 mt-3 pt-3 border-t border-gray-100">
        <span className="flex items-center gap-1 font-body text-[10px] text-slate-500">
          <span className="w-3 h-3 rounded bg-blue-100 border border-blue-300" /> Cours
        </span>
        <span className="flex items-center gap-1 font-body text-[10px] text-slate-500">
          <span className="w-3 h-3 rounded bg-green-100 border border-green-300" /> Stage
        </span>
        <span className="flex items-center gap-1 font-body text-[10px] text-slate-500">
          <span className="w-3 h-3 rounded bg-orange-100 border border-orange-300" /> Balade
        </span>
        <span className="flex items-center gap-1 font-body text-[10px] text-slate-500 ml-auto">
          ⚠️ = 4h+ (surcharge)
        </span>
      </div>
    </Card>
  );
}
