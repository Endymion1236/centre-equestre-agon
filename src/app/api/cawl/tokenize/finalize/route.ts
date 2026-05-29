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
    if (!tokenId) {
      return NextResponse.json({ error: "Token introuvable pour cette session" }, { status: 502 });
    }

    // 2. Créer le paiement de l'acompte avec le token, en le rendant permanent
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://centre-equestre-agon.vercel.app";
    const createReq: any = {
      cardPaymentMethodSpecificInput: {
        token: tokenId,
        tokenize: true, // rend le token permanent (Card On File)
        unscheduledCardOnFileRequestor: "cardholderInitiated",
        unscheduledCardOnFileSequenceIndicator: "first",
        threeDSecure: {
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

    const payResp = await payApi.createPayment(CAWL_PSPID, createReq);
    const payBody = payResp?.body || payResp;
    // LOG DIAGNOSTIC TEMPORAIRE : structure complète de la réponse CAWL.
    console.log("[cawl/tokenize/finalize] createPayment resp:", JSON.stringify({ status: payResp?.status, body: payBody })?.slice(0, 1500));
    const payment = payBody?.payment || payBody?.creationOutput?.payment || payBody?.createdPaymentOutput?.payment || {};
    // L'id peut se trouver à plusieurs endroits selon la forme de réponse.
    const cawlPaymentId =
      payment?.id ||
      payBody?.payment?.id ||
      payBody?.creationOutput?.payment?.id ||
      payBody?.createdPaymentOutput?.payment?.id ||
      payBody?.id ||
      "";
    // Statut : CAWL renvoie un libellé texte (status) ET un code numérique
    // (statusOutput.statusCode : 5/9 = réussi, 2 = refusé). On gère les deux.
    const status = payment?.status || payBody?.payment?.status || "";
    const statusCode =
      payment?.statusOutput?.statusCode ??
      payBody?.payment?.statusOutput?.statusCode ??
      payBody?.creationOutput?.payment?.statusOutput?.statusCode ??
      null;
    const merchantAction = payBody?.merchantAction || payment?.merchantAction;
    const redirectUrl = merchantAction?.redirectData?.redirectURL || "";

    // Diagnostic : tracer la réponse si l'id manque (cas observé en test).
    if (!cawlPaymentId) {
      console.error("[cawl/tokenize/finalize] payment.id absent — réponse brute:", JSON.stringify(payBody)?.slice(0, 1000));
    }

    // 3. Stocker token + id paiement initial + statut de l'acompte
    const statusUpper = String(status).toUpperCase();
    const acomptePaid =
      [5, 9].includes(Number(statusCode)) ||
      ["CAPTURED", "PENDING_CAPTURE", "PAID", "CAPTURE_REQUESTED", "AUTHORIZED"].includes(statusUpper);
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
