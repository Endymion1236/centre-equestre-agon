/**
 * src/lib/message-erreur.ts — dire ce qui a échoué.
 *
 * Les routes d'administration répondaient « Erreur interne » en gardant le
 * motif dans les logs Vercel. Pour qui administre un centre équestre, c'est un
 * bouton qui ne marche pas, sans explication et sans recours : le 1er
 * septembre 2026, une facture a refusé de sortir pendant des heures avant
 * qu'on apprenne qu'il manquait une police de caractères au serveur.
 *
 * Ces routes sont réservées à l'administration : il n'y a rien à cacher à qui
 * les appelle. On renvoie donc le motif, sans la pile d'appels (illisible et
 * inutile ici), et on continue de journaliser l'erreur complète côté serveur.
 */

/** Motif lisible d'une erreur, tronqué pour tenir dans un message d'écran. */
export function messageErreur(e: unknown, longueurMax = 300): string {
  const brut = e instanceof Error ? e.message : String(e ?? "");
  const propre = brut.trim() || "cause inconnue";
  return propre.length > longueurMax ? `${propre.slice(0, longueurMax - 1)}…` : propre;
}
