"use client";

import { useState } from "react";
import { AlertOctagon, AlertTriangle, CheckCircle2, Plus, Printer, X } from "lucide-react";
import type { ResultatConcours, SaisonPonyGames } from "@/lib/concours/saisons";
import {
  DUREE_ECHAUFFEMENT_MIN, DUREE_PREPA_MIN, PLACEURS_MAX,
  TACHES_MAX, ajouterTache, candidatsRole, coachTientRemplacant, poserTache, renommerTache, supprimerTache, estPersonne, htmlTableau, lignesTableau, nomCavalier, PERSONNE, plageLisible, poserCavalierRemplacant, poserPlaceur, poserPreparateur, poserRole, verifierTableau,
  type Candidat, type LigneTableau,
} from "@/lib/concours/saison-tableau";

type Changer = (f: (r: ResultatConcours) => ResultatConcours) => void;
type RoleTexte = "respPrepa" | "respEchauffement" | "respEchauffement2" | "juge" | "facteur" | "coach" | "coach2";

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
          {disponibles.map((c) => <option key={valeurDe(c)} value={valeurDe(c)}>{c.prevu ? "★ " : ""}{c.nom} ({c.taches}){c.prevu ? " — prévu" : ""}</option>)}
        </optgroup>
      )}
      {occupes.length > 0 && (
        <optgroup label="Occupés à ce moment-là">
          {occupes.map((c) => (
            // Le choix déjà fait reste sélectionnable, pour pouvoir le voir et le changer.
            <option key={valeurDe(c)} value={valeurDe(c)} disabled={valeurDe(c) !== valeur}>
              {c.nom} ({c.taches}) — {c.occupe}
            </option>
          ))}
        </optgroup>
      )}
      {libre && <option value={AUTRE}>✎ Autre personne…</option>}
    </select>
  );
}

function LignePassage({ saison, concours, ligne: l, changer }: { saison: SaisonPonyGames; concours: ResultatConcours; ligne: LigneTableau; changer: Changer }) {
  // `sauf` : le 2e menu ne repropose pas la personne du 1er (X reste à volonté).
  const parNom = (role: RoleTexte, vide: string, sauf?: string) => (
    <ChoixPersonne valeur={l.roles[role]} vide={vide} valeurDe={(c) => c.nom}
      candidats={candidatsRole(saison, concours, l.equipeId, role).filter((c) => !sauf || estPersonne(sauf) || c.nom !== sauf)}
      onChange={(v) => changer((c) => poserRole(c, l.equipeId, role, v))} />
  );
  /** Un 1er menu, et un 2e (facultatif) une fois le 1er rempli ou si le 2e l'est déjà. */
  const deuxNoms = (role: "coach" | "respEchauffement", vide: string, vide2: string) => (
    <div className="space-y-1">
      {parNom(role, vide)}
      {(l.roles[role] || l.roles[`${role}2`]) && parNom(`${role}2`, vide2, l.roles[role])}
    </div>
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
          <div key={c.id} className="whitespace-nowrap">
            {c.nom}{c.poney && <span className="text-blue-700"> — {c.poney}</span>}
            {c.dejaPretDepuis && (
              <span className="text-green-700" title="Même cavalier, même poney plus tôt : ni prépa ni échauffement à refaire">
                {" "}· prêt depuis {c.dejaPretDepuis}
              </span>
            )}
            {c.enchaineAvec && (
              <div className={`mt-0.5 mb-1 pl-2 border-l-2 ${c.preparateur ? "border-green-300" : "border-red-300"} whitespace-normal`}>
                <div className={c.preparateur ? "text-gray-500" : "text-red-700 font-semibold"}>
                  Joue avant avec {c.enchaineAvec} : qui prépare et échauffe {c.poney ?? "son poney"} ?
                </div>
                <ChoixPersonne valeur={c.preparateur} libre={false} vide="— préparateur —"
                  candidats={candidatsRole(saison, concours, l.equipeId, "preparateur", c.id).filter((x) => x.cavalierId && x.cavalierId !== c.id)}
                  valeurDe={(x) => x.cavalierId!} libelle={(id) => nomCavalier(saison, id)}
                  onChange={(v) => changer((r) => poserPreparateur(r, l.equipeId, c.id, v))} />
              </div>
            )}
          </div>
        ))}
        {l.remplacant && (
          <div className="mt-1">
            <div className="text-pink-700 whitespace-nowrap">Remplaçant : {l.remplacant}</div>
            <ChoixPersonne valeur={l.roles.cavalierRemplacant} libre={false} vide="— cavalier du remplaçant —"
              candidats={candidatsRole(saison, concours, l.equipeId, "cavalierRemplacant").filter((c) => c.cavalierId)}
              valeurDe={(c) => c.cavalierId!} libelle={(id) => nomCavalier(saison, id)}
              onChange={(v) => changer((c) => poserCavalierRemplacant(saison, c, l.equipeId, v))} />
            {l.cavaliers.length === 4 && <div className="text-[11px] text-gray-500 whitespace-normal mt-0.5">Équipe de 4 : il fait facteur, le coach tient le remplaçant pendant le jeu.</div>}
          </div>
        )}
      </td>
      <td className={td}>
        {deuxNoms("coach", "— coach —", "— 2e coach —")}
        {coachTientRemplacant(saison, l) && <div className="text-[11px] text-pink-700 mt-0.5">Tient le poney remplaçant ({l.remplacant}) pendant le jeu</div>}
      </td>
      <td className={td}>
        <div className="text-xs font-semibold text-gray-600 mb-1 whitespace-nowrap">{plageLisible(l.prepa)}</div>
        {parNom("respPrepa", "— responsable —")}
      </td>
      <td className={td}>
        <div className="text-xs font-semibold text-gray-600 mb-1 whitespace-nowrap">{plageLisible(l.echauffement)}</div>
        {deuxNoms("respEchauffement", "— responsable —", "— 2e responsable —")}
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
      <td className={td}>
        {parNom("facteur", "— facteur —")}
        {l.cavaliers.length >= 5 && <div className="text-[11px] text-gray-500 mt-0.5">Un des 5 cavaliers (★)</div>}
        {l.cavaliers.length === 4 && <div className="text-[11px] text-gray-500 mt-0.5">Le cavalier du remplaçant (★)</div>}
      </td>
      {(concours.taches ?? []).map((t) => (
        <td key={t.id} className={td}>
          <ChoixPersonne valeur={l.roles.taches?.[t.id]} vide={`— ${t.nom.toLowerCase()} —`} valeurDe={(c) => c.nom}
            candidats={candidatsRole(saison, concours, l.equipeId, "tache", t.id)}
            onChange={(v) => changer((c) => poserTache(c, l.equipeId, t.id, v))} />
        </td>
      ))}
    </tr>
  );
}

