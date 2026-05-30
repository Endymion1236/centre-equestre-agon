import { NextRequest, NextResponse } from "next/server";
import { cawlSdk, CAWL_PSPID } from "@/lib/cawl";
import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

/**
 * Finalise une session Hosted Tokenization et crée le paiement de l'ACOMPTE
 * avec un token permanent (Card On File), pour permettre le prélèvement
 * automatique du solde à J-7.
 *
 * Entrée : { hostedTokenizationId, paymentId (doc Firestore), amount (acompte €) }
 * Étapes :
 *   1. GetHostedTokenization → récupère le tokenId.
 *   2. CreatePayment avec :
 *        - token (carte tokenisée)
 *        - tokenize: true (rend le token permanent → réutilisable pour le solde)
 *        - unscheduledCardOnFileRequestor: "cardholderInitiated"
 *        - unscheduledCardOnFileSequenceIndicator: "first"
 *        - threeDSecure.redirectionData.returnUrl (SCA obligatoire sur l'initial)
 *   3. Stocke cofToken + cofInitialPaymentId sur le paiement Firestore.
 *
 * Selon la réponse CAWL (merchantAction) :
 *   - REDIRECT → renvoie redirectUrl (3-D Secure challenge) au client.
 *   - sinon → paiement traité, on renvoie le statut.
 *
 * ⚠️ Nécessite Card On File activé sur le PSPID (confirmation CA).
 */
export async function POST(req: NextRequest) {
  try {
    if (!CAWL_PSPID) {
      return NextResponse.json({ error: "CAWL non configuré" }, { status: 500 });
    }
    const { hostedTokenizationId, paymentId, amount, returnUrl } = await req.json();
    if (!hostedTokenizationId || !paymentId || !amount) {
      return NextResponse.json({ error: "hostedTokenizationId, paymentId et amount requis" }, { status: 400 });
    }

    const htApi: any = (cawlSdk as any)?.hostedTokenization;
    const payApi: any = (cawlSdk as any)?.payments;

    // 1. Récupérer le token créé dans l'iframe
    const htResp = await htApi.getHostedTokenization(CAWL_PSPID, hostedTokenizationId);
    const tokenId = htResp?.body?.token?.id || htResp?.token?.id || "";
    // paymentProductId du token (ex. 1 = Visa) — REQUIS par createPayment,
    // sinon CAWL renvoie UNKNOWN_PRODUCT_ID (1007).
    const paymentProductId =
      htResp?.body?.token?.paymentProductId ??
      htResp?.token?.paymentProductId ??
      null;
    if (!tokenId) {
      return NextResponse.json({ error: "Token introuvable pour cette session" }, { status: 502 });
    }

    // 2. Créer le paiement de l'acompte avec le token, en le rendant permanent
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://centre-equestre-agon.vercel.app";
    const createReq: any = {
      cardPaymentMethodSpecificInput: {
        token: tokenId,
        ...(paymentProductId ? { paymentProductId } : {}),
        tokenize: true, // rend le token permanent (Card On File)
        // SALE = autorisation + capture immédiate (l'acompte est encaissé).
        authorizationMode: "SALE",
        unscheduledCardOnFileRequestor: "cardholderInitiated",
        unscheduledCardOnFileSequenceIndicator: "first",
        threeDSecure: {
          // Paiement avec carte enregistrée : on saute l'authentification forte
          // (sinon le paiement reste bloqué en attente d'un 3DS qui n'arrive
          // jamais → statut CREATED). Le challenge reste géré si CAWL le force
          // (merchantAction REDIRECT).
          skipAuthentication: true,
          redirectionData: {
            returnUrl: returnUrl || `${appUrl}/espace-cavalier/factures?cawlReturn=${paymentId}`,
          },
        },
      },
      order: {
        amountOfMoney: { amount: Math.round(Number(amount) * 100), currencyCode: "EUR" },
        references: { merchantReference: paymentId },
      },
    };

    let payResp: any;
    try {
      payResp = await payApi.createPayment(CAWL_PSPID, createReq);
    } catch (createErr: any) {
      console.error("[cawl/tokenize/finalize] createPayment:", createErr?.message, JSON.stringify(createErr?.body || {}));
      return NextResponse.json({ error: "createPayment a échoué", detail: createErr?.message }, { status: 502 });
    }
    const payBody = payResp?.body || payResp;
    const payment = payBody?.payment || payBody?.creationOutput?.payment || payBody?.createdPaymentOutput?.payment || {};
    const cawlPaymentId =
      payment?.id ||
      payBody?.payment?.id ||
      payBody?.creationOutput?.payment?.id ||
      payBody?.createdPaymentOutput?.payment?.id ||
      payBody?.id ||
      "";
    // Statut texte + code numérique (5/9 = réussi, 2 = refusé, 0 = transitoire).
    let status = payment?.status || payBody?.payment?.status || "";
    let statusCode =
      payment?.statusOutput?.statusCode ??
      payBody?.payment?.statusOutput?.statusCode ??
      payBody?.creationOutput?.payment?.statusOutput?.statusCode ??
      null;
    const merchantAction = payBody?.merchantAction || payment?.merchantAction;
    const redirectUrl = merchantAction?.redirectData?.redirectURL || "";

    // Statut transitoire (0) sans redirection → relire le statut définitif.
    if (cawlPaymentId && (Number(statusCode) === 0 || statusCode == null) && merchantAction?.actionType !== "REDIRECT") {
      try {
        const det = await payApi.getPaymentDetails(CAWL_PSPID, cawlPaymentId);
        const detBody = det?.body || det;
        const detStatus = detBody?.status || detBody?.payment?.status;
        const detCode = detBody?.statusOutput?.statusCode ?? detBody?.payment?.statusOutput?.statusCode;
        if (detStatus) status = detStatus;
        if (detCode != null) statusCode = detCode;
      } catch { /* non bloquant */ }
    }

    // 3. Stocker token + id paiement initial + statut de l'acompte
    const statusUpper = String(status).toUpperCase();
    const acomptePaid =
      [5, 9].includes(Number(statusCode)) ||
      ["CAPTURED", "PENDING_CAPTURE", "PAID", "CAPTURE_REQUESTED", "AUTHORIZED", "PENDING_APPROVAL"].includes(statusUpper);
    await adminDb.collection("payments").doc(paymentId).update({
      cofToken: tokenId,
      ...(cawlPaymentId ? { cofInitialPaymentId: cawlPaymentId } : {}),
      cawlTokenizedAt: FieldValue.serverTimestamp(),
      ...(acomptePaid ? {
        paidAmount: Math.round(Number(amount) * 100) / 100,
        status: "partial",
        paymentMode: "cb_online",
        paymentRef: cawlPaymentId ? `CAWL-${cawlPaymentId}` : "",
      } : {}),
    });

    if (merchantAction?.actionType === "REDIRECT" && redirectUrl) {
      return NextResponse.json({ requiresRedirect: true, redirectUrl, cawlPaymentId });
    }
    return NextResponse.json({ requiresRedirect: false, status, statusCode, cawlPaymentId });
  } catch (e: any) {
    console.error("[cawl/tokenize/finalize]", e);
    return NextResponse.json({ error: e?.message || "Erreur finalisation tokenisation" }, { status: 500 });
  }
}
