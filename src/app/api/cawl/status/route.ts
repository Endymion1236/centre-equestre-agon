import { NextRequest, NextResponse } from "next/server";
import { cawlSdk, CAWL_PSPID } from "@/lib/cawl";
import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { loadTemplate } from "@/lib/email-template-loader";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // Log URL complète pour débugger les paramètres CAWL
  console.log("CAWL status URL complète:", req.nextUrl.toString());
  console.log("CAWL status params:", Object.fromEntries(req.nextUrl.searchParams.entries()));

  // CAWL retourne HOSTEDCHECKOUTID et RETURNMAC (tester les deux casses)
  const hostedCheckoutId =
    req.nextUrl.searchParams.get("HOSTEDCHECKOUTID") ||
    req.nextUrl.searchParams.get("hostedCheckoutId") ||
    req.nextUrl.searchParams.get("hostedcheckoutid") || "";
  const returnMac =
    req.nextUrl.searchParams.get("RETURNMAC") ||
    req.nextUrl.searchParams.get("returnMac") ||
    req.nextUrl.searchParams.get("returnmac") || "";
  const ref = req.nextUrl.searchParams.get("ref") || "";
  const paymentId = req.nextUrl.searchParams.get("paymentId") || "";
  const familyId = req.nextUrl.searchParams.get("familyId") || "";
  const depositStr = req.nextUrl.searchParams.get("deposit") || "0";
  const depositPercent = parseInt(depositStr) || 0;
  const isDeposit = depositPercent > 0 && depositPercent < 100;

  console.log(`CAWL status: hostedCheckoutId=${hostedCheckoutId}, returnMac=${!!returnMac}, ref=${ref}, paymentId=${paymentId}`);

  // Sans HOSTEDCHECKOUTID ou RETURNMAC → redirection directe (annulation probable)
  if (!hostedCheckoutId || !returnMac) {
    console.log("CAWL: pas de HOSTEDCHECKOUTID dans l'URL retour → probablement annulation");
    return NextResponse.redirect(
      new URL(`/espace-cavalier/reserver?cancelled=true`, req.nextUrl.origin)
    );
  }

  try {
    if (!CAWL_PSPID) throw new Error("CAWL_PSPID manquant");

    // Interroger le statut du paiement chez CAWL
    const statusResponse = await cawlSdk.hostedCheckout.getHostedCheckout(
      CAWL_PSPID,
      hostedCheckoutId,
      {}
    );

    const hcStatus = statusResponse.body?.status; // ex: "PAYMENT_CREATED", "IN_PROGRESS", "CLIENT_NOT_AUTHENTICATED"
    const paymentOutput = statusResponse.body?.createdPaymentOutput?.payment;
    const paymentStatus = paymentOutput?.status; // "CAPTURED", "PAID", "PENDING_CAPTURE", etc.
    const totalCents = paymentOutput?.paymentOutput?.amountOfMoney?.amount || 0;
    const totalEuros = totalCents / 100;

    console.log(`CAWL status: hcStatus=${hcStatus}, paymentStatus=${paymentStatus}, montant=${totalEuros}€`);

    const isSuccess = paymentStatus === "CAPTURED"
      || paymentStatus === "PAID"
      || paymentStatus === "PENDING_CAPTURE"
      || hcStatus === "PAYMENT_CREATED";

    if (isSuccess) {
      // ── Trouver le payment Firestore ──────────────────────────────────
      let payRef = null;
      let pData: any = null;

      if (paymentId) {
        const snap = await adminDb.collection("payments").doc(paymentId).get();
        if (snap.exists) {
          payRef = snap.ref;
          pData = snap.data();
        }
      }

      // Fallback : chercher par cawlRef
      if (!payRef && ref) {
        const snap = await adminDb.collection("payments")
          .where("cawlRef", "==", ref)
          .limit(1)
          .get();
        if (!snap.empty) {
          payRef = snap.docs[0].ref;
          pData = snap.docs[0].data();
        }
      }

      if (payRef && pData) {
        const totalTTC = pData.totalTTC || 0;
        const paidAmount = isDeposit
          ? Math.round(totalTTC * depositPercent / 100 * 100) / 100
          : totalEuros || totalTTC;

        // Éviter la double mise à jour si déjà payé
        if (pData.status !== "paid") {
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

          console.log(`✅ CAWL payment confirmé: ${ref} — ${paidAmount}€ — status=${isDeposit ? "partial" : "paid"}`);

          // ── Email de confirmation ─────────────────────────────────────
          const parentEmail = pData.familyEmail || "";
          const parentName = pData.familyName || "Client";
          const resendKey = process.env.RESEND_API_KEY;
          const fromEmail = process.env.RESEND_FROM_EMAIL || "Centre Equestre <onboarding@resend.dev>";

          if (parentEmail && resendKey) {
            try {
              const prestations = (pData.items || []).map((i: any) => i.activityTitle).join(", ") || "Prestation";
              const hasStage = (pData.items || []).some((i: any) => i.activityType === "stage");

              let templateKey = "confirmationPaiement";
              let vars: Record<string, string | number> = {
                parentName,
                montant: paidAmount.toFixed(2),
                prestations,
              };

              if (hasStage) {
                templateKey = "confirmationStage";
                vars = {
                  parentName,
                  stageTitle: pData.items?.[0]?.activityTitle || "Stage",
                  dates: prestations,
                  horaires: "",
                  enfants: (pData.items || []).map((i: any) => i.childName).filter(Boolean).join(", "),
                  montant: paidAmount.toFixed(2),
                };
              }

              const { subject, html } = await loadTemplate(templateKey, vars);
              fetch("https://api.resend.com/emails", {
                method: "POST",
                headers: {
                  "Authorization": `Bearer ${resendKey}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  from: fromEmail,
                  to: parentEmail,
                  ...(process.env.RESEND_BCC_EMAIL ? { bcc: process.env.RESEND_BCC_EMAIL } : {}),
                  subject,
                  html,
                }),
              }).catch(e => console.error("Email confirmation CAWL error:", e));
            } catch (emailErr) {
              console.error("Email template CAWL error:", emailErr);
            }
          }
        }

        return NextResponse.redirect(
          new URL(
            isDeposit
              ? `/espace-cavalier/reservations?success=true&deposit=true`
              : `/espace-cavalier/reservations?success=true`,
            req.nextUrl.origin
          )
        );
      }

      // Payment non trouvé mais paiement réussi → rediriger quand même
      console.warn(`CAWL: paiement réussi mais payment Firestore introuvable — ref=${ref}, paymentId=${paymentId}`);
      return NextResponse.redirect(
        new URL(`/espace-cavalier/reservations?success=true`, req.nextUrl.origin)
      );
    }

    // Paiement échoué / annulé
    console.log(`CAWL: paiement non abouti — hcStatus=${hcStatus}, paymentStatus=${paymentStatus}`);
    return NextResponse.redirect(
      new URL(`/espace-cavalier/reserver?cancelled=true`, req.nextUrl.origin)
    );

  } catch (error: any) {
    console.error("CAWL status error:", error);
    // En cas d'erreur API CAWL, rediriger vers réservations (le webhook confirmera si paiement ok)
    return NextResponse.redirect(
      new URL(`/espace-cavalier/reservations?success=true`, req.nextUrl.origin)
    );
  }
}
