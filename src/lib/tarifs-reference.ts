/**
 * Tarifs de référence des cartes de séances.
 *
 * Donnés aux assistants (boîte email, borne Câlin) pour qu'ils répondent
 * juste : sans eux, l'assistant boîte a inventé une « carte 5 cours 130 € ».
 * Ce ne sont pas les prix des créneaux (ceux-là viennent du planning) :
 * une carte se règle au club ou depuis l'espace cavalier, puis se consomme
 * séance par séance.
 */
export const CARTES_SEANCES = [
  { seances: 5, prixTTC: 125 },
  { seances: 10, prixTTC: 250 },
] as const;

/** « Carte 5 séances : 125 € | Carte 10 séances : 250 € » */
export function libelleCartesSeances(): string {
  return CARTES_SEANCES.map((c) => `Carte ${c.seances} séances : ${c.prixTTC} €`).join(" | ");
}
