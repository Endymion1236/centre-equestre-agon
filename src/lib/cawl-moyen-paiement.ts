/**
 * src/lib/cawl-moyen-paiement.ts
 *
 * Le moyen de paiement RÉELLEMENT utilisé derrière une page CAWL.
 *
 * La page de paiement CAWL (Worldline) propose la carte, mais aussi PayPal,
 * Apple Pay, Google Pay… Le journal des encaissements étiquetait tout « CB
 * en ligne (CAWL) » : une maman avait réglé par PayPal, le back-office CAWL
 * le disait, notre journal non. Pour rapprocher les versements CAWL du
 * relevé bancaire, il faut savoir par quel canal l'argent est arrivé.
 *
 * Le canal reste `cb_online` (c'est le mode « encaissé par CAWL », dont
 * dépendent remises et rapprochement) ; le moyen précis est porté à côté
 * (`moyenPaiement`) et dans le libellé lisible. Module pur.
 */

export type MoyenPaiementCawl = "carte" | "paypal" | "apple_pay" | "google_pay" | "bancontact" | "autre";

export interface MoyenCawl {
  moyen: MoyenPaiementCawl;
  /** « Carte bancaire », « PayPal »… */
  libelle: string;
  /** Identifiant produit CAWL (130 = CB, 840 = PayPal…), quand il est connu. */
  produit: number | null;
}

/** Produits de paiement Worldline/CAWL rencontrés ou attendus sur la page. */
const PRODUITS: Record<number, { moyen: MoyenPaiementCawl; libelle: string }> = {
  1: { moyen: "carte", libelle: "Carte Visa" },
  2: { moyen: "carte", libelle: "Carte American Express" },
  3: { moyen: "carte", libelle: "Carte Mastercard" },
  130: { moyen: "carte", libelle: "Carte bancaire (CB)" },
  840: { moyen: "paypal", libelle: "PayPal" },
  302: { moyen: "apple_pay", libelle: "Apple Pay" },
  320: { moyen: "google_pay", libelle: "Google Pay" },
  3012: { moyen: "bancontact", libelle: "Bancontact" },
};

/**
 * Lit `payment.paymentOutput` tel que CAWL le renvoie (retour de page ou
 * webhook) : la sortie spécifique au moyen porte l'identifiant produit ;
 * `paymentMethod` (« card », « redirect », « mobile ») sert de repli.
 */
export function moyenPaiementCawl(paymentOutput: any): MoyenCawl {
  const po = paymentOutput || {};
  const produit: number | null =
    po.redirectPaymentMethodSpecificOutput?.paymentProductId
    ?? po.cardPaymentMethodSpecificOutput?.paymentProductId
    ?? po.mobilePaymentMethodSpecificOutput?.paymentProductId
    ?? null;
  if (produit != null && PRODUITS[produit]) return { ...PRODUITS[produit], produit };
  const methode = String(po.paymentMethod || "").toLowerCase();
  if (methode === "card" || po.cardPaymentMethodSpecificOutput) return { moyen: "carte", libelle: "Carte bancaire", produit };
  if (methode === "mobile") return { moyen: "autre", libelle: `Paiement mobile${produit != null ? ` (produit ${produit})` : ""}`, produit };
  if (methode === "redirect" || po.redirectPaymentMethodSpecificOutput) return { moyen: "autre", libelle: `Paiement redirigé${produit != null ? ` (produit ${produit})` : ""}`, produit };
  return { moyen: "carte", libelle: "Carte bancaire", produit };
}

/**
 * Libellé du journal des encaissements. La carte garde « CB en ligne (CAWL) »,
 * les autres moyens sont nommés : « PayPal via CAWL (acompte) ».
 */
export function libelleEncaissementCawl(moyen: MoyenCawl, complement?: string | null): string {
  if (moyen.moyen === "carte") return complement ? `CB en ligne CAWL (${complement})` : "CB en ligne (CAWL)";
  return `${moyen.libelle} via CAWL${complement ? ` (${complement})` : ""}`;
}
