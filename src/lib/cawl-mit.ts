import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { cawlSdk, CAWL_PSPID } from "@/lib/cawl";
import { createEncaissementServer } from "@/lib/compta-encaissement-server";

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
// ⚠️ La propriété du SDK installé est `subsequentcardPaymentMethodSpecificInput`
// (card en minuscule — vérifié dans onlinepayments-sdk-nodejs), pas la casse
// "Card" de la doc web. Exporté pour test/log.
/**
 * Indicateur de demandeur pour la transaction non programmee.
 *
 * Le modele fourni par le support CAWL indique "cardholderInitiated". Or
 * notre prelevement est reellement initie par le COMMERCANT (cron a J-7,
 * porteur absent), ce qui correspondrait plutot a "merchantInitiated".
 *
 * On suit leur modele, qu'ils ont valide comme fonctionnel. Si un refus
 * persiste, c'est la premiere valeur a basculer.
 */
const COF_REQUESTOR = "cardholderInitiated";

/**
 * Corps du prelevement du solde.
 *
 * ── Historique ────────────────────────────────────────────────────────
 * Premiere implementation : POST /payments/{id}/subsequent avec
 * subsequentType "delayedCharge". L'API repondait 201 mais le paiement
 * revenait systematiquement REJECTED en production (elle fonctionnait en
 * preproduction). Apres analyse, le support CAWL a fourni un modele de
 * requete different, base sur le TOKEN de la carte plutot que sur une
 * reference a la transaction initiale.
 *
 * ── Modele retenu ─────────────────────────────────────────────────────
 * Creation d'un paiement serveur a serveur (payments.createPayment) avec :
 *   - le token Card On File issu de l'acompte ;
 *   - sequenceIndicator "subsequent" (l'acompte portait "first") ;
 *   - un bloc threeDSecure explicite : porteur absent, donc aucun
 *     challenge possible. Sans ce bloc, la plateforme peut exiger une
 *     authentification qui ne pourra jamais aboutir.
 *   - authorizationMode "SALE" : autorisation + capture immediate. Sans
 *     lui, les fonds sont bloques mais jamais encaisses.
 */
export function buildDelayedChargeBody(
  amountEuros: number,
  token?: string,
  merchantRef?: string,
  customer?: { familyId?: string; email?: string },
  scheme?: { schemeReferenceData?: string; initialSchemeTransactionId?: string },
) {
  return {
    cardPaymentMethodSpecificInput: {
      ...(token ? { token } : {}),
      unscheduledCardOnFileRequestor: COF_REQUESTOR,
      unscheduledCardOnFileSequenceIndicator: "subsequent",
      // Rattachement a l'autorisation initiale. Sans cette reference, la
      // transaction arrive « orpheline » chez l'emetteur : il voit un
      // paiement carte en reserve sans aucun accord prealable identifiable,
      // et le refuse. Constate en production : le paiement initial portait
      // bien un Scheme Reference Data, le prelevement n'en avait aucun.
      ...(scheme?.schemeReferenceData ? { schemeReferenceData: scheme.schemeReferenceData } : {}),
      ...(scheme?.initialSchemeTransactionId ? { initialSchemeTransactionId: scheme.initialSchemeTransactionId } : {}),
      authorizationMode: "SALE",
      threeDSecure: {
        challengeIndicator: "no-challenge-requested",
        skipAuthentication: false,
        exemptionRequest: "none",
      },
    },
    order: {
      amountOfMoney: {
        amount: Math.round(amountEuros * 100), // CAWL attend des centimes
        currencyCode: "EUR",
      },
      ...(merchantRef ? { references: { merchantReference: merchantRef } } : {}),
      // Bloc client : present sur le paiement initial, il etait absent ici.
      // CreatePayment le reclame generalement, et son absence produit un 400
      // sans statut de paiement exploitable.
      ...(customer?.familyId || customer?.email
        ? {
            customer: {
              ...(customer.familyId ? { merchantCustomerId: customer.familyId } : {}),
              ...(customer.email ? { contactDetails: { emailAddress: customer.email } } : {}),
            },
          }
        : {}),
    },
  };
}

/**
 * Lit la reference de schema portee par la transaction initiale (l'acompte).
 *
 * C'est elle qui permet a l'emetteur de rattacher le prelevement a l'accord
 * carte en reserve donne lors du paiement initial. Sans elle, la transaction
 * arrive orpheline et se fait refuser — constate en production.
 *
 * Lue a la demande plutot que stockee : fonctionne aussi sur les commandes
 * creees avant cette correction. Un echec n'est pas bloquant.
 */
