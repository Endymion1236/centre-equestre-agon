/**
 * src/app/admin/planning/creation-stage-utils.ts — prix et copies d'un stage,
 * à la création des créneaux.
 *
 * Demande de Nicolas (11/2026) : dans « Créer des créneaux », pouvoir fixer
 * le prix de la semaine, ouvrir l'inscription à la journée avec son prix, et
 * dupliquer le stage sur les semaines suivantes — ce que seule la fenêtre de
 * modification permettait, jour après jour.
 *
 * Mêmes champs que la modification d'un créneau (planning/page.tsx,
 * handleEditSave) : `priceTTC` (prix de la semaine, sur chaque jour),
 * `allowDayBooking`, `priceTTCDay` (vide = prorata du prix semaine).
 * Chaque copie est un stage à part : son propre lot (`stageGroupId`), comme
 * une copie de créneau (« Un cavalier à deux endroits », CLAUDE.md).
 * Pur, testé (tests/unit/creation-stage.test.ts).
 */

export interface PrixStage {
  /** Prix TTC de la semaine (ou du stage) ; vide = prix de l'activité. */
  prixSemaine: string | number | null | undefined;
  ouvertJournee: boolean;
  /** Prix TTC d'une journée ; vide = prorata du prix semaine. */
  prixJournee: string | number | null | undefined;
}

const nombre = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
};

/**
 * Champs de prix posés sur chaque créneau du stage. `prixActivite` et
 * `tvaTaux` viennent de l'activité choisie ; un taux à 0 reste à 0.
 */
export function champsPrixStage(p: PrixStage, prixActivite: number, tvaTaux: number) {
  const ttc = nombre(p.prixSemaine) ?? (Math.round((Number(prixActivite) || 0) * 100) / 100);
  const taux = Number.isFinite(Number(tvaTaux)) && Number(tvaTaux) >= 0 ? Number(tvaTaux) : 0;
  return {
    priceTTC: ttc,
    priceHT: Math.round((ttc / (1 + taux / 100)) * 100) / 100,
    allowDayBooking: !!p.ouvertJournee,
    priceTTCDay: p.ouvertJournee ? (nombre(p.prixJournee) ?? 0) : 0,
  };
}

/** Prix d'une journée affiché quand le champ est vide : prorata de la semaine. */
export function prixJourneeProrata(prixSemaine: number, nbJours: number): number {
  return nbJours > 0 ? Math.round((prixSemaine / nbJours) * 100) / 100 : 0;
}

const decaler = (iso: string, jours: number): string => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + jours);
  return d.toISOString().slice(0, 10);
};

/**
 * Les jours de chaque copie : la semaine choisie, puis les suivantes
 * (décalage de 7 jours à chaque fois). `nbSemaines` = 1 : le stage seul.
 */
export function joursDesCopies(jours: string[], nbSemaines: number): string[][] {
  const n = Math.max(1, Math.min(20, Math.floor(Number(nbSemaines) || 1)));
  return Array.from({ length: n }, (_, k) => jours.map((j) => decaler(j, 7 * k)));
}
