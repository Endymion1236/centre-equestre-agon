/**
 * Génération de QR codes pour faciliter les paiements clients.
 *
 * Deux types de QR :
 *
 * 1. SEPA Credit Transfer (norme EPC069-12) : contient les coordonnées bancaires
 *    structurées (BIC, IBAN, montant, libellé). Le client scanne avec son app
 *    bancaire (Crédit Agricole, BNP, Boursorama, Revolut, etc.) et le formulaire
 *    de virement est pré-rempli, il valide en 1 clic. Aucune commission.
 *    Encaissement J+1 à J+3.
 *
 * 2. CAWL (Crédit Agricole Worldline) : contient simplement l'URL Hosted Checkout
 *    Page créée pour ce paiement. Le client scanne, ouvre la page CAWL, paie en
 *    CB. Encaissement instantané, commission ~1.5%.
 *
 * Les QR sont retournés en data URL (data:image/png;base64,...) pour être
 * inclus tels quels dans :
 * - les <img src="..."> des emails HTML (inline, pas de fetch externe)
 * - les <Image src="..."> des PDF react-pdf
 *
 * Référence EPC069-12 :
 * https://www.europeanpaymentscouncil.eu/document-library/guidance-documents/quick-response-code-guidelines-enable-data-capture-initiation
 */

import QRCode from "qrcode";

// ─── Coordonnées bancaires du Centre Équestre (constantes) ────────────────
// Sources : tag userMemories session compactée + endpoint SEPA mandates
export const CENTRE_BENEFICIARY = "EARL Centre Equestre PC Agon-Coutainville";
export const CENTRE_IBAN = "FR7616606100640013539343253";
export const CENTRE_BIC = "AGRIFRPP866";

// ─── QR options communes : taille raisonnable pour email + PDF ─────────────
const QR_OPTIONS_EMAIL: QRCode.QRCodeToDataURLOptions = {
  errorCorrectionLevel: "M", // tolère ~15% de dégradation, équilibre densité/robustesse
  margin: 2,
  width: 200, // 200px = bon compromis email (gros assez pour scan, pas trop large)
  color: { dark: "#1e3a5f", light: "#ffffff" }, // bleu Centre Équestre
};

const QR_OPTIONS_PDF: QRCode.QRCodeToDataURLOptions = {
  errorCorrectionLevel: "M",
  margin: 1,
  width: 150, // 150px sur PDF = ~3.5 cm impression A4
  color: { dark: "#000000", light: "#ffffff" }, // noir pour impression
};

/**
 * Génère un QR Code SEPA Credit Transfer (norme EPC069-12).
 *
 * Le payload suit le format strict de la norme : 11 lignes, séparées par \n,
 * pas de \r. Le client doit scanner avec son app bancaire compatible
 * (toutes les grandes banques européennes le sont depuis 2017).
 *
 * @param amountEur - Montant en euros (sera formaté avec 2 décimales)
 * @param remittance - Libellé visible côté virement (ex: "F-2026-0127 Dupont").
 *                    Limité à 140 caractères (norme).
 * @param target - "email" ou "pdf" pour adapter la résolution.
 * @returns data URL PNG base64 ou null si erreur (ne casse pas l'envoi)
 */
export async function generateSEPAQR(
  amountEur: number,
  remittance: string,
  target: "email" | "pdf" = "email"
): Promise<string | null> {
  if (!amountEur || amountEur <= 0) return null;
  try {
    // Limiter le libellé à 140 caractères et nettoyer les caractères qui
    // pourraient casser le parsing (\n notamment, déjà séparateur dans le payload)
    const cleanRemittance = remittance.replace(/[\r\n]/g, " ").trim().slice(0, 140);
    const amountFormatted = `EUR${amountEur.toFixed(2)}`;

    // Format EPC069-12 strict (11 lignes) :
    const payload = [
      "BCD",                // 1: Service Tag
      "002",                // 2: Version (002 = Latin1 only, supporté partout)
      "1",                  // 3: Character set (1 = UTF-8)
      "SCT",                // 4: Identification (SCT = SEPA Credit Transfer)
      CENTRE_BIC,           // 5: BIC du bénéficiaire
      CENTRE_BENEFICIARY,   // 6: Nom du bénéficiaire (max 70 caractères)
      CENTRE_IBAN,          // 7: IBAN du bénéficiaire
      amountFormatted,      // 8: Montant (EUR + 2 décimales)
      "",                   // 9: Purpose (laissé vide, optionnel)
      "",                   // 10: Remittance reference structurée (laissée vide)
      cleanRemittance,      // 11: Remittance unstructured (libre, max 140 chars)
    ].join("\n");

    const opts = target === "pdf" ? QR_OPTIONS_PDF : QR_OPTIONS_EMAIL;
    return await QRCode.toDataURL(payload, opts);
  } catch (e) {
    console.error("[generateSEPAQR] erreur:", e);
    return null;
  }
}

/**
 * Génère un QR Code contenant simplement une URL CAWL (Hosted Checkout Page).
 *
 * Le client scanne avec l'appareil photo de son smartphone, son OS reconnaît
 * l'URL et propose d'ouvrir le navigateur. Il atterrit sur la page CAWL
 * pré-remplie pour le montant exact, paie en CB, fini.
 *
 * Note : la HCP CAWL a une durée de vie de 24h. Au-delà, le QR pointe vers
 * une page expirée. Donc à utiliser uniquement dans les emails envoyés
 * immédiatement, pas dans les factures PDF qui peuvent être consultées
 * plus tard.
 *
 * @param paymentUrl - URL Hosted Checkout Page CAWL
 * @param target - "email" ou "pdf"
 */
export async function generateCAWLQR(
  paymentUrl: string,
  target: "email" | "pdf" = "email"
): Promise<string | null> {
  if (!paymentUrl) return null;
  try {
    const opts = target === "pdf" ? QR_OPTIONS_PDF : QR_OPTIONS_EMAIL;
    return await QRCode.toDataURL(paymentUrl, opts);
  } catch (e) {
    console.error("[generateCAWLQR] erreur:", e);
    return null;
  }
}
