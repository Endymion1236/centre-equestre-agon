import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { loadTemplate } from "@/lib/email-template-loader";
import crypto from "crypto";

export const dynamic = "force-dynamic";

// Appel direct CAWL sans SDK — signature HMAC exacte selon spec Worldline
async function getHostedCheckoutStatus(hostedCheckoutId: string): Promise<any> {
  const isProduction = process.env.CAWL_ENV === "production";
  const host = isProduction
    ? "payment.ca.cawl-solutions.fr"
    : "payment.preprod.ca.cawl-solutions.fr";
  const pspid = process.env.CAWL_PSPID || "";
  const apiKeyId = process.env.CAWL_API_KEY_ID || process.env.CAWL_API_KEY || "";
  const secretKey = process.env.CAWL_SECRET_API_KEY || process.env.CAWL_API_SECRET || "";

  const path = `/v2/${pspid}/hostedcheckouts/${hostedCheckoutId}`;
  const method = "GET";
  const date = new Date().toUTCString();

  // Spec Worldline V1HMAC: contentType vide pour GET, headers X-GCS-* inclus
  const serverMetaInfo = Buffer.from(JSON.stringify({
    sdkCreator: "OnlinePayments",
    sdkIdentifier: "NodejsServerSDK/v7.4.0",
    platformIdentifier: "Node.js",
    integrator: "Centre Equestre Agon-Coutainville",
  })).toString("base64");

  const xGcsHeader = `x-gcs-servermetainfo:${serverMetaInfo}`;
  const toSign = `${method}

${date}
${xGcsHeader}
${path}
`;
  const signature = crypto.createHmac("SHA256", secretKey).update(toSign).digest("base64");
  const authorization = `GCS v1HMAC:${apiKeyId}:${signature}`;

  const url = `https://${host}${path}`;
  console.log(`CAWL GET ${url}`);

  const res = await fetch(url, {
    method: "GET",
    headers: {
      "Date": date,
      "Content-Type": "application/json",
      "X-GCS-ServerMetaInfo": serverMetaInfo,
      "Authorization": authorization,
    },
  });

  const data = await res.json();
  console.log(`CAWL getHostedCheckout status=${res.status}:`, JSON.stringify(data).substring(0, 500));
  return { status: res.status, body: data };
}

