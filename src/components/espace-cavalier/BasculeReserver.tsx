"use client";

import Link from "next/link";
import { CalendarDays, Repeat } from "lucide-react";

/**
 * Bascule entre les deux façons de s'inscrire depuis l'espace famille :
 * les activités ponctuelles (stages, cours, balades) et les cours à l'année.
 *
 * L'inscription annuelle vivait derrière un raccourci discret, tout en bas
 * de l'accueil : une famille qui cherchait « le cours du mercredi » allait
 * dans Réserver et ne l'y trouvait pas. Les deux parcours sont maintenant
 * côte à côte, en haut de chacune des deux pages.
 */
export function BasculeReserver({ active }: { active: "activites" | "annuel" }) {
  const onglets = [
    { id: "activites", href: "/espace-cavalier/reserver", icon: CalendarDays, label: "Stages, cours et balades" },
    { id: "annuel", href: "/espace-cavalier/inscription-annuelle", icon: Repeat, label: "Inscription à l’année" },
  ] as const;
  return (
    <div className="flex bg-sand rounded-xl p-1 mb-5">
      {onglets.map(({ id, href, icon: Icon, label }) => {
        const actif = id === active;
        return (
          <Link
            key={id}
            href={href}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg font-body text-sm font-semibold no-underline transition-all ${
              actif ? "bg-white text-blue-600 shadow-sm" : "text-slate-500"
            }`}
          >
            <Icon size={15} /> {label}
          </Link>
        );
      })}
    </div>
  );
}
