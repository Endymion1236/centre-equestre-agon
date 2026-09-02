export const MOYENS_PAIEMENT_INSCRIPTION = [
  { id: "cb", icon: "💳", label: "Carte bancaire", sub: "Paiement en ligne immédiat" },
  { id: "cheque", icon: "📝", label: "Chèque", sub: "Réglé au club" },
  { id: "especes", icon: "💵", label: "Espèces", sub: "Réglé au club" },
  { id: "virement", icon: "🏦", label: "Virement", sub: "Sur le compte du centre" },
  { id: "cb_terminal", icon: "💳", label: "CB au club", sub: "Sur le terminal du club" },
] as const;

export type MoyenPaiementInscription = typeof MOYENS_PAIEMENT_INSCRIPTION[number]["id"];
export type MoyenPaiementInscriptionDiffere = Exclude<MoyenPaiementInscription, "cb">;

export function estMoyenPaiementDiffere(
  mode: MoyenPaiementInscription,
): mode is MoyenPaiementInscriptionDiffere {
  return mode !== "cb";
}

export function libelleMoyenPaiementInscription(mode: MoyenPaiementInscription): string {
  return MOYENS_PAIEMENT_INSCRIPTION.find((option) => option.id === mode)?.label || "Règlement";
}

/** Reconnaît une commande annuelle sans dépendre du libellé de ses lignes. */
export function estCommandeInscriptionAnnuelle(payment: any): boolean {
  return payment?.type === "inscription_annuelle"
    || Boolean(payment?.forfaitType)
    || (Array.isArray(payment?.items)
      && payment.items.some((item: any) => String(item?.activityTitle || "").includes("Forfait")));
}

/**
 * Une réservation annuelle représente tout le contrat et n'a pas toujours de
 * date propre. Elle doit donc être annulée même sans date ; les réservations
 * ponctuelles ne le sont que si elles sont futures.
 */
export function doitAnnulerReservationLorsDesinscriptionAnnuelle(
  reservation: any,
  today: string,
): boolean {
  if (!["confirmed", "pending_validation"].includes(String(reservation?.status || ""))) {
    return false;
  }
  return reservation?.type === "annual"
    || (Boolean(reservation?.date) && String(reservation.date) >= today);
}
