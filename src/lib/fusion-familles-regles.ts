/**
 * src/lib/fusion-familles-regles.ts — règles de fusion lisibles côté
 * navigateur.
 *
 * `fusion-familles.ts` importe firebase-admin (serveur) : un écran qui en
 * importe une fonction, même pure, casse la construction du site (Avoirs,
 * 19/10/2026 : « Can't resolve 'fs' », plus aucun déploiement). Ce qui doit
 * servir à un écran vit ici, sans aucun import.
 */

/**
 * Tous les identifiants sous lesquels une même famille a pu être enregistrée :
 * la fiche elle-même, celle qui l'a absorbée le cas échéant, et toutes celles
 * absorbées par l'une ou l'autre. Une commande, un avoir, une réservation
 * peut encore porter l'ancien identifiant ; chercher « les commandes de la
 * famille » doit regarder tous ces identifiants (COSTEGROSSE, 19/10/2026 :
 * l'avoir sur une fiche, la commande du stage sur l'autre, « aucune commande
 * à créditer »).
 */
export function identifiantsRattaches(
  familyId: string,
  fiches: { id: string; status?: string | null; mergedInto?: string | null }[],
): string[] {
  const parId = new Map(fiches.map((f) => [f.id, f]));
  // Remonter jusqu'à la fiche vivante.
  let racine = familyId;
  const vus = new Set<string>();
  while (!vus.has(racine)) {
    vus.add(racine);
    const f = parId.get(racine);
    if (f?.status === "merged" && f.mergedInto) racine = f.mergedInto;
    else break;
  }
  const ids = new Set<string>([familyId, racine]);
  // Puis toutes les fiches absorbées par la racine, de proche en proche.
  let ajout = true;
  while (ajout) {
    ajout = false;
    for (const f of fiches) {
      if (f.status === "merged" && f.mergedInto && ids.has(f.mergedInto) && !ids.has(f.id)) { ids.add(f.id); ajout = true; }
    }
  }
  return [...ids];
}
