// =============================================================================
// Organisation d'un concours de la saison — logique pure
// -----------------------------------------------------------------------------
// Pour chaque concours : les équipes engagées dans l'ordre de passage, leur
// horaire, le poney de chaque cavalier et le poney remplaçant (équipes de 4
// cavaliers et paires). Une épreuve en paire dure 30 min, en équipe 45 min :
// les horaires s'enchaînent à partir de l'heure du premier passage, et les
// vérifications signalent un poney ou un cavalier pris à deux endroits.
// =============================================================================

import type { EngagementConcours, EquipeSaison, ResultatConcours, SaisonPonyGames } from "./saisons";

export const DUREE_PAIRE_MIN = 30;
export const DUREE_EQUIPE_MIN = 45;

/** Paire : la catégorie le dit (« Paire minime »), ou à défaut l'équipe n'a que 2 cavaliers. */
export function estPaire(e: EquipeSaison): boolean {
  if (/\bpaires?\b/i.test(e.categorie)) return true;
  if (e.categorie.trim()) return false;
  return e.cavalierIds.length === 2;
}

export function dureeEpreuve(e: EquipeSaison): number {
  return estPaire(e) ? DUREE_PAIRE_MIN : DUREE_EQUIPE_MIN;
}

/** Un poney remplaçant est prévu quand l'équipe compte 4 cavaliers, ou 2 (paire). */
export function besoinRemplacant(e: EquipeSaison): boolean {
  return e.cavalierIds.length === 4 || e.cavalierIds.length === 2;
}

// ─── Heures ────────────────────────────────────────────────────────────────

/** « 9:05 », « 09h05 », « 9h » → minutes depuis minuit ; invalide → undefined. */
export function minutes(heure?: string): number | undefined {
  const m = (heure ?? "").trim().match(/^(\d{1,2})\s*[:hH]\s*(\d{2})?$/);
  if (!m) return undefined;
  const h = Number(m[1]);
  const mn = Number(m[2] ?? 0);
  if (h > 23 || mn > 59) return undefined;
  return h * 60 + mn;
}