export async function lireSchemeReference(
  initialPaymentId?: string,
): Promise<{ schemeReferenceData?: string; initialSchemeTransactionId?: string }> {
  if (!initialPaymentId || !CAWL_PSPID) return {};
  try {
    const api: any = (cawlSdk as any)?.payments;
    const init = await api?.getPayment?.(CAWL_PSPID, initialPaymentId);
    const out = init?.body?.paymentOutput?.cardPaymentMethodSpecificOutput || {};
    const scheme = {
      ...(out.schemeReferenceData ? { schemeReferenceData: out.schemeReferenceData } : {}),
      ...(out.initialSchemeTransactionId ? { initialSchemeTransactionId: out.initialSchemeTransactionId } : {}),
    };
    console.log(
      `[cawl-mit] référence de schéma sur ${initialPaymentId}: ${JSON.stringify(scheme)}` +
        (Object.keys(scheme).length === 0 ? " — AUCUNE, le prélèvement risque le refus" : "")
    );
    return scheme;
  } catch (e: any) {
    console.warn(`[cawl-mit] lecture de la transaction initiale impossible: ${e?.message || e}`);
    return {};
  }
}

export async function chargeWithToken(params: MitChargeParams): Promise<MitChargeResult> {
  const mitEnabled = (process.env.CAWL_MIT_ENABLED || "").trim().toLowerCase() === "true";

  // Body prêt même en mode stub (utile pour les logs / la mise au point).
  // Reference unique pour le rapprochement (les references CAWL de nos
  // prelevements etaient jusqu'ici anonymes cote back-office).
  const merchantRef = `SOLDE-${params.paymentId}-${Date.now().toString(36)}`;
  // ── STUB : aucun appel reseau tant que le flag n'est pas actif ────────
  if (!mitEnabled) {
    const bodyStub = buildDelayedChargeBody(params.amount, params.token, merchantRef, {
      familyId: params.familyId,
      email: params.familyEmail,
    });
    console.log(`[cawl-mit] STUB (CAWL_MIT_ENABLED!=true) — solde ${params.amount}EUR pour ${params.paymentId} NON prélevé (fallback email). Body prêt:`, JSON.stringify(bodyStub));
    return { enabled: false, success: false };
  }

  // ── Reference de schema de la transaction initiale ────────────────────
  // Lue a la demande sur CAWL plutot que stockee : fonctionne aussi sur les
  // commandes creees avant cette correction. Un echec de lecture n'est pas
  // bloquant, on tente le prelevement sans (comportement anterieur).
  const scheme = await lireSchemeReference(params.initialPaymentId);

  const body = buildDelayedChargeBody(params.amount, params.token, merchantRef, {
    familyId: params.familyId,
    email: params.familyEmail,
  }, scheme);

  // ── Garde-fous avant tout appel réel ───────────────────────────────────────
  if (!CAWL_PSPID) {
    return { enabled: true, success: false, error: "CAWL_PSPID manquant" };
  }
  if (!params.token) {
    // Le modele CAWL s'appuie sur le token Card On File, plus sur une
    // reference a la transaction initiale.
    return { enabled: true, success: false, error: "token Card On File manquant" };
  }

  // ── Appel réel CAWL (SubsequentPayment) ────────────────────────────────────
  // SDK onlinepayments-sdk-nodejs : la méthode est exposée via le client
  // `subsequent` → cawlSdk.subsequent.subsequentPayment(merchantId, paymentId, body)
  // (endpoint /v2/{merchantId}/payments/{paymentId}/subsequent). Vérifié dans
  // le SDK installé. À tester en preprod avant d'activer le flag en production.
  try {
    const paymentsApi: any = (cawlSdk as any)?.payments;

    if (paymentsApi && typeof paymentsApi.createPayment === "function") {
      const resp = await paymentsApi.createPayment(CAWL_PSPID, body);
      const status = resp?.body?.payment?.status || resp?.body?.status || "";
      const ref = resp?.body?.payment?.id || resp?.body?.id || "";
      const ok = ["CAPTURED", "PENDING_CAPTURE", "PAID", "CAPTURE_REQUESTED", "AUTHORIZED"].includes(String(status).toUpperCase());
      if (ok) {
        console.log(`[cawl-mit] ✅ solde ${params.amount}EUR prélevé — ref=${ref} (${merchantRef})`);
        return { enabled: true, success: true, paymentReference: ref, statusCode: resp?.status };
      }
      // Le motif de refus renvoye par l'emetteur, quand il est fourni, est la
      // seule information exploitable pour distinguer un probleme de carte
      // d'un probleme d'habilitation.
      // Detail de l'erreur. Un 400 signale une requete invalide (champ
      // obligatoire absent) et n'a pas de `payment.status` : sans lire
      // `body.errors`, le message se resumait a « Statut CAWL: inconnu »,
      // ce qui ne dit rien de la cause.
      const apiErrors: any[] = resp?.body?.errors || resp?.body?.paymentResult?.errors || [];
      const motif =
        apiErrors.map((e: any) => `[${e.code || e.id || "?"}] ${e.message || ""}${e.propertyName ? ` (champ: ${e.propertyName})` : ""}`).join(" | ")
        || resp?.body?.payment?.statusOutput?.errors?.[0]?.message
        || "";
      console.warn(
        `[cawl-mit] ❌ échec — http=${resp?.status} statut=${status || "n/a"} ref=${ref || "n/a"} ` +
          `motif=${motif || "non communiqué"}`
      );
      // Reponse brute tronquee : indispensable pour transmettre au support.
      console.warn(`[cawl-mit] réponse CAWL brute: ${JSON.stringify(resp?.body || {}).slice(0, 1200)}`);
      return {
        enabled: true,
        success: false,
        paymentReference: ref,
        statusCode: resp?.status,
        error: motif
          ? `CAWL ${resp?.status || ""}: ${motif}`.trim()
          : `Statut CAWL: ${status || "inconnu"} (HTTP ${resp?.status || "?"})`,
      };
    }

    return {
      enabled: true,
      success: false,
      error: "Client SDK 'payments' introuvable — vérifier la version du SDK",
    };
  } catch (e: any) {
    console.error("[cawl-mit] Erreur appel SubsequentPayment:", e);
    return { enabled: true, success: false, error: (e?.message || String(e)).slice(0, 300) };
  }
}

