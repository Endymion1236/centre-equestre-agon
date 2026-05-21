/**
 * Utilitaires pour manipuler les dates en heure locale (sans décalage UTC).
 *
 * ⚠️ Pourquoi ?
 * `new Date().toISOString().split("T")[0]` renvoie la date en UTC, ce qui
 * cause un décalage d'un jour pour les utilisateurs en France à partir
 * de 23h (heure d'hiver) ou 22h (heure d'été).
 *
 * Exemple à 23h30 le 21 mai en France (UTC+2) :
 *   new Date().toISOString().split("T")[0]  →  "2026-05-21" puis +2h... → "2026-05-22" ❌
 *   toLocalDateString(new Date())           →  "2026-05-21" ✅
 *
 * Règle simple :
 *   - Pour une DATE (jour calendaire) → utiliser ces helpers
 *   - Pour un TIMESTAMP (instant précis) → garder new Date().toISOString()
 */

/**
 * Renvoie la date locale au format YYYY-MM-DD.
 *
 * @param date - Date à formater (par défaut : maintenant)
 * @returns string au format YYYY-MM-DD basé sur la timezone locale
 *
 * @example
 *   toLocalDateString()                    // "2026-05-21" (aujourd'hui en local)
 *   toLocalDateString(new Date("2026-01-01T22:30:00Z"))  // "2026-01-01" en France (UTC+1)
 */
export function toLocalDateString(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Renvoie la date d'aujourd'hui au format YYYY-MM-DD en local.
 * Raccourci pratique pour `toLocalDateString()`.
 */
export function todayLocalString(): string {
  return toLocalDateString();
}

/**
 * Renvoie la date locale dans N jours au format YYYY-MM-DD.
 *
 * @param days - Nombre de jours à ajouter (peut être négatif)
 * @param from - Date de départ (par défaut : aujourd'hui)
 *
 * @example
 *   addDaysLocal(30)   // "2026-06-20" si on est le 21 mai
 *   addDaysLocal(-7)   // "2026-05-14" si on est le 21 mai
 */
export function addDaysLocal(days: number, from: Date = new Date()): string {
  const d = new Date(from);
  d.setDate(d.getDate() + days);
  return toLocalDateString(d);
}
