/**
 * src/lib/devis-reponse.ts
 *
 * Accepter ou refuser un devis depuis l'email, sans compte.
 *
 * Une famille répond depuis son espace, rubrique Paiements. Un
 * établissement, lui, n'a pas d'espace : une communauté de communes reçoit
 * le devis sur la boîte d'un centre de loisirs, et la personne qui le lit
 * n'a ni compte ni mot de passe. Le devis lui partait pourtant avec la
 * consigne d'aller valider dans son espace famille, ce qu'elle ne pouvait
 * pas faire.
 *
 * Le devis porte donc un jeton non devinable ; l'email d'un établissement
 * contient deux boutons qui mènent à une page publique où la réponse
 * s'enregistre. Module pur : ni Firestore, ni React.
 */

/** Un client « établissement » : collectivité, association, entreprise. */
export function estClientEtablissement(client: { accountType?: string | null; tags?: string[] | null } | null | undefined): boolean {
  const type = String(client?.accountType || "").trim().toLowerCase();
  if (type && type !== "particulier") return true;
  return Array.isArray(client?.tags) && client!.tags!.includes("etablissement");
}

/** Jeton d'un lien de réponse : 48 caractères hexadécimaux, tirés au hasard. */
export function nouveauJetonDevis(): string {
  const octets = new Uint8Array(24);
  globalThis.crypto.getRandomValues(octets);
  return Array.from(octets, (o) => o.toString(16).padStart(2, "0")).join("");
}

export const JETON_DEVIS_RE = /^[a-f0-9]{48}$/;

export type EtatReponseDevis = "ouvert" | "deja_repondu" | "converti" | "expire" | "introuvable";

/**
 * Ce que le lien permet encore. Un devis déjà répondu ou converti n'est
 * jamais rouvert : la page l'affiche tel qu'il est.
 */
export function etatReponseDevis(
  devis: { status?: string | null; validUntil?: string | null } | null | undefined,
  aujourdhui: string,
): EtatReponseDevis {
  if (!devis) return "introuvable";
  const statut = String(devis.status || "");
  if (statut === "converted") return "converti";
  if (statut === "accepted" || statut === "refused") return "deja_repondu";
  const fin = String(devis.validUntil || "").slice(0, 10);
  // Le dernier jour de validité reste ouvert : « valable jusqu'au 30 »
  // veut dire que le 30 au soir, on peut encore signer.
  if (/^\d{4}-\d{2}-\d{2}$/.test(fin) && fin < aujourdhui) return "expire";
  return "ouvert";
}

export function reponseValide(valeur: unknown): valeur is "accepted" | "refused" {
  return valeur === "accepted" || valeur === "refused";
}
