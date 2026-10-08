// =============================================================================
// Membres d'une équipe de concours — logique pure
// -----------------------------------------------------------------------------
// Le menu « cavalier » d'un membre propose les personnes déjà dans le concours
// ET les cavaliers du club (fiches familles). Choisir un cavalier du club
// l'ajoute au concours et le place dans l'équipe d'un seul geste.
// =============================================================================

import type { Concours, Personne } from "./types";

/** Préfixe de la valeur d'option pour un cavalier du club pas encore dans le concours. */
export const PREFIXE_BASE = "base:";

export interface CavalierClub {
  childId: string;
  prenom: string;
  famille: string;
  familyId: string;
  naissance?: string;
}

export function personneDepuisCavalier(cav: CavalierClub): Personne {
  return { id: `cav-${cav.childId}`, prenom: cav.prenom, cavalierId: cav.childId, familyId: cav.familyId, naissance: cav.naissance };
}

/** Ajoute le cavalier du club au concours s'il n'y est pas ; renvoie le concours et l'id de la personne. */
export function ajouterCavalierClub(c: Concours, cav: CavalierClub): { concours: Concours; personneId: string } {
  const deja = c.personnes.find((p) => p.cavalierId === cav.childId);
  if (deja) return { concours: c, personneId: deja.id };
  const p = personneDepuisCavalier(cav);
  return { concours: { ...c, personnes: [...c.personnes, p] }, personneId: p.id };
}

/**
 * Pose le cavalier d'un membre d'équipe. `valeur` est l'id d'une personne du
 * concours, `base:<childId>` pour un cavalier du club, ou "" pour vider.
 * Le poney attribué de la personne pré-remplit la case poney si elle est vide.
 */
export function choisirCavalierMembre(
  c: Concours,
  cavaliersClub: CavalierClub[],
  equipeId: string,
  index: number,
  valeur: string,
): Concours {
  let concours = c;
  let personneId = valeur;
  if (valeur.startsWith(PREFIXE_BASE)) {
    const cav = cavaliersClub.find((x) => x.childId === valeur.slice(PREFIXE_BASE.length));
    if (!cav) return c;
    ({ concours, personneId } = ajouterCavalierClub(c, cav));
  }
  const pers = concours.personnes.find((p) => p.id === personneId);
  return {
    ...concours,
    equipes: (concours.equipes || []).map((e) =>
      e.id !== equipeId
        ? e
        : {
            ...e,
            membres: e.membres.map((m, i) =>
              i !== index ? m : { ...m, personneId, chevalId: m.chevalId || pers?.poneyAttribueId || undefined },
            ),
          },
    ),
  };
}
