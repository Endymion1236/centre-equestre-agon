/**
 * src/lib/statut-email.ts
 *
 * États de remise d'un email (webhook Resend, lib/resend-webhook), sans
 * dépendance serveur : lisible aussi par les écrans.
 */

export type StatutEmail = "sent" | "delayed" | "delivered" | "opened" | "clicked" | "bounced" | "complained";

/** Plus le rang est haut, plus l'information est définitive. */
const RANG: Record<StatutEmail, number> = { sent: 0, delayed: 1, delivered: 2, opened: 3, clicked: 4, bounced: 5, complained: 5 };

/** Les événements arrivent parfois dans le désordre : on ne revient jamais en arrière. */
export function statutSuivant(actuel: string | undefined | null, nouveau: StatutEmail): StatutEmail {
  const a = (actuel && actuel in RANG ? actuel : "sent") as StatutEmail;
  return RANG[nouveau] >= RANG[a] ? nouveau : a;
}

export const LIBELLE_STATUT_EMAIL: Record<StatutEmail, string> = {
  sent: "envoyé, remise non confirmée",
  delayed: "remise retardée",
  delivered: "remis",
  opened: "ouvert",
  clicked: "lien cliqué",
  bounced: "non remis",
  complained: "signalé comme spam",
};
