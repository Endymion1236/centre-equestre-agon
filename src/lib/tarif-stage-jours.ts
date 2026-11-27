/**
 * src/lib/tarif-stage-jours.ts — prix d'une semaine de stage selon son
 * nombre de jours.
 *
 * Une activité de stage porte des tarifs dégressifs (« 1 jour », « 2 jours »,
 * « 3 jours », « 4 jours », recopiés sur ses créneaux). Le panneau
 * d'inscription du planning les appliquait, mais la réservation en ligne
 * et le contrôle des prix du serveur prenaient toujours le prix plein du
 * créneau : la semaine de Noël (4 jours, 144 €) a été vendue 160 €
 * (COSTEGROSSE, 27/11/2026).
 *
 * Règle (identique à `tarifStage` de lib/changement-groupe et au panneau) :
 * le tarif configuré pour ce nombre de jours s'il existe et ne dépasse pas
 * le prix plein, sinon le prix plein. Pur, sans import.
 */

export interface CreneauTarifStage {
  priceTTC?: number;
  priceHT?: number;
  tvaTaux?: number;
  price1day?: number | null;
  price2days?: number | null;
  price3days?: number | null;
  price4days?: number | null;
}

const arrondi = (n: number) => Math.round(n * 100) / 100;

/** Prix plein (TTC) du créneau : priceTTC, sinon priceHT + TVA (5,5 % par défaut). */
export function prixPleinStage(cr: CreneauTarifStage | null | undefined): number {
  if (!cr) return 0;
  if (typeof cr.priceTTC === "number" && cr.priceTTC > 0) return arrondi(cr.priceTTC);
  if (typeof cr.priceHT === "number" && cr.priceHT > 0) return arrondi(cr.priceHT * (1 + (cr.tvaTaux ?? 5.5) / 100));
  return 0;
}

/** Prix de la semaine de stage qui compte `nbJours` jours. */
export function tarifSemaineStage(cr: CreneauTarifStage | null | undefined, nbJours: number): number {
  const plein = prixPleinStage(cr);
  if (!cr) return plein;
  const parJours: Record<number, number | null | undefined> = { 1: cr.price1day, 2: cr.price2days, 3: cr.price3days, 4: cr.price4days };
  const configure = Number(parJours[Math.round(nbJours)]);
  return Number.isFinite(configure) && configure > 0 && (plein === 0 || configure <= plein + 0.005) ? arrondi(configure) : plein;
}

/** Nombre de jours distincts d'une liste de créneaux d'une même semaine. */
export function nbJoursDistincts(creneaux: { date?: string }[]): number {
  return Math.max(1, new Set(creneaux.map((c) => c.date).filter(Boolean)).size);
}
