export interface PublicPlanningSlot {
  id: string;
  activityTitle: string;
  activityType: string;
  date: string;
  startTime: string;
  endTime: string;
  monitor: string;
  maxPlaces: number;
  enrolledCount: number;
  priceTTC?: number;
  priceHT?: number;
  tvaTaux?: number;
  status?: string;
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isCalendarDate(value: string) {
  if (!DATE_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function addCalendarDays(value: string, days: number) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function calendarDaysBetween(start: string, end: string) {
  return Math.round((new Date(`${end}T00:00:00Z`).getTime() - new Date(`${start}T00:00:00Z`).getTime()) / 86_400_000);
}

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

function number(value: unknown, fallback = 0) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function optionalNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return undefined;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * Construit la version publique d'un créneau sans exposer le tableau
 * `enrolled` (noms, familles, identifiants et informations de paiement).
 */
export function toPublicPlanningSlot(id: string, data: Record<string, unknown>): PublicPlanningSlot | null {
  const status = text(data.status);
  const date = text(data.date);
  if (!isCalendarDate(date) || status === "closed" || status === "cancelled") return null;

  const enrolledCount = Array.isArray(data.enrolled)
    ? data.enrolled.length
    : Math.max(0, number(data.enrolledCount));

  const slot: PublicPlanningSlot = {
    id,
    activityTitle: text(data.activityTitle) || "Activité équestre",
    activityType: text(data.activityType) || "animation",
    date,
    startTime: text(data.startTime),
    endTime: text(data.endTime),
    monitor: text(data.monitor),
    maxPlaces: Math.max(0, number(data.maxPlaces)),
    enrolledCount,
    status: status || undefined,
  };

  const priceTTC = optionalNumber(data.priceTTC);
  const priceHT = optionalNumber(data.priceHT);
  const tvaTaux = optionalNumber(data.tvaTaux);
  if (priceTTC !== undefined) slot.priceTTC = priceTTC;
  if (priceHT !== undefined) slot.priceHT = priceHT;
  if (tvaTaux !== undefined) slot.tvaTaux = tvaTaux;

  return slot;
}

export function comparePublicPlanningSlots(a: PublicPlanningSlot, b: PublicPlanningSlot) {
  return a.date.localeCompare(b.date)
    || a.startTime.localeCompare(b.startTime)
    || a.endTime.localeCompare(b.endTime)
    || a.activityTitle.localeCompare(b.activityTitle, "fr");
}
