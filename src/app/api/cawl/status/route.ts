import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { loadTemplate } from "@/lib/email-template-loader";
import { awardLoyaltyPointsServer } from "@/lib/fidelite";
import { confirmReservationsForPayment } from "@/lib/reservations";
import { acquireCawlConfirmationLock } from "@/lib/cawl-lock";
import { logEmail } from "@/lib/email-log";
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

  // ── Vérification du RETURNMAC contre celui stocké au checkout ─────────
  // Le RETURNMAC est un secret partagé entre nous et CAWL, généré par CAWL
  // lors du createHostedCheckout. Sans cette vérification, n'importe qui
  // connaissant un hostedCheckoutId pourrait déclencher la confirmation.
  try {
    const sessionSnap = await adminDb
      .collection("cawl_sessions")
      .doc(hostedCheckoutId)
      .get();

    if (!sessionSnap.exists) {
      console.warn(`CAWL status: session ${hostedCheckoutId} introuvable → rejet`);
      return NextResponse.redirect(new URL(`/espace-cavalier/reserver?cancelled=true`, req.nextUrl.origin));
    }

    const sessionData = sessionSnap.data() as any;
    const storedReturnMac = sessionData?.returnMac || "";

    // Comparaison en temps constant pour éviter les timing attacks
    // (Node: timingSafeEqual nécessite des Buffers de même longueur)
    const receivedBuf = Buffer.from(returnMac, "utf8");
    const storedBuf = Buffer.from(storedReturnMac, "utf8");

    const macValid =
      receivedBuf.length === storedBuf.length &&
      receivedBuf.length > 0 &&
      crypto.timingSafeEqual(receivedBuf, storedBuf);

    if (!macValid) {
      console.warn(
        `CAWL status: RETURNMAC invalide pour ${hostedCheckoutId} — possible tentative de forgery`
      );
      return NextResponse.redirect(
        new URL(`/espace-cavalier/reserver?cancelled=true`, req.nextUrl.origin)
      );
    }
  } catch (e) {
    console.error("CAWL status: erreur vérification RETURNMAC:", e);
    return NextResponse.redirect(
      new URL(`/espace-cavalier/reserver?cancelled=true`, req.nextUrl.origin)
    );
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

      // ── Verrou anti-doublon ──────────────────────────────────────────
      // Empêche status + webhook d'écrire tous les deux si appelés en
      // parallèle, et empêche aussi qu'un refresh navigateur déclenche un
      // second traitement (cas des acomptes où status !== "paid" reste vrai).
      // Le stage distingue deposit/full pour permettre les deux étapes
      // successives d'un paiement en deux fois.
      const stage: "deposit" | "full" = isDeposit ? "deposit" : "full";
      const lockAcquired = await acquireCawlConfirmationLock({
        hostedCheckoutId,
        stage,
        source: "status",
        paymentId: payRef.id,
        amountCents: Math.round(paidAmount * 100),
      });

      if (!lockAcquired) {
        console.log(
          `CAWL status: confirmation déjà traitée pour ${hostedCheckoutId} (stage=${stage}), redirect succès`
        );
        return NextResponse.redirect(
          new URL(
            isDeposit
              ? `/espace-cavalier/reservations?success=true&deposit=true`
              : `/espace-cavalier/reservations?success=true`,
            req.nextUrl.origin
          )
        );
      }

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

      // ── Attribution des points de fidélité ────────────────────────
      // Attribuer sur le montant effectivement encaissé (acompte OU solde)
      await awardLoyaltyPointsServer({
        familyId: familyId || pData.familyId,
        familyName: pData.familyName,
        montant: paidAmount,
        label: (pData.items || []).map((i: any) => i.activityTitle).join(", ") || "Paiement en ligne",
      });

      // ── Confirmer les réservations associées ──────────────────────
      // Uniquement si le paiement est soldé (pas pour un acompte, le cavalier
      // doit encore régler le solde avant que la résa soit définitivement
      // confirmée)
      if (!isDeposit) {
        await confirmReservationsForPayment({
          familyId: familyId || pData.familyId,
          items: pData.items || [],
        });
      }

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
          })
            .then(async (res) => {
              if (res.ok) {
                await logEmail({ to: parentEmail, subject, context: "cawl_status_check", template: templateKey, status: "sent", sentBy: "system", paymentId: payRef?.id, familyId: pData.familyId });
              } else {
                const errText = await res.text().catch(() => "");
                await logEmail({ to: parentEmail, subject, context: "cawl_status_check", template: templateKey, status: "failed", error: `HTTP ${res.status}: ${errText}`.slice(0, 500), sentBy: "system", paymentId: payRef?.id, familyId: pData.familyId });
              }
            })
            .catch(async (e) => {
              await logEmail({ to: parentEmail, subject, context: "cawl_status_check", template: templateKey, status: "failed", error: e?.message || String(e), sentBy: "system", paymentId: payRef?.id, familyId: pData.familyId });
              console.error("Email CAWL error:", e);
            });
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