export function versHeure(total: number): string {
  const t = ((total % 1440) + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

/** « 09h00 » pour l'affichage. */
export function heureLisible(heure?: string): string {
  const m = minutes(heure);
  return m === undefined ? "—" : versHeure(m).replace(":", "h");
}

// ─── Engagements ───────────────────────────────────────────────────────────

const equipeDe = (s: SaisonPonyGames, id: string) => s.equipes.find((e) => e.id === id);

/** Modifie un concours de la saison. */
export function majConcours(
  s: SaisonPonyGames,
  concoursId: string,
  f: (r: ResultatConcours) => ResultatConcours,
): SaisonPonyGames {
  return { ...s, resultats: s.resultats.map((r) => (r.id === concoursId ? f(r) : r)) };
}

/** Fin de la dernière épreuve qui a un horaire, sinon l'heure de début du concours. */
function prochaineHeureLibre(s: SaisonPonyGames, liste: EngagementConcours[], heureDebut?: string): number | undefined {
  let fin: number | undefined;
  for (const g of liste) {
    const d = minutes(g.heure);
    const e = equipeDe(s, g.equipeId);
    if (d === undefined || !e) continue;
    fin = Math.max(fin ?? 0, d + dureeEpreuve(e));
  }
  return fin ?? minutes(heureDebut);
}

/**
 * Engage des équipes à la suite, sans doublon. Chacune reçoit l'horaire qui
 * suit la dernière épreuve (ou l'heure de début) : les horaires déjà posés,
 * même à la main, ne bougent pas.
 */
export function engagerEquipes(s: SaisonPonyGames, r: ResultatConcours, equipeIds: string[]): ResultatConcours {
  const liste = [...(r.engagements ?? [])];
  const deja = new Set(liste.map((g) => g.equipeId));
  for (const equipeId of equipeIds) {
    const e = equipeDe(s, equipeId);
    if (deja.has(equipeId) || !e) continue;
    deja.add(equipeId);
    const debut = prochaineHeureLibre(s, liste, r.heureDebut);
    liste.push({ equipeId, poneys: {}, ...(debut === undefined ? {} : { heure: versHeure(debut) }) });
  }
  return { ...r, engagements: liste };
}

/** Retire une équipe ; les autres gardent leur horaire (« Recalculer » resserre le planning). */
export function desengager(r: ResultatConcours, equipeId: string): ResultatConcours {
  return { ...r, engagements: (r.engagements ?? []).filter((g) => g.equipeId !== equipeId) };
}

/** Avance (-1) ou recule (+1) une équipe dans l'ordre de passage. */
export function deplacer(s: SaisonPonyGames, r: ResultatConcours, equipeId: string, sens: -1 | 1): ResultatConcours {
  const liste = [...(r.engagements ?? [])];
  const i = liste.findIndex((g) => g.equipeId === equipeId);
  const j = i + sens;
  if (i < 0 || j < 0 || j >= liste.length) return r;
  [liste[i], liste[j]] = [liste[j], liste[i]];
  return avecHoraires(s, { ...r, engagements: liste });
}

/**
 * Horaires enchaînés depuis l'heure de début, dans l'ordre de passage :
 * chaque épreuve commence quand la précédente finit (30 min une paire, 45 une équipe).
 * Sans heure de début valide, le concours est rendu tel quel.
 */
export function avecHoraires(s: SaisonPonyGames, r: ResultatConcours): ResultatConcours {
  let curseur = minutes(r.heureDebut);
  if (curseur === undefined) return r;
  const engagements = (r.engagements ?? []).map((g) => {
    const e = equipeDe(s, g.equipeId);
    const heure = versHeure(curseur!);
    curseur! += e ? dureeEpreuve(e) : DUREE_EQUIPE_MIN;
    return { ...g, heure };
  });
  return { ...r, engagements };
}

/** Heure posée à la main : on range ensuite les équipes par horaire (sans horaire en dernier). */
export function poserHeure(r: ResultatConcours, equipeId: string, heure: string): ResultatConcours {
  const m = minutes(heure);
  const engagements = (r.engagements ?? []).map((g) =>
    g.equipeId === equipeId ? { ...g, heure: m === undefined ? undefined : versHeure(m) } : g,
  );
  return { ...r, engagements: trierParHoraire(engagements) };
}

export function trierParHoraire(liste: EngagementConcours[]): EngagementConcours[] {
  return liste
    .map((g, i) => ({ g, i, m: minutes(g.heure) }))
    .sort((a, b) => (a.m ?? Infinity) - (b.m ?? Infinity) || a.i - b.i)
    .map((x) => x.g);
}

export function poserPoney(r: ResultatConcours, equipeId: string, cavalierId: string, poney: string): ResultatConcours {
  return {
    ...r,
    engagements: (r.engagements ?? []).map((g) => {
      if (g.equipeId !== equipeId) return g;
      const { [cavalierId]: _ancien, ...poneys } = g.poneys;
      return { ...g, poneys: poney.trim() ? { ...poneys, [cavalierId]: poney.trim() } : poneys };
    }),
  };
}

export function poserRemplacant(r: ResultatConcours, equipeId: string, poney: string): ResultatConcours {
  return {
    ...r,
    engagements: (r.engagements ?? []).map((g) =>
      g.equipeId === equipeId ? { ...g, remplacant: poney.trim() || undefined } : g,
    ),
  };
}

// ─── Vérifications ─────────────────────────────────────────────────────────

export interface AlerteOrganisation {
  gravite: "erreur" | "alerte";
  message: string;
}

interface Creneau {
  equipe: EquipeSaison;
  debut?: number;
  fin?: number;
}

const chevauche = (a: Creneau, b: Creneau) =>
  a.debut !== undefined && b.debut !== undefined && a.debut < b.fin! && b.debut < a.fin!;

const plage = (c: Creneau) => `${versHeure(c.debut!).replace(":", "h")}–${versHeure(c.fin!).replace(":", "h")}`;

/** Ce qui cloche dans l'organisation d'un concours : à corriger (erreur) ou à compléter (alerte). */
export function verifierOrganisation(s: SaisonPonyGames, r: ResultatConcours): AlerteOrganisation[] {
  const out: AlerteOrganisation[] = [];
  const nom = (cavalierId: string) => s.cavaliers.find((c) => c.id === cavalierId)?.prenom ?? "?";
  const creneaux: (Creneau & { g: EngagementConcours })[] = [];

  for (const g of r.engagements ?? []) {
    const equipe = equipeDe(s, g.equipeId);
    if (!equipe) continue;
    const debut = minutes(g.heure);
    creneaux.push({ g, equipe, debut, fin: debut === undefined ? undefined : debut + dureeEpreuve(equipe) });

    if (debut === undefined) out.push({ gravite: "alerte", message: `${equipe.nom} : pas d'horaire.` });
    const sansPoney = equipe.cavalierIds.filter((id) => !g.poneys[id]?.trim()).map(nom);
    if (sansPoney.length) out.push({ gravite: "alerte", message: `${equipe.nom} : pas de poney pour ${sansPoney.join(", ")}.` });
    if (besoinRemplacant(equipe) && !g.remplacant?.trim()) {
      out.push({ gravite: "alerte", message: `${equipe.nom} : poney remplaçant à choisir.` });
    }

    // Un même poney deux fois dans l'équipe (remplaçant compris).
    const vus = new Map<string, string>();
    const usages = [
      ...equipe.cavalierIds.filter((id) => g.poneys[id]?.trim()).map((id) => ({ poney: g.poneys[id], qui: nom(id) })),
      ...(g.remplacant?.trim() ? [{ poney: g.remplacant, qui: "remplaçant" }] : []),
    ];
    for (const u of usages) {
      const cle = u.poney.trim().toLowerCase();
      if (vus.has(cle)) out.push({ gravite: "erreur", message: `${equipe.nom} : ${u.poney} est prévu deux fois (${vus.get(cle)} et ${u.qui}).` });
      else vus.set(cle, u.qui);
    }
  }

  // Entre deux épreuves qui se chevauchent : même poney ou même cavalier.
  for (let i = 0; i < creneaux.length; i++) {
    for (let j = i + 1; j < creneaux.length; j++) {
      const a = creneaux[i];
      const b = creneaux[j];
      if (!chevauche(a, b)) continue;
      const poneysDe = (c: typeof a) =>
        new Set([...Object.values(c.g.poneys), c.g.remplacant ?? ""].map((p) => p.trim().toLowerCase()).filter(Boolean));
      const communs = [...poneysDe(a)].filter((p) => poneysDe(b).has(p));
      for (const p of communs) {
        const affiche = [...Object.values(a.g.poneys), a.g.remplacant ?? ""].find((x) => x.trim().toLowerCase() === p) ?? p;
        out.push({ gravite: "erreur", message: `${affiche} est dans ${a.equipe.nom} (${plage(a)}) et ${b.equipe.nom} (${plage(b)}) en même temps.` });
      }
      for (const id of a.equipe.cavalierIds.filter((x) => b.equipe.cavalierIds.includes(x))) {
        out.push({ gravite: "erreur", message: `${nom(id)} passe avec ${a.equipe.nom} (${plage(a)}) et ${b.equipe.nom} (${plage(b)}) en même temps.` });
      }
    }
  }

  return out.sort((x, y) => (x.gravite === y.gravite ? 0 : x.gravite === "erreur" ? -1 : 1));
}
