/**
 * src/app/admin/management/planning-utils.ts
 *
 * Tout ce que le semainier de l'équipe (TabPlanning) calcule SANS toucher à
 * React ni à Firestore : conversions d'heures, découpage des chevauchements,
 * compactage d'une journée, charge par salarié, détection des conflits et des
 * tâches obligatoires manquantes, synchronisation avec les cours du planning.
 *
 * Pourquoi séparé : ce sont les règles métier qui décident concrètement de
 * l'horaire écrit dans Firestore. Les isoler du composant permet de les lire
 * (et de les corriger) sans traverser 2 000 lignes de JSX, et garantit qu'un
 * changement d'affichage ne peut pas modifier un calcul d'horaire par accident.
 * Aucune de ces fonctions n'écrit en base : elles PRÉPARENT un plan que le
 * composant applique ensuite, ce qui permet de montrer un aperçu à valider.
 */

import type { JourSemaine, ModelePlanning, Salarie, TacheModele, TachePlanifiee, TacheType } from "./types";
import type { Conflit } from "./planning-types";
import { JOURS, calcTempsTravailJour } from "./types";

/** Créneaux de début proposés dans le formulaire d'ajout : 07:00 → 20:00 par pas de 15 min. */
export const TIME_SLOTS = Array.from({length: (20-7)*4+1}, (_,i) => {
  const totalMin = 7*60 + i*15;
  return `${String(Math.floor(totalMin/60)).padStart(2,"0")}:${String(totalMin%60).padStart(2,"0")}`;
});

/** Durées proposées dans les sélecteurs : du quart d'heure à 5 h, par pas de 15 min. */
export const DUREES_STANDARD = [15,30,45,60,75,90,105,120,135,150,165,180,195,210,225,240,255,270,285,300];

export function heureToMin(h: string) { const [hh,mm] = h.split(":").map(Number); return hh*60+mm; }
export function minToHeure(m: number) { return `${String(Math.floor(m/60)).padStart(2,"0")}:${String(m%60).padStart(2,"0")}`; }

// ── Découpage automatique des tâches chevauchées ───────────────────────────
// Quand on insère une nouvelle tâche [newStart, newEnd] (en minutes) sur un
// même salarié/jour, on ajuste les tâches existantes qui la chevauchent :
//   - entièrement à l'intérieur → coupée en deux (avant + après)
//   - chevauchement d'un côté   → raccourcie
//   - entièrement recouverte    → supprimée
export type DecoupeOps = {
  updates: { id: string; heureDebut: string; dureeMinutes: number; label: string; ancien: string }[];
  creates: { from: TachePlanifiee; heureDebut: string; dureeMinutes: number; label: string }[];
  deletes: { id: string; label: string; plage: string }[];
};
export function planDecoupage(existing: TachePlanifiee[], newStart: number, newEnd: number): DecoupeOps {
  const ops: DecoupeOps = { updates: [], creates: [], deletes: [] };
  for (const t of existing) {
    const s = heureToMin(t.heureDebut);
    const e = s + t.dureeMinutes;
    if (!(s < newEnd && e > newStart)) continue; // pas de chevauchement
    const beforeStart = s, beforeEnd = Math.min(e, newStart);
    const afterStart = Math.max(s, newEnd), afterEnd = e;
    const hasBefore = beforeEnd > beforeStart;
    const hasAfter = afterEnd > afterStart;
    const ancien = `${t.heureDebut}→${minToHeure(e)}`;
    if (hasBefore && hasAfter) {
      ops.updates.push({ id: t.id, heureDebut: minToHeure(beforeStart), dureeMinutes: beforeEnd - beforeStart, label: t.tacheLabel, ancien });
      ops.creates.push({ from: t, heureDebut: minToHeure(afterStart), dureeMinutes: afterEnd - afterStart, label: t.tacheLabel });
    } else if (hasBefore) {
      ops.updates.push({ id: t.id, heureDebut: minToHeure(beforeStart), dureeMinutes: beforeEnd - beforeStart, label: t.tacheLabel, ancien });
    } else if (hasAfter) {
      ops.updates.push({ id: t.id, heureDebut: minToHeure(afterStart), dureeMinutes: afterEnd - afterStart, label: t.tacheLabel, ancien });
    } else {
      ops.deletes.push({ id: t.id, label: t.tacheLabel, plage: ancien });
    }
  }
  return ops;
}

