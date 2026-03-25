/**
 * Utilitaires centraux — Centre Équestre d'Agon-Coutainville
 * 
 * Ce fichier contient les fonctions de validation et de sécurisation
 * utilisées dans toute l'application.
 */

/** Convertit une valeur en nombre sûr (jamais NaN, jamais Infinity) */
export const safeNumber = (v: any): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Arrondi à 2 décimales */
export const round2 = (v: any): number => {
  return Math.round(safeNumber(v) * 100) / 100;
};

/** Calcule le HT depuis le TTC */
export const ttcToHT = (ttc: number, tvaTaux: number = 5.5): number => {
  return round2(safeNumber(ttc) / (1 + safeNumber(tvaTaux) / 100));
};

/** Calcule le TTC depuis le HT */
export const htToTTC = (ht: number, tvaTaux: number = 5.5): number => {
  return round2(safeNumber(ht) * (1 + safeNumber(tvaTaux) / 100));
};

/** Valide qu'un objet payment a les champs requis */
export const validatePayment = (p: any): { valid: boolean; errors: string[] } => {
  const errors: string[] = [];
  if (!p.familyId) errors.push("familyId manquant");
  if (!p.familyName) errors.push("familyName manquant");
  if (!Array.isArray(p.items) || p.items.length === 0) errors.push("items vide");
  if (safeNumber(p.totalTTC) <= 0) errors.push("totalTTC invalide");
  return { valid: errors.length === 0, errors };
};

/** Formate une date Firestore en string lisible */
export const formatFirestoreDate = (d: any): string => {
  if (!d) return "—";
  const date = d.seconds ? new Date(d.seconds * 1000) : d instanceof Date ? d : new Date(d);
  if (isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("fr-FR");
};

/** Formate un montant en euros */
export const formatEuro = (v: any): string => {
  return `${safeNumber(v).toFixed(2)}€`;
};

/** Modes de paiement normalisés */
export const PAYMENT_MODES = [
  { id: "cb_online", label: "CB (Stripe)" },
  { id: "cb_terminal", label: "CB (terminal)" },
  { id: "cheque", label: "Chèque" },
  { id: "especes", label: "Espèces" },
  { id: "virement", label: "Virement" },
  { id: "sepa", label: "Prélèvement SEPA" },
  { id: "avoir", label: "Avoir" },
] as const;

export type PaymentMode = typeof PAYMENT_MODES[number]["id"];

/** Génère un orderId stable et lisible : CMD-2026-A3F7 */
export const generateOrderId = (): string => {
  const year = new Date().getFullYear();
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `CMD-${year}-${rand}`;
};
