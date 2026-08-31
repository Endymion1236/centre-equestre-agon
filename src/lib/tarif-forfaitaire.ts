/**
 * src/lib/tarif-forfaitaire.ts — créneaux vendus à la sortie, pas au cavalier.
 *
 * Le prix d'un créneau s'applique normalement à CHAQUE cavalier inscrit :
 * deux places à 250 € font 500 €. C'est juste pour un cours, faux pour une
 * balade privatisée, vendue 250 € la sortie — que la famille vienne à un ou
 * à deux. Mettre 125 € par place ne règle rien : un cavalier seul paierait
 * alors la moitié d'une sortie qui mobilise autant de monde et de chevaux.
 *
 * Un créneau peut donc porter `tarifForfaitaire: true`. Le montant est alors
 * facturé UNE FOIS PAR FAMILLE : le premier cavalier inscrit le porte, les
 * suivants de la même famille sont à 0 €. Deux familles sans lien qui
 * réserveraient la même sortie paieraient chacune leur forfait — le club ne
 * travaille jamais gratuitement.
 *
 * Conséquence directe : un créneau au forfait est exclu du mécanisme « petit
 * groupe » (cron balades-petit-groupe). Un prix qui ne dépend pas du nombre
 * de participants ne peut pas donner lieu à un supplément pour manque de
 * participants.
 */

export interface CreneauTarifable {
  priceTTC?: number | null;
  priceHT?: number | null;
  tvaTaux?: number | null;
  tarifForfaitaire?: boolean | null;
}

interface InscritTarifable {
  childId?: string | null;
  familyId?: string | null;
}

/** Prix TTC affiché du créneau, quel que soit le champ renseigné. */
export function prixCreneauTTC(creneau: CreneauTarifable): number {
  const ttc = Number(creneau?.priceTTC) || 0;
  if (ttc > 0) return Math.round(ttc * 100) / 100;
  const ht = Number(creneau?.priceHT) || 0;
  if (ht <= 0) return 0;
  return Math.round(ht * (1 + (Number(creneau?.tvaTaux) || 5.5) / 100) * 100) / 100;
}

/**
 * Cavaliers d'une famille déjà inscrits sur ce créneau, hors celui qu'on est
 * en train d'inscrire.
 *
 * `enrolled` est relu en base après l'inscription : le cavalier ajouté s'y
 * trouve déjà, d'où l'exclusion par `childIdExclu`.
 */
export function inscritsMemeFamille(
  enrolled: InscritTarifable[] | null | undefined,
  familyId: string,
  childIdExclu?: string,
): number {
  if (!familyId) return 0;
  return (enrolled || []).filter(
    (e) => e?.familyId === familyId && (!childIdExclu || e?.childId !== childIdExclu),
  ).length;
}

/**
 * Prix à facturer pour UN cavalier de plus sur ce créneau.
 *
 * `dejaInscritsMemeFamille` : combien de cavaliers de la même famille sont
 * déjà sur ce créneau (ou déjà dans le panier en cours). Au-delà du premier,
 * un créneau au forfait ne facture plus rien.
 */
export function prixInscriptionCavalier(
  creneau: CreneauTarifable,
  dejaInscritsMemeFamille: number,
): number {
  const base = prixCreneauTTC(creneau);
  if (creneau?.tarifForfaitaire && dejaInscritsMemeFamille > 0) return 0;
  return base;
}

/**
 * Libellé du prix pour les écrans : « 250 € » devient « 250 € la sortie »
 * quand le tarif ne dépend pas du nombre de cavaliers.
 */
export function libellePrixCreneau(creneau: CreneauTarifable): string {
  const p = prixCreneauTTC(creneau);
  if (p <= 0) return "";
  const montant = `${p.toFixed(p % 1 === 0 ? 0 : 2).replace(".", ",")}€`;
  return creneau?.tarifForfaitaire ? `${montant} la sortie` : montant;
}
