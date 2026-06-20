// =============================================================================
// Module "Organisation de concours" — Moteur de contraintes (v1)
// Emplacement cible : src/lib/concours/contraintes.ts
// -----------------------------------------------------------------------------
// Logique PURE (aucune UI). On calcule, pour chaque personne, ses fenêtres
// d'occupation (à cheval / rôle support), puis on repère les chevauchements et
// les rôles non pourvus. C'est cette couche qui garantit "zéro conflit" —
// l'IA ne décide jamais de ça toute seule.
// =============================================================================

import type { Concours, Passage, Personne, RoleType, Conflit } from "./types";

/** Durée pendant laquelle une équipe est "en piste" (fenêtre des rôles support). */
const DUREE_PASSAGE_MIN = 20;
/** Prépa par défaut avant l'heure "à cheval", si heurePrepa n'est pas renseignée. */
const PREPA_AVANT_MIN = 30;

const LIBELLE_ROLE: Record<RoleType, string> = {
  coach: "coach",
  placeur: "placeur",
  juge: "juge de ligne",
  camion: "responsable camion",
  detente: "détente",
};

// ---------------------------------------------------------------------------
// Outils horaires
// ---------------------------------------------------------------------------
/** "09:30" -> 570 (minutes depuis minuit). null si vide/invalide. */
export function toMinutes(hhmm?: string): number | null {
  if (!hhmm) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** 570 -> "09:30" */
export function toHHMM(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

interface Fenetre {
  debut: number;
  fin: number;
}

/** Fenêtre "en piste" d'un passage (quand les rôles support sont nécessaires). */
function fenetrePassage(p: Passage): Fenetre | null {
  const cheval = toMinutes(p.heurePassage) ?? toMinutes(p.heureACheval);
  if (cheval == null) return null;
  return { debut: cheval, fin: cheval + DUREE_PASSAGE_MIN };
}

/** Fenêtre de prépa/détente d'un cavalier (souple) : du début de prépa jusqu'au passage. */
function fenetrePrepa(p: Passage): Fenetre | null {
  const fp = fenetrePassage(p);
  if (!fp) return null;
  const acheval = toMinutes(p.heureACheval);
  const prepa =
    toMinutes(p.heurePrepa) ??
    (acheval != null ? acheval - PREPA_AVANT_MIN : fp.debut - PREPA_AVANT_MIN);
  const debut = Math.min(prepa, fp.debut);
  if (debut >= fp.debut) return null;
  return { debut, fin: fp.debut };
}

function chevauche(a: Fenetre, b: Fenetre): boolean {
  return a.debut < b.fin && b.debut < a.fin;
}

// ---------------------------------------------------------------------------
// Occupations par personne
// ---------------------------------------------------------------------------
type TypeOccupation = "piste" | "prepa" | "role";

/** Une occupation "dure" bloque physiquement la personne (en piste ou rôle support). */
function estDure(t: TypeOccupation): boolean {
  return t === "piste" || t === "role";
}

interface Occupation {
  passageId: string;
  fenetre: Fenetre;
  type: TypeOccupation;
  /** Description courte pour le message : "à cheval (Ponies Splash)" ou "juge de ligne". */
  detail: string;
}

/** Construit la liste des occupations de chaque personne sur la journée. */
export function occupationsParPersonne(concours: Concours): Map<string, Occupation[]> {
  const map = new Map<string, Occupation[]>();
  const add = (personneId: string, occ: Occupation) => {
    const arr = map.get(personneId) ?? [];
    arr.push(occ);
    map.set(personneId, arr);
  };

  for (const p of concours.passages) {
    if (p.evenement) continue; // remise des prix, etc.

    const fPass = fenetrePassage(p);
    const fPrep = fenetrePrepa(p);

    for (const part of p.participants) {
      if (fPass)
        add(part.personneId, {
          passageId: p.id,
          fenetre: fPass,
          type: "piste",
          detail: `en piste (${p.nomEquipe})`,
        });
      if (fPrep)
        add(part.personneId, {
          passageId: p.id,
          fenetre: fPrep,
          type: "prepa",
          detail: `en prépa/détente (${p.nomEquipe})`,
        });
    }

    if (fPass) {
      for (const r of p.roles) {
        for (const pid of r.personneIds) {
          add(pid, {
            passageId: p.id,
            fenetre: fPass,
            type: "role",
            detail: `${LIBELLE_ROLE[r.type]} (${p.nomEquipe})`,
          });
        }
      }
    }
  }
  return map;
}

// ---------------------------------------------------------------------------
// Analyse : la fonction que la page appelle
// ---------------------------------------------------------------------------
export function analyser(concours: Concours): Conflit[] {
  const conflits: Conflit[] = [];
  const nom = (id: string): string => {
    const pers = concours.personnes.find((x) => x.id === id);
    return pers ? pers.prenom : id;
  };

  // 1) Chevauchements : une même personne à deux endroits en même temps.
  // On garde un seul signalement par (personne + paire de passages), le plus grave.
  const chevauchements = new Map<string, Conflit>();
  const occ = occupationsParPersonne(concours);
  for (const [personneId, liste] of occ) {
    for (let i = 0; i < liste.length; i++) {
      for (let j = i + 1; j < liste.length; j++) {
        const a = liste[i];
        const b = liste[j];
        if (a.passageId === b.passageId) continue; // même passage = pas un conflit
        if (!chevauche(a.fenetre, b.fenetre)) continue;

        // Deux occupations "dures" en même temps = impossible => erreur.
        // Si au moins une est de la prépa/détente => alerte (un relais peut exister).
        const dur = estDure(a.type) && estDure(b.type);
        const cle = `${personneId}|${[a.passageId, b.passageId].sort().join(",")}`;
        const existant = chevauchements.get(cle);
        if (existant && existant.gravite === "erreur") continue; // déjà au max

        chevauchements.set(cle, {
          gravite: dur ? "erreur" : "alerte",
          personneId,
          passageIds: [a.passageId, b.passageId],
          message: dur
            ? `${nom(personneId)} ne peut pas être ${a.detail} et ${b.detail} en même temps.`
            : `${nom(personneId)} est ${a.detail} et ${b.detail} sur un créneau serré — vérifie le relais.`,
        });
      }
    }
  }
  conflits.push(...chevauchements.values());

  // 2) Rôles non pourvus (hors rôles optionnels comme l'aide camion).
  for (const p of concours.passages) {
    if (p.evenement) continue;
    for (const r of p.roles) {
      if (r.optionnel) continue;
      const manque = r.nbRequis - r.personneIds.length;
      if (manque > 0) {
        conflits.push({
          gravite: "alerte",
          passageIds: [p.id],
          message: `${p.nomEquipe} (${p.heureACheval}) : il manque ${manque} ${LIBELLE_ROLE[r.type]}${manque > 1 ? "s" : ""}.`,
        });
      }
    }
  }

  // 3) Éligibilité : un rôle confié à quelqu'un qui ne peut pas le tenir.
  for (const p of concours.passages) {
    if (p.evenement) continue;
    for (const r of p.roles) {
      for (const pid of r.personneIds) {
        const pers = concours.personnes.find((x) => x.id === pid);
        if (!pers) continue;
        const interdit =
          (r.type === "camion" && pers.peutResponsableCamion === false) ||
          (r.type === "coach" && pers.peutCoacher === false) ||
          (r.type === "juge" && pers.peutJuger === false);
        if (interdit) {
          conflits.push({
            gravite: "erreur",
            personneId: pid,
            passageIds: [p.id],
            message: `${pers.prenom} ne peut pas être ${LIBELLE_ROLE[r.type]} (${p.nomEquipe}).`,
          });
        }
      }
    }
  }

  // Erreurs d'abord, puis alertes.
  return conflits.sort((a, b) =>
    a.gravite === b.gravite ? 0 : a.gravite === "erreur" ? -1 : 1,
  );
}
