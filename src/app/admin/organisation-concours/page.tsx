"use client";

import { useMemo, useState } from "react";
import { Printer, AlertTriangle, AlertOctagon, CheckCircle2, Clock, Trophy } from "lucide-react";
import { analyser } from "@/lib/concours/contraintes";
import { SEED_FINALE_PIEUX } from "@/lib/concours/seed-finale-pieux";
import type { Concours, Passage, RoleType } from "@/lib/concours/types";

const LIBELLE_ROLE: Record<RoleType, string> = {
  coach: "Coach",
  placeur: "Placeurs",
  juge: "Juge",
  camion: "Camion",
  detente: "Détente",
};
const ORDRE_ROLE: RoleType[] = ["coach", "placeur", "juge", "camion", "detente"];

export default function OrganisationConcoursPage() {
  // v1 : données de démonstration (l'affiche Finale Pieux). Plus tard : Firestore.
  const [concours] = useState<Concours>(SEED_FINALE_PIEUX);

  const personnesById = useMemo(
    () => Object.fromEntries(concours.personnes.map((p) => [p.id, p])),
    [concours],
  );
  const chevauxById = useMemo(
    () => Object.fromEntries(concours.chevaux.map((c) => [c.id, c])),
    [concours],
  );
  const conflits = useMemo(() => analyser(concours), [concours]);
  const erreurs = conflits.filter((c) => c.gravite === "erreur");
  const alertes = conflits.filter((c) => c.gravite === "alerte");

  const nomPersonne = (id: string) => personnesById[id]?.prenom ?? id;
  const nomCheval = (id?: string) => (id ? chevauxById[id]?.nom ?? id : "");

  const passagesTerrain = (terrainId: string) =>
    concours.passages
      .filter((p) => p.terrain === terrainId)
      .sort((a, b) => a.ordre - b.ordre);

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
    <div className="max-w-[1200px] mx-auto px-4 py-6">
      {/* En-tête */}
      <div className="flex items-start justify-between gap-4 mb-6 no-print">
        <div>
          <h1 className="font-display text-2xl font-bold text-blue-900">Organisation de concours</h1>
          <p className="font-body text-sm text-gray-500 mt-1">
            Qui fait quoi, à quelle heure. Le moteur signale les conflits en direct.
          </p>
        </div>
        <button
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 text-white font-body text-sm font-semibold hover:bg-blue-700 transition"
        >
          <Printer size={16} /> Imprimer l&apos;affiche
        </button>
      </div>

      {/* Bandeau conflits */}
      <div className="mb-6 no-print">
        {erreurs.length === 0 && alertes.length === 0 ? (
          <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-green-50 border border-green-200 text-green-800 font-body text-sm">
            <CheckCircle2 size={18} /> Tout est couvert : aucun conflit détecté.
          </div>
        ) : (
          <div className="rounded-lg border border-blue-500/10 bg-white overflow-hidden">
            <div className="flex items-center gap-4 px-4 py-3 border-b border-blue-500/8 font-body text-sm">
              <span className="inline-flex items-center gap-1.5 font-semibold text-red-700">
                <AlertOctagon size={16} /> {erreurs.length} erreur{erreurs.length > 1 ? "s" : ""}
              </span>
              <span className="inline-flex items-center gap-1.5 font-semibold text-amber-700">
                <AlertTriangle size={16} /> {alertes.length} alerte{alertes.length > 1 ? "s" : ""}
              </span>
              <span className="text-gray-400 text-xs">
                Les erreurs sont impossibles à tenir. Les alertes sont serrées — souvent couvertes par un relais.
              </span>
            </div>
            <ul className="divide-y divide-blue-500/6">
              {conflits.map((c, i) => (
                <li key={i} className="flex items-start gap-2 px-4 py-2.5 font-body text-sm">
                  {c.gravite === "erreur" ? (
                    <AlertOctagon size={15} className="text-red-600 mt-0.5 shrink-0" />
                  ) : (
                    <AlertTriangle size={15} className="text-amber-500 mt-0.5 shrink-0" />
                  )}
                  <span className={c.gravite === "erreur" ? "text-red-800" : "text-gray-700"}>{c.message}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Affiche imprimable */}
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
                          <Clock size={15} className="text-gray-400" /> {p.heurePassage ?? p.heureACheval}
                        </span>
                        {p.categorie && (
                          <span className="ml-auto text-xs font-body font-semibold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-full">
                            {p.categorie}
                          </span>
                        )}
                      </div>

                      <div className="font-display text-base font-bold text-gray-800 mb-1">{p.nomEquipe}</div>
                      <div className="font-body text-xs text-gray-500 mb-3">{riders(p)}</div>

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
                          const prepa = [p.heurePrepa && `Prépa ${p.heurePrepa}`, p.heureACheval && `À cheval ${p.heureACheval}`]
                            .filter(Boolean)
                            .join("  •  ");
                          return prepa ? (
                            <div className="col-span-2 text-gray-400 mt-0.5">{prepa}</div>
                          ) : null;
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
      </div>

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
