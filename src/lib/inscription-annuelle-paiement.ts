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
