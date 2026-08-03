/**
 * src/app/admin/management/journee-utils.ts
 *
 * Logique de la vue « Journée » isolée du rendu : rapprochement des cours
 * et des tâches par personne, détection des chevauchements, calcul de la
 * plage horaire. Aucune dépendance React — testable directement.
 */

import { CATEGORIES, JOURS } from "./types";
import type { JourSemaine, Salarie, TachePlanifiee } from "./types";
import { normalizeSearch } from "@/lib/search-normalize";

export const COURS_COLOR = "#2050A0";

export interface JourneeItem {
  id: string;
  kind: "cours" | "tache";
  label: string;
  sousTitre?: string;
  debut: number;   // minutes depuis minuit
  fin: number;
  couleur: string;
  conflit?: boolean;
  /** Categorie de tache (ecuries, soins…) ou "cours" — sert au filtre d'affichage. */
  categorie?: string;
}

export interface JourneeLigne {
  key: string;
  nom: string;
  couleur: string;
  items: JourneeItem[];
  sansFiche?: boolean;
  minutes: number;
  conflits: number;
}

export interface JourneeResultat {
  lignes: JourneeLigne[];
  personnesLibres: JourneeLigne[];
  plageDebut: number;
  plageFin: number;
  nbCours: number;
  nbTaches: number;
}

export const heureToMin = (h: string): number => {
  const [hh, mm] = String(h || "0:0").split(":").map(Number);
  return (hh || 0) * 60 + (mm || 0);
};

export const minToLabel = (m: number): string =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/** Jour de la semaine (lundi…dimanche) d'une date ISO "YYYY-MM-DD". */
export function jourSemaineDeDate(dateISO: string): JourSemaine {
  const d = new Date(dateISO + "T12:00:00");
  return JOURS[(d.getDay() + 6) % 7] as JourSemaine;
}

const COULEUR_PAUSE = CATEGORIES.find((c) => c.id === "pause")?.color;

/**
 * Assemble la journée : une ligne par personne, cours et tâches confondus.
 *
 * Le rapprochement cours ↔ salarié se fait sur le nom normalisé, car les
 * créneaux ne stockent qu'un nom en texte libre. Un moniteur sans fiche
 * équipe obtient sa propre ligne (`sansFiche`) au lieu d'être ignoré.
 */
export function construireJournee(params: {
  taches: TachePlanifiee[];
  salaries: Salarie[];
  creneaux: any[];
  dateISO: string;
}): JourneeResultat {
  const { taches, salaries, creneaux, dateISO } = params;
  const jourSemaine = jourSemaineDeDate(dateISO);
  const cle = (nom: string) => normalizeSearch(nom);

  const parCle = new Map<string, JourneeLigne>();
  for (const sal of salaries.filter((s) => s.actif)) {
    parCle.set(cle(sal.nom), {
      key: sal.id,
      nom: sal.nom,
      couleur: sal.couleur || "#64748b",
      items: [],
      minutes: 0,
      conflits: 0,
    });
  }

  // ── Tâches d'équipe du jour ─────────────────────────────────────────
  for (const tache of taches.filter((t) => t.jour === jourSemaine)) {
    const ligne = parCle.get(cle(tache.salarieName || ""))
      || Array.from(parCle.values()).find((l) => l.key === tache.salarieId);
    if (!ligne) continue;
    const debut = heureToMin(tache.heureDebut);
    ligne.items.push({
      id: `t_${tache.id}`,
      kind: "tache",
      categorie: (tache as any).categorie || "autre",
      label: tache.tacheLabel,
      debut,
      fin: debut + (tache.dureeMinutes || 0),
      couleur: (tache as any).color || CATEGORIES.find((c) => c.id === tache.categorie)?.color || "#64748b",
    });
  }

  // ── Cours et stages du jour ─────────────────────────────────────────
  for (const creneau of creneaux.filter((c: any) => c.date === dateISO && c.status !== "cancelled")) {
    const nomMonitor = String(creneau.monitor || "").trim();
    const cleMonitor = cle(nomMonitor);
    let ligne = cleMonitor ? parCle.get(cleMonitor) : undefined;

    if (!ligne) {
      const keySansFiche = cleMonitor || "__sans_moniteur__";
      ligne = parCle.get(keySansFiche);
      if (!ligne) {
        ligne = {
          key: keySansFiche,
          nom: nomMonitor || "Sans moniteur",
          couleur: nomMonitor ? "#7c3aed" : "#dc2626",
          items: [],
          minutes: 0,
          conflits: 0,
          sansFiche: true,
        };
        parCle.set(keySansFiche, ligne);
      }
    }

    const inscrits = creneau.enrolledCount ?? (creneau.enrolled || []).length;
    ligne.items.push({
      id: `c_${creneau.id}`,
      kind: "cours",
      categorie: "cours",
      label: creneau.activityTitle || "Cours",
      sousTitre: creneau.maxPlaces ? `${inscrits}/${creneau.maxPlaces}` : String(inscrits),
      debut: heureToMin(creneau.startTime),
      fin: heureToMin(creneau.endTime),
      couleur: COURS_COLOR,
    });
  }

  // ── Chevauchements + amplitude travaillée ───────────────────────────
  for (const ligne of parCle.values()) {
    ligne.items.sort((a, b) => a.debut - b.debut);
    for (let i = 0; i < ligne.items.length; i++) {
      for (let j = i + 1; j < ligne.items.length; j++) {
        if (ligne.items[j].debut < ligne.items[i].fin) {
          ligne.items[i].conflit = true;
          ligne.items[j].conflit = true;
        }
      }
    }
    ligne.conflits = ligne.items.filter((it) => it.conflit).length;

    const travail = ligne.items.filter(
      (it) => !(it.kind === "tache" && COULEUR_PAUSE && it.couleur === COULEUR_PAUSE),
    );
    if (travail.length > 0) {
      const debut = Math.min(...travail.map((it) => it.debut));
      const fin = Math.max(...travail.map((it) => it.fin));
      ligne.minutes = Math.max(0, fin - debut);
    }
  }

  const toutes = Array.from(parCle.values());
  const occupees = toutes.filter((l) => l.items.length > 0);
  const personnesLibres = toutes.filter((l) => l.items.length === 0 && !l.sansFiche);

  // Les personnes qui commencent le plus tôt en haut
  occupees.sort((a, b) => {
    const debutA = Math.min(...a.items.map((it) => it.debut));
    const debutB = Math.min(...b.items.map((it) => it.debut));
    if (debutA !== debutB) return debutA - debutB;
    return a.nom.localeCompare(b.nom, "fr");
  });

  const tousItems = occupees.flatMap((l) => l.items);
  let plageDebut = 8 * 60;
  let plageFin = 18 * 60;
  if (tousItems.length > 0) {
    plageDebut = Math.floor(Math.min(...tousItems.map((it) => it.debut)) / 60) * 60;
    plageFin = Math.ceil(Math.max(...tousItems.map((it) => it.fin)) / 60) * 60;
    if (plageFin - plageDebut < 120) plageFin = plageDebut + 120; // 2h mini, sinon grille écrasée
  }

  return {
    lignes: occupees,
    personnesLibres,
    plageDebut,
    plageFin,
    nbCours: tousItems.filter((it) => it.kind === "cours").length,
    nbTaches: tousItems.filter((it) => it.kind === "tache").length,
  };
}
