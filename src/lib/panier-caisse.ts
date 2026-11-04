/**
 * src/lib/panier-caisse.ts — quantité et prix d'une ligne du panier de
 * l'onglet Encaisser.
 *
 * Demande de Nicolas (11/2026) : deux promenades en main se saisissaient en
 * deux lignes « Promenade en main », et le montant d'une ligne ne se
 * corrigeait pas dans le panier. Une ligne porte désormais une quantité et
 * un prix unitaire ; son total reste dans `priceTTC`/`priceHT`, que lisent la
 * facture, le FEC et la TVA (lignesAuTotal) sans rien changer. La facture
 * affiche déjà `quantity` et `puHT` (api/invoice-pdf).
 *
 * Pas de quantité sur une ligne liée à un créneau (stage, cours réservé) ni
 * sur un bon cadeau : un créneau, c'est une place ; un bon, un code.
 * Module sans import, testé (tests/unit/panier-caisse.test.ts).
 */

export interface LignePanier {
  id: string;
  activityTitle: string;
  activityId?: string;
  childId?: string;
  creneauId?: string;
  priceHT: number;
  priceTTC: number;
  tva: number;
  quantity?: number;
  puHT?: number;
  puTTC?: number;
  isBonCadeau?: boolean;
  [k: string]: any;
}

const arrondi = (n: number) => Math.round(n * 100) / 100;
const taux = (t: unknown) => { const n = Number(t); return Number.isFinite(n) && n >= 0 ? n : 0; };
const ht = (ttc: number, tva: unknown) => arrondi(ttc / (1 + taux(tva) / 100));

/** Quantité et prix modifiables sur cette ligne ? */
export const ligneAjustable = (l: LignePanier): boolean => !l.creneauId && !l.isBonCadeau;

/** Prix unitaire TTC de la ligne. */
export const prixUnitaire = (l: LignePanier): number =>
  arrondi(l.puTTC ?? (Number(l.priceTTC) || 0) / Math.max(1, Number(l.quantity) || 1));

/** Recalcule totaux et prix unitaires à partir d'une quantité et d'un prix unitaire TTC. */
function avec(l: LignePanier, quantite: number, unitaireTTC: number): LignePanier {
  const q = Math.max(1, Math.floor(quantite));
  const pu = arrondi(Math.max(0, unitaireTTC));
  const totalTTC = arrondi(pu * q);
  return { ...l, quantity: q, puTTC: pu, puHT: ht(pu, l.tva), priceTTC: totalTTC, priceHT: ht(totalTTC, l.tva) };
}

/** Change la quantité (au moins 1), le prix unitaire reste. */
export function changerQuantite(l: LignePanier, quantite: number): LignePanier {
  if (!ligneAjustable(l) || !Number.isFinite(quantite)) return l;
  return avec(l, quantite, prixUnitaire(l));
}

/** Change le prix unitaire TTC (0 ou plus), la quantité reste. */
export function changerPrixUnitaire(l: LignePanier, unitaireTTC: number): LignePanier {
  if (!ligneAjustable(l) || !Number.isFinite(unitaireTTC) || unitaireTTC < 0) return l;
  return avec(l, Number(l.quantity) || 1, unitaireTTC);
}

/**
 * Ajoute une ligne au panier. La même prestation pour le même cavalier, au
 * même prix, ne fait pas une seconde ligne : sa quantité augmente.
 */
export function ajouterAuPanier<T extends LignePanier>(panier: T[], ligne: T): T[] {
  if (ligneAjustable(ligne)) {
    const i = panier.findIndex((x) => ligneAjustable(x)
      && x.activityTitle === ligne.activityTitle
      && (x.activityId || "") === (ligne.activityId || "")
      && (x.childId || "") === (ligne.childId || "")
      && taux(x.tva) === taux(ligne.tva)
      && Math.abs(prixUnitaire(x) - prixUnitaire(ligne)) < 0.005);
    if (i >= 0) {
      const x = panier[i];
      const suivant = [...panier];
      suivant[i] = avec(x, (Number(x.quantity) || 1) + (Number(ligne.quantity) || 1), prixUnitaire(x)) as T;
      return suivant;
    }
  }
  return [...panier, ligne];
}
