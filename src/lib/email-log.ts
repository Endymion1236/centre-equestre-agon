/**
 * Log centralisé des emails envoyés
 * Collection Firestore : emailsSent
 *
 * Métadonnées seulement (pas de HTML) — 90 jours de rétention.
 *
 * Utilisation côté API (routes) :
 *   import { logEmail } from "@/lib/email-log";
 *   await logEmail({ to, subject, context: "cron_rappel_j1", template: "rappelCours", status: "sent" });
 *
 * Utilisation côté /api/send-email : le log est automatique (appelé depuis la route).
 */

import { adminDb } from "./firebase-admin";

export interface EmailLogEntry {
  to: string | string[];
  subject: string;
  // Contexte source de l'envoi — clé courte stable pour filtres/stats
  context: string;
  // Nom du template utilisé (si applicable)
  template?: string;
  status: "sent" | "failed";
  // Message d'erreur si status=failed
  error?: string;
  // IDs utiles pour retrouver le contexte depuis le log (optionnels)
  familyId?: string;
  paymentId?: string;
  creneauId?: string;
  // Qui a déclenché l'envoi
  sentBy?: string; // UID admin ou "system" pour les crons
}

/**
 * Logge un email envoyé dans Firestore.
 * Ne throw jamais — même en cas d'erreur de log, on ne casse pas le flux d'envoi.
 */
export async function logEmail(entry: EmailLogEntry): Promise<void> {
  try {
    if (!adminDb) return;

    // Normalise to en string lisible
    const recipients = Array.isArray(entry.to) ? entry.to : [entry.to];
    const toStr = recipients.filter(Boolean).join(", ");

    const doc: any = {
      to: toStr,
      recipientCount: recipients.length,
      subject: entry.subject || "",
      context: entry.context || "unknown",
      status: entry.status,
      sentAt: new Date(),
      createdAt: new Date(), // pour nettoyage par âge
    };
    if (entry.template) doc.template = entry.template;
    if (entry.error) doc.error = String(entry.error).slice(0, 500);
    if (entry.familyId) doc.familyId = entry.familyId;
    if (entry.paymentId) doc.paymentId = entry.paymentId;
    if (entry.creneauId) doc.creneauId = entry.creneauId;
    if (entry.sentBy) doc.sentBy = entry.sentBy;

    await adminDb.collection("emailsSent").add(doc);
  } catch (err) {
    // Ne rien faire, juste logger en console
    console.error("[email-log] Erreur lors du log de l'email:", err);
  }
}

/**
 * Supprime les logs d'emails > maxDays jours (appelé depuis le cron quotidien).
 * Retourne le nombre de documents supprimés.
 */
export async function cleanupOldEmailLogs(maxDays = 90): Promise<number> {
  try {
    if (!adminDb) return 0;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - maxDays);

    const snap = await adminDb
      .collection("emailsSent")
      .where("createdAt", "<", cutoff)
      .limit(500) // batch raisonnable
      .get();

    if (snap.empty) return 0;

    const batch = adminDb.batch();
    snap.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();
    return snap.size;
  } catch (err) {
    console.error("[email-log] Cleanup failed:", err);
    return 0;
  }
}
