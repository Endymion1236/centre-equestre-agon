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

/** Durée d'un passage selon la taille de l'équipe. */
const DUREE_PETITE_EQUIPE_MIN = 30; // équipes de 2-3 cavaliers
const DUREE_GRANDE_EQUIPE_MIN = 45; // équipes de 4-5 cavaliers
const SEUIL_GRANDE_EQUIPE = 4; // à partir de 4 cavaliers = grande équipe

/** Durée "en piste" d'un passage, déduite du nombre de cavaliers. */
export function dureePassage(p: Passage): number {
  return (p.participants?.length ?? 0) >= SEUIL_GRANDE_EQUIPE ? DUREE_GRANDE_EQUIPE_MIN : DUREE_PETITE_EQUIPE_MIN;
}
/** La détente a lieu 30 min avant le passage. */
const DETENTE_AVANT_MIN = 30;
/** La préparation (camion) a lieu 1h avant le passage. */
const PREPA_AVANT_MIN = 60;

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

/** Heure de passage en minutes — la source unique des horaires. */
function heurePassageMin(p: Passage): number | null {
  return toMinutes(p.heurePassage) ?? toMinutes(p.heureACheval);
}

/** Fenêtre "en piste" : de l'heure de passage à +durée (30 ou 45 min selon l'équipe). */
export function fenetrePassage(p: Passage): Fenetre | null {
  const t = heurePassageMin(p);
  if (t == null) return null;
  return { debut: t, fin: t + dureePassage(p) };
}

/** Fenêtre de détente : 30 min avant le passage. */
export function fenetreDetente(p: Passage): Fenetre | null {
  const t = heurePassageMin(p);
  if (t == null) return null;
  return { debut: t - DETENTE_AVANT_MIN, fin: t };
}

/** Fenêtre de préparation au camion : de 1h avant à 30 min avant le passage. */
export function fenetreCamion(p: Passage): Fenetre | null {
  const t = heurePassageMin(p);
  if (t == null) return null;
  return { debut: t - PREPA_AVANT_MIN, fin: t - DETENTE_AVANT_MIN };
}

/** Fenêtre où un cavalier est mobilisé avant son passage : 1h avant jusqu'au passage. */
export function fenetreAvant(p: Passage): Fenetre | null {
  const t = heurePassageMin(p);
  if (t == null) return null;
  return { debut: t - PREPA_AVANT_MIN, fin: t };
}

/** Fenêtre d'un poste selon son type (camion = prépa, détente = détente, sinon passage). */
export function fenetreRole(p: Passage, type: RoleType): Fenetre | null {
  if (type === "camion") return fenetreCamion(p);
  if (type === "detente") return fenetreDetente(p);
  return fenetrePassage(p);
}

export function chevauche(a: Fenetre, b: Fenetre): boolean {
  return a.debut < b.fin && b.debut < a.fin;
}

/** Horaires dérivés pour l'affichage, à partir de l'heure de passage. */
export function heuresDerivees(p: Passage): { prepa: string; detente: string; passage: string; fin: string; duree: number } | null {
  const t = heurePassageMin(p);
  if (t == null) return null;
  const duree = dureePassage(p);
  return {
    prepa: toHHMM(Math.max(0, t - PREPA_AVANT_MIN)),
    detente: toHHMM(Math.max(0, t - DETENTE_AVANT_MIN)),
    passage: toHHMM(t),
    fin: toHHMM(t + duree),
    duree,
  };
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
    const fAvant = fenetreAvant(p);

    for (const part of p.participants) {
      if (fPass)
        add(part.personneId, {
          passageId: p.id,
          fenetre: fPass,
          type: "piste",
          detail: `en piste (${p.nomEquipe})`,
        });
      if (fAvant)
        add(part.personneId, {
          passageId: p.id,
          fenetre: fAvant,
          type: "prepa",
          detail: `en prépa/détente (${p.nomEquipe})`,
        });
    }

    for (const r of p.roles) {
      // Placeurs / juges / coach : à l'heure du PASSAGE.
      // Détente : 30 min avant. Aide camion : 1h avant. (souples)
      const souple = r.type === "camion" || r.type === "detente";
      const fenetre = fenetreRole(p, r.type);
      if (!fenetre) continue;
      const typeOcc: TypeOccupation = souple ? "prepa" : "role";
      for (const pid of r.personneIds) {
        add(pid, {
          passageId: p.id,
          fenetre,
          type: typeOcc,
          detail: `${LIBELLE_ROLE[r.type]} (${p.nomEquipe})`,
        });
      }
    }
  }
  return map;
}

