"use client";

import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Onglets entre les deux façons de s'inscrire depuis l'espace famille :
 * les activités ponctuelles (stages, cours, balades) et les cours à l'année.
 *
 * L'inscription annuelle vivait derrière un raccourci discret, tout en bas
 * de l'accueil : une famille qui cherchait « le cours du mercredi » allait
 * dans Réserver et ne l'y trouvait pas. Les deux parcours sont maintenant
 * côte à côte, en haut de chacune des deux pages.
 *
 * Des onglets soulignés, pas une barre à bascule : la page Réserver a déjà
 * un réglage d'affichage (Planning / Liste) de cette forme-là, et deux
 * barres identiques l'une sous l'autre se lisaient comme un seul tableau à
 * quatre cases. Le trait sous l'onglet dit « autre page », la barre dit
 * « autre réglage ». `droite` accueille ce réglage, sur la même ligne.
 */
export function BasculeReserver({ active, droite }: { active: "activites" | "annuel"; droite?: ReactNode }) {
  const onglets = [
    { id: "activites", href: "/espace-cavalier/reserver", label: "Stages, cours et balades" },
    { id: "annuel", href: "/espace-cavalier/inscription-annuelle", label: "Inscription à l’année" },
  ] as const;
  return (
    <div className="flex items-end justify-between gap-3 border-b border-gray-200 mb-5">
      <div className="flex gap-5 -mb-px">
        {onglets.map(({ id, href, label }) => {
          const actif = id === active;
          return (
            <Link
              key={id}
              href={href}
              className={`pb-2.5 font-body text-sm no-underline border-b-2 transition-colors whitespace-nowrap ${
                actif ? "font-bold text-blue-800 border-blue-800" : "font-semibold text-gray-500 border-transparent hover:text-blue-800"
              }`}
            >
              {label}
            </Link>
          );
        })}
      </div>
      {droite && <div className="pb-2">{droite}</div>}
    </div>
  );
}
