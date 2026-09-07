/**
 * Erreurs d'authentification côté famille : codes stables et messages
 * français, à partir des codes Firebase (`auth/...`).
 *
 * Pourquoi un module à part : le contexte d'authentification attrapait ses
 * erreurs avec un `console.error` ou un `catch {}` muet, et l'écran ne savait
 * afficher que « Envoi impossible pour le moment ». Une famille bloquée
 * (Astrid, 07/09/2026) ne pouvait pas dire si c'était le réseau, un quota
 * Firebase ou une session périmée. Ici tout est pur et testable.
 */

// ───────────────────────── Envoi du lien de confirmation ─────────────────

export type CodeEnvoiConfirmation =
  | "trop-de-demandes"
  | "reseau"
  | "session-expiree"
  | "indisponible"
  | "aucun-compte"
  | "trop-tot"
  | "inconnue";

/** Délai minimal entre deux renvois du lien de confirmation. */
export const DELAI_RENVOI_MS = 60_000;

export function codeFirebase(err: unknown): string {
  const code = (err as { code?: unknown } | null)?.code;
  return typeof code === "string" ? code : "";
}

export function codeEnvoiConfirmation(err: unknown): CodeEnvoiConfirmation {
  switch (codeFirebase(err)) {
    case "auth/too-many-requests":
    case "auth/quota-exceeded":
      return "trop-de-demandes";
    case "auth/network-request-failed":
    case "auth/timeout":
      return "reseau";
    case "auth/user-token-expired":
    case "auth/invalid-user-token":
    case "auth/requires-recent-login":
    case "auth/user-not-found":
    case "auth/user-disabled":
    case "auth/null-user":
      return "session-expiree";
    case "auth/operation-not-allowed":
    case "auth/unauthorized-continue-uri":
    case "auth/invalid-continue-uri":
    case "auth/missing-continue-uri":
    case "auth/unauthorized-domain":
    case "auth/invalid-api-key":
    case "auth/app-not-authorized":
    case "auth/internal-error":
      return "indisponible";
    default:
      return "inconnue";
  }
}

export function messageEnvoiConfirmation(code: CodeEnvoiConfirmation, secondesRestantes = 0): string {
  switch (code) {
    case "trop-de-demandes":
      return "Trop de demandes d'envoi en peu de temps. Attendez une quinzaine de minutes avant de redemander le lien, et regardez d'abord dans vos indésirables.";
    case "reseau":
      return "Réseau indisponible : l'email n'a pas pu partir. Vérifiez votre connexion puis réessayez.";
    case "session-expiree":
      return "Votre session a expiré. Déconnectez-vous puis reconnectez-vous pour redemander le lien.";
    case "indisponible":
      return "L'envoi du lien est momentanément indisponible côté serveur. Prévenez le club, qui peut vous envoyer un lien de connexion directement.";
    case "aucun-compte":
      return "Aucun compte connecté : reconnectez-vous pour redemander le lien.";
    case "trop-tot":
      return `Un lien vient d'être envoyé. Vous pourrez en redemander un dans ${Math.max(1, secondesRestantes)} s.`;
    default:
      return "Envoi impossible pour le moment. Réessayez dans quelques minutes ou contactez le club.";
  }
}

export type ResultatEnvoiConfirmation =
  | { ok: true; envoyeA: number }
  | { ok: false; code: CodeEnvoiConfirmation; message: string; codeFirebase?: string };

/**
 * Secondes à attendre avant un nouvel envoi (0 = autorisé).
 * `dernierEnvoi` est l'horodatage du dernier envoi RÉUSSI : un échec ne
 * déclenche pas de temporisation, la famille peut réessayer tout de suite.
 */
export function secondesAvantRenvoi(dernierEnvoi: number | null, maintenant: number, delai = DELAI_RENVOI_MS): number {
  if (dernierEnvoi === null) return 0;
  const restant = delai - (maintenant - dernierEnvoi);
  return restant > 0 ? Math.ceil(restant / 1000) : 0;
}

