/**
 * src/lib/analyse-preparation-seance.ts — l'analyse IA d'une note de
 * préparation de séance.
 *
 * Nicolas voulait, pour la préparation comme pour la fin de séance, pouvoir
 * dicter sa note au montoir puis en obtenir une lecture structurée : le
 * déroulé mis au propre, le matériel à sortir, les points de vigilance, et
 * ce qu'il faut adapter pour tel ou tel cavalier.
 *
 * La note du moniteur reste la référence : le déroulé ne reprend que ce
 * qu'elle dit. Ce que l'IA propose en plus va dans « suggestions », à part,
 * pour que personne ne prenne une idée du modèle pour une consigne écrite.
 *
 * Module pur : schéma, consigne, nettoyage. La route
 * /api/ia/preparation-seance fait l'appel. Comme pour la fin de séance, seuls
 * les PRÉNOMS et les poneys partent avec la note.
 */

export interface AnalysePreparationSeance {
  objectif: string;
  deroule: { etape: string; contenu: string }[];
  materiel: string[];
  vigilance: string[];
  adaptations: { prenom: string; conseil: string }[];
  suggestions: string[];
}

export const SCHEMA_ANALYSE_PREPARATION = {
  type: "object",
  properties: {
    objectif: { type: "string", description: "L'objectif de la séance en une phrase, ou chaîne vide." },
    deroule: {
      type: "array",
      description: "Les étapes prévues par la note, dans l'ordre (échauffement, travail, retour au calme…).",
      items: {
        type: "object",
        properties: { etape: { type: "string" }, contenu: { type: "string" } },
        required: ["etape", "contenu"],
        additionalProperties: false,
      },
    },
    materiel: { type: "array", items: { type: "string" }, description: "Matériel à préparer (barres, plots, cônes…)." },
    vigilance: { type: "array", items: { type: "string" }, description: "Points de sécurité, poneys, cavaliers à surveiller." },
    adaptations: {
      type: "array",
      items: {
        type: "object",
        properties: { prenom: { type: "string" }, conseil: { type: "string" } },
        required: ["prenom", "conseil"],
        additionalProperties: false,
      },
    },
    suggestions: { type: "array", items: { type: "string" }, description: "Idées en plus de la note, quatre au plus." },
  },
  required: ["objectif", "deroule", "materiel", "vigilance", "adaptations", "suggestions"],
  additionalProperties: false,
} as const;

export interface ContextePreparation {
  activityTitle?: string;
  date?: string;
  startTime?: string;
  endTime?: string;
  monitor?: string;
  themeStage?: string;
  cavaliers?: { prenom: string; poney?: string; niveau?: string }[];
}

export const CONSIGNE_PREPARATION =
  "Tu aides les moniteurs d'un centre équestre (poney-club, Agon-Coutainville) à préparer leurs reprises. "
  + "Le moniteur a écrit ou dicté sa préparation ; tu la mets au propre. "
  + "Dans « deroule », « materiel », « vigilance » et « adaptations », ne reprends que ce que la note dit ou implique directement : n'invente ni exercice ni cavalier. "
  + "Tes propres idées (variante ludique, progression, exercice complémentaire adapté au niveau) vont uniquement dans « suggestions », quatre au plus. "
  + "Une liste reste vide quand rien ne la justifie. "
  + "Écris en français simple, des phrases courtes, comme un collègue moniteur. "
  + "Dans « vigilance », pense à la sécurité des enfants et au bien-être des poneys. "
  + "Dans « adaptations », n'utilise que les prénoms des cavaliers inscrits.";

export function construireDemandePreparation(note: string, c: ContextePreparation): string {
  const lignes: string[] = [];
  const quand = [c.date, [c.startTime, c.endTime].filter(Boolean).join("–")].filter(Boolean).join(" ");
  lignes.push(`Reprise : ${c.activityTitle || "?"}${quand ? `, ${quand}` : ""}${c.monitor ? `, moniteur ${c.monitor}` : ""}.`);
  if (c.themeStage) lignes.push(`Thème : ${c.themeStage}.`);
  const inscrits = (c.cavaliers || []).filter((x) => x.prenom);
  if (inscrits.length) {
    lignes.push(`Cavaliers inscrits : ${inscrits.map((x) => [x.prenom, x.niveau, x.poney].filter(Boolean).join(" · ")).join(", ")}.`);
  }
  lignes.push("", "Préparation écrite par le moniteur :", `« ${note.trim()} »`);
  return lignes.join("\n");
}

const texte = (v: unknown, max: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const liste = (v: unknown, max = 8) => (Array.isArray(v) ? v : []).map((x) => texte(x, 300)).filter(Boolean).slice(0, max);

export function normaliserAnalysePreparation(brut: unknown): AnalysePreparationSeance {
  const b = (brut && typeof brut === "object" ? brut : {}) as Record<string, unknown>;
  return {
    objectif: texte(b.objectif, 400),
    deroule: (Array.isArray(b.deroule) ? b.deroule : [])
      .map((d: any) => ({ etape: texte(d?.etape, 80), contenu: texte(d?.contenu, 400) }))
      .filter((d) => d.contenu)
      .slice(0, 10),
    materiel: liste(b.materiel, 12),
    vigilance: liste(b.vigilance),
    adaptations: (Array.isArray(b.adaptations) ? b.adaptations : [])
      .map((a: any) => ({ prenom: texte(a?.prenom, 40), conseil: texte(a?.conseil, 300) }))
      .filter((a) => a.prenom && a.conseil)
      .slice(0, 20),
    suggestions: liste(b.suggestions, 4),
  };
}
