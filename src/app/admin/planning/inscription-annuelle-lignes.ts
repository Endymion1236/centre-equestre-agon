/**
 * Lignes de commande d'une inscription à l'année saisie au planning.
 *
 * La ligne « Forfait » porte le prix AVANT réduction famille, et la réduction
 * a sa propre ligne négative : les deux s'additionnent pour donner le prix
 * net. La ligne « Forfait » portait le prix déjà réduit, et la réduction se
 * retrouvait déduite deux fois — sur une fratrie de quatre, 369 € manquaient
 * à la commande (septembre 2026).
 */
import { formatFrequence } from "@/lib/rythme";

export interface LignesInscriptionAnnuelleInput {
  adhesion: boolean;
  ajoutHeureAdmin: boolean;
  childName: string;
  creneau: { id?: string; activityTitle: string; activityType?: string };
  extraSlots: string[];
  familyDiscountAmount: number;
  familyDiscountPercent: number;
  freqCumuleeAdmin: number;
  frequenceDejaInscrite: number;
  licence: boolean;
  licenceType: string;
  prixAdhesionDegressif: number;
  /** Prix du forfait après prorata, AVANT réduction famille. */
  prixForfaitBrut: number;
  prixLicence: number;
  rangEnfantFamille: number;
  remiseBaremePercent?: number;
  remiseHorsBareme?: boolean;
  remiseMotif: string;
  selChild: string;
  slotKey: string;
}

export function lignesInscriptionAnnuelle(input: LignesInscriptionAnnuelleInput): any[] {
  const {
    adhesion, ajoutHeureAdmin, childName, creneau, extraSlots, familyDiscountAmount,
    familyDiscountPercent, freqCumuleeAdmin, frequenceDejaInscrite, licence, licenceType,
    prixAdhesionDegressif, prixForfaitBrut, prixLicence, rangEnfantFamille,
    remiseBaremePercent, remiseHorsBareme, remiseMotif, selChild, slotKey,
  } = input;
  const items: any[] = [];
  if (adhesion) items.push({ activityTitle: `Adhésion annuelle (enfant ${rangEnfantFamille})`, childId: selChild, childName, priceHT: prixAdhesionDegressif / 1.055, tva: 5.5, priceTTC: prixAdhesionDegressif });
  if (licence) items.push({ activityTitle: `Licence FFE ${licenceType === "moins18" ? "-18ans" : "+18ans"}`, childId: selChild, childName, priceHT: prixLicence, tva: 0, priceTTC: prixLicence });
  // Créneau principal
  items.push({ activityTitle: ajoutHeureAdmin ? `Forfait — heure suppl. (${formatFrequence(frequenceDejaInscrite)}×→${formatFrequence(freqCumuleeAdmin)}×/sem) — ${creneau.activityTitle} (${slotKey})` : `Forfait ${creneau.activityTitle} (${slotKey})`, childId: selChild, childName, creneauId: creneau.id, activityType: creneau.activityType, priceHT: prixForfaitBrut / 1.055, tva: 5.5, priceTTC: prixForfaitBrut });
  // Créneaux supplémentaires (2ème, 3ème)
  const dayNames = ["Dim","Lun","Mar","Mer","Jeu","Ven","Sam"];
  for (const esKey of extraSlots) {
    const firstDash = esKey.indexOf("-");
    const secondDash = esKey.indexOf("-", firstDash + 1);
    const esDow = parseInt(esKey.substring(0, firstDash));
    const esTime = esKey.substring(firstDash + 1, secondDash);
    const esTitle = esKey.substring(secondDash + 1);
    const esSlotLabel = `${esTitle} — ${dayNames[esDow]} ${esTime}`;
    items.push({ activityTitle: `Forfait ${esTitle} (${esSlotLabel})`, childId: selChild, childName, activityType: creneau.activityType, priceHT: 0, tva: 5.5, priceTTC: 0 });
  }
  // Ligne de réduction famille si applicable
  if (familyDiscountAmount > 0) {
    // Le motif figure sur la facture : une remise hors barème doit dire
    // pourquoi, sans quoi personne ne saura la justifier dans six mois.
    const motif = remiseMotif.trim();
    const libelleRemise = `Réduction famille (${rangEnfantFamille}ème enfant, -${familyDiscountPercent}%`
      + (remiseHorsBareme ? ` — ${motif || "remise exceptionnelle"}` : "")
      + ")";
    items.push({ activityTitle: libelleRemise, childId: selChild, childName, priceHT: -familyDiscountAmount / 1.055, tva: 5.5, priceTTC: -familyDiscountAmount,
      ...(remiseHorsBareme ? { remiseHorsBareme: true, remiseBaremePercent, remiseMotif: motif || null } : {}) });
  }
  return items;
}
