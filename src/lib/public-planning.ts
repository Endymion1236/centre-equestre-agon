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
  /** L'inscription a la journee est-elle ouverte sur ce stage ? */
  allowDayBooking?: boolean;
  /** Tarif TTC d'une journee isolee, quand l'inscription a la journee est ouverte. */
  priceTTCDay?: number;
}

/**
 * Tarif journee a annoncer publiquement, ou null.
 *
 * Le planning public n'affichait que le prix semaine : un parent lisait
 * « 175 € », en concluait que c'etait la semaine entiere ou rien, et
 * repartait — alors que la journee etait parfois ouverte.
 *
 * Renvoie null des que l'un des deux champs manque : on n'annonce jamais
 * une formule dont on ne connait pas le prix.
 */
export function tarifJournee(slot: Pick<PublicPlanningSlot, "allowDayBooking" | "priceTTCDay">): number | null {
  if (!slot?.allowDayBooking) return null;
  const prix = slot.priceTTCDay;
  if (typeof prix !== "number" || !Number.isFinite(prix) || prix <= 0) return null;
  return prix;
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

  // Formule journee. Cette projection filtre volontairement les champs
  // exposes publiquement : sans ces deux lignes, l'info n'atteint jamais
  // le site, meme renseignee en base.
  if (data.allowDayBooking === true) slot.allowDayBooking = true;
  const priceTTCDay = optionalNumber(data.priceTTCDay);
  if (priceTTCDay !== undefined) slot.priceTTCDay = priceTTCDay;

  return slot;
}

export function comparePublicPlanningSlots(a: PublicPlanningSlot, b: PublicPlanningSlot) {
  return a.date.localeCompare(b.date)
    || a.startTime.localeCompare(b.startTime)
    || a.endTime.localeCompare(b.endTime)
    || a.activityTitle.localeCompare(b.activityTitle, "fr");
}
