"use client";

import { useEffect, useState } from "react";
import {
  Plus, Trash2, Trophy, Calendar, MapPin, ArrowLeft, ArrowUp, ArrowDown, X,
  AlertOctagon, AlertTriangle, CheckCircle2, RefreshCw, Clock,
} from "lucide-react";
import { listerPoneysBase } from "@/lib/concours/store";
import {
  bilanSaison, lireNombre, resultatsTries, saisirClassement,
  type SaisonPonyGames, type ResultatConcours, type EquipeSaison,
} from "@/lib/concours/saisons";
import {
  avecHoraires, besoinRemplacant, deplacer, desengager, dureeEpreuve, dureePassage, engagerEquipes, estPaire,
  heureLisible, majConcours, minutes, poserDuree, poserHeure, poserPoney, poserRemplacant, verifierOrganisation, versHeure,
} from "@/lib/concours/saison-organisation";
import type { Maj } from "./onglets";

const inp =
  "w-full px-2.5 py-2 rounded-lg border border-blue-500/15 font-body text-sm bg-white focus:border-blue-500 focus:outline-none";
const inpSm = "px-2 py-1.5 rounded-md border border-blue-500/15 font-body text-sm bg-white focus:border-blue-500 focus:outline-none";
const btnPrimaire =
  "inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-blue-600 text-white font-body text-sm font-semibold hover:bg-blue-700 transition disabled:opacity-50";
const btnSecondaire =
  "inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-blue-50 text-blue-700 font-body text-sm font-semibold hover:bg-blue-100 transition disabled:opacity-50";
const btnIcone = "p-1.5 rounded-lg text-gray-400 hover:text-blue-700 hover:bg-blue-50 transition disabled:opacity-30 disabled:hover:bg-transparent";

