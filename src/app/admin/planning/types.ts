// ─── Types partagés ─────────────────────────────────────────────────────────

export interface Creneau {
  id?: string;
  activityId: string;
  activityTitle: string;
  activityType: string;
  date: string;
  startTime: string;
  endTime: string;
  monitor: string;
  maxPlaces: number;
  enrolledCount: number;
  enrolled: any[];
  status: string;
  priceHT?: number;
  priceTTC?: number;
  tvaTaux?: number;
}

export interface EnrolledChild {
  childId: string;
  childName: string;
  familyId: string;
  familyName: string;
  enrolledAt: string;
  // ── Marquage source de paiement (couverture inscription) ─────────────
  // Permet à l'UI de savoir comment l'inscription est couverte
  // financièrement, sans devoir matcher un item de paiement précis :
  //  - 'card'    : carte de séances (débit à la clôture)
  //  - 'forfait' : forfait annuel (un seul paiement couvre toute la saison)
  //  - undefined : paiement classique au créneau (suppose un match par creneauId)
  paymentSource?: "card" | "forfait";
  forfaitId?: string | null;
  cardId?: string | null;
  presence?: "present" | "absent" | null;
  stageKey?: string;
}

export interface Period {
  startDate: string;
  endDate: string;
}

export interface SlotDef {
  activityId: string;
  day: number;
  startTime: string;
  endTime: string;
  monitor: string;
  maxPlaces: number;
}

// ─── Constantes ──────────────────────────────────────────────────────────────

export const dayNames = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
export const dayNamesFull = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];

/**
 * Comparateur stable pour trier les créneaux.
 * Réexporté depuis @/lib/creneau-sort pour que les imports existants depuis
 * "./types" continuent de fonctionner. Voir creneau-sort.ts pour la doc.
 */
export { compareCreneaux } from "@/lib/creneau-sort";

export const typeColors: Record<string, string> = {
  stage: "#27ae60",
  stage_journee: "#16a085",
  balade: "#e67e22",
  cours: "#2050A0",
  competition: "#7c3aed",
  anniversaire: "#D63031",
  ponyride: "#16a085",
  animation: "#e84393",
};

export const payModes = [
  { id: "cb_terminal", label: "CB", icon: "💳" },
  { id: "cheque", label: "Chèque", icon: "📝" },
  { id: "especes", label: "Espèces", icon: "💶" },
  { id: "cheque_vacances", label: "Chq.Vac.", icon: "🏖️" },
  { id: "pass_sport", label: "Pass'Sport", icon: "🎽" },
  { id: "ancv", label: "ANCV", icon: "🎫" },
  { id: "carte", label: "Carte", icon: "🎟️" },
  { id: "avoir", label: "Avoir", icon: "💜" },
  { id: "prelevement_sepa", label: "SEPA", icon: "🏦" },
];

// ─── Helpers dates ───────────────────────────────────────────────────────────

export function getWeekDates(offset: number): Date[] {
  const t = new Date();
  const m = new Date(t);
  m.setDate(t.getDate() - ((t.getDay() + 6) % 7) + offset * 7);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(m);
    d.setDate(m.getDate() + i);
    return d;
  });
}

export function fmtDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function fmtDateFR(d: Date) {
  return d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric" });
}

export function fmtMonthFR(d: Date) {
  return d.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
}

// ─────────────────────────────────────────────────────────────────────────────
//  Helper partagé : match d'un item de paiement avec un créneau visible.
//
//  Cas couverts (par ordre de priorité) :
//
//  1. Cours unique : item a un creneauId → match strict
//
//  2. Stage moderne : enrolled.stageKey existe ET item.stageKey existe
//     → match strict sur stageKey complet (format "activityTitle_premierJour")
//     Aucune confusion possible entre 2 stages de même titre sur 2 semaines.
//
//  3. Stage legacy (avant le fix stageKey) : enrolled n'a pas de stageKey
//     → fallback sur préfixe item.stageKey commence par activityTitle + "_"
//     Limite : un cavalier qui a payé "Stage galop d'or" semaine 1 apparaît
//     "réglé" sur "Stage galop d'or" semaine 2 si l'inscription est antérieure
//     au déploiement de ce fix. Pour les nouveaux stages c'est correct.
//
//  4. Très ancien : ni creneauId ni stageKey → match par activityTitle.includes
//
//  Le bug initial (Charlyse Pierre stage A payé, stage B inscriptions
//  apparaissait "réglé") reste corrigé : ces 2 stages ont des activityTitle
//  différents donc aucun cas ne matche.
// ─────────────────────────────────────────────────────────────────────────────
export function itemMatchesCreneau(
  item: any,
  enrolledOrChildId: string | { childId: string; stageKey?: string },
  creneau: { id?: string; activityTitle: string }
): boolean {
  // Compatibilité ascendante : accepte string (childId) ou objet enrolled
  const childId = typeof enrolledOrChildId === "string"
    ? enrolledOrChildId
    : enrolledOrChildId.childId;
  const enrolledStageKey = typeof enrolledOrChildId === "object"
    ? enrolledOrChildId.stageKey
    : undefined;

  if (item.childId !== childId) return false;

  // 1. Cours unique : creneauId strict
  if (item.creneauId) return item.creneauId === creneau.id;

  // 2. Stage moderne : on a le stageKey dans l'enrolled → match strict
  if (enrolledStageKey && item.stageKey) {
    return item.stageKey === enrolledStageKey;
  }

  // 3. Stage legacy : seul l'item a un stageKey, on tente le préfixe
  if (item.stageKey) {
    return String(item.stageKey).startsWith(creneau.activityTitle + "_");
  }

  // 4. Très ancien : fallback activityTitle
  return String(item.activityTitle || "").includes(creneau.activityTitle);
}
