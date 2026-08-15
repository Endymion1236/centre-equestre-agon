/**
 * src/app/admin/paiements/constants.ts
 *
 * Libellés et listes de modes figés de la page Paiements.
 *
 * Pourquoi les sortir du composant : ces valeurs sont du vocabulaire
 * comptable, pas de l'état d'écran. Elles atterrissent telles quelles dans
 * le journal des encaissements (donc dans les exports comptables) ou dans
 * la raison d'un avoir — les changer change des écritures déjà relues par
 * la comptable. Les avoir toutes au même endroit évite qu'un mode de
 * remboursement soit libellé « CB » ici et « carte bancaire » ailleurs.
 */

/** Libelles des modes de remboursement, pour le journal comptable. */
export const MODE_REMB_LABEL: Record<string, string> = {
  cb: "carte bancaire", virement: "virement", cheque: "chèque", especes: "espèces",
};

/**
 * Motifs d'annulation proposés par AnnulationModal, en clair.
 * Recopié dans la raison de l'avoir : c'est ce que lira la famille.
 */
export const MOTIF_LABEL: Record<string, string> = {
  anticipee: "annulation +3 semaines",
  certificat: "certificat médical / force majeure",
  tardive: "annulation tardive",
};

/**
 * Modes proposés dans l'encaissement groupé (plusieurs factures d'une même
 * famille réglées d'un seul geste).
 *
 * Volontairement limité aux règlements IMMÉDIATS : un chèque différé ou un
 * prélèvement SEPA est un échéancier, il ne peut pas solder plusieurs
 * factures « d'un coup » sans créer des échéances par facture.
 */
export const MODES_ENCAISSEMENT_GROUPE = ["cheque", "especes", "cb_terminal", "virement", "cheque_vacances", "pass_sport"];

/**
 * Modes proposés dans la modale « Encaisser » d'une commande unique.
 *
 * Liste distincte de `paymentModes` (types.ts) car elle porte des icônes et
 * n'expose que les gestes réalisables au comptoir : ni CB en ligne (CAWL,
 * réservée aux vraies transactions Worldline), ni avoir (proposé à part,
 * seulement si la famille a un solde disponible).
 */
export const MODES_ENCAISSEMENT_RAPIDE = [
  { id: "cheque", label: "Chèque", icon: "📝" },
  { id: "especes", label: "Espèces", icon: "💵" },
  { id: "virement", label: "Virement", icon: "🏦" },
  { id: "cb_terminal", label: "CB", icon: "💳" },
  { id: "cheque_vacances", label: "Chèques vacances", icon: "🏖️" },
  { id: "pass_sport", label: "Pass'Sport", icon: "🤸" },
  { id: "prelevement_sepa", label: "SEPA", icon: "🏦" },
  { id: "cheque_differe", label: "Chèques différés", icon: "📅" },
];