// ───────────────────────── Connexion Google / Facebook ────────────────────

export type Fournisseur = "google" | "facebook";

export type CodeConnexionFournisseur =
  | "popup-bloquee"
  | "annulee"
  | "domaine-non-autorise"
  | "conflit-identifiants"
  | "reseau"
  | "compte-desactive"
  | "inconnue";

export function codeConnexionFournisseur(err: unknown): CodeConnexionFournisseur {
  switch (codeFirebase(err)) {
    case "auth/popup-blocked":
      return "popup-bloquee";
    case "auth/popup-closed-by-user":
    case "auth/cancelled-popup-request":
    case "auth/user-cancelled":
      return "annulee";
    case "auth/unauthorized-domain":
    case "auth/operation-not-supported-in-this-environment":
    case "auth/operation-not-allowed":
      return "domaine-non-autorise";
    case "auth/account-exists-with-different-credential":
    case "auth/credential-already-in-use":
    case "auth/email-already-in-use":
      return "conflit-identifiants";
    case "auth/network-request-failed":
    case "auth/timeout":
      return "reseau";
    case "auth/user-disabled":
      return "compte-desactive";
    default:
      return "inconnue";
  }
}

export function messageConnexionFournisseur(code: CodeConnexionFournisseur, fournisseur: Fournisseur): string {
  const nom = fournisseur === "google" ? "Google" : "Facebook";
  switch (code) {
    case "popup-bloquee":
      return `Votre navigateur a bloqué la fenêtre de connexion ${nom}. Autorisez les fenêtres surgissantes pour ce site, puis réessayez.`;
    case "annulee":
      return `Connexion ${nom} annulée avant la fin. Réessayez quand vous voulez.`;
    case "domaine-non-autorise":
      return `La connexion ${nom} n'est pas disponible depuis cette adresse de site. Prévenez le club ; en attendant, utilisez le lien de connexion par email.`;
    case "conflit-identifiants":
      return `Cette adresse est déjà utilisée avec une autre méthode de connexion. Essayez l'autre bouton, ou le lien de connexion par email.`;
    case "reseau":
      return `Réseau indisponible pendant la connexion ${nom}. Vérifiez votre connexion puis réessayez.`;
    case "compte-desactive":
      return "Ce compte a été désactivé. Contactez le club.";
    default:
      return `Connexion ${nom} impossible pour le moment. Réessayez, ou utilisez le lien de connexion par email.`;
  }
}

/** Erreur remontée par signInWithGoogle / signInWithFacebook jusqu'à l'écran. */
export class ErreurConnexion extends Error {
  readonly code: CodeConnexionFournisseur;
  readonly fournisseur: Fournisseur;
  readonly codeFirebase: string;
  constructor(err: unknown, fournisseur: Fournisseur) {
    const code = codeConnexionFournisseur(err);
    super(messageConnexionFournisseur(code, fournisseur));
    this.name = "ErreurConnexion";
    this.code = code;
    this.fournisseur = fournisseur;
    this.codeFirebase = codeFirebase(err);
  }
}

// ───────────────────────── Rattachement de la fiche ───────────────────────

export type CodeConfirmationAdresse =
  | "aucun-compte"
  | "toujours-non-verifiee"
  | "reseau"
  | "inconnue";

export function messageConfirmationAdresse(code: CodeConfirmationAdresse): string {
  switch (code) {
    case "aucun-compte":
      return "Aucun compte connecté : reconnectez-vous.";
    case "toujours-non-verifiee":
      return "Votre adresse n'apparaît pas encore comme confirmée. Ouvrez bien le lien reçu par email (regardez dans les indésirables), puis cliquez de nouveau ici.";
    case "reseau":
      return "Impossible de vérifier pour le moment : réseau indisponible. Réessayez dans un instant.";
    default:
      return "La vérification n'a pas abouti. Réessayez, ou déconnectez-vous puis reconnectez-vous.";
  }
}
