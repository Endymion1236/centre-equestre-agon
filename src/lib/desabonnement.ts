import { createHmac } from "crypto";
import { adminDb } from "@/lib/firebase-admin";

/**
 * Désabonnement aux emails de communication.
 *
 * Obligation légale dès qu'un envoi sort du transactionnel : une campagne
 * vers plusieurs centaines de familles doit offrir un moyen simple de ne plus
 * la recevoir. Au-delà du droit, c'est aussi ce qui protège la réputation du
 * domaine d'envoi — une famille qui ne trouve pas de lien clique sur
 * « signaler comme indésirable », et c'est tout le domaine qui en pâtit.
 *
 * Ce qui reste TOUJOURS envoyé, désabonnement ou non : confirmations de
 * réservation, factures, rappels d'échéance, liens de connexion. Ce sont des
 * messages transactionnels, attendus par la famille et souvent nécessaires à
 * l'exécution du contrat.
 */

/** Contextes considérés comme de la communication, donc désabonnables. */
const CONTEXTES_MARKETING = new Set([
  "admin_communication",
  "offre_derniere_minute",
  "relance_reinscription",
]);

export function estMarketing(context?: string): boolean {
  return !!context && CONTEXTES_MARKETING.has(context);
}

/**
 * Jeton de désabonnement : signature du familyId. Empêche qu'on désabonne
 * quelqu'un d'autre en devinant un identifiant, sans imposer de connexion —
 * exiger un compte pour se désabonner reviendrait à ne pas offrir le moyen.
 */
export function jetonDesabonnement(familyId: string): string {
  const secret = process.env.UNSUBSCRIBE_SECRET || process.env.CRON_SECRET || "ce-agon";
  return createHmac("sha256", secret).update(familyId).digest("hex").slice(0, 32);
}

export function jetonValide(familyId: string, jeton: string): boolean {
  return !!familyId && !!jeton && jetonDesabonnement(familyId) === jeton;
}

/** La famille a-t-elle refusé les emails de communication ? */
export async function estDesabonne(familyId?: string): Promise<boolean> {
  if (!familyId) return false;
  try {
    const snap = await adminDb.collection("families").doc(familyId).get();
    return snap.exists && (snap.data() as any)?.desabonneEmails === true;
  } catch {
    // En cas de doute on n'envoie PAS : mieux vaut un message manquant qu'un
    // envoi à quelqu'un qui l'a explicitement refusé.
    return true;
  }
}

/** Pied de page légal, ajouté aux seuls emails de communication. */
export function piedDesabonnement(familyId: string, baseUrl: string): string {
  const lien = `${baseUrl}/desabonnement?f=${encodeURIComponent(familyId)}&t=${jetonDesabonnement(familyId)}`;
  return `<hr style="margin:20px 0;border:none;border-top:1px solid #eee;" />
    <p style="color:#999;font-size:11px;line-height:1.5;">
      Vous recevez ce message en tant que membre du Centre Équestre d'Agon-Coutainville.<br />
      <a href="${lien}" style="color:#999;">Ne plus recevoir nos actualités</a> —
      les confirmations de réservation et les factures continueront de vous être envoyées.
    </p>`;
}
