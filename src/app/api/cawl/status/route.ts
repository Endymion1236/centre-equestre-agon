import { NextRequest, NextResponse } from "next/server";
import { encadreConditionsStage } from "@/lib/cgv-clauses";
import { deciderPaiement } from "@/lib/cawl-status";
import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { loadTemplate } from "@/lib/email-template-loader";
import { awardLoyaltyPointsServer } from "@/lib/fidelite";
import { confirmReservationsForPayment } from "@/lib/reservations";
import { confirmerPlacesTenues } from "@/lib/places-tenues";
import { createForfaitsForPayment } from "@/lib/forfaits-server";
import { acquireCawlConfirmationLock } from "@/lib/cawl-lock";
import { logEmail } from "@/lib/email-log";
import { isRecipientAllowed, refreshEmailMode } from "@/lib/email-guard";
import { createEncaissementServer } from "@/lib/compta-encaissement-server";
import { deciderConfirmation } from "@/lib/cawl-confirmation";
import { lignesDetailHtml, prestationsCourtes, libelleModePaiement, titreSansEnfant, datesStage, dateEcheanceSolde } from "@/lib/email-prestations";
import type { Paiement, SessionCawl } from "@/types/argent";
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
  let sessionPaymentId = "";
  let sessionAmountEuros: number | null = null;
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

    const sessionData = sessionSnap.data() as SessionCawl;
    const storedReturnMac = sessionData?.returnMac || "";
    sessionPaymentId = sessionData?.paymentId || "";
    // Montant DEMANDÉ à la création du checkout (écrit côté serveur) —
    // référentiel du contrôle de cohérence : un lien de paiement partiel
    // (ex. acompte 30€ envoyé par l'admin) attend 30€, pas le total.
    sessionAmountEuros =
      typeof sessionData?.totalCents === "number" && sessionData.totalCents > 0
        ? Math.round(sessionData.totalCents) / 100
        : null;

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
      // On ne peut PAS savoir si le paiement a abouti : ne pas annoncer un
      // succes. Le webhook fera foi ; la famille voit un statut en cours.
      return NextResponse.redirect(
        new URL(`/espace-cavalier/reservations?pending=true`, req.nextUrl.origin),
      );
    }

    const hcStatus = body?.status;
    const paymentOutput = body?.createdPaymentOutput?.payment;
    const paymentStatus = paymentOutput?.status;
    const totalCents = paymentOutput?.paymentOutput?.amountOfMoney?.amount || 0;
    const totalEuros = totalCents / 100;

    console.log(`CAWL hcStatus=${hcStatus}, paymentStatus=${paymentStatus}, montant=${totalEuros}€`);

    // ⚠️ SEUL le statut du paiement decide. `hcStatus === "PAYMENT_CREATED"`
    // figurait ici comme critere de succes : il decrit la SESSION (« une
    // tentative a ete creee »), pas le resultat. Un refus bancaire cree lui
    // aussi un paiement — d'ou des cartes refusees validees en factures
    // reglees, avec email de confirmation et place reservee. Voir
    // lib/cawl-status.ts.
    const decision = deciderPaiement(paymentStatus);

    if (decision !== "succes") {
      console.warn(
        `CAWL paiement NON abouti (${decision}) : hcStatus=${hcStatus}, paymentStatus=${paymentStatus}, montant=${totalEuros}€`,
      );
      // « en_attente » : statut indetermine, le webhook tranchera. On ne
      // valide rien ici — une inscription en attente vaut mieux qu'une
      // place donnee sans encaissement.
      const motif = decision === "echec" ? "refused" : "pending";
      return NextResponse.redirect(
        new URL(`/espace-cavalier/reserver?cancelled=true&motif=${motif}`, req.nextUrl.origin),
      );
    }

    // ── Trouver le payment Firestore ──────────────────────────────────────
    // paymentId vient de l'URL de retour, mais certains flux (inscription
    // annuelle groupée) ne l'ont pas toujours passé : fallback sur la session
    // CAWL (cawl_sessions stocke le paymentId au moment du checkout) puis sur
    // la référence marchand. Sans ça, le paiement resterait "pending".
    let payRef = null;
    let pData: Paiement | null = null;
    const effectivePaymentId = paymentId || sessionPaymentId || "";

    if (effectivePaymentId) {
      const snap = await adminDb.collection("payments").doc(effectivePaymentId).get();
      if (snap.exists) { payRef = snap.ref; pData = snap.data() as Paiement; }
    }

    if (!payRef && ref) {
      const snap = await adminDb.collection("payments").where("cawlRef", "==", ref).limit(1).get();
      if (!snap.empty) { payRef = snap.docs[0].ref; pData = snap.docs[0].data() as Paiement; }
    }

    if (payRef && pData && pData.status !== "paid") {
      const totalTTC = pData.totalTTC || 0;

      // ── Décision partagée avec /api/cawl/webhook ──────────────────────
      // Montant attendu, cumul et attribution de facture sont calculés par
      // lib/cawl-confirmation.ts, pour que les deux chemins de confirmation ne
      // puissent plus diverger (cf. l'en-tête de ce module).
      const decisionConf = deciderConfirmation({
        montantEncaisseEuros: totalEuros,
        montantSessionEuros: sessionAmountEuros,
        totalTTC,
        dejaPaye: pData.paidAmount || 0,
        estAcompte: !!isDeposit,
        acompteAttendu: pData.acompteAmount ?? null,
        depositPercent,
        aDejaUneFacture: !!pData.invoiceNumber,
      });

      const montantPaye = decisionConf.montantCredite;
      const paidAmount = montantPaye; // encaissement de CE paiement (journal NF525)

      if (!decisionConf.accepte) {
        console.error(
          `⚠️ CAWL montant incohérent — payé ${totalEuros}€ < attendu ${decisionConf.montantAttendu}€ ` +
          `(payment=${payRef.id}, hc=${hostedCheckoutId}). Confirmation refusée.`
        );
        await payRef.update({
          amountMismatch: true,
          amountPaidReported: totalEuros,
          amountExpected: decisionConf.montantAttendu,
          needsReview: true,
          updatedAt: FieldValue.serverTimestamp(),
        });
        return NextResponse.redirect(
          new URL(`/espace-cavalier/reservations?review=true`, req.nextUrl.origin)
        );
      }

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

      // Token Card On File : si CAWL renvoie un token réutilisable (tokenisation
      // activée sur l'acompte), on le stocke pour permettre le prélèvement
      // automatique du solde à J-7 (cf. cron charge-stage-balances + cawl-mit).
      // Tant que la tokenisation n'est pas branchée, ces champs restent vides
      // et le cron retombe sur l'email de rappel.
      const cofToken = paymentOutput?.paymentOutput?.cardPaymentMethodSpecificOutput?.token
        || paymentOutput?.cardPaymentMethodSpecificOutput?.token
        || body?.createdPaymentOutput?.token
        || "";
      const cofSchemeTxId = paymentOutput?.paymentOutput?.cardPaymentMethodSpecificOutput?.schemeTransactionId
        || paymentOutput?.cardPaymentMethodSpecificOutput?.schemeTransactionId
        || "";
      // Id CAWL du paiement initial (acompte) — référence pour le delayedCharge du solde.
      const cofInitialPaymentId = paymentOutput?.id || paymentOutput?.paymentOutput?.references?.paymentReference || "";

      // ── Cumul : paidAmount s'ADDITIONNE (acompte puis solde, ou liens
      //    partiels successifs). Statut "paid" uniquement quand le total est
      //    atteint — un paiement partiel quelconque reste "partial".
      const newPaidTotal = decisionConf.nouveauCumul;
      const isFullyPaid = decisionConf.statut === "paid";

      // Une vente intégralement réglée doit avoir sa FACTURE : numérotation
      // séquentielle attribuée ici aussi (le flux UI le fait déjà — sans ça,
      // les paiements soldés en ligne restaient des proformas PF-…).
      let newInvoiceNumber: string | null = null;
      if (decisionConf.attribuerFacture) {
        try {
          const { attribuerNumeroFacture } = await import("@/lib/invoice-number");
          newInvoiceNumber = (await attribuerNumeroFacture({ paymentId: payRef.id, attributedBy: "system:cawl-status" })).invoiceNumber;
        } catch (e) {
          console.error("CAWL status: attribution numéro facture échouée (non-bloquant):", e);
        }
      }

      await payRef.update({
        status: decisionConf.statut,
        paidAmount: newPaidTotal,
        ...(newInvoiceNumber ? { invoiceNumber: newInvoiceNumber, invoiceDate: FieldValue.serverTimestamp() } : {}),
        paymentMode: "cb_online",
        cawlHostedCheckoutId: hostedCheckoutId,
        paymentRef: `CAWL-${hostedCheckoutId}`,
        ...(cofToken ? { cofToken, cawlTokenizedAt: FieldValue.serverTimestamp() } : {}),
        ...(cofSchemeTxId ? { cofSchemeTransactionId: cofSchemeTxId } : {}),
        ...(cofInitialPaymentId ? { cofInitialPaymentId } : {}),
        updatedAt: FieldValue.serverTimestamp(),
      });

      // Le paiement est encaissé : les places tenues deviennent définitives.
      // Non bloquant — un échec ici ne doit pas faire échouer l'encaissement,
      // la purge respecte de toute façon les paiements aboutis.
      await confirmerPlacesTenues(payRef.id);

      await createEncaissementServer({
        paymentId: payRef.id,
        familyId: familyId || pData.familyId,
        familyName: pData.familyName || "",
        montant: paidAmount,
        mode: "cb_online",
        modeLabel: !isFullyPaid ? `CB en ligne CAWL (paiement partiel ${montantPaye.toFixed(2)}€)` : "CB en ligne (CAWL)",
        ref: `CAWL-${hostedCheckoutId}`,
        activityTitle: (pData.items || []).map((i: any) => i.activityTitle).join(", "),
      });

      console.log(`✅ Payment ${payRef.id} mis à jour: ${isFullyPaid ? "paid" : "partial"} — +${montantPaye}€ (cumul ${newPaidTotal}€/${totalTTC}€)`);

      // ── Attribution des points de fidélité ────────────────────────
      // Attribuer sur le montant effectivement encaissé (acompte OU solde)
      await awardLoyaltyPointsServer({
        familyId: familyId || pData.familyId,
        familyName: pData.familyName,
        montant: paidAmount,
        label: (pData.items || []).map((i: any) => i.activityTitle).join(", ") || "Paiement en ligne",
      });

      // ── Confirmer les réservations associées ──────────────────────
      // La place est garantie dès l'acompte payé (décision métier) : on
      // confirme les réservations même pour un acompte. Le solde reste dû
      // séparément (relance / prélèvement auto à J-7).
      await confirmReservationsForPayment({
        familyId: familyId || pData.familyId,
        items: pData.items || [],
      });

      // Les forfaits annuels (inscription CB), eux, ne sont créés QUE sur un
      // paiement COMPLET — un acompte ou paiement partiel ne les crée pas.
      if (isFullyPaid) {
        await createForfaitsForPayment({
          paymentId: payRef.id,
          forfaitPayloads: pData.forfaitPayloads || [],
        });
      }

      // ── Email confirmation ───────────────────────────────────────────────
      // L'adresse stockée sur la commande peut être absente (commandes créées
      // par certains flux : inscription annuelle, import…). Dans ce cas on la
      // RÉSOUT depuis la fiche famille — sinon la confirmation ne partait pas,
      // silencieusement.
      let parentEmail = pData.familyEmail || "";
      if (!parentEmail) {
        const fid = familyId || pData.familyId;
        if (fid) {
          try {
            const famSnap = await adminDb.collection("families").doc(fid).get();
            if (famSnap.exists) parentEmail = ((famSnap.data() as any).parentEmail || "").trim();
            if (parentEmail) console.log(`CAWL status: email résolu depuis la famille ${fid} → ${parentEmail}`);
          } catch (e) {
            console.error("CAWL status: résolution email famille échouée:", e);
          }
        }
      }
      if (!parentEmail) {
        console.warn(`⚠️ CAWL status: aucune adresse email pour le paiement ${payRef.id} — confirmation non envoyée`);
      }
      const resendKey = process.env.RESEND_API_KEY;
      await refreshEmailMode();
      // Diagnostic explicite : sans ces logs, un envoi qui n'a pas lieu est
      // indétectable (aucune entrée emailsSent n'est créée si on n'entre pas
      // dans le if). Incident du 22/07 : confirmation d'acompte jamais reçue.
      if (parentEmail && !resendKey) {
        console.error(`❌ CAWL status: RESEND_API_KEY absente en Production — confirmation NON envoyée à ${parentEmail} (paiement ${payRef.id})`);
      } else if (parentEmail && resendKey && !isRecipientAllowed(parentEmail)) {
        console.warn(`🔒 CAWL status: ${parentEmail} bloqué par le mode restreint — confirmation non envoyée (paiement ${payRef.id})`);
      }
      if (parentEmail && resendKey && isRecipientAllowed(parentEmail)) {
        try {
          const items = pData.items || [];
          const hasStage = items.some((i: any) => i.activityType === "stage");

          // Libellés construits par lib/email-prestations : le panier intègre
          // déjà le prénom dans `activityTitle`, le recoller donnait
          // « Galop de bronze — ambre — ambre » dans l'email reçu.
          const lignesDetail = lignesDetailHtml(items);
          const prestations = prestationsCourtes(items);
          // Acompte de stage → template dédié (récap total / acompte / solde).
          // Paiement total → template classique "PAIEMENT CONFIRMÉ".
          const templateKey = hasStage
            ? (isDeposit ? "confirmationStageAcompte" : "confirmationStage")
            : "confirmationPaiement";
          const soldeRestant = Math.max(0, +(((pData.totalTTC || 0)) - paidAmount).toFixed(2));
          const soldePhrase = cofToken
            ? `Le solde de ${soldeRestant.toFixed(2)}€ sera prélevé automatiquement sur votre carte enregistrée environ une semaine avant le début du stage. Aucune action n'est requise.`
            : `Un email avec le lien de paiement du solde (${soldeRestant.toFixed(2)}€) vous sera envoyé environ une semaine avant le début du stage.`;
          const vars: Record<string, string | number> = hasStage ? {
            parentName: pData.familyName || "Client",
            // Résout {fidelite} dans le gabarit : les points ont été crédités
            // plus haut, le solde lu par le loader est donc à jour.
            familyId: familyId || pData.familyId || "",
            // Sans nettoyage, le titre du stage arrive sous la forme
            // « Stage Poney — ambre » : le panier y a déjà mis l'enfant, et
            // les prénoms sont listés juste en dessous.
            stageTitle: titreSansEnfant(items[0]) || "Stage",
            // Un stage court sur la semaine : `datesStage` lit `stageDates`
            // plutôt que la seule `date` de la ligne (cf. lib/email-prestations).
            dates: datesStage(items, pData.stageDate),
            horaires: items.map((i: any) => i.startTime && i.endTime ? `${i.startTime}–${i.endTime}` : "").filter(Boolean)[0] || "",
            enfants: items.map((i: any) => i.childName).filter(Boolean).join(", "),
            montant: paidAmount.toFixed(2),
            // Variables spécifiques au template acompte
            acompte: paidAmount.toFixed(2),
            solde: soldeRestant.toFixed(2),
            dateSolde: dateEcheanceSolde(pData.stageDate),
            total: (pData.totalTTC || 0).toFixed(2),
            soldePhrase,
          } : {
            parentName: pData.familyName || "Client",
            familyId: familyId || pData.familyId || "",
            montant: paidAmount.toFixed(2),
            prestations: lignesDetail || prestations,
            // Le gabarit `confirmationPaiement` attend `mode`. Le webhook le
            // passait, cette route non : la famille recevait « Mode de
            // paiement : {mode} », le marqueur brut. Concerne les cours
            // ponctuels ET les balades — tout ce qui n'est pas un stage.
            mode: libelleModePaiement("cb_online"),
          };
          // Rappel des conditions d'annulation pour les stages. Passé au
          // gabarit plutôt qu'écrit dedans : la clause doit apparaître même si
          // le gabarit est réédité depuis l'admin. Ce n'est PAS ce qui rend
          // la clause opposable (l'acceptation à la commande le fait), mais
          // ça évite la mauvaise surprise et désamorce les litiges.
          const estStage = items.some((i: any) => String(i.activityType || "").includes("stage"));
          const { subject, html } = await loadTemplate(templateKey, vars, estStage ? encadreConditionsStage() : "");
          const htmlFinal = html;
          fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { "Authorization": `Bearer ${resendKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              from: process.env.RESEND_FROM_EMAIL || "Centre Equestre <onboarding@resend.dev>",
              to: parentEmail,
              ...(process.env.RESEND_BCC_EMAIL ? { bcc: process.env.RESEND_BCC_EMAIL } : {}),
              subject, html: htmlFinal,
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
              await logEmail({ to: parentEmail, subject, context: "cawl_status_check", template: templateKey, status: "failed", error: "Erreur interne", sentBy: "system", paymentId: payRef?.id, familyId: pData.familyId });
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
