import { titreAvecNiveau } from "./promenade-niveau";

/**
 * Renseignements publics repris de la fiche activité (Admin → Activités) :
 * ce que « En savoir plus sur cette activité » doit montrer.
 *
 * Le lien du planning public renvoyait vers le catalogue des activités,
 * choisi sur le seul TYPE du créneau : une animation ponctuelle (« Le Grand
 * Défi d'Halloween ») y menait à la page générale, sans un mot sur elle. Le
 * club décrit pourtant chaque activité dans son catalogue ; il suffisait
 * d'apporter cette description jusqu'au planning.
 */
export interface DetailsActivitePublique {
  description?: string;
  ageMin?: number;
  ageMax?: number | null;
  galopRequired?: string | null;
  conditionsAcces?: string | null;
}

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
  /** Fiche du catalogue dont ce créneau est une séance. */
  activityId?: string;
  /** Renseignements publics de cette fiche, joints par l'API du planning. */
  details?: DetailsActivitePublique;
}

/** Les seuls champs d'une fiche activité montrés au public. Rien d'autre n'en sort. */
export function detailsActivitePublique(data: Record<string, unknown> | null | undefined): DetailsActivitePublique | undefined {
  if (!data) return undefined;
  const texteCourt = (v: unknown, max: number) => {
    const t = typeof v === "string" ? v.trim() : "";
    return t ? t.slice(0, max) : undefined;
  };
  const nombre = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : undefined);
  const details: DetailsActivitePublique = {
    description: texteCourt(data.description, 1500),
    ageMin: nombre(data.ageMin),
    ageMax: nombre(data.ageMax) ?? null,
    galopRequired: texteCourt(data.galopRequired, 60) ?? null,
    conditionsAcces: texteCourt(data.conditionsAcces, 400) ?? null,
  };
  const utile = details.description || details.ageMin !== undefined || details.galopRequired || details.conditionsAcces;
  return utile ? details : undefined;
}

/** Tranche d'âge en clair : « De 6 à 12 ans », « À partir de 6 ans », « Jusqu'à 12 ans ». */
export function trancheAge(details: Pick<DetailsActivitePublique, "ageMin" | "ageMax">): string {
  const min = details.ageMin;
  const max = typeof details.ageMax === "number" ? details.ageMax : null;
  if (min !== undefined && max !== null) return min === max ? `${min} ans` : `De ${min} à ${max} ans`;
  if (min !== undefined && min > 0) return `À partir de ${min} ans`;
  if (max !== null) return `Jusqu'à ${max} ans`;
  return "";
}

/** Le contenu du panneau « En savoir plus » : un texte, et quelques repères. */
export function renseignementsActivite(details: DetailsActivitePublique | undefined): { description: string; puces: string[] } {
  if (!details) return { description: "", puces: [] };
  const puces: string[] = [];
  const age = trancheAge(details);
  if (age) puces.push(age);
  if (details.galopRequired) puces.push(`Niveau : ${details.galopRequired}`);
  if (details.conditionsAcces) puces.push(details.conditionsAcces);
  return { description: details.description || "", puces };
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
    // Promenade au niveau fixé par la première inscription : le niveau
    // verrouillé (ou « niveau à définir ») fait partie du titre annoncé.
    activityTitle: titreAvecNiveau({
      activityTitle: text(data.activityTitle) || "Activité équestre",
      activityType: text(data.activityType),
      niveauADefinir: data.niveauADefinir === true,
      niveauFixe: (data.niveauFixe as any) || null,
    }),
    activityType: text(data.activityType) || "animation",
    date,
    startTime: text(data.startTime),
    endTime: text(data.endTime),
    monitor: text(data.monitor),
    maxPlaces: Math.max(0, number(data.maxPlaces)),
    enrolledCount,
    status: status || undefined,
    // Fiche du catalogue : l'API y joint la description publique.
    activityId: text(data.activityId) || undefined,
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
