import { GALOPS_PROGRAMME } from "./galops-programme";

// ── Contexte calculé à partir des données existantes d'un cavalier ────────────
export interface BadgeContext {
  seances: number;            // nb de séances suivies (notes "seance" à la clôture)
  activitesDistinctes: number; // nb d'activités différentes pratiquées
  poneysDistincts: number;     // nb de poneys différents montés
  niveauxAtteints: number;     // nb de niveaux de progression atteints (0 si aucun)
}

export interface BadgeDef {
  id: string;
  icon: string;
  label: string;
  description: string;
  value: (c: BadgeContext) => number;
  tiers: number[]; // seuils croissants
}

// ── Définition des badges (v1 : 100% auto-calculés) ───────────────────────────
export const BADGES: BadgeDef[] = [
  {
    id: "assiduite",
    icon: "🎯",
    label: "Cavalier assidu",
    description: "Nombre de séances suivies au club.",
    value: (c) => c.seances,
    tiers: [5, 15, 30, 60, 100],
  },
  {
    id: "explorateur",
    icon: "🧭",
    label: "Explorateur",
    description: "Différentes activités pratiquées (cours, balade, pony games…).",
    value: (c) => c.activitesDistinctes,
    tiers: [2, 4, 6],
  },
  {
    id: "ami_poneys",
    icon: "🐴",
    label: "Ami des poneys",
    description: "Différents poneys montés en séance.",
    value: (c) => c.poneysDistincts,
    tiers: [3, 6, 10, 15],
  },
  {
    id: "progression",
    icon: "⭐",
    label: "Sur la bonne voie",
    description: "Niveaux de progression atteints (Poney puis Galops).",
    value: (c) => c.niveauxAtteints,
    tiers: [1, 2, 3, 4, 5, 6],
  },
];

export interface BadgeResult extends BadgeDef {
  valeur: number;
  paliersAtteints: number;   // nb de paliers franchis
  totalPaliers: number;
  obtenu: boolean;           // au moins un palier franchi
  prochainSeuil: number | null;
}

export function evaluerBadges(ctx: BadgeContext): BadgeResult[] {
  return BADGES.map((b) => {
    const valeur = b.value(ctx);
    const paliersAtteints = b.tiers.filter((s) => valeur >= s).length;
    const prochainSeuil = b.tiers.find((s) => valeur < s) ?? null;
    return {
      ...b,
      valeur,
      paliersAtteints,
      totalPaliers: b.tiers.length,
      obtenu: paliersAtteints > 0,
      prochainSeuil,
    };
  });
}

// ── Construction du contexte à partir des données brutes ──────────────────────
// notes : child.peda?.notes (mélange de notes manuelles et de séances auto)
// niveauEnCoursId : progressions/{uid_childId}.niveauEnCours
export function contexteBadges(notes: any[], niveauEnCoursId?: string): BadgeContext {
  const seances = (notes || []).filter((n) => n?.type === "seance");
  const activites = new Set<string>();
  const poneys = new Set<string>();
  for (const n of seances) {
    if (n.activityTitle) activites.add(String(n.activityTitle).trim().toLowerCase());
    if (n.horseName) poneys.add(String(n.horseName).trim().toLowerCase());
  }
  const idx = niveauEnCoursId ? GALOPS_PROGRAMME.findIndex((g) => g.id === niveauEnCoursId) : -1;
  return {
    seances: seances.length,
    activitesDistinctes: activites.size,
    poneysDistincts: poneys.size,
    niveauxAtteints: idx >= 0 ? idx + 1 : 0,
  };
}
