import { NextRequest, NextResponse } from "next/server";
import { paiementAbouti } from "@/lib/cawl-status";
import { encadreConditionsStage } from "@/lib/cgv-clauses";
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
import { traiterBonCadeauSession } from "@/lib/bon-cadeau-traitement";
import { deciderConfirmation } from "@/lib/cawl-confirmation";
import { prestationsCourtes, libelleModePaiement, titreSansEnfant } from "@/lib/email-prestations";
import type { Paiement, SessionCawl } from "@/types/argent";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.text();

    // ── Vérification HMAC-SHA256 ──────────────────────────────────────────
    // CAWL signe ses notifications avec un secret WEBHOOK DEDIE, genere dans
    // le portail marchand — ce n'est PAS la cle API secrete. Le code utilisait
    // jusqu'ici la cle API : la signature ne pouvait donc jamais correspondre,
    // et toutes les notifications etaient rejetees en 400 sans qu'on le voie
    // (le retour navigateur confirmait les paiements dans le cas nominal).
    //
    // Ordre de priorite : secret webhook dedie d'abord, cle API ensuite pour
    // ne pas casser une configuration existante.
    const signature = req.headers.get("x-gcs-signature") || req.headers.get("x-signature") || "";
    const webhookSecret =
      process.env.CAWL_WEBHOOK_SECRET ||
      process.env.CAWL_SECRET_API_KEY ||
      process.env.CAWL_SECRET_API_KEY_VALUE ||
      "";
    const origineCle = process.env.CAWL_WEBHOOK_SECRET
      ? "CAWL_WEBHOOK_SECRET"
      : process.env.CAWL_SECRET_API_KEY
        ? "CAWL_SECRET_API_KEY (repli — verifier le secret webhook dedie)"
        : "CAWL_SECRET_API_KEY_VALUE (repli)";

    // Refus strict si secret non configuré (pas de mode "on continue quand même")
    if (!webhookSecret) {
      console.error("CAWL webhook: aucun secret configuré (CAWL_WEBHOOK_SECRET) — requête rejetée");
      return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
    }

    if (!signature) {
      console.error("CAWL webhook: signature absente");
      return NextResponse.json({ error: "Missing signature" }, { status: 400 });
    }

    const crypto = await import("crypto");
    const expectedSig = crypto
      .createHmac("sha256", webhookSecret)
      .update(body)
      .digest("base64");
    if (expectedSig !== signature) {
      // Diagnostic explicite : sans le nom du secret essaye, un echec de
      // signature est indiscernable d'un mauvais secret configure.
      console.error(
        `CAWL webhook: signature invalide (cle utilisee : ${origineCle}). ` +
          `Si le secret webhook dedie du portail CAWL n'est pas dans CAWL_WEBHOOK_SECRET, c'est la cause.`
      );
      return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }

    console.log(`✅ CAWL webhook: signature validee (cle : ${origineCle})`);

    let event: any;
    try {
      event = JSON.parse(body);
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    console.log(`CAWL webhook: type=${event.type}, id=${event.payment?.id}`);

    const payment = event.payment;
    if (!payment) {
      return NextResponse.json({ received: true });
    }

    const status = payment.status;
    const merchantRef = payment.paymentOutput?.references?.merchantReference || "";
    const totalCents = payment.paymentOutput?.amountOfMoney?.amount || 0;
    const totalEuros = totalCents / 100;
    const hostedCheckoutId = payment.hostedCheckoutSpecificOutput?.hostedCheckoutId || "";

    // ── Paiement confirmé ─────────────────────────────────────────────────
    // Meme regle que la route de retour (lib/cawl-status) : une seule
    // definition du succes, pour que les deux chemins ne puissent pas diverger.
    if (paiementAbouti(status)) {

      // ── Bon cadeau (achat en ligne : pas de payment associé) ─────────────
      // Traité en priorité et de façon idempotente. Si c'en est un, on s'arrête.
      //
      // CAWL ne renseigne PAS toujours hostedCheckoutSpecificOutput dans ses
      // notifications : sans repli, la branche etait sautee et le bon cadeau
      // ne pouvait etre cree que par le retour navigateur. Un acheteur qui
      // ferme son onglet apres avoir paye n'aurait alors jamais recu son bon,
      // alors que le webhook existe precisement pour ce cas.
      let checkoutId = hostedCheckoutId;
      if (!checkoutId && merchantRef) {
        const sessSnap = await adminDb.collection("cawl_sessions")
          .where("merchantRef", "==", merchantRef)
          .limit(1)
          .get();
        if (!sessSnap.empty) {
          checkoutId = sessSnap.docs[0].id;
          console.log(`CAWL webhook: hostedCheckoutId absent, retrouve via merchantRef → ${checkoutId}`);
        }
      }

      if (checkoutId) {
        const bonCode = await traiterBonCadeauSession(checkoutId, "webhook");
        if (bonCode) {
          console.log(`✅ CAWL webhook: bon cadeau confirmé ${checkoutId} → ${bonCode}`);
          return NextResponse.json({ received: true });
        }
      }

      // Chercher le payment par cawlRef (merchantReference)
      let payRef = null;
      let pData: Paiement | null = null;

      if (merchantRef) {
        const snap = await adminDb.collection("payments")
          .where("cawlRef", "==", merchantRef)
          .limit(1)
          .get();
        if (!snap.empty) {
          payRef = snap.docs[0].ref;
          pData = snap.docs[0].data() as Paiement;
        }
      }

      // Fallback : chercher par hostedCheckoutId
      if (!payRef && checkoutId) {
        const snap = await adminDb.collection("payments")
          .where("cawlHostedCheckoutId", "==", checkoutId)
          .limit(1)
          .get();
        if (!snap.empty) {
          payRef = snap.docs[0].ref;
          pData = snap.docs[0].data() as Paiement;
        }
      }

      if (payRef && pData) {
        // ── Acompte ou paiement total ? (autoritatif, PAS d'heuristique) ──
        // On lit le marqueur isDeposit stocké dans cawl_sessions au checkout.
        // L'ancienne heuristique "montant faible ⇒ acompte" était une faille
        // (audit) : un paiement total volontairement minoré était confirmé
        // comme un acompte. Supprimée.
        let isDeposit = false;
        let sessionDepositPercent = 0;
        // Montant DEMANDÉ à la création du checkout. C'est le référentiel du
        // contrôle de cohérence : un lien de paiement partiel (acompte de 30 €
        // sur une commande de 175 €) attend 30 €, pas le total. Le webhook
        // comparait au `totalTTC` du paiement et rejetait donc en
        // `needsReview` tout règlement partiel dont la famille n'était pas
        // revenue sur le site — audit 29/08/2026.
        let sessionAmountEuros: number | null = null;
        try {
          if (hostedCheckoutId) {
            const sessSnap = await adminDb.collection("cawl_sessions").doc(hostedCheckoutId).get();
            if (sessSnap.exists) {
              const s = sessSnap.data() as any;
              isDeposit = !!s?.isDeposit;
              sessionDepositPercent = s?.depositPercent || 0;
              sessionAmountEuros =
                typeof s?.totalCents === "number" && s.totalCents > 0
                  ? Math.round(s.totalCents) / 100
                  : null;
            }
          }
        } catch (e) { console.warn("CAWL webhook: lecture cawl_sessions impossible:", e); }

        // ── Décision partagée avec /api/cawl/status ───────────────────────
        // Montant attendu, cumul et attribution de facture sont calculés par
        // lib/cawl-confirmation.ts, pour que les deux chemins ne puissent plus
        // diverger (cf. l'en-tête de ce module).
        const decisionConf = deciderConfirmation({
          montantEncaisseEuros: totalEuros,
          montantSessionEuros: sessionAmountEuros,
          totalTTC: pData.totalTTC || totalEuros,
          dejaPaye: pData.paidAmount || 0,
          estAcompte: isDeposit,
          acompteAttendu: pData.acompteAmount ?? null,
          depositPercent: sessionDepositPercent,
          aDejaUneFacture: !!pData.invoiceNumber,
        });

        if (!decisionConf.accepte) {
          console.error(
            `⚠️ CAWL webhook montant incohérent — payé ${totalEuros}€ < attendu ${decisionConf.montantAttendu}€ ` +
            `(payment=${payRef.id}). Confirmation refusée.`
          );
          try {
            await payRef.update({
              amountMismatch: true,
              amountPaidReported: totalEuros,
              amountExpected: decisionConf.montantAttendu,
              needsReview: true,
              updatedAt: FieldValue.serverTimestamp(),
            });
          } catch { /* non bloquant */ }
          return NextResponse.json({ received: true, rejected: "amount_mismatch" });
        }

        // ── Verrou anti-doublon ──────────────────────────────────────────
        // Empêche webhook + status d'écrire tous les deux si appelés en
        // parallèle. IMPORTANT : le stage doit être le même que celui utilisé
        // par la route status (deposit/full), sinon les deux verrous sont
        // distincts et le paiement serait traité deux fois (double encaissement).
        const lockAcquired = await acquireCawlConfirmationLock({
          hostedCheckoutId,
          stage: isDeposit ? "deposit" : "full",
          source: "webhook",
          paymentId: payRef.id,
          amountCents: totalCents,
        });

        if (!lockAcquired) {
          console.log(
            `CAWL webhook: confirmation déjà traitée pour ${merchantRef}, skip`
          );
          return NextResponse.json({ received: true });
        }

        if (pData.status !== "paid") {
          // Montant crédité sur CE passage, et cumul — calculés par le module
          // partagé. Le webhook ÉCRASAIT auparavant `paidAmount` avec le total
          // dû : un acompte suivi d'un solde perdait la trace du premier
          // versement.
          const paidAmount = decisionConf.montantCredite;

          // Une vente intégralement réglée doit avoir sa FACTURE : numérotation
          // séquentielle continue (CGI art. 242 nonies A). Le webhook ne
          // l'attribuait jamais — une famille ayant fermé son navigateur après
          // avoir payé gardait une proforma PF-… (audit 29/08/2026).
          let newInvoiceNumber: string | null = null;
          if (decisionConf.attribuerFacture) {
            try {
              const { attribuerNumeroFacture } = await import("@/lib/invoice-number");
              newInvoiceNumber = (await attribuerNumeroFacture({
                paymentId: payRef.id,
                attributedBy: "system:cawl-webhook",
              })).invoiceNumber;
            } catch (e) {
              console.error("CAWL webhook: attribution numéro facture échouée (non-bloquant):", e);
            }
          }

          // Token Card On File + référence du paiement initial : indispensables
          // pour le prélèvement automatique du solde (MIT). Le webhook est le
          // seul point de confirmation si la famille ferme son navigateur avant
          // la redirection — sans cette capture, le solde ne serait jamais
          // prélevable automatiquement.
          const cofToken = payment.paymentOutput?.cardPaymentMethodSpecificOutput?.token || "";
          const cofSchemeTxId = payment.paymentOutput?.cardPaymentMethodSpecificOutput?.schemeTransactionId || "";

          await payRef.update({
            // Statut décidé sur le CUMUL réellement encaissé, pas sur le seul
            // marqueur acompte : un règlement partiel quelconque reste
            // « partial » jusqu'à ce que le total soit atteint.
            status: decisionConf.statut,
            paidAmount: decisionConf.nouveauCumul,
            ...(newInvoiceNumber ? { invoiceNumber: newInvoiceNumber, invoiceDate: FieldValue.serverTimestamp() } : {}),
            paymentMode: "cb_online",
            paymentRef: `CAWL-${payment.id}`,
            ...(cofToken ? { cofToken, cawlTokenizedAt: FieldValue.serverTimestamp() } : {}),
            ...(cofSchemeTxId ? { cofSchemeTransactionId: cofSchemeTxId } : {}),
            ...(payment.id ? { cofInitialPaymentId: payment.id } : {}),
            updatedAt: FieldValue.serverTimestamp(),
          });

          await createEncaissementServer({
            paymentId: payRef.id,
            familyId: pData.familyId,
            familyName: pData.familyName || "",
            montant: paidAmount,
            mode: "cb_online",
            modeLabel: isDeposit ? "CB en ligne CAWL (acompte)" : "CB en ligne (CAWL)",
            ref: `CAWL-${payment.id}`,
            activityTitle: (pData.items || []).map((i: any) => i.activityTitle).join(", "),
          });

          console.log(`✅ CAWL webhook payment confirmé: ${merchantRef} — ${paidAmount}€${isDeposit ? " (acompte)" : ""}`);

          // ── Attribution des points de fidélité ────────────────────────
          // Non-bloquant : erreurs loggées mais n'interrompent pas le flow.
          // Basé sur le montant RÉELLEMENT encaissé (paidAmount), pas sur le
          // total dû — sinon un acompte donnerait les points du stage complet.
          await awardLoyaltyPointsServer({
            familyId: pData.familyId,
            familyName: pData.familyName,
            montant: paidAmount,
            label: (pData.items || []).map((i: any) => i.activityTitle).join(", ") || "Paiement en ligne",
          });

          // Places tenues pendant le paiement → inscriptions définitives.
          await confirmerPlacesTenues(payRef.id);

          // ── Confirmer les réservations associées ──────────────────────
          // Les réservations créées en pending_payment au checkout doivent
          // passer en confirmed maintenant que le paiement est confirmé
          await confirmReservationsForPayment({
            familyId: pData.familyId,
            items: pData.items || [],
          });

          // ── Créer les forfaits annuels (inscription CB) ───────────────
          // Les payloads sont portés par le paiement (la famille ne peut pas
          // écrire dans `forfaits`). Création serveur ici. No-op si absent.
          await createForfaitsForPayment({
            paymentId: payRef.id,
            forfaitPayloads: pData.forfaitPayloads || [],
          });

          // ── Email de confirmation ─────────────────────────────────────
          const parentEmail = pData.familyEmail || "";
          const parentName = pData.familyName || "Client";
          const resendKey = process.env.RESEND_API_KEY;
          const fromEmail = process.env.RESEND_FROM_EMAIL || "Centre Equestre <onboarding@resend.dev>";

          await refreshEmailMode();
          if (parentEmail && resendKey && isRecipientAllowed(parentEmail)) {
            try {
              // Mêmes libellés que la route de retour (lib/email-prestations) :
              // le panier intègre déjà le prénom dans `activityTitle`, le
              // recoller donnait « Galop de bronze — ambre — ambre ».
              const prestations = prestationsCourtes(pData.items || []);
              const hasStage = (pData.items || []).some((i: any) => i.activityType === "stage");

              let templateKey = "confirmationPaiement";
              let vars: Record<string, string | number> = {
                parentName,
                montant: paidAmount.toFixed(2),
                prestations,
                mode: libelleModePaiement(pData.paymentMode || "cb_online"),
              };

              if (hasStage) {
                // Acompte → template dédié avec récap total/acompte/solde ;
                // paiement total → template classique. Toujours le montant
                // réellement encaissé (paidAmount), jamais le total pour un acompte.
                templateKey = isDeposit ? "confirmationStageAcompte" : "confirmationStage";
                const enfantsList = (pData.items || [])
                  .map((i: any) => i.childName).filter(Boolean).join(", ") || "Cavalier(s)";
                // Sur le CUMUL encaissé, pas sur le seul versement de ce
                // passage : sinon un solde annoncé après un acompte déjà versé
                // réclamerait une seconde fois ce qui est déjà payé.
                const soldeRestant = Math.max(0, +(((pData.totalTTC || 0)) - decisionConf.nouveauCumul).toFixed(2));
                const soldePhrase = cofToken
                  ? `Le solde de ${soldeRestant.toFixed(2)}€ sera prélevé automatiquement sur votre carte enregistrée environ une semaine avant le début du stage. Aucune action n'est requise.`
                  : `Un email avec le lien de paiement du solde (${soldeRestant.toFixed(2)}€) vous sera envoyé environ une semaine avant le début du stage.`;
                vars = {
                  parentName,
                  stageTitle: titreSansEnfant(pData.items?.[0]) || "Stage",
                  dates: pData.stageDate || prestations,
                  horaires: pData.items?.[0]?.stageSchedule || "",
                  enfants: enfantsList,
                  montant: paidAmount.toFixed(2),
                  acompte: paidAmount.toFixed(2),
                  solde: soldeRestant.toFixed(2),
                  total: (pData.totalTTC || 0).toFixed(2),
                  soldePhrase,
                };
              }

              const { subject, html } = await loadTemplate(templateKey, vars);
              // Rappel des conditions d'annulation, comme sur le retour de
              // paiement : le webhook est le chemin emprunté quand la famille
              // ferme son onglet avant le retour, elle recevait donc la
              // confirmation sans la clause.
              const htmlFinal = hasStage ? html + encadreConditionsStage() : html;
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
                  html: htmlFinal,
                }),
              })
                .then(async (res) => {
                  if (res.ok) {
                    await logEmail({ to: parentEmail, subject, context: "cawl_webhook", template: templateKey, status: "sent", sentBy: "system", paymentId: merchantRef, familyId: pData.familyId });
                  } else {
                    const errText = await res.text().catch(() => "");
                    await logEmail({ to: parentEmail, subject, context: "cawl_webhook", template: templateKey, status: "failed", error: `HTTP ${res.status}: ${errText}`.slice(0, 500), sentBy: "system", paymentId: merchantRef, familyId: pData.familyId });
                  }
                })
                .catch(async (e) => {
                  await logEmail({ to: parentEmail, subject, context: "cawl_webhook", template: templateKey, status: "failed", error: "Erreur interne", sentBy: "system", paymentId: merchantRef, familyId: pData.familyId });
                  console.error("Email webhook CAWL error:", e);
                });
            } catch (emailErr) {
              console.error("Email template CAWL webhook error:", emailErr);
            }
          }
        } else {
          console.log(`CAWL webhook: paiement ${merchantRef} déjà confirmé, skip`);
        }
      } else {
        // Normal pour un achat hors commande famille (bon cadeau deja traite
        // par le retour navigateur) : ce n'est pas une anomalie.
        console.log(
          `CAWL webhook: aucune commande famille pour ref=${merchantRef} ` +
            `(normal s'il s'agit d'un bon cadeau deja traite)`
        );
      }
    }

    // ── Paiement échoué / annulé ──────────────────────────────────────────
    if (status === "REJECTED" || status === "CANCELLED" || status === "REJECTED_CAPTURE") {
      console.log(`❌ CAWL payment failed: ref=${merchantRef}, status=${status}`);

      if (merchantRef) {
        const snap = await adminDb.collection("payments")
          .where("cawlRef", "==", merchantRef)
          .limit(1)
          .get();
        if (!snap.empty) {
          await snap.docs[0].ref.update({
            cawlLastFailStatus: status,
            updatedAt: FieldValue.serverTimestamp(),
          });
        }
      }
    }

    return NextResponse.json({ received: true });
  } catch (error: any) {
    console.error("CAWL webhook error:", error);
    console.error("API error:", error);
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}
