"use client";

import { useState } from "react";
import { AlertOctagon, AlertTriangle, CheckCircle2, Printer } from "lucide-react";
import type { ResultatConcours, SaisonPonyGames } from "@/lib/concours/saisons";
import {
  DUREE_ECHAUFFEMENT_MIN, DUREE_PREPA_MIN, PLACEURS_MAX,
  candidatsRole, estPersonne, htmlTableau, lignesTableau, nomCavalier, PERSONNE, plageLisible, poserPlaceur, poserRole, verifierTableau,
  type Candidat, type LigneTableau,
} from "@/lib/concours/saison-tableau";

type Changer = (f: (r: ResultatConcours) => ResultatConcours) => void;
type RoleTexte = "respPrepa" | "respEchauffement" | "juge" | "facteur" | "coach";

const inpSm =
  "w-full min-w-[110px] px-2 py-1.5 rounded-md border border-blue-500/15 font-body text-sm bg-white focus:border-blue-500 focus:outline-none";
const th = "text-left font-semibold px-2.5 py-2 text-xs text-gray-600 whitespace-nowrap";
const td = "px-2.5 py-2 align-top";

const AUTRE = "__autre__";

/**
 * Menu d'une personne pour un rôle : les disponibles d'abord, les occupés
 * grisés avec ce qui les retient, et « Autre personne… » pour taper un nom.
 * `valeurDe` dit ce qu'on enregistre (le nom, ou l'id pour un placeur).
 */
function ChoixPersonne({
  valeur, candidats, onChange, vide, valeurDe, libre = true, libelle = (v: string) => v,
}: {
  valeur?: string;
  candidats: Candidat[];
  onChange: (v: string) => void;
  vide: string;
  valeurDe: (c: Candidat) => string;
  libre?: boolean;
  /** Texte affiché pour une valeur absente de la liste (un id de cavalier, par exemple). */
  libelle?: (v: string) => string;
}) {
  const [saisie, setSaisie] = useState(false);
  if (saisie) {
    return (
      <input autoFocus className={inpSm} placeholder="Nom de la personne"
        onBlur={(e) => { if (e.target.value.trim()) onChange(e.target.value); setSaisie(false); }}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setSaisie(false); }} />
    );
  }
  const disponibles = candidats.filter((c) => !c.occupe);
  const occupes = candidats.filter((c) => c.occupe);
  const connu = !valeur || estPersonne(valeur) || candidats.some((c) => valeurDe(c) === valeur);
  const choisi = candidats.find((c) => valeurDe(c) === valeur);
  return (
    <select className={`${inpSm} ${choisi?.occupe ? "border-red-300 bg-red-50 text-red-700" : ""}`} value={valeur ?? ""}
      onChange={(e) => (e.target.value === AUTRE ? setSaisie(true) : onChange(e.target.value))}>
      <option value="">{vide}</option>
      <option value={estPersonne(valeur) ? valeur : PERSONNE}>X — personne</option>
      {!connu && <option value={valeur}>{libelle(valeur!)}</option>}
      {disponibles.length > 0 && (
        <optgroup label={`Disponibles (${disponibles.length})`}>
          {disponibles.map((c) => <option key={valeurDe(c)} value={valeurDe(c)}>{c.nom}</option>)}
        </optgroup>
      )}
      {occupes.length > 0 && (
        <optgroup label="Occupés à ce moment-là">
          {occupes.map((c) => (
            // Le choix déjà fait reste sélectionnable, pour pouvoir le voir et le changer.
            <option key={valeurDe(c)} value={valeurDe(c)} disabled={valeurDe(c) !== valeur}>
              {c.nom} — {c.occupe}
            </option>
          ))}
        </optgroup>
      )}
      {libre && <option value={AUTRE}>✎ Autre personne…</option>}
    </select>
  );
}

