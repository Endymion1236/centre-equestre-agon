/**
 * src/lib/borne-3d.ts — le contrat du personnage 3D de la borne.
 *
 * Le fichier /borne/calin.glb (fabriqué dans Blender, voir
 * docs/BORNE-PERSONNAGE-3D.md) porte des animations et une forme de bouche
 * aux noms convenus. Ce module dit quelle animation jouer pour chaque état
 * de la borne, et retrouve la forme de bouche, en tolérant les variantes de
 * nom qu'un export Blender produit (casse, suffixes « .001 », noms anglais
 * courants). Sans import, testé (tests/unit/borne-3d.test.ts).
 */

export type EtatBorne3D = "off" | "connecting" | "idle" | "listening" | "thinking" | "speaking";

/** Animations attendues, par ordre de préférence pour chaque état. */
export const ANIMATIONS: Record<EtatBorne3D, string[]> = {
  off: ["repos", "idle"],
  connecting: ["repos", "idle"],
  idle: ["repos", "idle"],
  listening: ["ecoute", "listen", "repos", "idle"],
  thinking: ["reflexion", "think", "repos", "idle"],
  speaking: ["parle", "talk", "repos", "idle"],
};

/** Expressions ponctuelles (jouées une fois, puis retour à l'état). */
export const EXPRESSIONS = ["joie", "clin", "rire", "desole", "etonne"] as const;

/** Formes de bouche reconnues, dans l'ordre. */
export const FORMES_BOUCHE = ["bouche", "mouthopen", "jawopen", "mouth_open", "viseme_aa"];

/** « Parle.001 », « Armature|parle », « PARLE » → « parle ». */
export function nomNormalise(nom: string): string {
  const dernier = String(nom || "").split("|").pop() || "";
  return dernier.replace(/\.\d+$/, "").trim().toLowerCase();
}

/** L'animation à jouer pour un état, parmi celles du fichier ; null s'il n'y en a aucune. */
export function animationPourEtat(etat: EtatBorne3D, disponibles: string[]): string | null {
  const parNom = new Map(disponibles.map((n) => [nomNormalise(n), n]));
  for (const voulu of ANIMATIONS[etat] || ANIMATIONS.idle) {
    const trouve = parNom.get(voulu);
    if (trouve) return trouve;
  }
  return disponibles[0] ?? null;
}

/** L'animation d'une expression, si le fichier en a une. */
export function animationExpression(pose: string, disponibles: string[]): string | null {
  const voulu = nomNormalise(pose);
  return disponibles.find((n) => nomNormalise(n) === voulu) ?? null;
}

/** L'indice de la forme de bouche dans un dictionnaire de formes clés, ou -1. */
export function indiceBouche(dictionnaire: Record<string, number> | undefined | null): number {
  if (!dictionnaire) return -1;
  const entrees = Object.entries(dictionnaire).map(([n, i]) => [nomNormalise(n), i] as const);
  for (const voulu of FORMES_BOUCHE) {
    const e = entrees.find(([n]) => n === voulu);
    if (e) return e[1];
  }
  return -1;
}

/** Ouverture de bouche bornée à 0..1 (la page envoie l'amplitude de la voix). */
export const ouverture = (v: number) => (Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0);
