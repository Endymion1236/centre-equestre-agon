/**
 * src/app/admin/paiements/remise-groupee.ts — une remise en % sur toutes les
 * commandes réglées ensemble (« Encaisser ensemble »).
 *
 * Octobre 2026, Nicolas : « quand on décide d'encaisser plusieurs commandes,
 * peut-on mettre un pourcentage de réduction global sur l'ensemble ? ».
 *
 * Même règle que la remise d'une commande seule (ModaleModifierCommande) :
 * la remise est répartie sur les lignes, au prorata, et seulement sur une
 * commande encore modifiable — ni facture numérotée, ni règlement déjà reçu
 * (commande-verrou) : une facture émise ne se modifie pas, il faut un avoir.
 * Chaque ligne garde son prix d'origine et le motif de la remise ; la
 * somme des lignes retombe exactement sur le nouveau total (le reste
 * d'arrondi va à la plus grosse ligne).
 *
 * Module pur, testé seul (tests/unit/remise-groupee.test.ts).
 */
import { verrouCommande } from "./commande-verrou";
import { tauxTva } from "@/lib/tva-taux";

const cts = (n: unknown) => Math.round((Number(n) || 0) * 100);

/** Pourcentage saisi, borné à ]0 ; 100] ; null s'il n'y a rien à appliquer. */
export function pourcentageRemise(saisie: unknown): number | null {
  const n = Number(String(saisie ?? "").replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(100, Math.round(n * 100) / 100);
}

/** Les lignes d'une commande après remise, et son nouveau total. */
export function lignesRemisees(items: any[], pct: number): { items: any[]; totalTTC: number; remise: number } {
  const avant = items.reduce((s, i) => s + cts(i.priceTTC), 0);
  const cible = Math.round(avant * (1 - pct / 100));
  const positives = items.map((i, k) => ({ k, c: cts(i.priceTTC) })).filter((x) => x.c > 0);
  const basePositive = positives.reduce((s, x) => s + x.c, 0);
  // La remise ne porte que sur les lignes positives (une ligne de remise
  // existante n'est pas « remisée » une seconde fois).
  const aRetirer = avant - cible;
  const parts = new Map<number, number>();
  for (const x of positives) parts.set(x.k, Math.round((x.c * aRetirer) / (basePositive || 1)));
  const reste = aRetirer - [...parts.values()].reduce((s, v) => s + v, 0);
  if (reste && positives.length) {
    const plusGrosse = positives.reduce((a, b) => (b.c > a.c ? b : a));
    parts.set(plusGrosse.k, (parts.get(plusGrosse.k) || 0) + reste);
  }
  const nouvelles = items.map((i, k) => {
    const retrait = parts.get(k);
    if (!retrait) return i;
    const ttc = (cts(i.priceTTC) - retrait) / 100;
    const taux = tauxTva(i.tva, i.tvaTaux);
    return {
      ...i,
      priceTTC: ttc,
      priceHT: Math.round((ttc / (1 + taux / 100)) * 100) / 100,
      originalPriceTTC: i.originalPriceTTC ?? i.priceTTC,
      discountReasons: [...(Array.isArray(i.discountReasons) ? i.discountReasons : []), `Remise globale ${String(pct).replace(".", ",")} %`],
    };
  });
  return { items: nouvelles, totalTTC: cible / 100, remise: aRetirer / 100 };
}

export interface PlanRemiseGroupee {
  /** Commandes remisées : id, nouvelles lignes, nouveau total. */
  remisees: { id: string; items: any[]; totalTTC: number; remise: number }[];
  /** Commandes laissées telles quelles, avec le motif. */
  exclues: { id: string; motif: string }[];
  remiseTotale: number;
}

/** Ce que la remise change, commande par commande, avant toute écriture. */
export function planRemiseGroupee(commandes: any[], pct: number): PlanRemiseGroupee {
  const remisees: PlanRemiseGroupee["remisees"] = [];
  const exclues: PlanRemiseGroupee["exclues"] = [];
  for (const p of commandes) {
    const v = verrouCommande(p);
    if (v.verrouillee) {
      exclues.push({ id: p.id, motif: v.motif === "facture" ? `facture ${p.invoiceNumber} déjà émise` : "un règlement a déjà été reçu" });
      continue;
    }
    const r = lignesRemisees(p.items || [], pct);
    if (r.remise > 0) remisees.push({ id: p.id, ...r });
  }
  return { remisees, exclues, remiseTotale: Math.round(remisees.reduce((s, r) => s + r.remise, 0) * 100) / 100 };
}
