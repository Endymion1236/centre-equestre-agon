"use client";

/**
 * src/app/espace-cavalier/reserver/ListeCours.tsx
 *
 * La section « Cours & activités » de la vue liste : les créneaux non-stage
 * regroupés par jour, dans l'ordre chronologique.
 *
 * Séparée de la carte (CarteCours) parce qu'elle ne fait qu'une chose :
 * poser les dates dans le bon ordre et écrire l'intitulé du jour. La famille
 * parcourt cette liste de haut en bas comme un agenda, l'ordre est donc une
 * fonctionnalité, pas un détail de présentation.
 */

import CarteCours from "./CarteCours";
import type { Creneau } from "./types";

type PropsCommunes = Omit<React.ComponentProps<typeof CarteCours>, "creneau">;

export default function ListeCours({ coursByDate, ...commun }: { coursByDate: Record<string, Creneau[]> } & PropsCommunes) {
  return (
    <div>
      <h2 className="font-display text-lg font-bold text-blue-800 mb-3">Cours & activités</h2>
      {Object.entries(coursByDate).sort(([a], [b]) => a.localeCompare(b)).map(([date, cs]) => (
        <div key={date} className="mb-4">
          <div className="font-body text-xs font-semibold text-gray-600 uppercase mb-2">{new Date(date).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}</div>
          <div className="flex flex-col gap-2">
            {cs.map(c => (
              <CarteCours key={c.id} creneau={c} {...commun} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
