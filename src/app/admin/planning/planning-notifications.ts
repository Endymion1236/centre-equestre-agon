/**
 * src/app/admin/planning/planning-notifications.ts
 *
 * Prévenir l'équipe quand le planning bouge : création, modification,
 * suppression ou duplication de créneaux déclenchent une notification push
 * vers les moniteurs (API /api/planning/notify-staff).
 *
 * Pourquoi ce fichier est à part : c'est le seul effet de bord de la page qui
 * n'a PAS le droit de faire échouer l'action de l'admin. Un créneau supprimé
 * reste supprimé même si le serveur de push est en panne — la règle est
 * inscrite dans le catch ci-dessous et ne doit jamais devenir un `throw`.
 * Isolée ici, elle est visible d'un coup d'œil au lieu d'être répétée
 * mentalement à chaque appel dans les cinq handlers qui l'utilisent.
 */

import { authFetch } from "@/lib/auth-fetch";

export type PlanningChangeNotification = {
  action: "created" | "updated" | "deleted" | "duplicated";
  activityTitle?: string;
  date?: string;
  startTime?: string;
  endTime?: string;
  previousStartTime?: string;
  previousEndTime?: string;
  monitor?: string;
  count?: number;
};

export async function notifyPlanningChange(payload: PlanningChangeNotification) {
  try {
    const response = await authFetch("/api/planning/notify-staff", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) console.warn("Notification planning refusée :", response.status);
  } catch (error) {
    // La modification du planning reste validée même si le push est indisponible.
    console.warn("Notification planning non envoyée :", error);
  }
}
