"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";
import type { ResultatConcours, SaisonPonyGames } from "@/lib/concours/saisons";
import { texteFacturation, toursParCavalier } from "@/lib/concours/saison-facturation";

/** Onglet « Facturation » d'un concours : nombre de tours courus par chaque cavalier. */
export function FacturationConcours({ saison, concours }: { saison: SaisonPonyGames; concours: ResultatConcours }) {
  const [copie, setCopie] = useState(false);
  const lignes = toursParCavalier(saison, concours);
  const coureurs = lignes.filter((l) => l.tours > 0);
  const total = coureurs.reduce((n, l) => n + l.tours, 0);

  const copier = async () => {
    try {
      await navigator.clipboard.writeText(texteFacturation(concours, lignes));
      setCopie(true);
      setTimeout(() => setCopie(false), 2000);
    } catch { alert("Copie impossible sur cet appareil."); }
  };

  if (!lignes.length) {
    return <p className="font-body text-sm text-gray-500">Aucune équipe engagée à ce concours (onglet Organisation).</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-body text-sm text-gray-600">
          Un tour = un passage d’une équipe du cavalier. Engagé dans deux équipes (une paire et une équipe), il fait deux tours.
          Le cavalier du poney remplaçant est indiqué à part : ce n’est pas un tour.
        </p>
        <button type="button" onClick={copier}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-blue-600 text-white font-body text-sm font-semibold hover:bg-blue-700 transition">
          {copie ? <Check size={16} /> : <Copy size={16} />} {copie ? "Copié" : "Copier le récapitulatif"}
        </button>
      </div>

      <div className="rounded-xl border border-blue-500/10 bg-white overflow-hidden">
        <table className="w-full font-body text-sm">
          <thead className="bg-blue-50 text-left text-xs uppercase tracking-wide text-blue-900">
            <tr>
              <th className="px-3 py-2">Cavalier</th>
              <th className="px-3 py-2 text-center">Tours</th>
              <th className="px-3 py-2 hidden sm:table-cell">Passages</th>
            </tr>
          </thead>
          <tbody>
            {lignes.map((l) => (
              <tr key={l.cavalierId} className="border-t border-blue-500/10 align-top">
                <td className="px-3 py-2 font-semibold text-blue-900">
                  {l.nom}
                  <div className="sm:hidden mt-1 text-xs font-normal text-gray-600">
                    {l.detail.map((d) => `${d.heure ? `${d.heure} · ` : ""}${d.equipe}${d.poney ? ` (${d.poney})` : ""}`).join(" — ")}
                  </div>
                  {l.remplacant.length > 0 && <div className="mt-1 text-xs font-normal text-amber-800">Poney remplaçant : {l.remplacant.join(", ")}</div>}
                </td>
                <td className="px-3 py-2 text-center text-lg font-bold">{l.tours}</td>
                <td className="px-3 py-2 hidden sm:table-cell text-gray-700">
                  {l.detail.length ? l.detail.map((d, i) => (
                    <div key={i}>{d.heure && <span className="text-gray-500">{d.heure} · </span>}{d.equipe} <span className="text-gray-500">{d.categorie}</span>{d.poney && <> — {d.poney}</>}</div>
                  )) : <span className="text-gray-400">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-blue-500/20 bg-blue-50/50 font-semibold">
              <td className="px-3 py-2">{coureurs.length} cavalier{coureurs.length > 1 ? "s" : ""}</td>
              <td className="px-3 py-2 text-center">{total}</td>
              <td className="px-3 py-2 hidden sm:table-cell" />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
