/**
 * src/app/admin/devis/devis-modification.ts — modifier un devis.
 *
 * Octobre 2026 : Nicolas ne pouvait que créer, envoyer, convertir ou
 * supprimer un devis. Règles de la modification :
 *   - un devis converti ne se modifie plus : la commande existe ;
 *   - un brouillon se modifie librement ;
 *   - un devis déjà envoyé, accepté ou refusé repasse en brouillon « modifié,
 *     à renvoyer », avec un NOUVEAU lien de réponse : l'ancien lien, reçu par
 *     la famille, ne permet plus d'accepter l'ancienne version. Le numéro du
 *     devis ne change pas.
 * Module pur.
 */

export type StatutDevis = "draft" | "sent" | "accepted" | "refused" | "converted";

export function peutModifierDevis(statut: StatutDevis | string | undefined): boolean {
  return statut !== "converted";
}

/** Faut-il prévenir avant de modifier ? (le client a déjà la version actuelle, ou y a répondu) */
export function avertissementModification(statut: StatutDevis | string | undefined): string | null {
  if (statut === "sent") return "Ce devis a déjà été envoyé. Une fois modifié, il repassera en brouillon : il faudra le renvoyer, et l'ancien lien ne permettra plus de l'accepter.";
  if (statut === "accepted") return "Ce devis a été accepté. Le modifier annule cette acceptation : il repassera en brouillon et devra être renvoyé pour un nouvel accord.";
  if (statut === "refused") return "Ce devis a été refusé. Une fois modifié, il repassera en brouillon et pourra être renvoyé.";
  return null;
}

/** Champs d'état à écrire avec la modification. */
export function etatApresModification(
  d: { status: StatutDevis | string; totalTTC?: number },
  nouveauJeton: () => string,
  quand: string,
): Record<string, unknown> {
  const trace = { le: quand, statutAvant: d.status, totalAvant: d.totalTTC ?? null };
  if (d.status === "draft") return { modifieLe: quand };
  return { status: "draft", token: nouveauJeton(), modifieApresEnvoi: true, modifieLe: quand, derniereModification: trace };
}