/**
 * Arrondit une duree au quart d'heure le plus proche, avec un minimum de
 * 15 min. Utilise pour les pre-remplissages depuis tachesType (qui peuvent
 * avoir des durees non-multiples de 15 comme 5, 10 ou 20 min).
 */
export function roundToQuarter(min: number): number {
  if (min <= 15) return 15;
  return Math.round(min / 15) * 15;
}

/** Numéro de semaine ISO ("2026-W15") d'une date — sert à la navigation semaine précédente/suivante. */
export function getISO(date: Date) {
  const d = new Date(date); d.setHours(0,0,0,0);
  d.setDate(d.getDate()+3-((d.getDay()+6)%7));
  const w1 = new Date(d.getFullYear(),0,4);
  const wn = 1+Math.round(((d.getTime()-w1.getTime())/86400000-3+((w1.getDay()+6)%7))/7);
  return `${d.getFullYear()}-W${String(wn).padStart(2,"0")}`;
}

// ── Compacter la journée d'un salarié ────────────────────────────────
/**
 * Tasse les tâches manuelles dans la journée pour combler les trous,
 * en respectant les tâches importées du planning (cours/stages) comme
 * des "ancres" temporelles fixes.
 *
 * Algorithme :
 * 1. Récupère toutes les tâches du salarié pour ce jour, triées par heure.
 * 2. Identifie les "ancres" (tacheTypeId === "__planning__") : leurs
 *    horaires sont imposés et ne bougent jamais.
 * 3. Sépare les tâches manuelles en groupes selon leur position vs ancres :
 *    - "avant la 1ère ancre"
 *    - "entre ancre N et ancre N+1"
 *    - "après la dernière ancre"
 * 4. Dans chaque groupe : on tasse les tâches en partant de l'extrémité
 *    de l'ancre précédente (ou de la 1ère heure si pas d'ancre avant).
 *    Une tâche qui dépasserait sur l'ancre suivante n'est PAS rognée :
 *    on prévient l'admin via toast et on la laisse à sa place originale.
 *
 * Cas particulier : la 1ère tâche manuelle "avant ancre" garde son heure
 * de début si elle n'a pas de prédécesseur (elle sert de point de départ
 * de la chaîne de compactage).
 *
 * Ne fait AUCUNE écriture : renvoie les décalages à appliquer (`updates`) et
 * les tâches bloquées (`conflits`), que l'appelant confirme puis commite.
 */
