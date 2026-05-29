import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

/**
 * Prélèvement automatique du solde via un token Card On File (MIT).
 *
 * ⚠️ STUB — NON BRANCHÉ SUR CAWL POUR L'INSTANT.
 *
 * Ce module isole le SEUL endroit qui dépend de la confirmation du Crédit
 * Agricole / Worldline. Toute la logique métier (cron J-7, détection du token,
 * emails, mise à jour du paiement) est complète et fonctionnelle autour ; il ne
 * reste qu'à remplir l'appel réseau ci-dessous une fois ces points confirmés :
 *
 *   1. Card On File / token PERMANENT activé sur le PSPID (contrat CAWL).
 *   2. Accord acquéreur pour CVC optionnel sur les transactions ultérieures.
 *   3. Format exact du JSON CreatePayment côté CAWL avec cardOnFileData
 *      (cf. doc : isInitialTransaction:false + subsequentCardOnFileData
 *       { cardOnFileInitiator:"MERCHANT", transactionType:"...",
 *         initialSchemeTransactionId:"<schemeTransactionId du 1er paiement>" }).
 *
 * Tant que CAWL_MIT_ENABLED n'est pas mis à "true" dans les variables
 * d'environnement Vercel, cette fonction renvoie { enabled:false } et le cron
 * retombe automatiquement sur l'email de rappel (comportement actuel, sûr).
 */

export interface MitChargeParams {
  paymentId: string;
  familyId: string;
  amount: number;          // montant du solde à prélever (euros)
  token: string;           // token permanent CAWL (Card On File)
  schemeTransactionId?: string; // référence du paiement initial (acompte)
  label: string;           // libellé (ex: "Solde stage Poney — Dupont")
  familyEmail?: string;
}

export interface MitChargeResult {
  enabled: boolean;        // false = stub non branché → fallback email
  success: boolean;
  paymentReference?: string;
  error?: string;
}

/**
 * Déclenche le prélèvement du solde. Retourne enabled:false tant que le stub
 * n'est pas branché, pour que l'appelant fasse le fallback email.
 */
export async function chargeWithToken(params: MitChargeParams): Promise<MitChargeResult> {
  const mitEnabled = process.env.CAWL_MIT_ENABLED === "true";

  // ── STUB : tant que non activé, on ne tente AUCUN appel réseau ─────────────
  if (!mitEnabled) {
    console.log(`[cawl-mit] STUB (CAWL_MIT_ENABLED!=true) — pas de prélèvement auto pour ${params.paymentId}, fallback email`);
    return { enabled: false, success: false };
  }

  // ── À BRANCHER quand le CA confirme ────────────────────────────────────────
  // Structure cible (à adapter au format exact renvoyé par le support CAWL) :
  //
  //   const merchantId = process.env.CAWL_MERCHANT_ID;
  //   const endpoint = `${process.env.CAWL_API_BASE}/${merchantId}/payments`;
  //   const body = {
  //     cardPaymentMethodSpecificInput: {
  //       token: params.token,
  //       paymentProductId: 1, // ou détecté
  //       unscheduledCardOnFileRequestor: "merchantInitiated",
  //       unscheduledCardOnFileSequenceIndicator: "subsequent",
  //       cardOnFileData: {
  //         isInitialTransaction: false,
  //         subsequentCardOnFileData: {
  //           cardOnFileInitiator: "MERCHANT",
  //           transactionType: "DELAYED_CHARGE",
  //           initialSchemeTransactionId: params.schemeTransactionId,
  //         },
  //       },
  //     },
  //     order: {
  //       amountOfMoney: { amount: Math.round(params.amount * 100), currencyCode: "EUR" },
  //       customer: { contactDetails: { emailAddress: params.familyEmail } },
  //       references: { merchantReference: params.paymentId },
  //     },
  //   };
  //   // ... appel signé via le SDK CAWL, lecture du statut, etc.
  //
  // Pour l'instant, si quelqu'un active le flag SANS avoir branché l'appel,
  // on échoue explicitement plutôt que de prétendre un succès.
  console.error(`[cawl-mit] CAWL_MIT_ENABLED=true mais l'appel réel n'est pas encore implémenté pour ${params.paymentId}`);
  return {
    enabled: true,
    success: false,
    error: "Appel CAWL MIT non implémenté (en attente confirmation contrat CA/Worldline)",
  };
}

/**
 * Enregistre une tentative de prélèvement auto sur le paiement (audit/anti-doublon).
 */
export async function logMitAttempt(paymentId: string, result: MitChargeResult, amount: number) {
  try {
    await adminDb.collection("payments").doc(paymentId).update({
      mitLastAttemptAt: FieldValue.serverTimestamp(),
      mitLastResult: result.success ? "success" : (result.enabled ? "failed" : "skipped_disabled"),
      ...(result.error ? { mitLastError: result.error.slice(0, 300) } : {}),
      ...(result.success ? {
        paidAmount: FieldValue.increment(amount),
        mitChargedAt: FieldValue.serverTimestamp(),
      } : {}),
    });
  } catch (e) {
    console.error("[cawl-mit] logMitAttempt:", e);
  }
}
