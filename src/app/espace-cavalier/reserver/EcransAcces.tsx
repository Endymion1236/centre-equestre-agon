"use client";

/**
 * src/app/espace-cavalier/reserver/EcransAcces.tsx
 *
 * Les deux écrans qui remplacent la page de réservation quand la famille ne
 * peut pas encore réserver : pas connectée, ou connectée sans fiche famille.
 *
 * Sortis de `page.tsx` parce que ce sont des retours anticipés (`return`) placés
 * juste avant le rendu principal : au milieu du fichier, ils cachaient la
 * frontière entre « la page ne s'affiche pas » et « la page s'affiche ».
 *
 * L'écran « profil incomplet » n'est PAS un message d'erreur : c'est le premier
 * contact d'un nouveau compte avec le centre. Il doit rester accueillant et
 * n'offrir qu'une seule action évidente — compléter le profil — sinon le
 * nouveau client abandonne avant sa première réservation.
 */

import { Card } from "@/components/ui";
import { lienAjoutCavalier } from "./utils-reservation";
import type { Creneau } from "./types";

/** Pas connecté */
export function EcranNonConnecte() {
  return (
    <div className="text-center py-20">
      <Card padding="lg">
        <p className="font-body text-sm text-gray-600">Connectez-vous pour accéder aux réservations.</p>
      </Card>
    </div>
  );
}

/** Connecté mais pas de fiche famille (nouveau compte) */
export function EcranProfilIncomplet({ bookingCreneau }: { bookingCreneau: Creneau | null }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4">
      <div className="text-5xl mb-4">🐴</div>
      <h2 className="font-display text-xl font-bold text-blue-800 mb-2 text-center">
        Bienvenue au centre équestre !
      </h2>
      <p className="font-body text-sm text-gray-500 text-center mb-6 max-w-xs">
        Votre compte est créé. Il ne reste plus qu&apos;à compléter votre profil
        (coordonnées + cavaliers) pour pouvoir réserver.
      </p>
      <a href={lienAjoutCavalier(bookingCreneau)}>
        <button className="font-body text-sm font-semibold text-white bg-blue-500 px-6 py-3 rounded-xl border-none cursor-pointer hover:bg-blue-400 transition-colors">
          Compléter mon profil →
        </button>
      </a>
      <p className="font-body text-xs text-gray-400 mt-4 text-center">
        Si vous avez déjà un dossier au centre, contactez-nous pour lier votre compte.
      </p>
    </div>
  );
}
