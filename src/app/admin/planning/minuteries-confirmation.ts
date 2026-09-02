"use client";

/**
 * src/app/admin/planning/minuteries-confirmation.ts
 *
 * La minuterie qui déclenche l'envoi groupé d'une confirmation de stage.
 */

import { authFetch } from "@/lib/auth-fetch";

/**
 * Minuteries d'envoi des confirmations groupées.
 *
 * Hors du composant à dessein : le panneau se démonte entre deux inscriptions
 * (on change de créneau, de jour, de semaine), la confirmation en attente,
 * elle, reste due. Le cron `/api/cron/confirmations-stage` reste le filet :
 * si l'onglet est fermé avant l'échéance, c'est lui qui envoie.
 */
const minuteriesConfirmation = new Map<string, ReturnType<typeof setTimeout>>();

export function programmerEnvoiConfirmation(familyId: string, envoiPrevuA: string) {
  const precedente = minuteriesConfirmation.get(familyId);
  if (precedente) clearTimeout(precedente);
  const attente = Math.max(3000, (Date.parse(envoiPrevuA) || 0) - Date.now() + 2000);
  minuteriesConfirmation.set(familyId, setTimeout(() => {
    minuteriesConfirmation.delete(familyId);
    // `force: false` : si une inscription de dernière minute a repoussé
    // l'échéance, l'envoi est simplement laissé au cron.
    authFetch("/api/admin/confirmation-stage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "envoyer", familyId, force: false }),
    }).catch(e => console.warn("Envoi confirmation groupée:", e));
  }, attente));
}

export function annulerMinuterieConfirmation(familyId: string) {
  const t = minuteriesConfirmation.get(familyId);
  if (t) { clearTimeout(t); minuteriesConfirmation.delete(familyId); }
}

