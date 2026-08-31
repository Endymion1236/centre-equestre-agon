/**
 * Jeton des liens de paiement envoyés par email.
 *
 * ── Le problème qu'il résout ─────────────────────────────────────────────
 *
 * Le lien envoyé par email portait l'URL CAWL elle-même. Or une session CAWL
 * vit deux heures, et son URL de redirection trois : un lien envoyé le soir
 * était mort le lendemain matin. C'est arrivé à une famille le 31/08/2026,
 * qui n'a pas pu régler son acompte.
 *
 * L'email pointe désormais vers nous, et c'est le clic qui fabrique une
 * session neuve. Reste à s'assurer que celui qui clique a bien reçu le lien :
 * c'est le rôle de ce jeton.
 *
 * ── Ce qu'il garantit, et ce qu'il ne garantit pas ───────────────────────
 *
 * Il garantit que l'identifiant de paiement n'a pas été deviné ni fabriqué :
 * sans le secret du serveur, on ne peut pas signer. Il ne garantit pas
 * l'identité de celui qui clique — un lien transmis fonctionne. C'est
 * volontaire : un parent doit pouvoir faire régler par un grand-parent sans
 * qu'on lui demande de créer un compte. Le seul pouvoir conféré est de PAYER,
 * jamais de consulter des données ni de modifier quoi que ce soit.
 *
 * ── L'échéance ───────────────────────────────────────────────────────────
 *
 * Le jeton porte sa propre date de péremption, incluse dans la signature. Un
 * lien de paiement n'a pas vocation à vivre éternellement, mais l'échéance se
 * compte en semaines, pas en heures.
 */

import { createHmac, timingSafeEqual } from "crypto";

/** Durée de validité par défaut d'un lien de paiement. */
export const JOURS_VALIDITE = 30;

function secret(): string {
  return process.env.PAYMENT_LINK_SECRET
    || process.env.UNSUBSCRIBE_SECRET
    || process.env.CRON_SECRET
    || "ce-agon";
}

function signature(paymentId: string, echeance: number): string {
  return createHmac("sha256", secret())
    .update(`${paymentId}.${echeance}`)
    .digest("hex")
    .slice(0, 32);
}

/**
 * Jeton pour un paiement. Format : « échéance.signature », l'échéance étant
 * un horodatage en secondes — lisible, et surtout vérifiable sans avoir à
 * stocker quoi que ce soit en base.
 */
export function jetonPaiement(paymentId: string, jours = JOURS_VALIDITE): string {
  const echeance = Math.floor(Date.now() / 1000) + jours * 86400;
  return `${echeance}.${signature(paymentId, echeance)}`;
}

export type VerdictJeton = "ok" | "expire" | "invalide";

/** Vérifie un jeton. Distingue l'expiration de la falsification : la première
 *  mérite un message clair à la famille, la seconde non. */
export function verifierJetonPaiement(paymentId: string, jeton: string): VerdictJeton {
  if (!paymentId || !jeton) return "invalide";
  const [brutEcheance, signatureRecue] = jeton.split(".");
  const echeance = Number(brutEcheance);
  if (!Number.isFinite(echeance) || !signatureRecue) return "invalide";

  const attendue = Buffer.from(signature(paymentId, echeance));
  const recue = Buffer.from(signatureRecue);
  // Comparaison à temps constant : une comparaison ordinaire s'arrête au
  // premier caractère différent, ce qui laisse deviner la signature octet par
  // octet en mesurant le temps de réponse.
  if (attendue.length !== recue.length || !timingSafeEqual(attendue, recue)) return "invalide";

  // L'échéance est vérifiée APRÈS la signature : sinon on renseignerait sur la
  // validité d'une échéance choisie par l'appelant.
  return echeance * 1000 < Date.now() ? "expire" : "ok";
}
