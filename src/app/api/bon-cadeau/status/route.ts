import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { traiterBonCadeauSession } from "@/lib/bon-cadeau-traitement";
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

  if (!hostedCheckoutId) return cancel();

  const sessSnap = await adminDb.collection("cawl_sessions").doc(hostedCheckoutId).get();
  if (!sessSnap.exists) return cancel();
  const sess = sessSnap.data() as any;
  if (!sess.bonCadeau) return cancel();
  if (sess.returnMac && returnMac && sess.returnMac !== returnMac) {
    console.warn(`bon-cadeau status: RETURNMAC invalide pour ${hostedCheckoutId}`);
    return cancel();
  }
  if (sess.bonTraite) return merci(); // déjà traité (rafraîchissement / webhook)

  try {
    const { status: httpStatus, body } = await getHostedCheckoutStatus(hostedCheckoutId);
    const paymentStatus = body?.createdPaymentOutput?.payment?.status;
    const hcStatus = body?.status;
    const isSuccess = httpStatus === 200 &&
      (["CAPTURED", "PAID", "PENDING_CAPTURE"].includes(paymentStatus) || hcStatus === "PAYMENT_CREATED");

    if (!isSuccess) {
      console.log(`bon-cadeau status non abouti: hc=${hcStatus}, pay=${paymentStatus}`);
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
