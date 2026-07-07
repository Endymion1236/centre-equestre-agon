import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { createEncaissementServer } from "@/lib/compta-encaissement-server";
import { acquireCawlConfirmationLock } from "@/lib/cawl-lock";
import { Resend } from "resend";
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

const genCode = () => "BON-" + (Date.now().toString(36).slice(-4) + Math.random().toString(36).slice(2, 5)).toUpperCase();

function emailHtml(code: string, montant: number, beneficiaire: string, message: string): string {
  return `<!DOCTYPE html><html lang="fr"><body style="margin:0;background:#f4f1ea;font-family:Arial,sans-serif;padding:24px">
  <div style="max-width:520px;margin:0 auto;background:#1e3a5f;border-radius:16px;overflow:hidden;color:#fff">
    <div style="padding:28px 24px;text-align:center">
      <div style="font-size:12px;letter-spacing:2px;opacity:.7;text-transform:uppercase">Centre Équestre d'Agon-Coutainville</div>
      <div style="font-size:22px;font-weight:700;margin-top:6px">🎁 Votre bon cadeau</div>
      ${beneficiaire ? `<div style="margin-top:12px;opacity:.85">Pour : <strong>${beneficiaire}</strong></div>` : ""}
      <div style="font-size:44px;font-weight:700;color:#F0A010;margin:18px 0">${montant.toFixed(2)}€</div>
      <div style="display:inline-block;background:rgba(255,255,255,.12);padding:10px 22px;border-radius:8px;letter-spacing:2px;font-weight:700;font-size:16px">${code}</div>
      ${message ? `<div style="margin-top:14px;font-style:italic;opacity:.75">« ${message} »</div>` : ""}
    </div>
  </div>
  <p style="max-width:520px;margin:16px auto 0;color:#555;font-size:13px;text-align:center">
    Merci pour votre achat ! Présentez ce code au centre, ou utilisez-le lors d'un paiement.
    Conservez cet email — il fait office de bon cadeau.
  </p></body></html>`;
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
  // Déjà traité (rafraîchissement navigateur) → page merci sans re-traiter.
  if (sess.bonTraite) return merci();

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

    // Verrou anti-doublon (empêche un second traitement).
    const lock = await acquireCawlConfirmationLock({
      hostedCheckoutId, stage: "full", source: "status", amountCents: sess.totalCents || 0,
    });
    if (!lock) return merci();

    const montant = Number(sess.montant) || (sess.totalCents || 0) / 100;
    const code = genCode();

    // 1) Créer le bon (utilisable via le code).
    await adminDb.collection("bons-cadeaux").add({
      code, montant, solde: montant, statut: "actif",
      recipientName: sess.beneficiaire || "",
      message: sess.message || "",
      fromName: sess.acheteurNom || "",
      acheteurEmail: sess.acheteurEmail || "",
      source: "vente-en-ligne",
      merchantRef: sess.merchantRef || "",
      createdAt: new Date(),
    });

    // 2) Enregistrer la vente en recette (encaissement immuable), sans famille.
    await createEncaissementServer({
      familyId: "",
      familyName: `Bon cadeau en ligne — ${sess.acheteurNom || "acheteur"}`,
      montant,
      mode: "cb",
      modeLabel: "CB en ligne (bon cadeau)",
      ref: sess.merchantRef || "",
      activityTitle: "Bon cadeau",
      raison: `Vente bon cadeau ${code}`,
    });

    // 3) Envoyer le bon (code) par email à l'acheteur.
    try {
      const apiKey = process.env.RESEND_API_KEY || "";
      const resend = apiKey ? new Resend(apiKey) : null;
      const FROM = process.env.RESEND_FROM_EMAIL || process.env.RESEND_FROM || "onboarding@resend.dev";
      const BCC = process.env.RESEND_BCC_EMAIL || process.env.RESEND_BCC || "";
      if (resend && sess.acheteurEmail) {
        await resend.emails.send({
          from: FROM, to: sess.acheteurEmail, ...(BCC ? { bcc: BCC } : {}),
          subject: "🎁 Votre bon cadeau — Centre Équestre d'Agon-Coutainville",
          html: emailHtml(code, montant, sess.beneficiaire || "", sess.message || ""),
        });
      }
    } catch (e) { console.error("bon-cadeau email:", e); }

    await sessSnap.ref.set({ bonTraite: true, code }, { merge: true });
    return merci();
  } catch (e) {
    console.error("bon-cadeau status:", e);
    return cancel();
  }
}
