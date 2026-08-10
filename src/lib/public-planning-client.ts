import { addCalendarDays, type PublicPlanningSlot } from "@/lib/public-planning";
import { toParisDateString } from "@/lib/date-local";

/**
 * Chargement mutualisé du planning public.
 *
 * La page d'accueil affiche deux composants qui ont besoin des mêmes données
 * — la bande d'état en haut et le bandeau des prochains stages. Chacun
 * appelait /api/public/planning de son côté, sur exactement la même période :
 * deux requêtes réseau identiques à chaque visite, et deux fois le travail
 * côté serveur.
 *
 * Ce module mémorise la requête en cours et son résultat pendant une courte
 * durée. Le second composant réutilise la promesse du premier, donc une seule
 * requête part. La fenêtre est volontairement brève : le planning bouge en
 * temps réel, et une place déjà prise affichée comme libre serait pire qu'un
 * appel de plus.
 */

const FENETRE_MS = 30_000;
const HORIZON_JOURS = 180;

let enCours: Promise<PublicPlanningSlot[]> | null = null;
let resultat: { slots: PublicPlanningSlot[]; a: number } | null = null;

export function chargerPlanningPublic(): Promise<PublicPlanningSlot[]> {
  if (resultat && Date.now() - resultat.a < FENETRE_MS) {
    return Promise.resolve(resultat.slots);
  }
  if (enCours) return enCours;

  const debut = toParisDateString();
  const fin = addCalendarDays(debut, HORIZON_JOURS);

  enCours = fetch(`/api/public/planning?start=${debut}&end=${fin}`, { cache: "no-store" })
    .then(async (res) => {
      if (!res.ok) throw new Error(`Planning public indisponible (${res.status})`);
      const payload = await res.json();
      const slots: PublicPlanningSlot[] = Array.isArray(payload?.slots) ? payload.slots : [];
      resultat = { slots, a: Date.now() };
      return slots;
    })
    .finally(() => {
      enCours = null;
    });

  return enCours;
}

/** Date du jour utilisée pour la requête, pour rester cohérent entre composants. */
export function jourPlanning(): string {
  return toParisDateString();
}
