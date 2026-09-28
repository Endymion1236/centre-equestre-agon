/**
 * Recaler une commande sur le journal des encaissements.
 *
 * Le journal fait foi : `paidAmount` doit être la somme de ses écritures.
 * L'onglet Cohérence signalait quinze commandes (septembre 2026) dont le
 * journal portait un prélèvement SEPA ou un règlement, alors que la commande
 * affichait 0 € réglé — sans moyen de les remettre d'accord ailleurs qu'à la
 * main, commande par commande.
 *
 * Même calcul que le dépôt d'une remise SEPA (lib/sepa-remise) : l'encaissé
 * vient du journal, et une commande dont des prélèvements restent à venir
 * reste « sepa_scheduled ». Le journal n'est jamais modifié.
 *
 * Module pur, partagé avec les tests.
 */
import { etatCommandeApresRemise } from "@/lib/sepa-remise";

export interface RecalageCommande {
  paidAmount: number;
  status: "paid" | "sepa_scheduled" | "partial" | "pending";
  /** Posé seulement si la commande a un échéancier SEPA. */
  sepaRestant?: number;
}

const A_VENIR = new Set(["pending", "remis"]);

export function recalerCommandeSurJournal(
  commande: { totalTTC?: number; status?: string },
  encaissements: { montant?: number }[],
  echeancesSepa: { montant?: number; status?: string }[],
): RecalageCommande {
  const totalEncaisse = encaissements.reduce((s, e) => s + (Number(e.montant) || 0), 0);
  const restantes = echeancesSepa.filter(e => A_VENIR.has(String(e.status || "")));
  const etat = etatCommandeApresRemise({
    totalTTC: Number(commande.totalTTC) || 0,
    totalEncaisse,
    echeancesRestantes: restantes.length,
  });
  return {
    paidAmount: etat.paidAmount,
    status: etat.status,
    ...(echeancesSepa.length > 0
      ? { sepaRestant: Math.round(restantes.reduce((s, e) => s + (Number(e.montant) || 0), 0) * 100) / 100 }
      : {}),
  };
}
