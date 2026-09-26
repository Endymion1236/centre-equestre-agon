import { prelevementPlanifie } from "@/lib/sepa-remise";

/**
 * Prélèvements SEPA programmés d'une famille, vus depuis les Impayés.
 *
 * Une commande planifiée en SEPA sort des Impayés (son règlement est en
 * cours) et ses échéances ne vivent que dans Prélèvements SEPA › Échéancier.
 * Filtré sur la famille, l'onglet Impayés affichait alors « 0 facture » sans
 * dire où était passée la commande : Nicolas venait de la répartir en 2× sur
 * deux mandats et ne retrouvait l'échéancier nulle part (septembre 2026).
 *
 * Ce module relie chaque commande SEPA de la famille à ses échéances (par
 * `paymentId`, ou `orderId` pour les forfaits inscrits depuis le planning) et
 * signale la commande marquée SEPA sans aucune échéance à prélever — celle-là
 * ne serait réclamée nulle part.
 */

export interface EcheanceSepaResume {
  id: string;
  mandatId?: string;
  montant?: number;
  dateEcheance?: string;
  status?: string;
  paymentId?: string | null;
  orderId?: string | null;
  familyId?: string;
}

export interface CommandePrelevee {
  paymentId: string;
  libelle: string;
  totalTTC: number;
  /** Échéances encore à prélever (en attente ou dans une remise non déposée). */
  aVenir: number;
  montantAVenir: number;
  prochaineDate: string | null;
  derniereDate: string | null;
  /** Mandats débités : deux quand l'échéancier est réparti père / mère. */
  mandats: string[];
  /** Marquée SEPA, mais aucune échéance à prélever : rien ne sera prélevé. */
  sansEcheance: boolean;
}

const A_PRELEVER = new Set(["pending", "remis"]);

function aPrelever(e: EcheanceSepaResume): boolean {
  return A_PRELEVER.has(String(e.status || ""));
}

export function prelevementsDeLaFamille(
  familyId: string,
  payments: any[],
  echeances: EcheanceSepaResume[],
): { commandes: CommandePrelevee[]; echeancesSansCommande: number } {
  const commandesSepa = payments.filter(p =>
    p?.familyId === familyId
    && p?.status !== "cancelled" && p?.status !== "paid"
    && prelevementPlanifie(p),
  );
  const ech = echeances.filter(e => e.familyId === familyId);
  const rattachees = new Set<string>();

  const commandes = commandesSepa.map((p): CommandePrelevee => {
    const siennes = ech.filter(e =>
      (e.paymentId && e.paymentId === p.id) || (!e.paymentId && p.orderId && e.orderId === p.orderId),
    );
    siennes.forEach(e => rattachees.add(e.id));
    const aVenir = siennes.filter(aPrelever).sort((a, b) => String(a.dateEcheance || "").localeCompare(String(b.dateEcheance || "")));
    const montantAVenir = Math.round(aVenir.reduce((s, e) => s + (Number(e.montant) || 0), 0) * 100) / 100;
    return {
      paymentId: p.id,
      libelle: (p.items || []).map((i: any) => i?.activityTitle).filter(Boolean).join(", ") || "Commande",
      totalTTC: Number(p.totalTTC) || 0,
      aVenir: aVenir.length,
      montantAVenir,
      prochaineDate: aVenir[0]?.dateEcheance || null,
      derniereDate: aVenir[aVenir.length - 1]?.dateEcheance || null,
      mandats: [...new Set(aVenir.map(e => e.mandatId).filter((m): m is string => !!m))],
      sansEcheance: aVenir.length === 0,
    };
  });

  const echeancesSansCommande = ech.filter(e => aPrelever(e) && !rattachees.has(e.id)).length;
  return { commandes, echeancesSansCommande };
}