function idTache(): string {
  return `t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Colonnes de tâches en plus pour ce concours (concours au club : parking,
 * buvette, speaker…) : ajouter, renommer, supprimer, ou reprendre celles
 * d'un autre concours de la saison.
 */
function TachesEnPlus({ saison, concours, changer }: { saison: SaisonPonyGames; concours: ResultatConcours; changer: Changer }) {
  const [nom, setNom] = useState("");
  const taches = concours.taches ?? [];
  const modele = saison.resultats.filter((r) => r.id !== concours.id && r.taches?.length).sort((a, b) => b.date.localeCompare(a.date))[0];
  const ajouter = () => {
    if (!nom.trim()) return;
    changer((r) => ajouterTache(r, nom, idTache()));
    setNom("");
  };
  const supprimer = (id: string, libelle: string) => {
    const remplis = (concours.engagements ?? []).filter((g) => g.roles?.taches?.[id]?.trim()).length;
    if (remplis && !confirm(`Supprimer la colonne « ${libelle} » et les ${remplis} nom(s) saisis dessous ?`)) return;
    changer((r) => supprimerTache(r, id));
  };
  const reprendre = () => {
    if (!modele?.taches) return;
    changer((r) => modele.taches!.reduce<ResultatConcours>((acc, t) => ajouterTache(acc, t.nom, idTache()), r));
  };
  return (
    <div className="rounded-xl border border-blue-500/12 bg-white px-4 py-3 space-y-2">
      <div className="text-sm font-semibold text-blue-900">Tâches en plus pour ce concours</div>
      <p className="text-xs text-gray-500">Une colonne par tâche (parking, buvette, speaker…), avec une personne par passage, prise pendant le passage.</p>
      <div className="flex flex-wrap gap-2">
        {taches.map((t) => (
          <span key={t.id} className="inline-flex items-center gap-1 rounded-full bg-blue-50 pl-1 pr-1 py-0.5">
            <input className="bg-transparent px-2 py-1 text-sm font-semibold text-blue-900 w-32 focus:outline-none focus:bg-white rounded-full"
              defaultValue={t.nom} aria-label="Nom de la tâche"
              onBlur={(e) => { if (e.target.value.trim() && e.target.value.trim() !== t.nom) changer((r) => renommerTache(r, t.id, e.target.value)); else e.target.value = t.nom; }}
              onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
            <button type="button" onClick={() => supprimer(t.id, t.nom)} className="p-1.5 rounded-full text-gray-400 hover:text-red-600 hover:bg-red-50" aria-label={`Supprimer ${t.nom}`}>
              <X size={14} />
            </button>
          </span>
        ))}
        {taches.length < TACHES_MAX && (
          <span className="inline-flex items-center gap-1">
            <input className={`${inpSm} !w-44`} placeholder="Nouvelle tâche (ex. Parking)" value={nom}
              onChange={(e) => setNom(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") ajouter(); }} />
            <button type="button" onClick={ajouter} disabled={!nom.trim()}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50">
              <Plus size={14} /> Ajouter
            </button>
          </span>
        )}
        {!taches.length && modele && (
          <button type="button" onClick={reprendre} className="px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 text-sm font-semibold hover:bg-blue-100">
            Reprendre celles de « {modele.nom} » ({modele.taches!.map((t) => t.nom).join(", ")})
          </button>
        )}
      </div>
    </div>
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
          juste avant, chacun avec un responsable ; pendant le passage, 1 à 2 coachs, 1 à 2 placeurs, un juge de ligne et un facteur.
          Chaque menu propose d&apos;abord les personnes libres à ce moment-là ; les occupées (en préparation,
          en échauffement, en jeu ou sur un autre rôle) sont grisées. L&apos;échauffement peut avoir 2 responsables ; le cavalier du poney
          remplaçant est pris de la préparation à la fin du passage. « Autre personne… » pour un parent, un coach… « X — personne » quand il n&apos;y a personne sur le rôle : toujours disponible.
          Le nombre entre parenthèses = tâches déjà confiées à la personne dans ce concours (placeur, juge, facteur,
          coach, responsable, cavalier du remplaçant), sans compter la préparation, l&apos;échauffement et le jeu avec son équipe.
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

      <TachesEnPlus saison={saison} concours={concours} changer={changer} />

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
              {(concours.taches ?? []).map((t) => <th key={t.id} className={th}>{t.nom}</th>)}
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
