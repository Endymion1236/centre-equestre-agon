import { NextRequest, NextResponse } from "next/server";
import { cawlSdk, CAWL_PSPID } from "@/lib/cawl";

/**
 * Crée une session Hosted Tokenization CAWL pour l'acompte d'un stage.
 *
 * Flux (cf. doc CAWL Hosted Tokenization + spec OpenAPI) :
 *   1. [ICI] CreateHostedTokenization → renvoie hostedTokenizationUrl
 *   2. La page de paiement charge l'iframe Tokenizer avec cette URL
 *   3. Le client saisit sa carte, submitTokenization() → hostedTokenizationId
 *   4. /api/cawl/tokenize/finalize : GetHostedTokenization → token, puis
 *      CreatePayment de l'acompte avec ce token (tokenize permanent).
 *
 * askConsumerConsent + cvvMandatoryForNewToken=false : on prépare la carte
 * pour des paiements ultérieurs (le solde à J-7) sans imposer le CVC plus tard.
 * ⚠️ Le CVC optionnel nécessite l'accord acquéreur (cf. demande au CA).
 */
export async function POST(req: NextRequest) {
  try {
    if (!CAWL_PSPID) {
      return NextResponse.json({ error: "CAWL non configuré (CAWL_PSPID manquant)" }, { status: 500 });
    }

    const body = await req.json().catch(() => ({}));
    const locale = body.locale || "fr-FR";

    const htApi: any = (cawlSdk as any)?.hostedTokenization;
    if (!htApi || typeof htApi.createHostedTokenization !== "function") {
      return NextResponse.json({ error: "SDK hostedTokenization indisponible" }, { status: 500 });
    }

    const request: any = {
      locale,
      // Demande le consentement du client pour réutiliser sa carte (Card On File).
      askConsumerConsent: true,
      creditCardSpecificInput: {
        // Le CVC reste demandé à la création (paiement initial = acompte),
        // mais pas pour les transactions ultérieures (solde prélevé sans client).
        ValidationRules: {
          cvvMandatoryForNewToken: true,
          cvvMandatoryForExistingToken: false,
        },
      },
      // variant: template d'iframe personnalisé éventuel — à fournir par le CA
      // si un template custom est uploadé sur le compte. Optionnel.
      ...(process.env.CAWL_HT_VARIANT ? { variant: process.env.CAWL_HT_VARIANT } : {}),
    };

    const resp = await htApi.createHostedTokenization(CAWL_PSPID, request);
    const out = resp?.body || resp;
    const hostedTokenizationUrl = out?.hostedTokenizationUrl || "";
    const hostedTokenizationId = out?.hostedTokenizationId || "";

    if (!hostedTokenizationUrl) {
      return NextResponse.json({ error: "Pas d'URL de tokenisation renvoyée" }, { status: 502 });
    }

    return NextResponse.json({ hostedTokenizationUrl, hostedTokenizationId });
  } catch (e: any) {
    console.error("[cawl/tokenize/session]", e);
    return NextResponse.json({ error: e?.message || "Erreur création session tokenisation" }, { status: 500 });
  }
}
