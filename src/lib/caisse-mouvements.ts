/**
 * Ce qui est une recette, et ce qui n'est qu'un déplacement d'argent.
 *
 * Le livre de caisse contient deux natures d'écritures qu'il ne faut jamais
 * confondre :
 *
 *  - les **recettes** : un client a payé (espèces, CB, chèque…) ;
 *  - les **mouvements de trésorerie** : l'argent bouge sans qu'il y ait vente.
 *      • l'« apport en caisse » (fonds de caisse initial, appoint de monnaie
 *        amené par le gérant) — une entrée qui n'est pas un chiffre d'affaires ;
 *      • le « versement en banque » — une sortie qui n'est pas une dépense.
 *
 * Les deux doivent apparaître dans le livre de caisse, sinon le solde théorique
 * ne colle plus avec la caisse physique. Aucun des deux ne doit entrer dans le
 * chiffre d'affaires ni dans le ticket Z de la clôture journalière.
 *
 * Source unique : tout écran qui totalise des encaissements passe par ici.
 */

export interface MouvementCaisse {
  montant?: number;
  mode?: string;
  isApportCaisse?: boolean;
  isVersementBanque?: boolean;
}

/** Apport de fonds de caisse : entrée d'espèces sans vente. */
export function estApportCaisse(e: MouvementCaisse): boolean {
  return Boolean(e?.isApportCaisse);
}

/** Versement en banque : sortie d'espèces sans dépense. */
export function estVersementBanque(e: MouvementCaisse): boolean {
  return Boolean(e?.isVersementBanque);
}

/** Apport ou versement : l'argent se déplace, il ne se gagne pas. */
export function estMouvementDeTresorerie(e: MouvementCaisse): boolean {
  return estApportCaisse(e) || estVersementBanque(e);
}

/** Vraie recette : tout le reste (une vente encaissée). */
export function estRecette(e: MouvementCaisse): boolean {
  return !estMouvementDeTresorerie(e);
}

/** Référence lisible d'un apport, du même format que celle des versements. */
export function refApport(date: Date): string {
  return `APPORT-${date.toISOString().slice(0, 10).replace(/-/g, "")}`;
}
