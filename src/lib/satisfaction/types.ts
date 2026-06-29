// ─────────────────────────────────────────────────────────────────────────
//  Satisfaction post-stage : types + agrégation par enseignant
// ─────────────────────────────────────────────────────────────────────────
// Le questionnaire est envoyé par mail le lendemain de la fin d'un stage
// multijours. Les réponses sont stockées dans la collection existante
// `avis-satisfaction`, enrichies de `source:"stage"`, du `stageLabel` et des
// moniteurs nommés (une note d'encadrement par moniteur).

/** Un moniteur évalué dans une réponse (note d'encadrement 1..5). */
export interface NoteMoniteur {
  nom: string;
  note: number; // 1..5
}

/** Invitation à répondre (créée par le cron ou pour un test). Doc id = token. */
export interface SatisfactionInvitation {
  id: string;            // token (id du doc, non devinable)
  stageLabel: string;
  semaine?: string;      // lundi YYYY-MM-DD
  dateFin?: string;      // YYYY-MM-DD (dernier jour du stage)
  childId?: string;
  childName: string;
  familyId?: string;
  familyName?: string;
  familyEmail?: string;
  moniteurs: string[];   // noms des moniteurs ayant encadré l'enfant
  repondu?: boolean;
  dateEnvoi?: any;
  createdAt?: any;
}

/** Réponse enregistrée dans `avis-satisfaction` (champs spécifiques au stage). */
export interface AvisStage {
  id?: string;
  source: "stage";
  invitationId?: string;
  stageLabel: string;
  semaine?: string;
  dateFin?: string;
  childId?: string;
  childName?: string;
  familyId?: string;
  familyName?: string;
  // Compat page admin existante :
  activityTitle: string; // = stageLabel
  globalNote: number;    // = note globale du stage (1..5)
  aspects?: Record<string, number>;
  commentaire?: string;
  // Spécifique stage :
  moniteurs: NoteMoniteur[];   // une note d'encadrement par moniteur
  noteProgres?: number;
  notePoneyNiveau?: number;
  noteOrganisation?: number;
  recommande?: boolean;
  createdAt?: any;
}

/** Définition d'une question à note (étoiles 1..5) du formulaire. */
export const QUESTIONS_NOTE = [
  { id: "globalNote", label: "Note globale du stage" },
  { id: "noteProgres", label: "Les progrès de votre enfant" },
  { id: "notePoneyNiveau", label: "L'adéquation poney / niveau" },
  { id: "noteOrganisation", label: "L'organisation (accueil, horaires, infos)" },
] as const;

export const MOYENNE_VIDE = "—";

/** Moyenne arrondie à 1 décimale, ou MOYENNE_VIDE si aucune valeur. */
export function moyenne(vals: number[]): number | null {
  const v = vals.filter(n => typeof n === "number" && n > 0);
  if (v.length === 0) return null;
  return Math.round((v.reduce((s, n) => s + n, 0) / v.length) * 10) / 10;
}

export interface BilanEnseignant {
  nom: string;
  nbNotes: number;            // nb de notes d'encadrement reçues
  moyenneEncadrement: number | null;
  moyenneGlobaleStage: number | null; // moyenne des notes globales des stages encadrés
  recommandePct: number | null;       // % de "recommande" sur ses stages
  commentaires: Array<{ stageLabel: string; commentaire: string; date?: any }>;
}

/**
 * Agrège les avis (source stage) par enseignant nommé.
 * Chaque entrée `moniteurs:[{nom,note}]` alimente la moyenne d'encadrement du
 * moniteur ; la note globale et la reco du stage sont attribuées à chacun de
 * ses moniteurs (informatif).
 */
export function bilanParEnseignant(avis: AvisStage[]): BilanEnseignant[] {
  const map = new Map<string, {
    notesEnc: number[]; notesGlob: number[]; recos: boolean[];
    commentaires: Array<{ stageLabel: string; commentaire: string; date?: any }>;
  }>();
  const get = (nom: string) => {
    if (!map.has(nom)) map.set(nom, { notesEnc: [], notesGlob: [], recos: [], commentaires: [] });
    return map.get(nom)!;
  };
  for (const a of avis) {
    if (!Array.isArray(a.moniteurs)) continue;
    for (const m of a.moniteurs) {
      if (!m?.nom) continue;
      const e = get(m.nom);
      if (typeof m.note === "number" && m.note > 0) e.notesEnc.push(m.note);
      if (typeof a.globalNote === "number" && a.globalNote > 0) e.notesGlob.push(a.globalNote);
      if (typeof a.recommande === "boolean") e.recos.push(a.recommande);
      if (a.commentaire && a.commentaire.trim()) {
        e.commentaires.push({ stageLabel: a.stageLabel || a.activityTitle || "", commentaire: a.commentaire.trim(), date: a.createdAt });
      }
    }
  }
  return Array.from(map.entries())
    .map(([nom, e]) => ({
      nom,
      nbNotes: e.notesEnc.length,
      moyenneEncadrement: moyenne(e.notesEnc),
      moyenneGlobaleStage: moyenne(e.notesGlob),
      recommandePct: e.recos.length ? Math.round((e.recos.filter(Boolean).length / e.recos.length) * 100) : null,
      commentaires: e.commentaires,
    }))
    .sort((a, b) => (b.moyenneEncadrement ?? -1) - (a.moyenneEncadrement ?? -1));
}