/** Construit la liste des occupations de chaque poney (un poney = une ressource). */
export function occupationsParCheval(concours: Concours): Map<string, Occupation[]> {
  const map = new Map<string, Occupation[]>();
  const add = (chevalId: string, occ: Occupation) => {
    const arr = map.get(chevalId) ?? [];
    arr.push(occ);
    map.set(chevalId, arr);
  };
  for (const p of concours.passages) {
    if (p.evenement) continue;
    const fPass = fenetrePassage(p);
    const fAvant = fenetreAvant(p);
    for (const part of p.participants) {
      if (!part.chevalId) continue;
      if (fPass) add(part.chevalId, { passageId: p.id, fenetre: fPass, type: "piste", detail: `monté sur « ${p.nomEquipe} »` });
      if (fAvant) add(part.chevalId, { passageId: p.id, fenetre: fAvant, type: "prepa", detail: `en échauffement pour « ${p.nomEquipe} »` });
    }
  }
  return map;
}

/** Nombre de passages où chaque poney est monté (chevalId -> nombre). */
export function compterPassagesPoneys(concours: Concours): Record<string, number> {
  const cpt: Record<string, number> = {};
  for (const p of concours.passages) {
    if (p.evenement) continue;
    for (const part of p.participants) {
      if (!part.chevalId) continue;
      cpt[part.chevalId] = (cpt[part.chevalId] ?? 0) + 1;
    }
  }
  return cpt;
}

/**
 * Personnes déjà occupées (en piste ou tenant un poste) pendant le créneau de
 * PASSAGE d'un passage donné. Sert à bloquer l'affectation à un rôle de
 * quelqu'un qui est déjà pris sur ce créneau (la prépa/camion, souple, ne bloque pas).
 */
