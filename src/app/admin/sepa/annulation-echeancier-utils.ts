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
 *     à la banque (« remis ») ou prélevée reste : elle est dans un fichier
 *     déjà transmis, ou au journal ;
 *   - octobre 2026 (Éléonore GRENIER, forfait en 10×) : la 1re échéance était
 *     prélevée, l'annulation en bloc était refusée, les 9 autres ont été
 *     supprimées une à une et la commande est restée « prélèvement
 *     programmé » : visible sur la fiche, absente des impayés. Désormais on
 *     annule ce qui reste à venir même après un prélèvement passé, et une
 *     commande encore « programmée » sans aucune échéance à venir se remet
 *     d'aplomb (réparation) ;
 *   - une échéance « remis » (à la banque, pas encore confirmée) reste
 *     attendue : son montant reste couvert (`sepaRestant`), il n'est pas
 *     réclamé une seconde fois dans les impayés ;
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
  /** Échéances gardées : remises à la banque ou prélevées. */
  gardees: EcheanceAnnulable[];
  /** Champs à poser sur la commande. `sepaRestant: null` = champ à effacer. */
  commande: { status: "pending" | "partial" | "paid"; sepaRestant: number | null; paymentRef: string; paymentMode?: string };
  raison?: string;
}

export function planifierAnnulationEcheancier(
  paymentId: string,
  echeances: EcheanceAnnulable[],
  commande: { paidAmount?: number | null; totalTTC?: number | null; paymentMode?: string | null; orderId?: string | null; status?: string | null; sepaRestant?: number | null },
): PlanAnnulationEcheancier {
  const orderId = commande.orderId || null;
  const serie = echeances.filter((e) => e.paymentId === paymentId || (!!orderId && e.orderId === orderId));
  const aRetirer = serie.filter((e) => e.status === "pending");
  const gardees = serie.filter((e) => e.status === "remis" || e.status === "preleve");
  // Remis à la banque, pas encore confirmé : l'argent est attendu.
  const attendu = Math.round(serie.filter((e) => e.status === "remis").reduce((s, e) => s + (Number(e.montant) || 0), 0) * 100) / 100;
  const paye = Math.round((Number(commande.paidAmount) || 0) * 100) / 100;
  const total = Math.round((Number(commande.totalTTC) || 0) * 100) / 100;
  const status: "pending" | "partial" | "paid" = paye <= 0 ? "pending" : paye >= total && total > 0 ? "paid" : "partial";
  const base = {
    aRetirer: aRetirer.map((e) => e.id),
    montantRetire: Math.round(aRetirer.reduce((s, e) => s + (Number(e.montant) || 0), 0) * 100) / 100,
    bloquantes: [] as EcheanceAnnulable[],
    gardees,
    // Sans encaissement ni prélèvement attendu, le mode « prélèvement » n'a
    // plus de sens : la commande repart vierge, comme avant la planification.
    commande: {
      status,
      sepaRestant: attendu > 0 ? attendu : null,
      paymentRef: "",
      ...(paye <= 0 && attendu <= 0 ? { paymentMode: "" } : {}),
    },
  };
  const encoreProgrammee = commande.status === "sepa_scheduled" || typeof commande.sepaRestant === "number";
  if (aRetirer.length === 0 && !encoreProgrammee) {
    return { ...base, possible: false, raison: "Aucune échéance à venir sur cette commande." };
  }
  return { ...base, possible: true };
}

/**
 * Commandes encore « prélèvement programmé » sans aucune échéance à venir
 * (ni en attente, ni remise à la banque) : elles restent dues mais sont
 * cachées des impayés. Même règle que la veille du club (point 13).
 */
export function commandesSansPrelevementAVenir<T extends { id: string; orderId?: string | null; status?: string | null; sepaRestant?: number | null }>(
  commandes: T[],
  echeances: EcheanceAnnulable[],
): T[] {
  return commandes.filter((p) => {
    if (p.status === "cancelled" || p.status === "paid") return false;
    if (!(p.status === "sepa_scheduled" || typeof p.sepaRestant === "number")) return false;
    const liees = echeances.filter((e) => (e.paymentId && e.paymentId === p.id) || (!e.paymentId && !!p.orderId && e.orderId === p.orderId));
    return !liees.some((e) => e.status === "pending" || e.status === "remis");
  });
}
