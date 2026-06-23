"use client";

import { Trophy } from "lucide-react";
import type { Concours, Passage, RoleType } from "@/lib/concours/types";

const LIBELLE_ROLE: Record<RoleType, string> = {
  coach: "Coach",
  placeur: "Placeurs",
  juge: "Juge",
  camion: "Aide camion",
  detente: "Détente",
};
const ORDRE_ROLE: RoleType[] = ["coach", "placeur", "juge", "camion", "detente"];

/** Heure à laquelle un poste s'exerce : aide camion = prépa, le reste = passage. */
function heureRole(p: Passage, type: RoleType): string {
  if (type === "camion") return p.heurePrepa || p.heureACheval || p.heurePassage || "";
  return p.heurePassage || p.heureACheval || "";
}

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
                    {/* En-tête : n° + équipe + heure de passage */}
                    <div className="flex items-start gap-3 mb-2">
                      <span className={`${numBg} text-white text-sm font-bold w-7 h-7 rounded-full flex items-center justify-center shrink-0`}>
                        {p.ordre}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="font-display text-lg font-bold text-gray-900 leading-tight">{p.nomEquipe}</div>
                        {p.categorie && <div className="text-xs font-semibold text-blue-700">{p.categorie}</div>}
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-display text-xl font-bold text-blue-900 leading-none">{p.heurePassage || p.heureACheval}</div>
                        <div className="text-[10px] uppercase tracking-wide text-gray-400">passage</div>
                      </div>
                    </div>

                    {/* Horaires clés */}
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {p.heurePrepa && <span className="text-[11px] bg-gray-100 text-gray-600 rounded px-1.5 py-0.5">Prépa {p.heurePrepa}</span>}
                      {p.heureACheval && <span className="text-[11px] bg-gray-100 text-gray-600 rounded px-1.5 py-0.5">À cheval {p.heureACheval}</span>}
                      {(p.heurePassage || p.heureACheval) && (
                        <span className="text-[11px] bg-blue-100 text-blue-700 font-semibold rounded px-1.5 py-0.5">Passage {p.heurePassage || p.heureACheval}</span>
                      )}
                    </div>

                    {/* Cavaliers */}
                    {riders(p) && (
                      <div className="font-body text-xs text-gray-600 mb-2">
                        <span className="font-semibold text-gray-700">Cavaliers : </span>{riders(p)}
                      </div>
                    )}

                    {/* Qui fait quoi et à quelle heure */}
                    <div className="space-y-1 font-body text-xs border-t border-gray-100 pt-2">
                      {rolesPresents(p).map((t) => {
                        const noms = roleNoms(p, t);
                        const h = heureRole(p, t);
                        return (
                          <div key={t} className="flex items-baseline gap-2">
                            <span className="font-semibold text-gray-700 shrink-0 w-[72px]">{LIBELLE_ROLE[t]}</span>
                            <span className="text-gray-400 shrink-0 w-10 tabular-nums">{h}</span>
                            <span className={noms === "—" ? "text-red-500 font-semibold" : "text-gray-700"}>{noms}</span>
                          </div>
                        );
                      })}
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
