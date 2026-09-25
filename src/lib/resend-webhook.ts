/**
 * src/lib/resend-webhook.ts
 *
 * Savoir si un email est vraiment arrivé.
 *
 * « Envoyé » voulait seulement dire : accepté par Resend. Une adresse mal
 * saisie, une boîte pleine ou un filtre qui refuse l'email, et le lien de
 * paiement n'arrivait jamais — sans que personne au club ne le sache
 * (septembre 2026). Resend prévient l'application par un webhook signé
 * (Svix) : remis, rejeté, retardé, ouvert, cliqué, signalé comme spam.
 *
 * Module pur (crypto de Node seulement) : vérification de signature,
 * lecture de l'événement, ordre des états.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import type { StatutEmail } from "./statut-email";

export { LIBELLE_STATUT_EMAIL, statutSuivant, type StatutEmail } from "./statut-email";

const TOLERANCE_S = 5 * 60;

/**
 * Signature Svix : HMAC-SHA256 de « id.timestamp.corps » avec le secret
 * (whsec_… en base64), comparée à chacune des signatures « v1,… » de l'en-tête.
 * Un horodatage à plus de 5 minutes est refusé (rejeu).
 */
export function verifierSignatureResend(p: {
  id: string | null;
  timestamp: string | null;
  signatures: string | null;
  corps: string;
  secret: string;
  maintenant?: Date;
}): boolean {
  if (!p.id || !p.timestamp || !p.signatures || !p.secret) return false;
  const ts = Number(p.timestamp);
  const now = Math.floor((p.maintenant || new Date()).getTime() / 1000);
  if (!Number.isFinite(ts) || Math.abs(now - ts) > TOLERANCE_S) return false;
  let cle: Buffer;
  try { cle = Buffer.from(p.secret.replace(/^whsec_/, ""), "base64"); } catch { return false; }
  const attendu = createHmac("sha256", cle).update(`${p.id}.${p.timestamp}.${p.corps}`).digest();
  return p.signatures.split(" ").some((s) => {
    const [version, valeur] = s.split(",");
    if (version !== "v1" || !valeur) return false;
    const recu = Buffer.from(valeur, "base64");
    return recu.length === attendu.length && timingSafeEqual(recu, attendu);
  });
}

const PAR_TYPE: Record<string, StatutEmail> = {
  "email.delivered": "delivered",
  "email.delivery_delayed": "delayed",
  "email.bounced": "bounced",
  "email.complained": "complained",
  "email.opened": "opened",
  "email.clicked": "clicked",
};

/** Ce que dit l'événement, en clair pour l'écran. */
export function lireEvenementResend(ev: any): { emailId: string; statut: StatutEmail; raison: string; destinataires: string[] } | null {
  const statut = PAR_TYPE[String(ev?.type || "")];
  const emailId = String(ev?.data?.email_id || "");
  if (!statut || !emailId) return null;
  const destinataires = Array.isArray(ev?.data?.to) ? ev.data.to.map(String) : ev?.data?.to ? [String(ev.data.to)] : [];
  let raison = "";
  if (statut === "bounced") {
    const b = ev?.data?.bounce || {};
    const type = String(b.type || "").toLowerCase();
    const detail = String(b.message || b.subType || "").trim();
    raison = type === "permanent"
      ? "Adresse invalide ou inexistante : l'email n'a pas été remis."
      : type === "transient"
        ? "Boîte pleine ou serveur indisponible : l'email n'a pas été remis."
        : "L'email a été rejeté par le serveur du destinataire.";
    if (detail) raison += ` (${detail.slice(0, 160)})`;
  } else if (statut === "complained") {
    raison = "Le destinataire a signalé l'email comme indésirable.";
  } else if (statut === "delayed") {
    raison = "Remise retardée : le serveur du destinataire ne répond pas encore.";
  }
  return { emailId, statut, raison, destinataires };
}