function LignePassage({ saison, concours, ligne: l, changer }: { saison: SaisonPonyGames; concours: ResultatConcours; ligne: LigneTableau; changer: Changer }) {
  const parNom = (role: RoleTexte, vide: string) => (
    <ChoixPersonne valeur={l.roles[role]} candidats={candidatsRole(saison, concours, l.equipeId, role)} vide={vide}
      valeurDe={(c) => c.nom} onChange={(v) => changer((c) => poserRole(c, l.equipeId, role, v))} />
  );
  // Placeurs : cavaliers de la saison seulement.
  const candidatsPlaceur = candidatsRole(saison, concours, l.equipeId, "placeur").filter((c) => c.cavalierId);
  const placeurs = l.roles.placeurs ?? [];

  return (
    <tr className="border-t border-gray-100">
      <td className={td}>
        <div className="font-bold text-blue-900 whitespace-nowrap">{plageLisible(l.passage)}</div>
        <div className="font-semibold text-gray-800">{l.equipe}</div>
        <div className="text-xs text-gray-400">{l.categorie}</div>
      </td>
      <td className={`${td} text-xs`}>
        {l.cavaliers.map((c) => (
          <div key={c.id} className="whitespace-nowrap">{c.nom}{c.poney && <span className="text-blue-700"> — {c.poney}</span>}</div>
        ))}
        {l.remplacant && (
          <div className="mt-1">
            <div className="text-pink-700 whitespace-nowrap">Remplaçant : {l.remplacant}</div>
            <ChoixPersonne valeur={l.roles.cavalierRemplacant} libre={false} vide="— cavalier du remplaçant —"
              candidats={candidatsRole(saison, concours, l.equipeId, "cavalierRemplacant").filter((c) => c.cavalierId)}
              valeurDe={(c) => c.cavalierId!} libelle={(id) => nomCavalier(saison, id)}
              onChange={(v) => changer((c) => poserRole(c, l.equipeId, "cavalierRemplacant", v))} />
          </div>
        )}
      </td>
      <td className={td}>{parNom("coach", "— coach —")}</td>
      <td className={td}>
        <div className="text-xs font-semibold text-gray-600 mb-1 whitespace-nowrap">{plageLisible(l.prepa)}</div>
        {parNom("respPrepa", "— responsable —")}
      </td>
      <td className={td}>
        <div className="text-xs font-semibold text-gray-600 mb-1 whitespace-nowrap">{plageLisible(l.echauffement)}</div>
        {parNom("respEchauffement", "— responsable —")}
      </td>
      <td className={`${td} space-y-1`}>
        {Array.from({ length: Math.min(placeurs.length + 1, PLACEURS_MAX) }, (_, i) => (
          <ChoixPersonne key={i} valeur={placeurs[i]} libre={false} vide={i === 0 ? "— placeur —" : "— 2e placeur —"}
            candidats={candidatsPlaceur.filter((c) => c.cavalierId === placeurs[i] || !placeurs.includes(c.cavalierId!))}
            valeurDe={(c) => c.cavalierId!} libelle={(id) => nomCavalier(saison, id)}
            onChange={(v) => changer((c) => poserPlaceur(c, l.equipeId, i, v))} />
        ))}
      </td>
      <td className={td}>{parNom("juge", "— juge —")}</td>
      <td className={td}>{parNom("facteur", "— facteur —")}</td>
    </tr>
  );
}

export function TableauConcours({ saison, concours, changer }: { saison: SaisonPonyGames; concours: ResultatConcours; changer: Changer }) {
  const lignes = lignesTableau(saison, concours);
  const alertes = verifierTableau(saison, concours);

  const imprimer = () => {
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(htmlTableau(saison, concours));
    w.document.close();
  };

  if (lignes.length === 0) {
    return (
      <p className="text-sm text-gray-500 py-8 text-center border border-dashed border-gray-200 rounded-xl">
        Engage d&apos;abord les équipes et pose leurs horaires dans « Organisation ».
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-xs text-gray-500 flex-1 min-w-[240px]">
          Pour chaque passage : préparation des poneys ({DUREE_PREPA_MIN} min) puis échauffement ({DUREE_ECHAUFFEMENT_MIN} min)
          juste avant, chacun avec un responsable ; pendant le passage, un coach, 1 à 2 placeurs, un juge de ligne et un facteur.
          Chaque menu propose d&apos;abord les personnes libres à ce moment-là ; les occupées (en préparation,
          en échauffement, en jeu ou sur un autre rôle) sont grisées. Un coach par passage ; le cavalier du poney
          remplaçant est pris de l&apos;échauffement à la fin du passage. « Autre personne… » pour un parent, un coach… « X — personne » quand il n&apos;y a personne sur le rôle : toujours disponible.
        </p>
        <button type="button" onClick={imprimer}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-blue-600 text-white font-body text-sm font-semibold hover:bg-blue-700 transition">
          <Printer size={15} /> Imprimer le tableau
        </button>
      </div>

      {alertes.length === 0 ? (
        <div className="rounded-xl bg-green-50 border border-green-200 px-4 py-2.5 text-sm text-green-800 inline-flex items-center gap-2">
          <CheckCircle2 size={16} /> Tous les rôles sont pourvus et personne n&apos;est attendu à deux endroits à la fois.
        </div>
      ) : (
        <div className="rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-3 space-y-1">
          {alertes.map((a, i) => (
            <div key={i} className={`text-sm flex items-start gap-2 ${a.gravite === "erreur" ? "text-red-700 font-semibold" : "text-amber-800"}`}>
              {a.gravite === "erreur" ? <AlertOctagon size={15} className="mt-0.5 shrink-0" /> : <AlertTriangle size={15} className="mt-0.5 shrink-0" />}
              {a.message}
            </div>
          ))}
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-blue-500/12 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-blue-50/60">
            <tr>
              <th className={th}>Passage</th>
              <th className={th}>Cavaliers — poneys</th>
              <th className={th}>Coach</th>
              <th className={th}>Prépa poneys</th>
              <th className={th}>Échauffement</th>
              <th className={th}>Placeurs</th>
              <th className={th}>Juge de ligne</th>
              <th className={th}>Facteur</th>
            </tr>
          </thead>
          <tbody>
            {lignes.map((l) => <LignePassage key={l.equipeId} saison={saison} concours={concours} ligne={l} changer={changer} />)}
          </tbody>
        </table>
      </div>
    </div>
  );
}
