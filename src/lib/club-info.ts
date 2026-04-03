/**
 * Helper centralisé pour les infos du centre équestre
 * Lu depuis Firestore settings/centre — fallback sur les valeurs par défaut
 */

import { adminDb } from "@/lib/firebase-admin";

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

const DEFAULTS: ClubInfo = {
  nom: "Centre Equestre d'Agon-Coutainville",
  legalName: "E.A.R.L. Centre Equestre Poney Club d'Agon-Coutainville",
  address: "56 Charrière du Commerce, 50230 Agon-Coutainville",
  tel: "02 44 84 99 96",
  email: "ceagon@orange.fr",
  siret: "50756918400017",
  tvaIntra: "FR12507569184",
  iban: "FR76 1660 6100 6400 1353 9343 253",
  bic: "AGRIFRPP866",
  website: "https://centreequestreagon.com",
};

let cache: ClubInfo | null = null;
let cacheTs = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function getClubInfo(): Promise<ClubInfo> {
  // Cache pour éviter de lire Firestore à chaque facture
  if (cache && Date.now() - cacheTs < CACHE_TTL) return cache;
  try {
    const snap = await adminDb.collection("settings").doc("centre").get();
    if (snap.exists) {
      cache = { ...DEFAULTS, ...snap.data() } as ClubInfo;
      cacheTs = Date.now();
      return cache;
    }
  } catch (e) {
    console.warn("getClubInfo: Firestore non dispo, fallback défauts");
  }
  return DEFAULTS;
}
