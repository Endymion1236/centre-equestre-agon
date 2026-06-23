// =============================================================================
// Module "Organisation de concours" — Attribution automatique des rôles
// Emplacement cible : src/lib/concours/attribution.ts
// -----------------------------------------------------------------------------
// Remplit les postes manquants (coach / placeur / juge / aide camion) en
// respectant : pas de conflit d'horaire, juge ≥ 14 ans, coach = personnes
// marquées "coach" (Nicolas, Emmeline…). Les postes déjà saisis à la main
// sont conservés ; on ne fait que compléter.
// =============================================================================

import type { Concours, Personne, RoleType } from "./types";
import { fenetrePassage, fenetreRole, chevauche } from "./contraintes";

interface Fenetre {
  debut: number;
  fin: number;
}

/** Âge à une date donnée, ou null si la naissance est inconnue. */
function ageA(naissanceISO: string | undefined, dateISO: string): number | null {
  if (!naissanceISO) return null;
  const n = new Date(naissanceISO);
  const d = new Date(dateISO || Date.now());
  if (isNaN(n.getTime()) || isNaN(d.getTime())) return null;
  let age = d.getFullYear() - n.getFullYear();
  const m = d.getMonth() - n.getMonth();
  if (m < 0 || (m === 0 && d.getDate() < n.getDate())) age--;
  return age;
}

export interface ResultatAttribution {
  concours: Concours;
  /** Nombre de postes pourvus par l'attribution. */
  pourvus: number;
  /** Postes restés vides faute de candidat disponible. */
  nonPourvus: { passage: string; role: RoleType; manque: number }[];
}

/**
 * Complète les rôles non remplis. Ne touche pas aux postes déjà saisis.
 * Règles : juge ≥ 14 ans (naissance inconnue = adulte, éligible),
 * coach = personne `peutCoacher`, aide camion exclut `peutResponsableCamion=false`.
 */
export function attribuerAuto(concours: Concours): ResultatAttribution {
  const personnes = concours.personnes;
  const byId = new Map(personnes.map((p) => [p.id, p]));
  const nonPourvus: ResultatAttribution["nonPourvus"] = [];
  let pourvus = 0;

  // Fenêtres "dures" déjà occupées par chaque personne (en piste + postes existants).
  const busy = new Map<string, Fenetre[]>();
  const addBusy = (pid: string, w: Fenetre) => {
    const a = busy.get(pid) ?? [];
    a.push(w);
    busy.set(pid, a);
  };
  const libre = (pid: string, w: Fenetre) => !(busy.get(pid) ?? []).some((x) => chevauche(x, w));

  // Initialisation : cavaliers en piste + postes déjà attribués (placeur/juge/coach = passage).
  for (const p of concours.passages) {
    if (p.evenement) continue;
    const fPass = fenetrePassage(p);
    if (fPass) for (const part of p.participants) addBusy(part.personneId, fPass);
    for (const r of p.roles) {
      const f = fenetreRole(p, r.type);
      if (!f) continue;
      for (const pid of r.personneIds) addBusy(pid, f);
    }
  }

  // Charge (nb de postes tenus) pour répartir équitablement.
  const charge = new Map<string, number>();
  for (const p of concours.passages) for (const r of p.roles) for (const pid of r.personneIds) charge.set(pid, (charge.get(pid) ?? 0) + 1);
  const inc = (pid: string) => charge.set(pid, (charge.get(pid) ?? 0) + 1);

  const eligible = (pe: Personne, type: RoleType): boolean => {
    if (type === "coach" || type === "detente") return pe.peutCoacher === true;
    if (type === "juge") {
      if (pe.peutJuger === false) return false;
      const age = ageA(pe.naissance, concours.date);
      return age === null ? true : age >= 14;
    }
    if (type === "camion") return pe.peutResponsableCamion !== false;
    return true; // placeur : tout le monde
  };

  // On travaille sur une copie profonde des passages/rôles.
  const passages = concours.passages.map((p) => ({
    ...p,
    roles: p.roles.map((r) => ({ ...r, personneIds: [...r.personneIds] })),
  }));

  // On remplit les postes contraints d'abord (coach/détente = vivier coach,
  // juge = âge), les placeurs (ouverts à tous) en dernier, en gardant les coachs
  // en réserve pour ne pas les gaspiller comme placeurs.
  const PRIORITE: RoleType[] = ["coach", "juge", "placeur", "detente", "camion"];

  for (const p of passages) {
    if (p.evenement) continue;
    const ridersIci = new Set(p.participants.map((x) => x.personneId));

    for (const type of PRIORITE) {
      const r = p.roles.find((x) => x.type === type);
      if (!r) continue;
      const fenetre = fenetreRole(p, type);
      if (!fenetre) continue;
      const dejaSurPassage = new Set<string>(p.roles.flatMap((x) => x.personneIds));

      const candidats = personnes
        .filter((pe) => {
          if (ridersIci.has(pe.id)) return false; // pas les cavaliers de ce passage
          if (dejaSurPassage.has(pe.id)) return false; // pas deux postes sur le même passage
          if (!eligible(pe, type)) return false;
          return libre(pe.id, fenetre);
        })
        .map((pe) => pe.id)
        .sort((a, b) => {
          // Sauf pour coach/détente, on garde les coachs (Nicolas/Emmeline) en réserve.
          if (type !== "coach" && type !== "detente") {
            const ca = byId.get(a)?.peutCoacher ? 1 : 0;
            const cb = byId.get(b)?.peutCoacher ? 1 : 0;
            if (ca !== cb) return ca - cb;
          }
          return (charge.get(a) ?? 0) - (charge.get(b) ?? 0);
        });

      let k = 0;
      while (r.personneIds.length < r.nbRequis && k < candidats.length) {
        const pick = candidats[k++];
        r.personneIds.push(pick);
        addBusy(pick, fenetre);
        inc(pick);
        pourvus++;
      }
      const manque = r.nbRequis - r.personneIds.length;
      if (manque > 0 && !r.optionnel) nonPourvus.push({ passage: p.nomEquipe, role: type, manque });
    }
  }

  return { concours: { ...concours, passages }, pourvus, nonPourvus };
}
