/**
 * src/lib/ia-modeles.ts — les modèles d'IA du logiciel, à un seul endroit.
 *
 * Septembre 2026 : Nicolas fait passer toutes les fonctions sur les modèles
 * actuels. Elles tournaient sur quatre générations différentes (Sonnet 4.5,
 * Opus 4.5, Sonnet 4.6, Opus 5, Sonnet 5), chaque route écrivant son modèle
 * en dur. La prochaine mise à jour se fera ici.
 *
 * Deux règles de ces modèles, à respecter partout :
 *   - la réflexion interne est toujours active et COMPTE dans `max_tokens` :
 *     une limite taillée pour l'ancien modèle (60, 512…) coupait la réponse.
 *     D'où `effort: "low"` sur les rédactions courtes et des limites larges ;
 *   - la réponse peut commencer par un bloc de réflexion (vide) : on lit
 *     TOUS les blocs de texte, jamais `content[0]` (texteReponse).
 */

/** Analyses, lecture de documents, agent : le modèle le plus capable. */
export const MODELE_PRINCIPAL = "claude-opus-5-5";
/** Rédactions courantes (emails, descriptions, suggestions), borne, boîte mail. */
export const MODELE_REDACTION = "claude-sonnet-5-5";
/**
 * Petites extractions en masse (justificatifs, trésorerie, bulletins de paie,
 * repérage dans un mail). Haiku 5.5 depuis octobre 2026 (demande de Nicolas) :
 * plus fiable que Haiku 4.5 et dix fois moins cher. Comme les autres, il
 * réfléchit par défaut : chaque appel règle `effort: "low"` et garde une
 * limite large. Il refuse `temperature`, `top_p`, `top_k`, les budgets de
 * réflexion et les réponses préremplies (erreur 400).
 */
export const MODELE_LEGER = "claude-haiku-5-5";

/**
 * Limite de longueur d'une réponse, réflexion comprise. Assez large pour
 * qu'une réflexion, même courte, ne tronque jamais une réponse de quelques
 * lignes ; seuls les mots-jetons réellement produits sont facturés.
 */
export const LIMITE_REPONSE = 8000;

/** Tout le texte d'une réponse, quels que soient les blocs de réflexion qui le précèdent. */
export function texteReponse(message: { content: Array<{ type: string; text?: string }> }): string {
  return (message.content || [])
    .map((b) => (b.type === "text" ? b.text || "" : ""))
    .join("")
    .trim();
}
