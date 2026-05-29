import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { cawlSdk, CAWL_PSPID } from "@/lib/cawl";

/**
 * Prélèvement automatique du solde via un token Card On File.
 *
 * Scénario "acompte à la réservation + solde prélevé automatiquement une
 * semaine avant le stage". CAWL distingue deux temps :
 *
 *  1) ACOMPTE (client présent) : transaction "cardholderInitiated" /
 *     sequenceIndicator "first", avec tokenizationMode "createWithConsent"
 *     pour stocker la carte (token Card On File permanent).
 *     → géré au checkout/status, qui stocke cofToken + payment.id initial.
 *
 *  2) SOLDE (client ABSENT, J-7) : transaction ultérieure de type
 *     "delayedCharge" — cas documenté : débiter le titulaire après qu'un
 *     service initial a déjà été traité. Endpoint dédié SubsequentPayment,
 *     body minimal (doc Card On File, exemples G/H/I/J) :
 *
 *        {
 *          "subsequentCardPaymentMethodSpecificInput": { "subsequentType": "delayedCharge" },
 *          "order": { "amountOfMoney": { "amount": <centimes>, "currencyCode": "EUR" } }
 *        }
 *
 *     Le montant est le solde, le token est lié au paiement initial référencé.
 *     Hors 3-D Secure (client absent → MIT), CVC inutile.
 *
 * ⚠️ L'APPEL HTTP RÉEL est désactivé tant que CAWL_MIT_ENABLED !== "true",
 *    le temps de : confirmer l'activation Card On File sur le PSPID, vérifier
 *    le chemin exact de l'endpoint subsequent du SDK, et tester en preprod.
 *    Flag absent/false → aucun appel réseau, enabled:false, fallback email.
 */

export interface MitChargeParams {
  paymentId: string;            // doc payment Firestore (notre référence)
  familyId: string;
  amount: number;               // solde à prélever (euros)
  token: string;                // token permanent Card On File
  initialPaymentId?: string;    // payment.id CAWL de l'acompte (transaction initiale)
  label: string;
  familyEmail?: string;
}

export interface MitChargeResult {
  enabled: boolean;             // false = stub non actif → fallback email
  success: boolean;
  paymentReference?: string;
  statusCode?: number;
  error?: string;
}

// Corps exact de la requête de prélèvement du solde (delayedCharge).
// Exporté pour pouvoir être testé/loggé indépendamment de l'appel réseau.
export function buildDelayedChargeBody(amountEuros: number) {
  return {
    subsequentCardPaymentMethodSpecificInput: {
      subsequentType: "delayedCharge" as const,
    },
    order: {
      amountOfMoney: {
        amount: Math.round(amountEuros * 100), // CAWL attend des centimes
        currencyCode: "EUR",
      },
    },
  };
}

export async function chargeWithToken(params: MitChargeParams): Promise<MitChargeResult> {
  const mitEnabled = process.env.CAWL_MIT_ENABLED === "true";

  // Body prêt même en mode stub (utile pour les logs / la mise au point).
  const body = buildDelayedChargeBody(params.amount);

  // ── STUB : tant que non activé, aucun appel réseau ─────────────────────────
  if (!mitEnabled) {
    console.log(`[cawl-mit] STUB (CAWL_MIT_ENABLED!=true) — solde ${params.amount}EUR pour ${params.paymentId} NON prélevé (fallback email). Body prêt:`, JSON.stringify(body));
    return { enabled: false, success: false };
  }

  // ── Garde-fous avant tout appel réel ───────────────────────────────────────
  if (!CAWL_PSPID) {
    return { enabled: true, success: false, error: "CAWL_PSPID manquant" };
  }
  if (!params.initialPaymentId) {
    // delayedCharge référence la transaction initiale (acompte).
    return { enabled: true, success: false, error: "initialPaymentId (acompte) manquant pour le delayedCharge" };
  }

  // ── Appel réel CAWL (SubsequentPayment) ────────────────────────────────────
  // Le SDK onlinepayments-sdk-nodejs n'expose pas toujours subsequentPayment de
  // façon stable selon la version ; on tente la méthode SDK si présente. À
  // VÉRIFIER EN PREPROD avant d'activer le flag en production.
  try {
    const paymentsApi: any = (cawlSdk as any)?.payments;

    if (paymentsApi && typeof paymentsApi.subsequentPayment === "function") {
      const resp = await paymentsApi.subsequentPayment(CAWL_PSPID, params.initialPaymentId, body);
      const status = resp?.body?.payment?.status || resp?.body?.status || "";
      const ref = resp?.body?.payment?.id || resp?.body?.id || "";
      const ok = ["CAPTURED", "PENDING_CAPTURE", "PAID", "CAPTURE_REQUESTED", "AUTHORIZED"].includes(String(status).toUpperCase());
      if (ok) {
        return { enabled: true, success: true, paymentReference: ref, statusCode: resp?.status };
      }
      return { enabled: true, success: false, paymentReference: ref, statusCode: resp?.status, error: `Statut CAWL: ${status || "inconnu"}` };
    }

    // Méthode SDK absente : on ne devine pas l'appel REST signé pour ne pas
    // risquer une transaction mal formée.
    return {
      enabled: true,
      success: false,
      error: "Méthode SDK subsequentPayment introuvable — endpoint REST à brancher après vérif preprod",
    };
  } catch (e: any) {
    console.error("[cawl-mit] Erreur appel SubsequentPayment:", e);
    return { enabled: true, success: false, error: (e?.message || String(e)).slice(0, 300) };
  }
}

/**
 * Enregistre la tentative sur le paiement (audit + anti-doublon).
 * Incrémente paidAmount uniquement en cas de succès.
 */
export async function logMitAttempt(paymentId: string, result: MitChargeResult, amount: number) {
  try {
    await adminDb.collection("payments").doc(paymentId).update({
      mitLastAttemptAt: FieldValue.serverTimestamp(),
      mitLastResult: result.success ? "success" : (result.enabled ? "failed" : "skipped_disabled"),
      ...(result.paymentReference ? { mitPaymentReference: result.paymentReference } : {}),
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
