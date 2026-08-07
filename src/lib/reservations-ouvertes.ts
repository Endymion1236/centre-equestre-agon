import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { isAdminToken } from "@/lib/api-auth";

/**
 * Verrou des réservations en ligne côté FAMILLE.
 *
 * Contexte : tant que le site n'est pas officiellement ouvert, des visiteurs
 * peuvent réserver et payer en ligne alors que rien n'est prêt. Masquer les
 * boutons ne suffit pas — l'espace cavalier est installé en PWA chez plusieurs
 * familles, avec des pages en cache qui mènent directement au paiement. Le
 * blocage doit donc vivre dans les routes serveur.
 *
 * Le réglage est relu à CHAQUE requête depuis Firestore : en serverless, une
 * variable en mémoire ne survit pas d'un appel à l'autre (leçon du mode
 * restreint des emails). Aucun redéploiement n'est nécessaire pour ouvrir ou
 * fermer.
 *
 * Choix de repli assumé : si le document est absent ou si la lecture échoue,
 * on considère les réservations OUVERTES. Un incident Firestore ne doit pas
 * bloquer les encaissements une fois le site en service ; la fermeture est un
 * acte volontaire, elle doit être écrite noir sur blanc.
 */

export const MESSAGE_PAR_DEFAUT =
  "Les réservations en ligne ne sont pas encore ouvertes. " +
  "Contactez le centre équestre pour toute demande.";

export interface ReglageReservations {
  ouvert: boolean;
  message: string;
}

export async function lireReglageReservations(): Promise<ReglageReservations> {
  try {
    const snap = await adminDb.collection("settings").doc("reservations").get();
    if (!snap.exists) return { ouvert: true, message: MESSAGE_PAR_DEFAUT };
    const d = snap.data() as any;
    return {
      ouvert: d?.ouvert !== false, // seul un false explicite ferme
      message: (d?.message || "").trim() || MESSAGE_PAR_DEFAUT,
    };
  } catch (e) {
    console.error("[reservations] lecture du réglage impossible — ouvert par défaut", e);
    return { ouvert: true, message: MESSAGE_PAR_DEFAUT };
  }
}

/**
 * À appeler en tête des routes de réservation/paiement côté famille.
 *
 * Retourne une réponse 403 à renvoyer telle quelle si le verrou est actif,
 * ou `null` si la requête peut continuer.
 *
 * @param decoded  Token décodé (résultat de verifyAuth). Les admins ne sont
 *                 JAMAIS bloqués : Nicolas continue d'inscrire et d'encaisser
 *                 depuis son interface pendant la fermeture.
 * @param options.autoriser  Échappatoire explicite pour les cas légitimes
 *                 pendant la fermeture (ex. régler un solde déjà dû).
 */
export async function bloquerSiReservationsFermees(
  decoded?: any,
  options?: { autoriser?: boolean }
): Promise<NextResponse | null> {
  if (options?.autoriser) return null;
  if (decoded && isAdminToken(decoded)) return null;

  const reglage = await lireReglageReservations();
  if (reglage.ouvert) return null;

  return NextResponse.json(
    { error: reglage.message, reservationsFermees: true },
    { status: 403 }
  );
}