function genId(prefixe: string): string {
  return `${prefixe}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

const dateLisible = (iso: string) => iso.split("-").reverse().join("/");

// ─── Liste des concours de la saison ───────────────────────────────────────

export function OngletConcours({ saison, maj }: { saison: SaisonPonyGames; maj: Maj }) {
  const [ouvert, setOuvert] = useState<string | null>(null);
  const [nom, setNom] = useState("");
  const [date, setDate] = useState("");
  const [lieu, setLieu] = useState("");

  const concoursOuvert = ouvert ? saison.resultats.find((r) => r.id === ouvert) : undefined;
  if (concoursOuvert) {
    return <FicheConcours saison={saison} maj={maj} concours={concoursOuvert} onFermer={() => setOuvert(null)} />;
  }

  const ajouter = () => {
    if (!nom.trim() || !date) return;
    const id = genId("cc");
    maj((s) => ({ ...s, resultats: [...s.resultats, { id, nom: nom.trim(), date, lieu: lieu.trim() || undefined, classements: [] }] }));
    setNom("");
    setDate("");
    setLieu("");
    setOuvert(id);
  };

  const supprimer = (r: ResultatConcours) => {
    if (!confirm(`Supprimer le concours « ${r.nom} », son organisation et ses résultats ?`)) return;
    maj((s) => ({ ...s, resultats: s.resultats.filter((x) => x.id !== r.id) }));
  };

  const tries = resultatsTries(saison).reverse();

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-blue-500/15 bg-white p-4">
        <div className="text-sm font-semibold text-blue-900 mb-2">Ajouter un concours</div>
        <div className="grid sm:grid-cols-[2fr_1fr_1.5fr_auto] gap-2 items-end">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Concours</label>
            <input className={inp} value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Pony Games de Pieux" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Date</label>
            <input type="date" className={inp} value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Lieu (optionnel)</label>
            <input className={inp} value={lieu} onChange={(e) => setLieu(e.target.value)} />
          </div>
          <button type="button" onClick={ajouter} disabled={!nom.trim() || !date} className={btnPrimaire}><Plus size={15} /> Ajouter</button>
        </div>
      </div>

      {tries.length === 0 ? (
        <p className="text-sm text-gray-500 py-8 text-center border border-dashed border-gray-200 rounded-xl">Aucun concours pour cette saison.</p>
      ) : (
        <div className="space-y-2">
          {tries.map((r) => {
            const alertes = verifierOrganisation(saison, r);
            const erreurs = alertes.filter((a) => a.gravite === "erreur").length;
            const nbEngagees = r.engagements?.length ?? 0;
            return (
              <div key={r.id} className="flex items-center gap-3 rounded-xl border border-blue-500/12 bg-white p-4 hover:border-blue-500/30 transition">
                <Trophy size={20} className="text-blue-600 shrink-0" />
                <button type="button" onClick={() => setOuvert(r.id)} className="min-w-0 flex-1 text-left">
                  <div className="font-display font-bold text-gray-800">{r.nom}</div>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500 mt-0.5">
                    <span className="inline-flex items-center gap-1"><Calendar size={12} /> {dateLisible(r.date)}</span>
                    {r.lieu && <span className="inline-flex items-center gap-1"><MapPin size={12} /> {r.lieu}</span>}
                    <span>{nbEngagees} équipe(s) engagée(s)</span>
                    {nbEngagees > 0 && (erreurs > 0
                      ? <span className="text-red-600 font-semibold">{erreurs} conflit(s)</span>
                      : alertes.length > 0
                        ? <span className="text-amber-600">{alertes.length} point(s) à compléter</span>
                        : <span className="text-green-700">organisation complète</span>)}
                    {r.classements.length > 0 && <span>· résultats saisis</span>}
                  </div>
                </button>
                <button type="button" onClick={() => setOuvert(r.id)} className={btnSecondaire}>Ouvrir</button>
                <button type="button" onClick={() => supprimer(r)} title="Supprimer"
                  className="p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition"><Trash2 size={16} /></button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Fiche d'un concours : organisation + résultats ────────────────────────

function FicheConcours({
  saison, maj, concours, onFermer,
}: { saison: SaisonPonyGames; maj: Maj; concours: ResultatConcours; onFermer: () => void }) {
  const [partie, setPartie] = useState<"organisation" | "resultats">("organisation");
  const changer = (f: (r: ResultatConcours) => ResultatConcours) => maj((s) => majConcours(s, concours.id, f));

  return (
    <div className="space-y-4">
      <button type="button" onClick={onFermer} className="inline-flex items-center gap-1.5 text-sm text-blue-700 hover:underline">
        <ArrowLeft size={15} /> Tous les concours de la saison
      </button>
      <div className="rounded-xl border border-blue-500/15 bg-white p-4 grid sm:grid-cols-[2fr_1fr_1.5fr] gap-2">
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Concours</label>
          <input className={`${inp} font-semibold`} value={concours.nom} onChange={(e) => changer((r) => ({ ...r, nom: e.target.value }))} />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Date</label>
          <input type="date" className={inp} value={concours.date} onChange={(e) => e.target.value && changer((r) => ({ ...r, date: e.target.value }))} />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Lieu</label>
          <input className={inp} value={concours.lieu ?? ""} onChange={(e) => changer((r) => ({ ...r, lieu: e.target.value || undefined }))} />
        </div>
      </div>

      <div className="flex gap-1 border-b border-blue-500/10">
        {([["organisation", "Organisation"], ["resultats", "Résultats"]] as const).map(([id, libelle]) => (
          <button key={id} type="button" onClick={() => setPartie(id)}
            className={`px-4 py-2 font-body text-sm font-semibold rounded-t-lg transition ${
              partie === id ? "bg-blue-600 text-white" : "text-blue-800 hover:bg-blue-50"
            }`}>
            {libelle}
          </button>
        ))}
      </div>

      {partie === "organisation"
        ? <OrganisationConcours saison={saison} concours={concours} changer={changer} />
        : <ResultatsConcours saison={saison} maj={maj} concours={concours} />}
    </div>
  );
}

type Changer = (f: (r: ResultatConcours) => ResultatConcours) => void;

function OrganisationConcours({ saison, concours, changer }: { saison: SaisonPonyGames; concours: ResultatConcours; changer: Changer }) {
  const [poneys, setPoneys] = useState<string[]>([]);
  const [aEngager, setAEngager] = useState("");

  useEffect(() => {
    listerPoneysBase()
      .then((liste) => setPoneys([...new Set(liste.map((p) => p.nom))]))
      .catch((e) => console.error("Cavalerie indisponible", e));
  }, []);

  const engagements = concours.engagements ?? [];
  const engagees = new Set(engagements.map((g) => g.equipeId));
  const libres = bilanSaison(saison)
    .map((g) => ({ categorie: g.categorie, equipes: g.equipes.map((b) => b.equipe).filter((e) => !engagees.has(e.id)) }))
    .filter((g) => g.equipes.length > 0);
  const alertes = verifierOrganisation(saison, concours);
  const sansHeure = engagements.every((g) => minutes(g.heure) === undefined);

  const poserDebut = (valeur: string) =>
    changer((r) => {
      const maj = { ...r, heureDebut: valeur || undefined };
      // Tant qu'aucun horaire n'est posé, l'heure de début les calcule tous.
      return sansHeure ? avecHoraires(saison, maj) : maj;
    });

  const recalculer = () => {
    if (minutes(concours.heureDebut) === undefined) return;
    if (!sansHeure && !confirm("Recalculer tous les horaires dans l'ordre de passage, à partir de l'heure de début ? Les heures modifiées à la main seront remplacées.")) return;
    changer((r) => avecHoraires(saison, r));
  };

  return (
    <div className="space-y-4">
      <datalist id="pg-poneys">{poneys.map((p) => <option key={p} value={p} />)}</datalist>

      <div className="rounded-xl border border-blue-500/15 bg-white p-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Premier passage</label>
          <input type="time" className={inp} value={concours.heureDebut ?? ""} onChange={(e) => poserDebut(e.target.value)} />
        </div>
        <button type="button" onClick={recalculer} disabled={minutes(concours.heureDebut) === undefined || engagements.length === 0} className={btnSecondaire}>
          <RefreshCw size={14} /> Recalculer les horaires
        </button>
        <p className="text-xs text-gray-500 flex-1 min-w-[220px]">
          Les épreuves s&apos;enchaînent dans l&apos;ordre de passage : <b>30 min</b> pour une paire, <b>45 min</b> pour une équipe,
          durée modifiable passage par passage. Une heure modifiée à la main range l&apos;équipe à sa place ;
          après un changement de durée, « Recalculer » réenchaîne les horaires.
        </p>
      </div>

      <div className="rounded-xl border border-blue-500/15 bg-white p-4 flex flex-wrap items-end gap-2">
        <div className="flex-1 min-w-[220px]">
          <label className="block text-xs font-semibold text-gray-600 mb-1">Engager une équipe</label>
          <select className={inp} value={aEngager} onChange={(e) => setAEngager(e.target.value)}>
            <option value="">{libres.length ? "— choisir une équipe —" : "Toutes les équipes sont engagées"}</option>
            {libres.map((g) => (
              <optgroup key={g.categorie} label={g.categorie}>
                {g.equipes.map((e) => <option key={e.id} value={e.id}>{e.nom}{e.indice ? ` · ${e.indice}` : ""}</option>)}
              </optgroup>
            ))}
          </select>
        </div>
        <button type="button" disabled={!aEngager} className={btnPrimaire}
          onClick={() => { changer((r) => engagerEquipes(saison, r, [aEngager])); setAEngager(""); }}>
          <Plus size={15} /> Engager
        </button>
        <button type="button" disabled={libres.length === 0} className={btnSecondaire}
          onClick={() => changer((r) => engagerEquipes(saison, r, libres.flatMap((g) => g.equipes.map((e) => e.id))))}>
          Engager toutes les équipes
        </button>
      </div>

      {engagements.length > 0 && <Alertes alertes={alertes} />}

      {engagements.length === 0 ? (
        <p className="text-sm text-gray-500 py-8 text-center border border-dashed border-gray-200 rounded-xl">
          Aucune équipe engagée à ce concours.
        </p>
      ) : (
        <div className="space-y-2">
          {engagements.map((g, i) => {
            const equipe = saison.equipes.find((e) => e.id === g.equipeId);
            if (!equipe) return null;
            return (
              <CartePassage key={g.equipeId} saison={saison} equipe={equipe} engagement={g} rang={i + 1}
                premier={i === 0} dernier={i === engagements.length - 1} changer={changer} />
            );
          })}
        </div>
      )}
    </div>
  );
}

function Alertes({ alertes }: { alertes: ReturnType<typeof verifierOrganisation> }) {
  if (alertes.length === 0) {
    return (
      <div className="rounded-xl bg-green-50 border border-green-200 px-4 py-2.5 text-sm text-green-800 inline-flex items-center gap-2">
        <CheckCircle2 size={16} /> Tous les passages ont un horaire, aucun poney ni cavalier n&apos;est pris à deux endroits.
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-3 space-y-1">
      {alertes.map((a, i) => (
        <div key={i} className={`text-sm flex items-start gap-2 ${a.gravite === "erreur" ? "text-red-700 font-semibold" : "text-amber-800"}`}>
          {a.gravite === "erreur" ? <AlertOctagon size={15} className="mt-0.5 shrink-0" /> : <AlertTriangle size={15} className="mt-0.5 shrink-0" />}
          {a.message}
        </div>
      ))}
    </div>
  );
}

function CartePassage({
  saison, equipe, engagement, rang, premier, dernier, changer,
}: {
  saison: SaisonPonyGames;
  equipe: EquipeSaison;
  engagement: NonNullable<ResultatConcours["engagements"]>[number];
  rang: number;
  premier: boolean;
  dernier: boolean;
  changer: Changer;
}) {
  const debut = minutes(engagement.heure);
  const g = engagement;
  const habituelle = dureeEpreuve(equipe);
  const duree = dureePassage(saison, g);
  const modifiee = duree !== habituelle;

  return (
    <div className="rounded-xl border border-blue-500/12 bg-white p-3.5">
      <div className="flex flex-wrap items-center gap-2 mb-2.5">
        <span className="w-7 h-7 rounded-full bg-blue-600 text-white text-xs font-bold inline-flex items-center justify-center shrink-0">{rang}</span>
        <div className="inline-flex items-center gap-1">
          <Clock size={14} className="text-gray-400" />
          <input key={`h-${g.heure ?? ""}`} type="time" className={`${inpSm} w-[110px]`} defaultValue={g.heure ?? ""}
            onBlur={(e) => e.target.value !== (g.heure ?? "") && changer((r) => poserHeure(r, equipe.id, e.target.value))} />
          <span className="text-xs text-gray-500 whitespace-nowrap">
            {debut !== undefined ? `→ ${heureLisible(versHeure(debut + duree))}` : ""}
          </span>
          <input key={`d-${duree}`} type="number" min={5} step={5} inputMode="numeric" title={`Durée du passage (habituellement ${habituelle} min)`}
            className={`${inpSm} w-[64px] text-center ${modifiee ? "border-amber-300 bg-amber-50 font-semibold" : ""}`}
            defaultValue={duree}
            onBlur={(e) => {
              const v = lireNombre(e.target.value);
              if (v !== duree) changer((r) => poserDuree(saison, r, equipe.id, v));
            }} />
          <span className="text-xs text-gray-500">min</span>
          {modifiee && (
            <button type="button" title={`Revenir à ${habituelle} min`} onClick={() => changer((r) => poserDuree(saison, r, equipe.id, undefined))}
              className="text-[11px] text-amber-700 hover:underline whitespace-nowrap">↺ {habituelle} min</button>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <span className="font-display font-bold text-gray-800">{equipe.nom}</span>
          <span className="text-xs text-gray-500 ml-2">{equipe.categorie || "Sans catégorie"}{equipe.indice ? ` · ${equipe.indice}` : ""}</span>
          <span className={`ml-2 px-2 py-0.5 rounded-full text-[11px] font-semibold ${estPaire(equipe) ? "bg-purple-50 text-purple-700" : "bg-blue-50 text-blue-700"}`}>
            {estPaire(equipe) ? "Paire" : "Équipe"}
          </span>
        </div>
        <button type="button" className={btnIcone} disabled={premier} title="Passer avant" onClick={() => changer((r) => deplacer(saison, r, equipe.id, -1))}><ArrowUp size={16} /></button>
        <button type="button" className={btnIcone} disabled={dernier} title="Passer après" onClick={() => changer((r) => deplacer(saison, r, equipe.id, 1))}><ArrowDown size={16} /></button>
        <button type="button" title="Retirer l'équipe de ce concours"
          onClick={() => confirm(`Retirer ${equipe.nom} de ce concours ?`) && changer((r) => desengager(r, equipe.id))}
          className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition"><X size={16} /></button>
      </div>

      {equipe.cavalierIds.length === 0 ? (
        <p className="text-xs text-gray-400">Aucun cavalier dans cette équipe (onglet Équipes).</p>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {equipe.cavalierIds.map((id) => {
            const c = saison.cavaliers.find((x) => x.id === id);
            if (!c) return null;
            return (
              <label key={id} className="flex items-center gap-2 text-sm">
                <span className="w-24 truncate text-gray-700 font-semibold" title={[c.prenom, c.nom].filter(Boolean).join(" ")}>{c.prenom}</span>
                <input key={`p-${id}-${g.poneys[id] ?? ""}`} list="pg-poneys" className={`${inpSm} flex-1 min-w-0`} placeholder="Poney…"
                  defaultValue={g.poneys[id] ?? ""}
                  onBlur={(e) => e.target.value.trim() !== (g.poneys[id] ?? "") && changer((r) => poserPoney(r, equipe.id, id, e.target.value))} />
              </label>
            );
          })}
          {besoinRemplacant(equipe) && (
            <label className="flex items-center gap-2 text-sm">
              <span className="w-24 text-pink-700 font-semibold">Remplaçant</span>
              <input key={`r-${g.remplacant ?? ""}`} list="pg-poneys" className={`${inpSm} flex-1 min-w-0 border-pink-200`} placeholder="Poney remplaçant…"
                defaultValue={g.remplacant ?? ""}
                onBlur={(e) => e.target.value.trim() !== (g.remplacant ?? "") && changer((r) => poserRemplacant(r, equipe.id, e.target.value))} />
            </label>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Résultats d'un concours ───────────────────────────────────────────────

function ResultatsConcours({ saison, maj, concours: r }: { saison: SaisonPonyGames; maj: Maj; concours: ResultatConcours }) {
  // Les équipes engagées si l'organisation est faite, sinon toutes celles de la saison.
  const engagees = new Set((r.engagements ?? []).map((g) => g.equipeId));
  const groupes = bilanSaison(saison)
    .map((g) => ({ ...g, equipes: engagees.size ? g.equipes.filter((b) => engagees.has(b.equipe.id)) : g.equipes }))
    .filter((g) => g.equipes.length > 0);

  const champ = (equipeId: string, cle: "rang" | "points", saisie: string) => {
    const actuel = r.classements.find((c) => c.equipeId === equipeId) ?? { equipeId };
    const valeurs = { rang: actuel.rang, points: actuel.points, [cle]: lireNombre(saisie) };
    maj((s) => saisirClassement(s, r.id, equipeId, valeurs));
  };

  if (groupes.length === 0) {
    return <p className="text-sm text-gray-500 py-8 text-center border border-dashed border-gray-200 rounded-xl">Crée d&apos;abord les équipes de la saison.</p>;
  }

  return (
    <div className="rounded-xl border border-blue-500/15 bg-white p-4">
      <p className="text-xs text-gray-500 mb-2">Saisis le classement et les points de chaque équipe ; laisse vide celles qui n&apos;ont pas couru.</p>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-gray-500 text-left">
            <th className="font-semibold py-1">Équipe</th>
            <th className="font-semibold py-1 w-24">Classement</th>
            <th className="font-semibold py-1 w-24">Points</th>
          </tr>
        </thead>
        <tbody>
          {groupes.map((g) => [
            <tr key={`g-${g.categorie}`}><td colSpan={3} className="pt-3 pb-1 text-xs font-bold text-blue-900 uppercase tracking-wide">{g.categorie}</td></tr>,
            ...g.equipes.map(({ equipe }) => {
              const c = r.classements.find((x) => x.equipeId === equipe.id);
              return (
                <tr key={equipe.id} className="border-t border-gray-100">
                  <td className="py-1.5 pr-2">
                    {equipe.nom}
                    {equipe.indice && <span className="text-xs text-gray-400 ml-1.5">{equipe.indice}</span>}
                  </td>
                  <td className="py-1.5 pr-2">
                    <input key={`${r.id}-${equipe.id}-rang-${c?.rang ?? ""}`} className={inp} inputMode="numeric" placeholder="—"
                      defaultValue={c?.rang ?? ""} onBlur={(e) => champ(equipe.id, "rang", e.target.value)} />
                  </td>
                  <td className="py-1.5">
                    <input key={`${r.id}-${equipe.id}-pts-${c?.points ?? ""}`} className={inp} inputMode="decimal" placeholder="—"
                      defaultValue={c?.points ?? ""} onBlur={(e) => champ(equipe.id, "points", e.target.value)} />
                  </td>
                </tr>
              );
            }),
          ])}
        </tbody>
      </table>
    </div>
  );
}