/**
 * Enregistre la tentative sur le paiement (audit + anti-doublon) ET, en cas de
 * succès, réconcilie le paiement comme un règlement normal :
 *   - paidAmount += solde
 *   - statut "paid" si le total est atteint
 *   - création d'un encaissement NF525 pour le solde prélevé
 * La réconciliation n'est faite qu'une fois (garde mitChargedAt) pour éviter
 * tout double comptage si la fonction est rappelée.
 */
export async function logMitAttempt(paymentId: string, result: MitChargeResult, amount: number) {
  try {
    const ref = adminDb.collection("payments").doc(paymentId);
    const snap = await ref.get();
    const p: any = snap.exists ? snap.data() : {};
    const alreadySettled = !!p.mitChargedAt;

    const update: any = {
      mitLastAttemptAt: FieldValue.serverTimestamp(),
      mitLastResult: result.success ? "success" : (result.enabled ? "failed" : "skipped_disabled"),
      ...(result.paymentReference ? { mitPaymentReference: result.paymentReference } : {}),
      ...(result.error ? { mitLastError: result.error.slice(0, 300) } : {}),
    };

    if (result.success && !alreadySettled) {
      const total = Number(p.totalTTC || 0);
      const newPaid = +((Number(p.paidAmount || 0)) + amount).toFixed(2);
      const fullyPaid = total > 0 && newPaid >= total - 0.01;
      update.paidAmount = newPaid;
      update.mitChargedAt = FieldValue.serverTimestamp();
      if (fullyPaid) update.status = "paid";
      if (result.paymentReference) update.paymentRef = `CAWL-${result.paymentReference}`;
    }

    await ref.update(update);

    // Encaissement NF525 du solde prélevé (comme un paiement normal), une seule fois.
    if (result.success && !alreadySettled) {
      await createEncaissementServer({
        paymentId,
        familyId: p.familyId || "",
        familyName: p.familyName || "",
        montant: amount,
        mode: "cb_online",
        modeLabel: "Prélèvement automatique du solde (CAWL)",
        ref: result.paymentReference ? `CAWL-${result.paymentReference}` : "",
        activityTitle: (p.items || []).map((i: any) => i.activityTitle).join(", "),
      });
    }
  } catch (e) {
    console.error("[cawl-mit] logMitAttempt:", e);
  }
}
