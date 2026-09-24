import { toParisDateString } from "./date-local";

/**
 * Garde-fou commun à tous les écrans : on n'encaisse que de l'argent reçu,
 * donc jamais à une date future (heure de Paris). Une échéance « à prévoir »
 * attend à sa date d'échéance, elle ne s'encaisse pas d'avance.
 */
export function refusDateEncaissement(customDate: string | undefined, maintenant: Date = new Date()): string | null {
  if (!customDate) return null;
  // Format inattendu : laissé aux appelants tel qu'avant, ce garde-fou ne vise que le futur.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(customDate)) return null;
  const aujourdHui = toParisDateString(maintenant);
  if (customDate > aujourdHui) {
    return `Date d'encaissement dans le futur (${customDate.split("-").reverse().join("/")}) : on n'encaisse que de l'argent reçu.`;
  }
  return null;
}