export function planifierCompactage(dayTaches: TachePlanifiee[]): {
  updates: { id: string; oldHeure: string; newHeure: string }[];
  conflits: string[];
} {
  // 2. Indice des ancres dans le tableau trié
  const ancreIndices: number[] = [];
  dayTaches.forEach((t, i) => { if (t.tacheTypeId === "__planning__") ancreIndices.push(i); });

  // 3. Calculer les nouveaux horaires en simulation (sans écrire)
  const updates: { id: string; oldHeure: string; newHeure: string }[] = [];
  const conflits: string[] = [];

  // Helper : pour une plage [startMin, limitMin] et une liste d'indices
  // de tâches manuelles, on les tasse en partant de startMin.
  const tasserPlage = (indices: number[], startMin: number, limitMin: number | null) => {
    let cursor = startMin;
    for (const idx of indices) {
      const t = dayTaches[idx];
      const newDebut = cursor;
      const newFin = newDebut + t.dureeMinutes;
      if (limitMin !== null && newFin > limitMin) {
        // La tâche déborderait sur l'ancre suivante : on ne la déplace pas
        conflits.push(`${t.tacheLabel} (${t.heureDebut})`);
        // On laisse cette tâche à sa place originale et on reprend après
        cursor = heureToMin(t.heureDebut) + t.dureeMinutes;
        continue;
      }
      const newHeure = minToHeure(newDebut);
      if (newHeure !== t.heureDebut) {
        updates.push({ id: t.id, oldHeure: t.heureDebut, newHeure });
      }
      cursor = newFin;
    }
  };

  if (ancreIndices.length === 0) {
    // Pas d'ancre : on tasse toutes les tâches manuelles depuis la
    // 1ère, qui garde son heure de début comme point d'ancrage de chaîne.
    const firstHeure = heureToMin(dayTaches[0].heureDebut);
    const indices = dayTaches.map((_, i) => i).filter(i => dayTaches[i].tacheTypeId !== "__planning__");
    tasserPlage(indices, firstHeure, null);
  } else {
    // Avant la 1ère ancre : on tasse en remontant depuis l'ancre
    // (la dernière tâche manuelle finit pile à l'heure de l'ancre).
    // Stratégie alternative plus simple : on garde la 1ère manuelle
    // à son heure originale, on tasse les suivantes à la chaîne.
    const before = dayTaches.slice(0, ancreIndices[0])
      .map((_, i) => i).filter(i => dayTaches[i].tacheTypeId !== "__planning__");
    if (before.length > 0) {
      const firstHeure = heureToMin(dayTaches[before[0]].heureDebut);
      const ancreHeure = heureToMin(dayTaches[ancreIndices[0]].heureDebut);
      tasserPlage(before, firstHeure, ancreHeure);
    }

    // Entre chaque paire d'ancres : on tasse depuis la fin de l'ancre N
    // jusqu'au début de l'ancre N+1.
    for (let a = 0; a < ancreIndices.length - 1; a++) {
      const ancreA = dayTaches[ancreIndices[a]];
      const ancreFinMin = heureToMin(ancreA.heureDebut) + ancreA.dureeMinutes;
      const ancreBmin = heureToMin(dayTaches[ancreIndices[a + 1]].heureDebut);
      const between: number[] = [];
      for (let i = ancreIndices[a] + 1; i < ancreIndices[a + 1]; i++) {
        if (dayTaches[i].tacheTypeId !== "__planning__") between.push(i);
      }
      if (between.length > 0) tasserPlage(between, ancreFinMin, ancreBmin);
    }

    // Après la dernière ancre
    const lastAncre = dayTaches[ancreIndices[ancreIndices.length - 1]];
    const lastAncreFinMin = heureToMin(lastAncre.heureDebut) + lastAncre.dureeMinutes;
    const after: number[] = [];
    for (let i = ancreIndices[ancreIndices.length - 1] + 1; i < dayTaches.length; i++) {
      if (dayTaches[i].tacheTypeId !== "__planning__") after.push(i);
    }
    if (after.length > 0) tasserPlage(after, lastAncreFinMin, null);
  }

  return { updates, conflits };
}

// ── Détection des doublons à l'application d'un modèle ────────────────
// Une tâche est en doublon si même (salarieId, jour, heureDebut, tacheTypeId).
export function detecterDoublonsModele(modele: ModelePlanning, taches: TachePlanifiee[]): {
  duplicates: { existante: TachePlanifiee; nouvelle: TacheModele }[];
  nouvelles: TacheModele[];
} {
  const duplicates: { existante: TachePlanifiee; nouvelle: TacheModele }[] = [];
  const nouvelles: TacheModele[] = [];
  for (const tm of modele.taches) {
    const existante = taches.find(t =>
      t.salarieId === tm.salarieId &&
      t.jour === tm.jour &&
      t.heureDebut === tm.heureDebut &&
      t.tacheTypeId === tm.tacheTypeId
    );
    if (existante) duplicates.push({ existante, nouvelle: tm });
    else nouvelles.push(tm);
  }
  return { duplicates, nouvelles };
}

