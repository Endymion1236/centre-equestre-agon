"use client";

/**
 * src/app/espace-cavalier/reserver/Bandeaux.tsx
 *
 * Les deux bandeaux affichés tout en haut de l'écran de réservation :
 * « réservations pas encore ouvertes » et « une place vous est réservée ».
 *
 * Séparés de `page.tsx` parce qu'ils ne dépendent d'aucune logique de
 * réservation : ce sont des annonces. Les garder à part évite qu'ils se
 * fassent absorber par la vue liste ou la vue planning, alors qu'ils doivent
 * rester visibles QUEL QUE SOIT le chemin d'arrivée sur la page (voir plus bas).
 */

import type { Creneau } from "./types";
import { holdActive } from "./utils-reservation";

/**
 * Verrou d'avant-ouverture : le blocage reel vit cote serveur, ce bandeau
 * evite juste a la famille de remplir un panier pour rien.
 */
export function BandeauReservationsFermees({ messageFermeture }: { messageFermeture: string }) {
  return (
    <div className="mb-5 rounded-2xl border-2 border-amber-300 bg-amber-50 p-4">
      <div className="font-body text-sm font-bold text-amber-900">
        Réservations en ligne pas encore ouvertes
      </div>
      <div className="mt-1 font-body text-sm text-amber-800">
        {messageFermeture ||
          "Les réservations en ligne ne sont pas encore ouvertes. Contactez le centre équestre pour toute demande."}
      </div>
    </div>
  );
}

/* Place(s) reservee(s) pour CETTE famille (hold 24h) : bandeau global,
   visible quel que soit le chemin d'arrivee. Le lien de l'email perdait
   son parametre ?creneau= a l'ouverture dans l'application installee
   (PWA demarre sur sa page d'accueil) — on ne depend donc plus de
   l'URL : les holds sont dans les donnees deja chargees. */
export function BandeauxPlacesReservees({
  creneaux, familyId, onAccepter,
}: {
  creneaux: Creneau[];
  familyId: string;
  onAccepter: (creneau: any, childId: string) => void;
}) {
  return (
    <>
      {creneaux.filter((c: any) => holdActive(c) && (c as any).waitlistHold?.familyId === familyId).map((c: any) => {
        const hold = (c as any).waitlistHold;
        const fin = new Date(hold.until);
        return (
          <div key={`hold_${c.id}`} className="mb-4 rounded-2xl border-2 border-green-300 bg-green-50 p-4">
            <div className="font-body text-sm font-bold text-green-800">
              🎉 Une place est réservée pour {hold.childName}
            </div>
            <div className="mt-1 font-body text-xs text-green-700">
              {c.activityTitle} — {new Date(c.date + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })} · {c.startTime}–{c.endTime}.
              À confirmer avant le {fin.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric" })} à {fin.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}.
            </div>
            <button
              onClick={() => onAccepter(c, hold.childId)}
              className="w-full mt-3 py-3 rounded-xl font-body text-sm font-bold text-white bg-green-600 hover:bg-green-500 border-none cursor-pointer">
              ✓ J'accepte cette place — passer au paiement
            </button>
          </div>
        );
      })}
    </>
  );
}
