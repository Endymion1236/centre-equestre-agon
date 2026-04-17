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
 * Comparateur stable pour trier les créneaux par heure puis par titre.
 *
 * Pourquoi pas juste startTime ?
 *   À l'origine, on triait uniquement par startTime. Quand plusieurs créneaux
 *   partagent la même heure de début (ex: 3 stages qui commencent tous à 10:00),
 *   le tri est indéterminé et l'ordre d'affichage peut changer d'un jour à
 *   l'autre selon l'ordre dans lequel Firestore renvoie les documents. L'œil
 *   perdait ses repères : un même stage pouvait apparaître en haut un jour,
 *   au milieu le lendemain.
 *
 * Solution : tri stable à 3 niveaux :
 *   1. startTime (heure de début) — critère principal
 *   2. endTime (heure de fin) — les créneaux courts avant les longs à même
 *      heure de début (utile pour différencier balade 1h vs stage 4h)
 *   3. activityTitle (alphabétique) — garantit un ordre totalement
 *      déterministe même pour deux créneaux strictement identiques en heures
 */
export function compareCreneaux(
  a: { startTime: string; endTime?: string; activityTitle?: string },
  b: { startTime: string; endTime?: string; activityTitle?: string }
): number {
  const byStart = a.startTime.localeCompare(b.startTime);
  if (byStart !== 0) return byStart;
  const byEnd = (a.endTime || "").localeCompare(b.endTime || "");
  if (byEnd !== 0) return byEnd;
  return (a.activityTitle || "").localeCompare(b.activityTitle || "");
}

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
