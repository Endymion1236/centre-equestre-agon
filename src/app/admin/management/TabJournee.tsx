"use client";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ChevronLeft, ChevronRight, Users } from "lucide-react";
import type { Salarie, TachePlanifiee } from "./types";
import { JOURS_LABELS, fmtDuree, getISOWeek } from "./types";
import { COURS_COLOR, construireJournee, jourSemaineDeDate, minToLabel } from "./journee-utils";
import { CATEGORIES } from "./types";
import { toLocalDateString } from "@/lib/date-local";

/**
 * Vue « Journée » — qui fait quoi, quand, sur une seule page.
 *
 * Réunit les DEUX sources qui étaient jusqu'ici séparées :
 *   - les cours et stages (collection `creneaux`, champ `monitor` en texte)
 *   - les tâches d'équipe (collection `taches-planifiees`, liées à un salarié)
 *
 * Toute la logique d'assemblage vit dans `journee-utils.ts` (testée
 * unitairement) ; ce fichier ne fait que l'afficher.
 */

const PX_PAR_HEURE = 78;      // largeur d'une heure sur la frise
const COL_NOM = 132;          // largeur de la colonne des noms

interface Props {
  semaine: string;
  setSemaine: (s: string) => void;
  taches: TachePlanifiee[];
  salaries: Salarie[];
  creneaux: any[];
}