// ── Liste des imports distincts de la semaine (pour le bouton "Annuler") ──
// Regroupe les tâches par importBatchId pour proposer une annulation ciblée.
export function regrouperImportsDeLaSemaine(taches: TachePlanifiee[]) {
  const groups: Record<string, { batchId: string; nom: string; count: number; date: Date | null }> = {};
  for (const t of taches) {
    if (!t.importBatchId) continue;
    const key = t.importBatchId;
    if (!groups[key]) {
      const importedAt = t.importedAt?.toDate?.() || null;
      groups[key] = {
        batchId: key,
        nom: t.importedFromModeleNom || "Modèle inconnu",
        count: 0,
        date: importedAt,
      };
    }
    groups[key].count++;
  }
  // Tri du plus récent au plus ancien (les imports sans date à la fin)
  return Object.values(groups).sort((a, b) => {
    if (!a.date) return 1;
    if (!b.date) return -1;
    return b.date.getTime() - a.date.getTime();
  });
}

// Calcul charge par salarié (minutes totales / semaine)
// Charge par salarié = somme par jour de (amplitude première→dernière tâche − pauses explicites).
// Cohérent avec TabHoraires : les battements courts entre tâches non-pause sont comptés.
export function calculerChargeParSalarie(taches: TachePlanifiee[], joursActifs: JourSemaine[]): Record<string, number> {
  const map: Record<string, number> = {};
  const salIds = [...new Set(taches.map(t => t.salarieId))];
  for (const salId of salIds) {
    let total = 0;
    for (const jour of joursActifs) {
      const dayT = taches.filter(t => t.salarieId === salId && t.jour === jour);
      total += calcTempsTravailJour(dayT);
    }
    map[salId] = total;
  }
  return map;
}

// ── Détection automatique des tâches obligatoires manquantes ───────────
export function detecterTachesManquantes(
  tachesObligatoires: TacheType[],
  taches: TachePlanifiee[],
  joursTravailles: JourSemaine[]
): { tache: TacheType; jour: JourSemaine }[] {
  const manquantes: { tache: TacheType; jour: JourSemaine }[] = [];
  for (const tt of tachesObligatoires) {
    // Jours attendus : joursObligatoires > joursDefaut > lun-ven
    const joursConfig = (tt.joursObligatoires && tt.joursObligatoires.length > 0)
      ? tt.joursObligatoires
      : (tt.joursDefaut && tt.joursDefaut.length > 0)
        ? tt.joursDefaut
        : JOURS.slice(0, 5) as JourSemaine[];
    // Filtrer par les jours réellement travaillés cette semaine
    const joursAttendus = joursConfig.filter(j => joursTravailles.includes(j));
    for (const jour of joursAttendus) {
      const exists = taches.some(t => t.tacheTypeId === tt.id && t.jour === jour);
      const existsByLabel = taches.some(t => t.tacheLabel === tt.label && t.jour === jour);
      if (!exists && !existsByLabel) {
        manquantes.push({ tache: tt, jour });
      }
    }
  }
  return manquantes;
}

// ── Détection des conflits horaires (même salarié, même jour, chevauchement) ─
export function detecterConflits(taches: TachePlanifiee[], joursActifs: JourSemaine[]): Conflit[] {
  const result: Conflit[] = [];
  const salIds = [...new Set(taches.map(t => t.salarieId))];
  for (const salId of salIds) {
    for (const jour of joursActifs) {
      const jourTaches = taches
        .filter(t => t.salarieId === salId && t.jour === jour)
        .sort((a, b) => a.heureDebut.localeCompare(b.heureDebut));
      for (let i = 0; i < jourTaches.length; i++) {
        const t1 = jourTaches[i];
        const fin1 = heureToMin(t1.heureDebut) + t1.dureeMinutes;
        for (let j = i + 1; j < jourTaches.length; j++) {
          const t2 = jourTaches[j];
          const debut2 = heureToMin(t2.heureDebut);
          if (debut2 < fin1) {
            // Chevauchement détecté
            result.push({
              salarieName: t1.salarieName,
              salarieId: salId,
              jour,
              tache1: t1,
              tache2: t2,
            });
          }
        }
      }
    }
  }
  return result;
}

