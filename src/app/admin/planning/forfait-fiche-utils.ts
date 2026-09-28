/**
 * src/app/admin/planning/forfait-fiche-utils.ts
 *
 * La fiche « forfait » (collection `forfaits`, écran Forfaits) et ses
 * commandes doivent dire la même chose.
 *
 * Septembre 2026, Anouk Tachefine : deux fiches identiques pour le même
 * cours, créées le même jour, et un prix de 699 € alors que la commande
 * avait été ramenée à 550 € (dix prélèvements de 55 €).
 *   - l'inscription annuelle créait la fiche sans regarder s'il en existait
 *     déjà une : une seconde tentative (après une erreur, ou un double clic)
 *     en posait une seconde — et, avec elle, une seconde commande ;
 *   - la correction du montant depuis le panneau mettait à jour commande et
 *     prélèvements, jamais la fiche.
 *
 * Module pur.
 */

const actif = (f: any) => f?.status !== "cancelled" && f?.status !== "resilie";

/** Fiche active déjà posée pour ce cavalier, ce créneau et cette saison. */
export function forfaitDejaActif(
  forfaits: any[],
  cible: { childId: string; slotKey: string; seasonStartYear: number },
): any | null {
  return forfaits.find(f =>
    actif(f)
    && f.childId === cible.childId
    && f.slotKey === cible.slotKey
    // Fiche ancienne sans saison : on la considère de la saison demandée
    // plutôt que de risquer un doublon.
    && (f.seasonStartYear === undefined || f.seasonStartYear === null || Number(f.seasonStartYear) === cible.seasonStartYear),
  ) || null;
}

/**
 * Fiches à remettre au prix après correction du montant : les fiches actives
 * du cavalier dont le créneau (`slotKey`) est celui des commandes corrigées
 * (`forfaitRef`). Aucune si les commandes ne désignent pas de forfait, ou si
 * elles portent aussi un autre cavalier.
 */
export function forfaitsDesCommandes(forfaits: any[], commandes: any[], childId: string): string[] {
  const refs = new Set(commandes.map(p => p?.forfaitRef).filter(Boolean));
  if (refs.size === 0) return [];
  // Commande de fratrie (plusieurs cavaliers en un règlement) : son total
  // n'est pas le prix du forfait de CE cavalier — on ne touche pas la fiche.
  const autreCavalier = commandes.some(p => (p?.items || []).some((i: any) => i?.childId && i.childId !== childId));
  if (autreCavalier) return [];
  return forfaits.filter(f => actif(f) && f.childId === childId && refs.has(f.slotKey)).map(f => f.id);
}