export async function GET(req: NextRequest) {
  // Log tous les paramètres reçus
  console.log("CAWL status params:", Object.fromEntries(req.nextUrl.searchParams.entries()));

  // CAWL envoie hostedCheckoutId (camelCase) + RETURNMAC
  const hostedCheckoutId =
    req.nextUrl.searchParams.get("hostedCheckoutId") ||
    req.nextUrl.searchParams.get("HOSTEDCHECKOUTID") || "";
  const returnMac =
    req.nextUrl.searchParams.get("RETURNMAC") ||
    req.nextUrl.searchParams.get("returnMac") || "";
  const ref = req.nextUrl.searchParams.get("ref") || "";
  const paymentId = req.nextUrl.searchParams.get("paymentId") || "";
  const familyId = req.nextUrl.searchParams.get("familyId") || "";
  const depositStr = req.nextUrl.searchParams.get("deposit") || "0";
  const depositPercent = parseInt(depositStr) || 0;
  const isDeposit = depositPercent > 0 && depositPercent < 100;

  console.log(`CAWL status: hostedCheckoutId=${hostedCheckoutId}, returnMac=${!!returnMac}, paymentId=${paymentId}`);

  if (!hostedCheckoutId || !returnMac) {
    console.log("CAWL: paramètres manquants → annulation");
    return NextResponse.redirect(new URL(`/espace-cavalier/reserver?cancelled=true`, req.nextUrl.origin));
  }

  try {
    const { status: httpStatus, body } = await getHostedCheckoutStatus(hostedCheckoutId);

    if (httpStatus !== 200) {
      console.error(`CAWL API erreur ${httpStatus}:`, body);
      // Rediriger quand même vers succès — le paiement a peut-être abouti
      return NextResponse.redirect(new URL(`/espace-cavalier/reservations?success=true`, req.nextUrl.origin));
    }

    const hcStatus = body?.status;
    const paymentOutput = body?.createdPaymentOutput?.payment;
    const paymentStatus = paymentOutput?.status;
    const totalCents = paymentOutput?.paymentOutput?.amountOfMoney?.amount || 0;
    const totalEuros = totalCents / 100;

    console.log(`CAWL hcStatus=${hcStatus}, paymentStatus=${paymentStatus}, montant=${totalEuros}€`);

    const isSuccess =
      paymentStatus === "CAPTURED" ||
      paymentStatus === "PAID" ||
      paymentStatus === "PENDING_CAPTURE" ||
      hcStatus === "PAYMENT_CREATED";

    if (!isSuccess) {
      console.log(`CAWL paiement non abouti: hcStatus=${hcStatus}, paymentStatus=${paymentStatus}`);
      return NextResponse.redirect(new URL(`/espace-cavalier/reserver?cancelled=true`, req.nextUrl.origin));
    }

    // ── Trouver le payment Firestore ──────────────────────────────────────
    let payRef = null;
    let pData: any = null;

    if (paymentId) {
      const snap = await adminDb.collection("payments").doc(paymentId).get();
      if (snap.exists) { payRef = snap.ref; pData = snap.data(); }
    }

    if (!payRef && ref) {
      const snap = await adminDb.collection("payments").where("cawlRef", "==", ref).limit(1).get();
      if (!snap.empty) { payRef = snap.docs[0].ref; pData = snap.docs[0].data(); }
    }

    if (payRef && pData && pData.status !== "paid") {
      const totalTTC = pData.totalTTC || 0;
      // Utiliser acompteAmount stocké (montant exact) plutôt que recalculer depuis le %
      const paidAmount = isDeposit
        ? (pData.acompteAmount || Math.round(totalTTC * depositPercent / 100 * 100) / 100)
        : totalEuros || totalTTC;

      await payRef.update({
        status: isDeposit ? "partial" : "paid",
        paidAmount,
        paymentMode: "cb_online",
        cawlHostedCheckoutId: hostedCheckoutId,
        paymentRef: `CAWL-${hostedCheckoutId}`,
        updatedAt: FieldValue.serverTimestamp(),
      });

      await adminDb.collection("encaissements").add({
        paymentId: payRef.id,
        familyId: familyId || pData.familyId,
        familyName: pData.familyName || "",
        montant: paidAmount,
        mode: "cb_online",
        modeLabel: isDeposit ? `CB en ligne CAWL (acompte ${depositPercent}%)` : "CB en ligne (CAWL)",
        ref: `CAWL-${hostedCheckoutId}`,
        activityTitle: (pData.items || []).map((i: any) => i.activityTitle).join(", "),
        date: FieldValue.serverTimestamp(),
      });

      console.log(`✅ Payment ${payRef.id} mis à jour: ${isDeposit ? "partial" : "paid"} — ${paidAmount}€`);

      // ── Email confirmation ───────────────────────────────────────────────
      const parentEmail = pData.familyEmail || "";
      const resendKey = process.env.RESEND_API_KEY;
      if (parentEmail && resendKey) {
        try {
          const items = pData.items || [];
          const hasStage = items.some((i: any) => i.activityType === "stage");

          // Construire une description détaillée par article
          const lignesDetail = items.map((i: any) => {
            const parts = [i.activityTitle, i.childName].filter(Boolean);
            const infos = [];
            if (i.date) {
              const d = new Date(i.date);
              const dateStr = d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
              infos.push(dateStr);
            }
            if (i.startTime && i.endTime) infos.push(`${i.startTime}–${i.endTime}`);
            if (i.monitor) infos.push(`avec ${i.monitor}`);
            return `${parts.join(" — ")}${infos.length ? `<br/><span style="color:#888;font-size:12px;">${infos.join(" · ")}</span>` : ""}`;
          }).join("<br/><br/>");

          const prestations = items.map((i: any) => i.activityTitle).join(", ") || "Prestation";
          const templateKey = hasStage ? "confirmationStage" : "confirmationPaiement";
          const vars: Record<string, string | number> = hasStage ? {
            parentName: pData.familyName || "Client",
            stageTitle: items[0]?.activityTitle || "Stage",
            dates: items.map((i: any) => {
              if (!i.date) return "";
              return new Date(i.date).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "long" });
            }).filter(Boolean).join(", "),
            horaires: items.map((i: any) => i.startTime && i.endTime ? `${i.startTime}–${i.endTime}` : "").filter(Boolean)[0] || "",
            enfants: items.map((i: any) => i.childName).filter(Boolean).join(", "),
            montant: paidAmount.toFixed(2),
          } : {
            parentName: pData.familyName || "Client",
            montant: paidAmount.toFixed(2),
            prestations: lignesDetail || prestations,
          };
          const { subject, html } = await loadTemplate(templateKey, vars);
          fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { "Authorization": `Bearer ${resendKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              from: process.env.RESEND_FROM_EMAIL || "Centre Equestre <onboarding@resend.dev>",
              to: parentEmail,
              ...(process.env.RESEND_BCC_EMAIL ? { bcc: process.env.RESEND_BCC_EMAIL } : {}),
              subject, html,
            }),
          }).catch(e => console.error("Email CAWL error:", e));
        } catch (e) { console.error("Email template error:", e); }
      }
    } else if (pData?.status === "paid") {
      console.log(`Payment ${payRef?.id} déjà payé, skip`);
    } else {
      console.warn(`Payment Firestore introuvable: paymentId=${paymentId}, ref=${ref}`);
    }

    return NextResponse.redirect(
      new URL(isDeposit ? `/espace-cavalier/reservations?success=true&deposit=true` : `/espace-cavalier/reservations?success=true`, req.nextUrl.origin)
    );

  } catch (error: any) {
    console.error("CAWL status error:", error);
    return NextResponse.redirect(new URL(`/espace-cavalier/reservations?success=true`, req.nextUrl.origin));
  }
}