// ── Import des cours/stages du planning dans les tâches ────────────────
export interface CreneauCible {
  creneau: any;
  salarieId: string;
  salarieName: string;
  jour: JourSemaine;
}

/**
 * Prépare la synchronisation « cours/stages du planning → tâches d'équipe ».
 *
 * Synchro NON destructive : on garde les cours/stages déjà importés (et leur
 * statut 'fait'), on crée seulement les manquants, on retire les obsolètes.
 * Clé d'unicité d'un cours/stage : salarié + jour + heure + titre.
 * Les tâches manuelles (vrai tacheTypeId) ne sont JAMAIS touchées.
 */
export function planifierSynchroCreneaux(params: {
  dates: { jour: JourSemaine; dateStr: string }[];
  creneaux: any[];
  salaries: Salarie[];
  taches: TachePlanifiee[];
  semaine: string;
}): { targetCreneaux: CreneauCible[]; aCreer: CreneauCible[]; aSupprimer: TachePlanifiee[]; nbGardees: number } {
  const { dates, creneaux, salaries, taches, semaine } = params;

  // ── 1. Lister tout ce qu'il faudrait avoir après import ──
  // (= les créneaux du planning de la semaine qui ont un moniteur reconnu)
  const targetCreneaux: CreneauCible[] = [];

  for (const { jour, dateStr } of dates) {
    const dayCr = creneaux.filter(c => c.date === dateStr && c.monitor);
    for (const c of dayCr) {
      // Supporter plusieurs moniteurs séparés par virgule
      const monitorNames = (c.monitor || "").split(",").map((s: string) => s.trim()).filter(Boolean);
      for (const monitorName of monitorNames) {
        const monitorLower = monitorName.toLowerCase();
        const sal = salaries.find(s =>
          s.actif && s.nom.toLowerCase().trim() === monitorLower
        );
        if (sal) {
          targetCreneaux.push({ creneau: c, salarieId: sal.id, salarieName: sal.nom, jour });
        }
      }
    }
  }

  // ── 2. Synchro non destructive : on garde les cours/stages déjà importés ──
  const keyOf = (salarieId: string, jour: string, heure: string, label: string) =>
    `${salarieId}|${jour}|${heure}|${(label || "").trim()}`;

  const existantes = taches.filter(t =>
    t.tacheTypeId === "__planning__" && t.semaine === semaine
  );
  const existKeys = new Map<string, TachePlanifiee>();
  existantes.forEach(t => existKeys.set(keyOf(t.salarieId, t.jour, t.heureDebut, t.tacheLabel), t));

  const aCreer: CreneauCible[] = [];
  const keysVues = new Set<string>();
  for (const tc of targetCreneaux) {
    const k = keyOf(tc.salarieId, tc.jour, tc.creneau.startTime, tc.creneau.activityTitle);
    if (keysVues.has(k)) continue;       // doublon entre deux créneaux identiques → ignoré
    keysVues.add(k);
    if (!existKeys.has(k)) aCreer.push(tc); // déjà présent → on garde, sinon à créer
  }
  // Obsolètes : tâches __planning__ qui ne correspondent plus à aucun créneau actuel
  const aSupprimer = existantes.filter(t =>
    !keysVues.has(keyOf(t.salarieId, t.jour, t.heureDebut, t.tacheLabel))
  );
  const nbGardees = existantes.length - aSupprimer.length;

  return { targetCreneaux, aCreer, aSupprimer, nbGardees };
}
