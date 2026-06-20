"use client";

import { Clock, Trophy } from "lucide-react";
import type { Concours, Passage, RoleType } from "@/lib/concours/types";

const LIBELLE_ROLE: Record<RoleType, string> = {
  coach: "Coach",
  placeur: "Placeurs",
  juge: "Juge",
  camion: "Camion",
  detente: "Détente",
};
const ORDRE_ROLE: RoleType[] = ["coach", "placeur", "juge", "camion", "detente"];

/** Rendu "affiche" d'un concours : utilisé pour l'aperçu et l'impression. */
export default function Affiche({ concours }: { concours: Concours }) {
  const personnesById = Object.fromEntries(concours.personnes.map((p) => [p.id, p]));
  const chevauxById = Object.fromEntries(concours.chevaux.map((c) => [c.id, c]));

  const nomPersonne = (id: string) => personnesById[id]?.prenom ?? id;
  const nomCheval = (id?: string) => (id ? chevauxById[id]?.nom ?? id : "");

  const passagesTerrain = (terrainId: string) =>
    concours.passages.filter((p) => p.terrain === terrainId).sort((a, b) => a.ordre - b.ordre);

  const riders = (p: Passage) =>
    p.participants
      .map((part) => {
        const cheval = nomCheval(part.chevalId);
        return cheval ? `${nomPersonne(part.personneId)} / ${cheval}` : nomPersonne(part.personneId);
      })
      .join("  •  ");

  const roleNoms = (p: Passage, type: RoleType): string => {
    const r = p.roles.find((x) => x.type === type);
    if (!r || r.personneIds.length === 0) return "—";
    return r.personneIds.map(nomPersonne).join(" · ");
  };
  const rolesPresents = (p: Passage): RoleType[] =>
    ORDRE_ROLE.filter((t) => p.roles.some((r) => r.type === t));

  return (
    <div id="affiche-print">
      <div className="text-center mb-5">
        <h2 className="font-display text-3xl font-bold text-blue-900 tracking-tight">{concours.titre}</h2>
        {concours.sousTitre && (
          <p className="font-display text-lg text-pink-600 font-semibold">{concours.sousTitre}</p>
        )}
      </div>

      <div className="grid md:grid-cols-2 gap-5">
        {concours.terrains.map((terrain) => {
          const accent = terrain.id === "manege" ? "orange" : "blue";
          const head = accent === "orange" ? "bg-orange-500" : "bg-blue-600";
          const numBg = accent === "orange" ? "bg-orange-500" : "bg-blue-600";
          return (
            <div key={terrain.id} className="space-y-3">
              <div className={`${head} text-white text-center font-display text-xl font-bold py-2.5 rounded-xl`}>
                {terrain.nom}
              </div>
              {passagesTerrain(terrain.id).map((p) =>
                p.evenement ? (
                  <div
                    key={p.id}
                    className="flex items-center justify-center gap-2 py-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 font-body font-semibold text-sm"
                  >
                    <Trophy size={16} /> {p.heureACheval} — {p.nomEquipe}
                  </div>
                ) : (
                  <div key={p.id} className="rounded-xl border border-blue-500/10 bg-white p-4">
                    <div className="flex items-center gap-3 mb-1">
                      <span className={`${numBg} text-white text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center shrink-0`}>
                        {p.ordre}
                      </span>
                      <span className="inline-flex items-center gap-1 font-display text-lg font-bold text-blue-900">
                        <Clock size={15} className="text-gray-400" /> {p.heurePassage || p.heureACheval}
                      </span>
                      {p.categorie && (
                        <span className="ml-auto text-xs font-body font-semibold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-full">
                          {p.categorie}
                        </span>
                      )}
                    </div>

                    <div className="font-display text-base font-bold text-gray-800 mb-1">{p.nomEquipe}</div>
                    {riders(p) && <div className="font-body text-xs text-gray-500 mb-3">{riders(p)}</div>}

                    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 font-body text-xs">
                      {rolesPresents(p).map((t) => (
                        <div key={t} className="flex gap-1.5">
                          <span className="font-semibold text-gray-700 shrink-0">{LIBELLE_ROLE[t]} :</span>
                          <span className={roleNoms(p, t) === "—" ? "text-red-500 font-semibold" : "text-gray-600"}>
                            {roleNoms(p, t)}
                          </span>
                        </div>
                      ))}
                      {(() => {
                        const prepa = [
                          p.heurePrepa && `Prépa ${p.heurePrepa}`,
                          p.heureACheval && `À cheval ${p.heureACheval}`,
                        ]
                          .filter(Boolean)
                          .join("  •  ");
                        return prepa ? <div className="col-span-2 text-gray-400 mt-0.5">{prepa}</div> : null;
                      })()}
                    </div>

                    {p.noteRelais && (
                      <div className="mt-2 text-xs font-body text-blue-700 bg-blue-50/60 rounded-lg px-3 py-1.5">
                        ↪ {p.noteRelais}
                      </div>
                    )}
                  </div>
                ),
              )}
              {passagesTerrain(terrain.id).length === 0 && (
                <div className="text-center text-xs text-gray-400 py-6 border border-dashed border-gray-200 rounded-xl">
                  Aucun passage sur ce terrain.
                </div>
              )}
            </div>
          );
        })}
      </div>

      {concours.rappels && concours.rappels.length > 0 && (
        <div className="mt-5 rounded-xl bg-purple-50 border border-purple-200 p-4">
          <div className="font-display font-bold text-purple-800 mb-2 text-sm">Relais &amp; rappels</div>
          <ul className="space-y-1 font-body text-xs text-purple-900/80 list-disc pl-5">
            {concours.rappels.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      )}

      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #affiche-print,
          #affiche-print * {
            visibility: visible;
          }
          #affiche-print {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>
    </div>
  );
}
