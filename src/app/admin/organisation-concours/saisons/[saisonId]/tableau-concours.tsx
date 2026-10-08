"use client";

import { AlertOctagon, AlertTriangle, CheckCircle2, Printer } from "lucide-react";
import type { ResultatConcours, SaisonPonyGames } from "@/lib/concours/saisons";
import {
  DUREE_ECHAUFFEMENT_MIN, DUREE_PREPA_MIN, PLACEURS_MAX,
  htmlTableau, lignesTableau, nomCavalier, plageLisible, poserPlaceur, poserRole, verifierTableau,
  type LigneTableau,
} from "@/lib/concours/saison-tableau";

type Changer = (f: (r: ResultatConcours) => ResultatConcours) => void;
type RoleTexte = "respPrepa" | "respEchauffement" | "juge" | "facteur";

const inpSm =
  "w-full min-w-[110px] px-2 py-1.5 rounded-md border border-blue-500/15 font-body text-sm bg-white focus:border-blue-500 focus:outline-none";
const th = "text-left font-semibold px-2.5 py-2 text-xs text-gray-600 whitespace-nowrap";
const td = "px-2.5 py-2 align-top";

/** Nom libre (cavalier, parent, coach…) : saisi puis enregistré en quittant la case. */
function CaseNom({ valeur, onChange, placeholder }: { valeur?: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <input key={valeur ?? ""} list="pg-personnes" className={inpSm} placeholder={placeholder} defaultValue={valeur ?? ""}
      onBlur={(e) => e.target.value.trim() !== (valeur ?? "") && onChange(e.target.value)} />
  );
}

function LignePassage({ saison, ligne: l, changer }: { saison: SaisonPonyGames; ligne: LigneTableau; changer: Changer }) {
  const role = (r: RoleTexte) => (v: string) => changer((c) => poserRole(c, l.equipeId, r, v));
  // Les cavaliers de l'équipe courent : on ne les propose pas comme placeurs.
  const placeursPossibles = saison.cavaliers
    .filter((c) => !l.cavaliers.some((x) => x.id === c.id))
    .sort((a, b) => a.prenom.localeCompare(b.prenom, "fr"));
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
        {l.remplacant && <div className="text-pink-700 whitespace-nowrap">Remplaçant : {l.remplacant}</div>}
      </td>
      <td className={td}>
        <div className="text-xs font-semibold text-gray-600 mb-1 whitespace-nowrap">{plageLisible(l.prepa)}</div>
        <CaseNom valeur={l.roles.respPrepa} onChange={role("respPrepa")} placeholder="Responsable" />
      </td>
      <td className={td}>
        <div className="text-xs font-semibold text-gray-600 mb-1 whitespace-nowrap">{plageLisible(l.echauffement)}</div>
        <CaseNom valeur={l.roles.respEchauffement} onChange={role("respEchauffement")} placeholder="Responsable" />
      </td>
      <td className={`${td} space-y-1`}>
        {Array.from({ length: Math.min(placeurs.length + 1, PLACEURS_MAX) }, (_, i) => (
          <select key={i} className={inpSm} value={placeurs[i] ?? ""}
            onChange={(e) => changer((c) => poserPlaceur(c, l.equipeId, i, e.target.value))}>
            <option value="">{i === 0 ? "— placeur —" : "— 2e placeur —"}</option>
            {placeursPossibles
              .filter((c) => c.id === placeurs[i] || !placeurs.includes(c.id))
              .map((c) => <option key={c.id} value={c.id}>{nomCavalier(saison, c.id)}</option>)}
          </select>
        ))}
      </td>
      <td className={td}><CaseNom valeur={l.roles.juge} onChange={role("juge")} placeholder="Juge de ligne" /></td>
      <td className={td}><CaseNom valeur={l.roles.facteur} onChange={role("facteur")} placeholder="Facteur" /></td>
    </tr>
  );
}

export function TableauConcours({ saison, concours, changer }: { saison: SaisonPonyGames; concours: ResultatConcours; changer: Changer }) {
  const lignes = lignesTableau(saison, concours);
  const alertes = verifierTableau(saison, concours);

  // Suggestions de noms : les cavaliers de la saison et les personnes déjà désignées.
  const dejaNommes = lignes.flatMap((l) => [l.roles.respPrepa, l.roles.respEchauffement, l.roles.juge, l.roles.facteur]);
  const suggestions = [...new Set([
    ...saison.cavaliers.map((c) => nomCavalier(saison, c.id)),
    ...dejaNommes.filter((n): n is string => !!n),
  ])].sort((a, b) => a.localeCompare(b, "fr"));

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
      <datalist id="pg-personnes">{suggestions.map((n) => <option key={n} value={n} />)}</datalist>

      <div className="flex flex-wrap items-center gap-3">
        <p className="text-xs text-gray-500 flex-1 min-w-[240px]">
          Pour chaque passage : préparation des poneys ({DUREE_PREPA_MIN} min) puis échauffement ({DUREE_ECHAUFFEMENT_MIN} min)
          juste avant, chacun avec un responsable ; pendant le passage, 1 à 2 placeurs, un juge de ligne et un facteur.
          Les noms sont libres (cavalier, parent, coach…).
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
              <th className={th}>Prépa poneys</th>
              <th className={th}>Échauffement</th>
              <th className={th}>Placeurs</th>
              <th className={th}>Juge de ligne</th>
              <th className={th}>Facteur</th>
            </tr>
          </thead>
          <tbody>
            {lignes.map((l) => <LignePassage key={l.equipeId} saison={saison} ligne={l} changer={changer} />)}
          </tbody>
        </table>
      </div>
    </div>
  );
}
