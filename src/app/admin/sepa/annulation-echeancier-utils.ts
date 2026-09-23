/**
 * src/app/admin/sepa/annulation-echeancier-utils.ts
 *
 * Annuler l'échéancier SEPA d'une commande créé par erreur (mauvais montant,
 * mauvais nombre d'échéances), pour le refaire.
 *
 * Cas vécu (septembre 2026) : un forfait annuel planifié en 10 échéances
 * avant d'avoir corrigé le montant. La corbeille ne retirait qu'une échéance
 * à la fois, et la commande restait « sepa_scheduled » avec son `sepaRestant` :
 * absente des impayés, et impossible à replanifier proprement.
 *
 * Règles :
 *   - on ne retire que les échéances encore « pending ». Une échéance remise
 *     à la banque (« remis ») ou prélevée n'est pas annulable ici : elle est
 *     dans un fichier déjà transmis, ou au journal. Si la série en contient,
 *     l'annulation est refusée en bloc — la retoucher à moitié laisserait une
 *     commande incohérente ;
 *   - la commande retrouve le statut que dit son encaissé : en attente si
 *     rien n'est réglé, partielle sinon. Elle réapparaît dans les impayés ;
 *   - aucune écriture comptable n'est touchée : une échéance planifiée n'est
 *     pas un encaissement.
 */

export interface EcheanceAnnulable {
  id: string;
  paymentId?: string | null;
  /** L'inscription annuelle relie ses échéances par le numéro de commande,
   *  sans paymentId ; la caisse, par paymentId. On reconnaît les deux. */
  orderId?: string | null;
  status: string;
  montant: number;
  dateEcheance?: string;
}

export interface PlanAnnulationEcheancier {
  possible: boolean;
  /** Échéances à retirer (toutes « pending »). */
  aRetirer: string[];
  montantRetire: number;
  /** Échéances qui empêchent l'annulation (remises ou prélevées). */
  bloquantes: EcheanceAnnulable[];
  /** Champs à poser sur la commande. `null` = champ à effacer. */
  commande: { status: "pending" | "partial" | "paid"; sepaRestant: null; paymentRef: string; paymentMode?: string };
  raison?: string;
}

export function planifierAnnulationEcheancier(
  paymentId: string,
  echeances: EcheanceAnnulable[],
  commande: { paidAmount?: number | null; totalTTC?: number | null; paymentMode?: string | null; orderId?: string | null },
): PlanAnnulationEcheancier {
  const orderId = commande.orderId || null;
  const serie = echeances.filter((e) => e.paymentId === paymentId || (!!orderId && e.orderId === orderId));
  const aRetirer = serie.filter((e) => e.status === "pending");
  const bloquantes = serie.filter((e) => e.status === "remis" || e.status === "preleve");
  const paye = Math.round((Number(commande.paidAmount) || 0) * 100) / 100;
  const total = Math.round((Number(commande.totalTTC) || 0) * 100) / 100;
  const status: "pending" | "partial" | "paid" = paye <= 0 ? "pending" : paye >= total && total > 0 ? "paid" : "partial";
  const base = {
    aRetirer: aRetirer.map((e) => e.id),
    montantRetire: Math.round(aRetirer.reduce((s, e) => s + (Number(e.montant) || 0), 0) * 100) / 100,
    bloquantes,
    // Sans encaissement, le mode « prélèvement » n'a plus de sens : la
    // commande repart vierge, comme avant la planification.
    commande: { status, sepaRestant: null as null, paymentRef: "", ...(paye <= 0 ? { paymentMode: "" } : {}) },
  };
  if (bloquantes.length > 0) {
    return { ...base, possible: false, raison: `${bloquantes.length} échéance(s) déjà remise(s) à la banque ou prélevée(s) : l'échéancier ne peut plus être annulé d'un bloc. Supprimez seulement les échéances à venir, une par une.` };
  }
  if (aRetirer.length === 0) {
    return { ...base, possible: false, raison: "Aucune échéance à venir sur cette commande." };
  }
  return { ...base, possible: true };
}
