/**
 * Helpers de sécurisation comptable pour la loi anti-fraude TVA 2018.
 *
 * Fournit des fonctions pour :
 * 1. Calculer un hash SHA-256 d'un encaissement individuel (signature)
 * 2. Calculer un hash agrégé d'une période (pour les clôtures journalières)
 * 3. Chaîner les hashs (chaque hash inclut le précédent — mécanisme
 *    type blockchain léger)
 *
 * Usage :
 *   import { hashEncaissement, hashCloture } from "@/lib/compta-hash";
 *   const h = await hashEncaissement({ ... });
 */

/**
 * Calcule un hash SHA-256 d'une chaîne, en hexadécimal.
 * Utilise l'API Web Crypto (disponible côté client et côté Node 18+).
 */
export async function sha256(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Hash d'un encaissement individuel.
 * Les champs inclus sont les champs comptables critiques : toute
 * modification d'un seul caractère change le hash.
 */
export async function hashEncaissement(enc: {
  paymentId?: string;
  familyId?: string;
  familyName?: string;
  montant: number;
  mode: string;
  modeLabel?: string;
  ref?: string;
  activityTitle?: string;
  raison?: string;
  correctionDe?: string;
  dateIso: string; // date en ISO 8601
  previousHash?: string; // hash de l'encaissement précédent (chaînage)
}): Promise<string> {
  // Construction déterministe (ordre fixe) pour que le hash soit reproductible.
  const payload = [
    enc.paymentId || "",
    enc.familyId || "",
    enc.familyName || "",
    enc.montant.toFixed(2),
    enc.mode,
    enc.modeLabel || "",
    enc.ref || "",
    enc.activityTitle || "",
    enc.raison || "",
    enc.correctionDe || "",
    enc.dateIso,
    enc.previousHash || "",
  ].join("|");
  return sha256(payload);
}

/**
 * Hash d'une clôture journalière.
 * Inclut tous les encaissements du jour (leurs hashs) + les totaux.
 */
export async function hashCloture(cloture: {
  date: string; // YYYY-MM-DD
  numero: number; // Z001, Z002...
  encaissementHashes: string[]; // hashs de tous les encaissements du jour
  totauxParMode: Record<string, number>;
  totalGeneral: number;
  previousClotureHash?: string; // hash de la clôture précédente
}): Promise<string> {
  const encHashesStr = cloture.encaissementHashes.sort().join(",");
  const totauxStr = Object.keys(cloture.totauxParMode).sort()
    .map(k => `${k}:${cloture.totauxParMode[k].toFixed(2)}`)
    .join(",");
  const payload = [
    cloture.date,
    cloture.numero.toString().padStart(6, "0"),
    encHashesStr,
    totauxStr,
    cloture.totalGeneral.toFixed(2),
    cloture.previousClotureHash || "",
  ].join("||");
  return sha256(payload);
}

/**
 * Vérifie l'intégrité d'un encaissement à partir de son hash stocké.
 */
export async function verifyEncaissementHash(
  enc: Parameters<typeof hashEncaissement>[0],
  storedHash: string
): Promise<boolean> {
  const computed = await hashEncaissement(enc);
  return computed === storedHash;
}
