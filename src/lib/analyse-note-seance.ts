/**
 * src/lib/analyse-note-seance.ts — l'analyse IA d'une note de fin de séance.
 *
 * Au montoir, le moniteur dicte sa note de fin de reprise. Nicolas voulait,
 * juste après la dictée, une lecture structurée de cette note : ce qui a
 * marché, ce qui coince, quoi reprendre la prochaine fois, et les points à
 * ne pas laisser passer (sécurité, cheval, cavalier).
 *
 * Module pur : le schéma de réponse, la consigne envoyée au modèle et le
 * nettoyage du résultat. La route /api/ia/note-seance fait l'appel.
 *
 * Données : seuls les PRÉNOMS des cavaliers de la reprise et les poneys
 * partent avec la note — assez pour que l'analyse rattache une remarque au
 * bon enfant, pas plus.
 */

export const TYPES_ALERTE = ["securite", "cheval", "cavalier", "materiel", "autre"] as const;
export type TypeAlerte = (typeof TYPES_ALERTE)[number];

export interface AnalyseNoteSeance {
  resume: string;
  pointsPositifs: string[];
  difficultes: string[];
  aRetravailler: string[];
  prochaineSeance: string;
  alertes: { type: TypeAlerte; texte: string }[];
  cavaliers: { prenom: string; observation: string }[];
}

/** Schéma imposé à la réponse du modèle (sortie structurée). */
export const SCHEMA_ANALYSE_NOTE = {
  type: "object",
  properties: {
    resume: { type: "string", description: "La séance en deux phrases au plus." },
    pointsPositifs: { type: "array", items: { type: "string" } },
    difficultes: { type: "array", items: { type: "string" } },
    aRetravailler: { type: "array", items: { type: "string" }, description: "Exercices ou notions à reprendre." },
    prochaineSeance: { type: "string", description: "Une proposition concrète pour la prochaine séance, ou chaîne vide." },
    alertes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          type: { type: "string", enum: [...TYPES_ALERTE] },
          texte: { type: "string" },
        },
        required: ["type", "texte"],
        additionalProperties: false,
      },
    },
    cavaliers: {
      type: "array",
      items: {
        type: "object",
        properties: { prenom: { type: "string" }, observation: { type: "string" } },
        required: ["prenom", "observation"],
        additionalProperties: false,
      },
    },
  },
  required: ["resume", "pointsPositifs", "difficultes", "aRetravailler", "prochaineSeance", "alertes", "cavaliers"],
  additionalProperties: false,
} as const;

export interface ContexteSeance {
  activityTitle?: string;
  date?: string;
  startTime?: string;
  monitor?: string;
  themeStage?: string;
  notePreparation?: string;
  cavaliers?: { prenom: string; poney?: string; absent?: boolean }[];
}

/** Le prénom seul : la note n'a pas besoin du nom de famille. */
export function prenomSeul(nomComplet: unknown): string {
  return String(nomComplet ?? "").trim().split(/\s+/)[0] || "";
}

export const CONSIGNE_SYSTEME =
  "Tu aides les moniteurs d'un centre équestre (poney-club, Agon-Coutainville) à exploiter la note qu'ils dictent en fin de reprise. "
  + "Tu analyses uniquement ce que dit la note : n'invente ni exercice, ni incident, ni cavalier. "
  + "Une liste reste vide quand la note n'en parle pas. "
  + "Écris en français simple, des phrases courtes, comme un collègue moniteur. "
  + "Signale en alerte tout ce qui touche à la sécurité, à la santé ou au comportement d'un poney, ou à un cavalier en difficulté ou en danger. "
  + "Dans « cavaliers », ne reprends que les enfants que la note évoque, par leur prénom.";

export function construireDemande(note: string, contexte: ContexteSeance): string {
  const lignes: string[] = [];
  const quand = [contexte.date, contexte.startTime].filter(Boolean).join(" à ");
  lignes.push(`Reprise : ${contexte.activityTitle || "?"}${quand ? `, le ${quand}` : ""}${contexte.monitor ? `, moniteur ${contexte.monitor}` : ""}.`);
  if (contexte.themeStage) lignes.push(`Thème prévu : ${contexte.themeStage}.`);
  if (contexte.notePreparation?.trim()) lignes.push(`Préparation écrite avant la séance : « ${contexte.notePreparation.trim()} »`);
  const presents = (contexte.cavaliers || []).filter((c) => c.prenom && !c.absent);
  if (presents.length) {
    lignes.push(`Cavaliers présents : ${presents.map((c) => (c.poney ? `${c.prenom} (${c.poney})` : c.prenom)).join(", ")}.`);
  }
  lignes.push("", "Note dictée par le moniteur :", `« ${note.trim()} »`);
  return lignes.join("\n");
}

const texte = (v: unknown, max: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const liste = (v: unknown, max = 8) => (Array.isArray(v) ? v : []).map((x) => texte(x, 300)).filter(Boolean).slice(0, max);

/** Réponse du modèle → analyse bornée et propre à enregistrer. */
export function normaliserAnalyse(brut: unknown): AnalyseNoteSeance {
  const b = (brut && typeof brut === "object" ? brut : {}) as Record<string, unknown>;
  return {
    resume: texte(b.resume, 600),
    pointsPositifs: liste(b.pointsPositifs),
    difficultes: liste(b.difficultes),
    aRetravailler: liste(b.aRetravailler),
    prochaineSeance: texte(b.prochaineSeance, 400),
    alertes: (Array.isArray(b.alertes) ? b.alertes : [])
      .map((a: any) => ({
        type: (TYPES_ALERTE as readonly string[]).includes(a?.type) ? (a.type as TypeAlerte) : "autre",
        texte: texte(a?.texte, 300),
      }))
      .filter((a) => a.texte)
      .slice(0, 6),
    cavaliers: (Array.isArray(b.cavaliers) ? b.cavaliers : [])
      .map((c: any) => ({ prenom: texte(c?.prenom, 40), observation: texte(c?.observation, 300) }))
      .filter((c) => c.prenom && c.observation)
      .slice(0, 20),
  };
}

export const LIBELLES_ALERTE: Record<TypeAlerte, string> = {
  securite: "Sécurité", cheval: "Poney / cheval", cavalier: "Cavalier", materiel: "Matériel", autre: "À noter",
};
