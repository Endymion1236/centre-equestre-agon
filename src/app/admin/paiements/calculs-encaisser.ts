/**
 * src/app/admin/paiements/calculs-encaisser.ts
 *
 * Les décisions de l'onglet « Encaisser » qui ne dépendent d'aucun état
 * React : quelles familles la recherche laisse passer, combien vaut la
 * remise appliquée, et quelles commandes impayées ont déjà un règlement en
 * route.
 *
 * Pourquoi les isoler : ce sont des règles d'argent (la remise) et des
 * garde-fous comptables (le règlement en cours), pas de l'affichage. Tant
 * qu'elles vivaient dans le corps du composant, la même formule de remise
 * était réécrite à trois endroits — panier, panier révisé, impayés — et
 * rien ne garantissait qu'elles restent d'accord.
 */

import { safeNumber } from "@/lib/utils";
import type { Family } from "@/types";

/** Promo retenue à l'écran : soit un code du catalogue, soit rien. */
export interface PromoApplique {
  label: string;
  discountMode: string;
  discountValue: number;
}

/**
 * Familles correspondant à la recherche.
 *
 * La recherche porte aussi sur les PRÉNOMS DES ENFANTS : au comptoir, le
 * parent est souvent annoncé par « la maman de Léa ». Chaque mot tapé doit
 * être présent (et non l'un OU l'autre), pour que « martin lea » désigne
 * une seule famille.
 */
export const filtrerFamilles = <T extends Family>(familles: T[], recherche: string): T[] =>
  recherche
    ? familles.filter((f) => {
        const terms = recherche.toLowerCase().trim().split(/\s+/);
        const childText = (f.children || []).map((c: any) => `${c.firstName || ""} ${(c as any).lastName || ""}`).join(" ");
        const searchable = `${f.parentName || ""} ${f.parentEmail || ""} ${childText}`.toLowerCase();
        return terms.every(t => searchable.includes(t));
      })
    : familles;

/**
 * Montant de la remise à retrancher d'un total.
 *
 * Un code promo appliqué prend le pas sur la remise saisie à la main : les
 * deux champs se neutralisent à l'écran, on ne cumule jamais les deux.
 */
export const calculerRemise = (
  appliedPromo: PromoApplique | null,
  base: number,
  manualDiscount: string,
): number =>
  appliedPromo
    ? (appliedPromo.discountMode === "percent" ? base * appliedPromo.discountValue / 100 : appliedPromo.discountValue)
    : safeNumber(manualDiscount);

/**
 * Une commande a un règlement EN COURS si : SEPA programmé, chèque
 * différé enregistré, ou un encaissement déjà rattaché (acompte). On
 * ne la regroupe pas dans l'encaissement « tout d'un coup » : son
 * règlement suit déjà son cours, l'inclure créerait un double paiement.
 */
export const aReglementEnCours = (p: any, encaissements: any[]): boolean =>
  p.status === "sepa_scheduled" ||
  p.paymentMode === "cheque_differe" ||
  p.paymentMode === "prelevement_sepa" ||
  encaissements.some((e: any) => e.paymentId === p.id);