export default function TabJournee({ semaine, setSemaine, taches, salaries, creneaux }: Props) {
  const [dateISO, setDateISO] = useState(() => toLocalDateString());
  // Heure courante — calculée côté client uniquement (évite un écart au rendu serveur)
  const [maintenant, setMaintenant] = useState<number | null>(null);

  // Filtre d'affichage : la vue globale devient illisible quand tout est
  // detaille — on choisit ce qu'on regarde (cours & balades, nourrir les
  // poneys, menage…). Choix conserve d'une visite a l'autre (localStorage) :
  // c'est un reglage d'usage personnel, pas une donnee metier.
  const [categoriesMasquees, setCategoriesMasquees] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const brut = window.localStorage.getItem("journee_categories_masquees");
      return new Set(brut ? (JSON.parse(brut) as string[]) : []);
    } catch { return new Set(); }
  });
  const basculerCategorie = (id: string) => {
    setCategoriesMasquees((prev) => {
      const suivant = new Set(prev);
      if (suivant.has(id)) suivant.delete(id); else suivant.add(id);
      try { window.localStorage.setItem("journee_categories_masquees", JSON.stringify([...suivant])); } catch {}
      return suivant;
    });
  };
  const itemVisible = (it: { categorie?: string }) => !categoriesMasquees.has(it.categorie || "autre");

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setMaintenant(now.getHours() * 60 + now.getMinutes());
    };
    tick();
    const timer = setInterval(tick, 60_000);
    return () => clearInterval(timer);
  }, []);

  // Naviguer d'un jour : si on change de semaine ISO, le parent recharge les tâches
  const decalerJour = (delta: number) => {
    const d = new Date(dateISO + "T12:00:00");
    d.setDate(d.getDate() + delta);
    const nouvelle = toLocalDateString(d);
    setDateISO(nouvelle);
    const semaineCible = getISOWeek(d);
    if (semaineCible !== semaine) setSemaine(semaineCible);
  };

  const allerAujourdhui = () => {
    const aujourd = toLocalDateString();
    setDateISO(aujourd);
    const semaineCible = getISOWeek(new Date());
    if (semaineCible !== semaine) setSemaine(semaineCible);
  };

  const dateObj = new Date(dateISO + "T12:00:00");
  const estAujourdhui = dateISO === toLocalDateString();
  const jourSemaine = jourSemaineDeDate(dateISO);

  const { lignes, personnesLibres, plageDebut, plageFin, nbCours, nbTaches } = useMemo(
    () => construireJournee({ taches, salaries, creneaux, dateISO }),
    [taches, salaries, creneaux, dateISO],
  );

  const dureePlage = plageFin - plageDebut;
  const largeurFrise = (dureePlage / 60) * PX_PAR_HEURE;
  const heures = Array.from({ length: Math.ceil(dureePlage / 60) + 1 }, (_, i) => plageDebut + i * 60);
  const pct = (min: number) => ((min - plageDebut) / dureePlage) * 100;
  const totalConflits = lignes.reduce((sum, l) => sum + (l.conflits > 0 ? 1 : 0), 0);

  return (
    <div className="flex flex-col gap-4">
      {/* ── Barre de navigation ──────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => decalerJour(-1)}
            className="flex items-center justify-center w-9 h-9 rounded-lg bg-white border border-gray-200 text-slate-600 cursor-pointer hover:border-blue-300"
            title="Jour précédent"
          >
            <ChevronLeft size={16} />
          </button>
          <div className="min-w-[190px] text-center">
            <div className="font-display text-lg font-bold text-blue-800 capitalize leading-tight">
              {JOURS_LABELS[jourSemaine]} {dateObj.getDate()}
            </div>
            <div className="font-body text-xs text-slate-500 capitalize">
              {dateObj.toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}
            </div>
          </div>
          <button
            type="button"
            onClick={() => decalerJour(1)}
            className="flex items-center justify-center w-9 h-9 rounded-lg bg-white border border-gray-200 text-slate-600 cursor-pointer hover:border-blue-300"
            title="Jour suivant"
          >
            <ChevronRight size={16} />
          </button>
          {!estAujourdhui && (
            <button
              type="button"
              onClick={allerAujourdhui}
              className="font-body text-xs font-semibold text-blue-600 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 cursor-pointer hover:bg-blue-100"
            >
              Aujourd’hui
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 font-body text-xs">
          <span className="inline-flex items-center gap-1.5 bg-white border border-gray-200 rounded-lg px-3 py-2 text-slate-600">
            <Users size={13} className="text-slate-400" />
            <strong className="text-blue-800">{lignes.length}</strong> en poste
          </span>
          <span className="bg-white border border-gray-200 rounded-lg px-3 py-2 text-slate-600">
            <strong className="text-blue-800">{nbCours}</strong> cours
          </span>
          <span className="bg-white border border-gray-200 rounded-lg px-3 py-2 text-slate-600">
            <strong className="text-blue-800">{nbTaches}</strong> tâches
          </span>
          {totalConflits > 0 && (
            <span className="inline-flex items-center gap-1.5 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-red-700 font-semibold">
              <AlertTriangle size={13} />
              {totalConflits} chevauchement{totalConflits > 1 ? "s" : ""}
            </span>
          )}
        </div>
      </div>

      {/* Filtre d'affichage par type d'element */}
      <div className="flex flex-wrap gap-1.5 mb-3">
            {[{ id: "cours", label: "Cours & balades", emoji: "🏇", color: "#2050A0" }, ...CATEGORIES].map((c) => {
              const masque = categoriesMasquees.has(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => basculerCategorie(c.id)}
                  title={masque ? "Cliquer pour réafficher" : "Cliquer pour masquer"}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full font-body text-[11px] font-semibold border cursor-pointer transition-opacity ${masque ? "opacity-35 bg-gray-100 text-gray-500 border-gray-200 line-through" : "text-white border-transparent"}`}
                  style={masque ? undefined : { background: c.color }}
                >
                  {c.emoji} {c.label}
                </button>
              );
            })}
          </div>

      {/* ── Frise ────────────────────────────────────────────────────── */}
      {lignes.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-2xl py-14 text-center">
          <div className="text-3xl mb-2">🌤️</div>
          <div className="font-display text-base font-bold text-blue-800">Rien de planifié ce jour-là</div>
          <p className="font-body text-sm text-slate-500 mt-1">
            Ni cours, ni tâche d’équipe pour le {JOURS_LABELS[jourSemaine].toLowerCase()} {dateObj.getDate()}.
          </p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <div style={{ minWidth: COL_NOM + largeurFrise }}>
              {/* Règle des heures */}
              <div className="flex border-b border-gray-100 bg-gray-50/60 sticky top-0 z-10">
                <div style={{ width: COL_NOM }} className="shrink-0 border-r border-gray-100" />
                <div className="relative flex-1 h-8">
                  {heures.map((h) => (
                    <div
                      key={h}
                      className="absolute top-0 h-full flex items-center"
                      style={{ left: `${pct(h)}%` }}
                    >
                      <span className="font-body text-[10px] font-semibold text-slate-400 -translate-x-1/2 px-1">
                        {minToLabel(h)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>


              {/* Une ligne par personne */}
              {lignes
                .map((ligne) => ({ ...ligne, items: ligne.items.filter(itemVisible) }))
                .filter((ligne) => ligne.items.length > 0 || categoriesMasquees.size === 0)
                .map((ligne) => (
                <div key={ligne.key} className="flex border-b border-gray-50 last:border-b-0 group">
                  {/* Nom */}
                  <div
                    style={{ width: COL_NOM }}
                    className="shrink-0 border-r border-gray-100 px-3 py-2.5 flex items-center gap-2"
                  >
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ background: ligne.couleur }}
                    />
                    <div className="min-w-0">
                      <div className="font-body text-xs font-bold text-blue-800 truncate leading-tight">
                        {ligne.nom}
                      </div>
                      <div className="font-body text-[10px] text-slate-400 flex items-center gap-1">
                        {fmtDuree(ligne.minutes)}
                        {ligne.conflits > 0 && <AlertTriangle size={9} className="text-red-500" />}
                        {ligne.sansFiche && <span title="Pas de fiche équipe">·&nbsp;hors&nbsp;équipe</span>}
                      </div>
                    </div>
                  </div>

                  {/* Blocs */}
                  <div className="relative flex-1 h-[52px]">
                    {/* Repères horaires */}
                    {heures.map((h) => (
                      <div
                        key={h}
                        className="absolute top-0 bottom-0 w-px bg-gray-100"
                        style={{ left: `${pct(h)}%` }}
                      />
                    ))}

                    {/* Ligne « maintenant » */}
                    {estAujourdhui && maintenant !== null && maintenant >= plageDebut && maintenant <= plageFin && (
                      <div
                        className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-20 pointer-events-none"
                        style={{ left: `${pct(maintenant)}%` }}
                      />
                    )}

                    {ligne.items.map((item) => {
                      const gauche = pct(item.debut);
                      const largeur = Math.max(pct(item.fin) - gauche, 1.5);
                      const estCours = item.kind === "cours";
                      return (
                        <div
                          key={item.id}
                          title={`${minToLabel(item.debut)}–${minToLabel(item.fin)} · ${item.label}${item.conflit ? " ⚠️ chevauchement" : ""}`}
                          className={`absolute top-1.5 bottom-1.5 rounded-lg px-2 py-1 overflow-hidden flex flex-col justify-center ${
                            item.conflit ? "ring-2 ring-red-400" : ""
                          }`}
                          style={{
                            left: `${gauche}%`,
                            width: `${largeur}%`,
                            background: estCours ? item.couleur : `${item.couleur}1a`,
                            borderLeft: estCours ? "none" : `3px solid ${item.couleur}`,
                          }}
                        >
                          <span
                            className={`font-body text-[11px] font-semibold truncate leading-tight ${estCours ? "text-white" : ""}`}
                            style={estCours ? undefined : { color: item.couleur }}
                          >
                            {item.label}
                          </span>
                          <span
                            className={`font-body text-[9px] truncate leading-tight ${estCours ? "text-white/75" : "text-slate-500"}`}
                          >
                            {minToLabel(item.debut)}
                            {item.sousTitre ? ` · ${item.sousTitre}` : ""}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Légende + personnes sans rien ────────────────────────────── */}
      <div className="flex items-center justify-between gap-4 flex-wrap font-body text-[11px] text-slate-500">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3.5 h-3.5 rounded" style={{ background: COURS_COLOR }} />
            Cours &amp; stages
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3.5 h-3.5 rounded bg-slate-200 border-l-[3px] border-slate-400" />
            Tâches d’équipe
          </span>
          {estAujourdhui && (
            <span className="inline-flex items-center gap-1.5">
              <span className="w-0.5 h-3.5 bg-red-500" />
              Maintenant
            </span>
          )}
        </div>
        {personnesLibres.length > 0 && (
          <div className="text-slate-400">
            Sans rien de planifié : {personnesLibres.map((l) => l.nom).join(", ")}
          </div>
        )}
      </div>
    </div>
  );
}