export function personnesOccupeesAuPassage(concours: Concours, passageId: string): Set<string> {
  const cible = concours.passages.find((p) => p.id === passageId);
  const occupes = new Set<string>();
  if (!cible || cible.evenement) return occupes;
  const fCible = fenetrePassage(cible);
  if (!fCible) return occupes;
  for (const [pid, liste] of occupationsParPersonne(concours)) {
    for (const o of liste) {
      if (!estDure(o.type)) continue; // prépa/camion = souple
      if (chevauche(o.fenetre, fCible)) {
        occupes.add(pid);
        break;
      }
    }
  }
  return occupes;
}
export function analyser(concours: Concours): Conflit[] {
  const conflits: Conflit[] = [];
  const nom = (id: string): string => {
    const pers = concours.personnes.find((x) => x.id === id);
    return pers ? pers.prenom : id;
  };
  const nomCheval = (id: string): string => concours.chevaux.find((x) => x.id === id)?.nom ?? id;

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

  // 1ter) Un poney ne peut pas être à deux endroits en même temps.
  // piste + piste = impossible (erreur). Avec de l'échauffement = alerte
  // (échauffement à anticiper, typiquement un poney partagé entre deux cavaliers).
  const conflitsPoney = new Map<string, Conflit>();
  const occCh = occupationsParCheval(concours);
  for (const [chevalId, liste] of occCh) {
    for (let i = 0; i < liste.length; i++) {
      for (let j = i + 1; j < liste.length; j++) {
        const a = liste[i];
        const b = liste[j];
        if (a.passageId === b.passageId) continue;
        if (!chevauche(a.fenetre, b.fenetre)) continue;
        const dur = estDure(a.type) && estDure(b.type);
        const cle = `${chevalId}|${[a.passageId, b.passageId].sort().join(",")}`;
        const existant = conflitsPoney.get(cle);
        if (existant && existant.gravite === "erreur") continue;
        conflitsPoney.set(cle, {
          gravite: dur ? "erreur" : "alerte",
          chevalId,
          passageIds: [a.passageId, b.passageId],
          message: dur
            ? `Le poney ${nomCheval(chevalId)} est monté sur deux passages en même temps (${a.detail} / ${b.detail}).`
            : `Le poney ${nomCheval(chevalId)} est ${a.detail} et ${b.detail} sur un créneau serré — anticipe l'échauffement.`,
        });
      }
    }
  }
  conflits.push(...conflitsPoney.values());

  // 1bis) Cumuls sur un même passage : une personne ne peut pas être à la fois
  // cavalière et tenir un poste "en piste" (placeur/juge/coach) sur SON passage,
  // ni cumuler deux de ces postes. (L'aide camion, qui est sur la prépa, est exclue.)
  const joindre = (arr: string[]): string =>
    arr.length <= 1 ? arr[0] ?? "" : `${arr.slice(0, -1).join(", ")} et ${arr[arr.length - 1]}`;
  const LABEL_DUTY: Record<string, string> = { cavalier: "cavalier", coach: "coach", placeur: "placeur", juge: "juge" };
  for (const p of concours.passages) {
    if (p.evenement) continue;
    const duties = new Map<string, Set<string>>();
    const addDuty = (pid: string, duty: string) => {
      if (!pid) return;
      const s = duties.get(pid) ?? new Set<string>();
      s.add(duty);
      duties.set(pid, s);
    };
    for (const part of p.participants) addDuty(part.personneId, "cavalier");
    for (const r of p.roles) {
      if (r.type === "camion" || r.type === "detente") continue; // postes souples / prépa
      for (const pid of r.personneIds) addDuty(pid, r.type);
    }
    for (const [pid, set] of duties) {
      if (set.size >= 2) {
        const libelles = [...set].map((d) => LABEL_DUTY[d] ?? d);
        conflits.push({
          gravite: "erreur",
          personneId: pid,
          passageIds: [p.id],
          message: `${nom(pid)} ne peut pas être à la fois ${joindre(libelles)} sur « ${p.nomEquipe} » (${p.heurePassage ?? p.heureACheval}).`,
        });
      }
    }
  }

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

  // 5) Chevauchement de passages sur un même terrain : deux équipes en piste
  // au même moment (durée 30 min pour 2-3 cavaliers, 45 min pour 4-5). Signale
  // que l'écart entre deux passages du même terrain est trop court.
  const parTerrain = new Map<string, Passage[]>();
  for (const p of concours.passages) {
    if (p.evenement) continue;
    if (heurePassageMin(p) == null) continue;
    const arr = parTerrain.get(p.terrain) ?? [];
    arr.push(p);
    parTerrain.set(p.terrain, arr);
  }
  for (const [terrain, liste] of parTerrain) {
    const nomTerrain = concours.terrains.find((t) => t.id === terrain)?.nom ?? terrain;
    for (let i = 0; i < liste.length; i++) {
      for (let j = i + 1; j < liste.length; j++) {
        const fa = fenetrePassage(liste[i]);
        const fb = fenetrePassage(liste[j]);
        if (!fa || !fb || !chevauche(fa, fb)) continue;
        const da = dureePassage(liste[i]);
        const db = dureePassage(liste[j]);
        conflits.push({
          gravite: "erreur",
          passageIds: [liste[i].id, liste[j].id],
          message: `${nomTerrain} : « ${liste[i].nomEquipe} » (${da} min) et « ${liste[j].nomEquipe} » (${db} min) se chevauchent — espace davantage les passages.`,
        });
      }
    }
  }

  // Erreurs d'abord, puis alertes.
  return conflits.sort((a, b) =>
    a.gravite === b.gravite ? 0 : a.gravite === "erreur" ? -1 : 1,
  );
}

// ---------------------------------------------------------------------------
// Récap par personne : la timeline de chacun dans la journée
// ---------------------------------------------------------------------------
export interface PlanningPersonne {
  personneId: string;
  prenom: string;
  lignes: { heure: string; label: string }[];
}

/** Pour chaque personne : ses occupations triées par heure (prépa, en piste, postes…). */
export function planningParPersonne(concours: Concours): PlanningPersonne[] {
  const occ = occupationsParPersonne(concours);
  const res: PlanningPersonne[] = [];
  for (const [pid, liste] of occ) {
    const pers = concours.personnes.find((p) => p.id === pid);
    const lignes = liste
      .slice()
      .sort((a, b) => a.fenetre.debut - b.fenetre.debut)
      .map((o) => ({ heure: toHHMM(o.fenetre.debut), label: o.detail }));
    res.push({ personneId: pid, prenom: pers?.prenom ?? pid, lignes });
  }
  return res.sort((a, b) => a.prenom.localeCompare(b.prenom, "fr"));
}
