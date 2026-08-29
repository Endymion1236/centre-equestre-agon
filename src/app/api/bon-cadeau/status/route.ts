import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { traiterBonCadeauSession } from "@/lib/bon-cadeau-traitement";
import { deciderPaiement } from "@/lib/cawl-status";
import crypto from "crypto";

// Lit le statut d'un Hosted Checkout CAWL (même signature V1HMAC que /api/cawl/status).
async function getHostedCheckoutStatus(hostedCheckoutId: string): Promise<any> {
  const isProduction = process.env.CAWL_ENV === "production";
  const host = isProduction ? "payment.ca.cawl-solutions.fr" : "payment.preprod.ca.cawl-solutions.fr";
  const pspid = process.env.CAWL_PSPID || "";
  const apiKeyId = process.env.CAWL_API_KEY_ID || process.env.CAWL_API_KEY || "";
  const secretKey = process.env.CAWL_SECRET_API_KEY || process.env.CAWL_API_SECRET || "";
  const path = `/v2/${pspid}/hostedcheckouts/${hostedCheckoutId}`;
  const date = new Date().toUTCString();
  const serverMetaInfo = Buffer.from(JSON.stringify({
    sdkCreator: "OnlinePayments", sdkIdentifier: "NodejsServerSDK/v7.4.0",
    platformIdentifier: "Node.js", integrator: "Centre Equestre Agon-Coutainville",
  })).toString("base64");
  const xGcsHeader = `x-gcs-servermetainfo:${serverMetaInfo}`;
  const toSign = `GET\n\n${date}\n${xGcsHeader}\n${path}\n`;
  const signature = crypto.createHmac("SHA256", secretKey).update(toSign).digest("base64");
  const res = await fetch(`https://${host}${path}`, {
    method: "GET",
    headers: {
      "Date": date,
      "Content-Type": "application/json",
      "X-GCS-ServerMetaInfo": serverMetaInfo,
      "Authorization": `GCS v1HMAC:${apiKeyId}:${signature}`,
    },
  });
  const data = await res.json();
  return { status: res.status, body: data };
}

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const hostedCheckoutId = p.get("hostedCheckoutId") || p.get("HOSTEDCHECKOUTID") || "";
  const returnMac = p.get("RETURNMAC") || p.get("returnMac") || "";
  const origin = req.nextUrl.origin;
  const cancel = () => NextResponse.redirect(new URL("/offrir-un-bon?cancelled=true", origin));
  const merci = () => NextResponse.redirect(new URL("/offrir-un-bon/merci?ok=1", origin));

  // Les DEUX paramètres sont exigés. Le test précédent
  // (`sess.returnMac && returnMac && …`) échouait en mode ouvert : appeler
  // l'URL sans RETURNMAC sautait entièrement le contrôle, et un simple
  // hostedCheckoutId suffisait à déclencher le traitement du bon.
  if (!hostedCheckoutId || !returnMac) return cancel();

  const sessSnap = await adminDb.collection("cawl_sessions").doc(hostedCheckoutId).get();
  if (!sessSnap.exists) return cancel();
  const sess = sessSnap.data() as any;
  if (!sess.bonCadeau) return cancel();

  // Comparaison en temps constant, comme /api/cawl/status
  // (timingSafeEqual exige des Buffers de même longueur).
  const receivedBuf = Buffer.from(returnMac, "utf8");
  const storedBuf = Buffer.from(String(sess.returnMac || ""), "utf8");
  const macValid =
    receivedBuf.length === storedBuf.length &&
    receivedBuf.length > 0 &&
    crypto.timingSafeEqual(receivedBuf, storedBuf);
  if (!macValid) {
    console.warn(`bon-cadeau status: RETURNMAC invalide pour ${hostedCheckoutId}`);
    return cancel();
  }
  if (sess.bonTraite) return merci(); // déjà traité (rafraîchissement / webhook)

  try {
    const { status: httpStatus, body } = await getHostedCheckoutStatus(hostedCheckoutId);
    const paymentStatus = body?.createdPaymentOutput?.payment?.status;
    const hcStatus = body?.status;

    // ⚠️ SEUL le statut du PAIEMENT décide — cf. lib/cawl-status.ts et
    // l'incident du 30/07/2026. Cette route acceptait encore
    // `hcStatus === "PAYMENT_CREATED"` comme critère de succès : or ce statut
    // décrit la SESSION (« une tentative a été créée »), et un refus bancaire
    // en crée une aussi. Un bon cadeau valide était donc émis, la recette
    // comptabilisée et l'email envoyé, sans le moindre encaissement.
    const decision = httpStatus === 200 ? deciderPaiement(paymentStatus) : "en_attente";

    if (decision !== "succes") {
      console.log(`bon-cadeau status non abouti (${decision}): hc=${hcStatus}, pay=${paymentStatus}`);
      return cancel();
    }

    // Traitement partagé (génère le bon + recette + email, idempotent).
    await traiterBonCadeauSession(hostedCheckoutId, "status");
    return merci();
  } catch (e) {
    console.error("bon-cadeau status:", e);
    return cancel();
  }
}
