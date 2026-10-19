/**
 * src/lib/club-info-defauts.ts — coordonnées du club par défaut.
 *
 * Séparées de club-info.ts (qui lit settings/centre avec firebase-admin) pour
 * être lisibles depuis le navigateur : les écrans qui impriment un document
 * (registre d'élevage…) y retrouvent l'identité du club sans serveur. Les
 * réglages Firestore settings/centre priment quand ils existent.
 */

export interface ClubInfo {
  nom: string;
  legalName: string;
  address: string;
  tel: string;
  email: string;
  siret: string;
  tvaIntra: string;
  iban: string;
  bic: string;
  website: string;
}

export const CLUB_DEFAUTS: ClubInfo = {
  nom: "Centre Equestre d'Agon-Coutainville",
  legalName: "E.A.R.L. Centre Equestre Poney Club d'Agon-Coutainville",
  address: "56 Charrière du Commerce, 50230 Agon-Coutainville",
  tel: "02 44 84 99 96",
  email: "ceagon50@gmail.com",
  siret: "50756918400017",
  tvaIntra: "FR12507569184",
  iban: "FR76 1660 6100 6400 1353 9343 253",
  bic: "AGRIFRPP866",
  website: "https://centreequestreagon.com",
};

/** Les réglages par-dessus les défauts, en ignorant les champs vides. */
export function fusionnerClubInfo(reglages: Record<string, unknown> | null | undefined): ClubInfo {
  const merged: any = { ...CLUB_DEFAUTS };
  for (const [k, v] of Object.entries(reglages || {})) {
    if (typeof v === "string" ? v.trim() !== "" : v !== null && v !== undefined) merged[k] = v;
  }
  return merged as ClubInfo;
}
