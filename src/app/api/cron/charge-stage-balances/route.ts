import { NextRequest, NextResponse } from "next/server";
import { messageErreur } from "@/lib/message-erreur";
import { tracerExecution } from "@/lib/cron-trace";
import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { logEmail } from "@/lib/email-log";
import { isRecipientAllowed, refreshEmailMode } from "@/lib/email-guard";
import { generateCAWLQR, generateSEPAQR } from "@/lib/payment-qr";
import { addDaysParis } from "@/lib/date-local";
import { chargeWithToken, logMitAttempt } from "@/lib/cawl-mit";
import { acquireCawlConfirmationLock } from "@/lib/cawl-lock";
import {
  emailLayout, emailButton, emailPanneau, emailLigne, emailTitre,
  emailParagraphe as P, emailEtat, emailSignature,
  emailCouleurs as C, euros, eurosTexte,
} from "@/lib/email-templates";

const POLICE_TEXTE = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * CRON charge-stage-balances — tous les jours à 8h
 * 
 * Pour chaque paiement stage dont le stage commence dans 7 jours
 * et qui a un solde restant, envoie un email avec lien de paiement.
 * 
 * Flow :
 *   Inscription stage → paiement pending (acompteAmount=30€/enfant)
 *   Famille paie l'acompte → paiement partial (paidAmount=30€)
 *   J-7 : ce cron envoie le lien de paiement pour le solde
 *   Famille paie le solde → paiement paid
 */
export async function GET(req: NextRequest) {
  // Cron le plus critique financierement : accepte aussi le declencheur
  // externe de secours. Idempotent (soldeReminderSentAt / soldeRelanceJ5SentAt),
  // donc un double appel ne preleve jamais deux fois.
  const secret = process.env.CRON_SECRET;
  const parVercel = req.headers.get("authorization") === `Bearer ${secret}`;
  const parExterne = req.headers.get("x-cron-secret") === secret
    || req.nextUrl.searchParams.get("secret") === secret;
  if (!secret || (!parVercel && !parExterne)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const declencheur = parVercel ? "vercel" : "externe";

  const resendKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL || "Centre Equestre <onboarding@resend.dev>";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://centre-equestre-agon.vercel.app";

  const results = {
    processed: 0,
    emailsSent: 0,
    autoCharged: 0,
    errors: 0,
    skipped: 0,
    details: [] as string[],
  };

  try {
    // Date J+7 — surchargée par ?date=YYYY-MM-DD pour les TESTS (preprod) :
    // traite les paiements des stages démarrant à cette date, sans attendre.
    const dateParam = req.nextUrl.searchParams.get("date");
    const j7Str = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : addDaysParis(7);
    if (dateParam) console.log(`⚠️ [charge-stage-balances] MODE TEST : date forcée à ${j7Str}`);
    const [j7y, j7m, j7d] = j7Str.split("-").map(Number);
    const j7 = new Date(j7y, j7m - 1, j7d, 12, 0, 0);
    const j7Label = j7.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });

    console.log(`\n💳 [charge-stage-balances] Soldes stage J-7 — stages du ${j7Str}`);

    // Trouver les paiements stage dont la date de début est J+7
    const stagePaySnap = await adminDb.collection("payments")
      .where("stageDate", "==", j7Str)
      .get();

    if (stagePaySnap.empty) {
      console.log("  → Aucun paiement stage pour J+7");
      return NextResponse.json({ ok: true, message: `Aucun stage le ${j7Str}`, ...results });
    }

    for (const payDoc of stagePaySnap.docs) {
      const p = payDoc.data() as any;
      results.processed++;

      // Solde restant
      const solde = (p.totalTTC || 0) - (p.paidAmount || 0);
      if (solde <= 0 || p.status === "paid" || p.status === "cancelled") {
        results.skipped++;
        results.details.push(`${p.familyName}: déjà réglé ou annulé`);
        continue;
      }

      // Éviter les doublons
      if (p.soldeReminderSentAt) {
        results.skipped++;
        results.details.push(`${p.familyName}: rappel déjà envoyé`);
        continue;
      }

      const familyEmail = p.familyEmail || "";
      const familyName = p.familyName || "";
      const stageTitle = p.stageTitle || (p.items || [])[0]?.activityTitle || "Stage";

      if (!familyEmail) {
        results.skipped++;
        results.details.push(`${familyName}: pas d'email`);
        continue;
      }

      // ── 1) Prélèvement automatique du solde si un token CB est disponible ──
      // La famille a payé l'acompte par CB et accepté la tokenisation de sa
      // carte → on tente de prélever le solde automatiquement (MIT Card On
      // File). Si le module n'est pas branché (stub) ou s'il n'y a pas de
      // token, on retombe sur l'email de rappel ci-dessous (comportement
      // historique, non destructif).
      const cofToken = p.cofToken || p.cardOnFileToken || "";
      // Le delayedCharge exige le paymentId CAWL de l'acompte (endpoint
      // /payments/{paymentId}/subsequent). Un hostedCheckoutId n'est PAS un
      // paymentId : sans cofInitialPaymentId, on ne tente pas le MIT (qui
      // échouerait et enverrait un email d'échec anxiogène) — on retombe
      // directement sur l'email de rappel classique.
      if (cofToken && p.cofInitialPaymentId) {
        // ── Verrou posé AVANT le débit ────────────────────────────────────
        // L'idempotence reposait sur `soldeReminderSentAt`, écrit APRÈS le
        // prélèvement réussi. Si la carte était débitée et que l'écriture
        // Firestore qui suit échouait, la passe suivante re-débitait la
        // famille. Le verrou est désormais acquis avant l'appel : une seconde
        // tentative sur le même paiement ne peut plus partir (audit F5).
        const verrouMit = await acquireCawlConfirmationLock({
          hostedCheckoutId: `mit-${payDoc.id}`,
          stage: "balance",
          source: "cron-mit",
          paymentId: payDoc.id,
          amountCents: Math.round(solde * 100),
        });
        if (!verrouMit) {
          results.skipped++;
          results.details.push(`${familyName}: prélèvement du solde déjà engagé`);
          continue;
        }

        const mit = await chargeWithToken({
          paymentId: payDoc.id,
          familyId: p.familyId,
          amount: solde,
          token: cofToken,
          initialPaymentId: p.cofInitialPaymentId,
          label: `Solde ${stageTitle} — ${familyName}`,
          familyEmail,
        });

        if (mit.enabled) {
          // Le module est branché : on enregistre la tentative et on agit selon le résultat.
          await logMitAttempt(payDoc.id, mit, solde);

          if (mit.success) {
            // Statut mis à jour par logMitAttempt (paidAmount incrémenté). On
            // passe le paiement à "paid" si le solde est couvert.
            const newPaid = (p.paidAmount || 0) + solde;
            const estSolde = newPaid >= (p.totalTTC || 0);
            // Vente intégralement réglée → FACTURE définitive (numérotation
            // séquentielle) — sinon le paiement resterait une proforma PF-….
            let invNum: string | null = null;
            if (estSolde && !p.invoiceNumber) {
              try {
                const { attribuerNumeroFacture } = await import("@/lib/invoice-number");
                invNum = (await attribuerNumeroFacture({ paymentId: payDoc.id, attributedBy: "system:cron-mit" })).invoiceNumber;
              } catch (e) {
                console.error("cron MIT: attribution numéro facture échouée (non-bloquant):", e);
              }
            }
            await adminDb.collection("payments").doc(payDoc.id).update({
              status: estSolde ? "paid" : "partial",
              ...(invNum ? { invoiceNumber: invNum, invoiceDate: FieldValue.serverTimestamp() } : {}),
              soldeReminderSentAt: FieldValue.serverTimestamp(),
            });

            // Email de confirmation "solde prélevé"
            await refreshEmailMode();
            if (resendKey && isRecipientAllowed(familyEmail)) {
              const subject = `Solde du stage prélevé — ${eurosTexte(solde)}`;
              const html = emailLayout([
                emailEtat("Solde prélevé", euros(solde), C.vert),
                emailTitre("Tout est réglé"),
                P(`Bonjour <strong>${familyName}</strong>,`),
                P(`Le solde du stage <strong>${stageTitle}</strong>, qui commence le ${j7Label}, vient d'être prélevé sur votre carte enregistrée.`),
                P("Aucune action n'est requise. La facture est disponible dans votre espace.", 14),
                emailButton("Voir ma facture", `${appUrl}/espace-cavalier/factures`),
                emailSignature(),
              ].join("\n"), `${euros(solde)} prélevés — ${stageTitle}`);
              const r = await fetch("https://api.resend.com/emails", {
                method: "POST",
                headers: { "Authorization": `Bearer ${resendKey}`, "Content-Type": "application/json" },
                body: JSON.stringify({
                  from: fromEmail, to: familyEmail,
                  ...(process.env.RESEND_BCC_EMAIL ? { bcc: process.env.RESEND_BCC_EMAIL } : {}),
                  subject, html,
                }),
              }).then(r => logEmail({ to: familyEmail, subject, context: "cron_stage_solde_auto", template: "stageSoldePreleve", status: r.ok ? "sent" : "failed", sentBy: "system", paymentId: payDoc.id })).catch(() => {});
            }

            results.autoCharged++;
            results.details.push(`💳✅ ${familyName} → solde prélevé auto (${solde.toFixed(2)}€)`);
            console.log(`  💳✅ Solde prélevé auto → ${familyEmail} (${solde.toFixed(2)}€)`);
            continue; // solde traité, pas d'email de rappel
          } else {
            // Le prélèvement a échoué : email d'échec + on laisse le lien manuel ci-dessous.
            let emailEnvoye = false;
            if (resendKey && isRecipientAllowed(familyEmail)) {
              const subject = `Prélèvement du solde impossible — ${eurosTexte(solde)}`;
              // Gabarit MAISON (bandeau bleu marine + pied de page) plutot
              // qu'un HTML ad hoc a bandeau rouge : ce n'est pas une mise en
              // demeure, juste un prelevement qui n'a pas abouti. Le bouton
              // vient du helper partage, insensible au passage a la ligne.
              const html = emailLayout([
                emailTitre("Le prélèvement n'a pas abouti"),
                P(`Bonjour <strong>${familyName}</strong>,`),
                P(`Le prélèvement automatique du solde de votre stage <strong>${stageTitle}</strong> n'a pas abouti. Cela arrive : un plafond de carte, une opposition temporaire, ou une carte arrivée à expiration.`),
                emailPanneau("", [
                  emailLigne("Reste à régler", euros(solde)),
                  emailLigne("Avant le", j7Label),
                ].join("")),
                emailButton("Régler mon solde", `${appUrl}/espace-cavalier/factures?payId=${payDoc.id}`),
                P("Un souci pour régler en ligne ? Répondez simplement à ce message, nous trouverons une solution.", 13),
                emailSignature(),
              ].join("\n"), `${euros(solde)} à régler avant le ${j7Label}`);
              const r = await fetch("https://api.resend.com/emails", {
                method: "POST",
                headers: { "Authorization": `Bearer ${resendKey}`, "Content-Type": "application/json" },
                body: JSON.stringify({
                  from: fromEmail, to: familyEmail,
                  ...(process.env.RESEND_BCC_EMAIL ? { bcc: process.env.RESEND_BCC_EMAIL } : {}),
                  subject, html,
                }),
              });
              emailEnvoye = r.ok;
              await logEmail({ to: familyEmail, subject, context: "cron_stage_solde_echec", template: "stageSoldeEchec", status: r.ok ? "sent" : "failed", sentBy: "system", paymentId: payDoc.id }).catch(() => {});
            }

            // `soldeReminderSentAt` fait SAUTER definitivement ce paiement au
            // prochain passage (garde anti-doublon, ligne ~79). Le poser alors
            // que l'email n'est PAS parti condamnait le solde au silence : ni
            // prelevement, ni relance, jamais. On ne le pose donc que si
            // l'envoi a reellement abouti.
            await adminDb.collection("payments").doc(payDoc.id).update(
              emailEnvoye
                ? { soldeReminderSentAt: FieldValue.serverTimestamp() }
                : { soldeReminderBlockedAt: FieldValue.serverTimestamp() }
            );
            results.errors++;
            if (emailEnvoye) results.emailsSent++;
            results.details.push(
              emailEnvoye
                ? `💳❌ ${familyName}: prélèvement échoué (${mit.error || "?"}) → email d'échec envoyé`
                : `💳❌ ${familyName}: prélèvement échoué (${mit.error || "?"}) → email NON envoyé, sera retenté`
            );
            console.warn(`  💳❌ Prélèvement échoué → ${familyEmail}: ${mit.error}`);
            continue;
          }
        }
        // mit.enabled === false → stub non branché : on continue vers l'email de rappel classique.
      }

      // ── 2) Fallback : email de rappel avec lien de paiement (existant) ────
      const soldeLink = `${appUrl}/espace-cavalier/factures?payId=${payDoc.id}`;

      // Générer les QR codes : on utilise le mécanisme CID (pas data URL inline)
      // pour que les images soient affichées par Gmail. Cf send-payment-link
      // pour le détail du fix.
      const sepaLibelle = `${stageTitle} ${familyName}`.trim().slice(0, 70);
      const qrCAWL = await generateCAWLQR(soldeLink, "email");
      const qrSEPA = await generateSEPAQR(solde, sepaLibelle, "email");
      const cidCAWL = `qr-cawl`;
      const cidSEPA = `qr-sepa`;
      const qrSection = (qrCAWL || qrSEPA) ? emailPanneau("Ou scannez avec votre téléphone", `
          <table role="presentation" style="width:100%;border-collapse:collapse;" cellpadding="0" cellspacing="0">
            <tr>
              ${qrCAWL ? `<td style="text-align:center;vertical-align:top;padding:6px;">
                <img src="cid:${cidCAWL}" alt="QR paiement carte" style="width:130px;height:130px;display:block;margin:0 auto;border:0;" />
                <div style="margin:9px 0 0;font-family:${POLICE_TEXTE};font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:${C.encre};">Carte</div>
              </td>` : ""}
              ${qrSEPA ? `<td style="text-align:center;vertical-align:top;padding:6px;">
                <img src="cid:${cidSEPA}" alt="QR virement SEPA" style="width:130px;height:130px;display:block;margin:0 auto;border:0;" />
                <div style="margin:9px 0 0;font-family:${POLICE_TEXTE};font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:${C.encre};">Virement</div>
                <div style="margin:3px 0 0;font-family:${POLICE_TEXTE};font-size:12px;color:${C.gris};">ING, Boursorama, Revolut, BNP Pro</div>
              </td>` : ""}
            </tr>
          </table>
      `) : "";

      try {
        const subject = `Solde du stage à régler — ${eurosTexte(solde)} avant le ${j7Label}`;
        const html = emailLayout([
          emailTitre("Le stage commence dans une semaine"),
          P(`Bonjour <strong>${familyName}</strong>,`),
          P(`Le stage <strong>${stageTitle}</strong> commence dans <strong>7 jours</strong> (${j7Label}).`),
          emailPanneau("", [
            p.paidAmount > 0 ? emailLigne("Acompte déjà reçu", euros(p.paidAmount)) : "",
            emailLigne('<strong style="color:' + C.encre + ';">Solde à régler</strong>', euros(solde)),
          ].join("")),
          emailButton("Régler mon solde", soldeLink),
          qrSection,
          P("Vous pouvez également régler sur place, par carte, chèque ou espèces.", 13),
          emailSignature(),
        ].join("\n"), `${euros(solde)} à régler avant le ${j7Label}`);

        if (resendKey && isRecipientAllowed(familyEmail)) {
          // Attachments CID pour les QR. IMPORTANT : content_id (snake_case)
          // pour l'API REST, sinon Resend traite l'image comme une simple
          // PJ et le <img src="cid:xxx"> ne se résout pas (cf send-payment-link).
          const attachments: any[] = [];
          if (qrCAWL) attachments.push({ filename: "qr-paiement-carte.png", content: qrCAWL.base64Raw, content_id: cidCAWL, content_type: "image/png" });
          if (qrSEPA) attachments.push({ filename: "qr-virement-sepa.png", content: qrSEPA.base64Raw, content_id: cidSEPA, content_type: "image/png" });

          const resendRes = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { "Authorization": `Bearer ${resendKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              from: fromEmail,
              to: familyEmail,
              ...(process.env.RESEND_BCC_EMAIL ? { bcc: process.env.RESEND_BCC_EMAIL } : {}),
              subject, html,
              ...(attachments.length > 0 ? { attachments } : {}),
            }),
          });
          if (resendRes.ok) {
            await logEmail({ to: familyEmail, subject, context: "cron_stage_solde", template: "stageSoldeJ7", status: "sent", sentBy: "system", paymentId: payDoc.id });
          } else {
            const errText = await resendRes.text().catch(() => "");
            await logEmail({ to: familyEmail, subject, context: "cron_stage_solde", template: "stageSoldeJ7", status: "failed", error: `HTTP ${resendRes.status}: ${errText}`.slice(0, 500), sentBy: "system", paymentId: payDoc.id });
          }

          // Marquer le rappel comme envoyé — UNIQUEMENT si l'email est
          // réellement parti : sinon la famille ne serait jamais relancée
          // une fois le mode restreint levé.
          await adminDb.collection("payments").doc(payDoc.id).update({
            soldeReminderSentAt: FieldValue.serverTimestamp(),
          });

          results.emailsSent++;
          results.details.push(`✅ ${familyName} → ${familyEmail} (${solde.toFixed(2)}€)`);
        } else {
          // Reporting HONNÊTE : bloqué par le mode restreint ≠ envoyé.
          // (Incident de frayeur 17/07 : le rapport affichait '✅ envoyé'
          // pour des emails en réalité bloqués par le guard.)
          results.skipped++;
          results.details.push(`🔒 ${familyName} → ${familyEmail} BLOQUÉ (mode restreint) — rien envoyé, sera relancé à la levée`);
        }
        console.log(`  ✅ Solde J-7 → ${familyEmail} (${solde.toFixed(2)}€)`);
      } catch (e: any) {
        results.errors++;
        results.details.push(`❌ ${familyName}: ${e.message}`);
        console.error(`  ❌ Erreur solde J-7 → ${familyEmail}`, e);
      }
    }

    // ── RELANCE J-5 : soldes toujours impayés deux jours après J-7 ─────────
    // Le passage J-7 est un tir unique (soldeReminderSentAt bloque tout
    // repassage) : prélèvement échoué ou lien ignoré, la famille arrivait au
    // stage avec un solde impayé sans autre rappel. À J-5, on relance UNE
    // fois celles dont le solde reste dû ET qui ont déjà été traitées à J-7
    // — jamais celles que J-7 aurait ratées, pour ne pas court-circuiter le
    // prélèvement automatique.
    let relances = 0;
    try {
      const j5Str = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : addDaysParis(5);
      const [y5, m5, d5] = j5Str.split("-").map(Number);
      const j5Label = new Date(y5, m5 - 1, d5, 12, 0, 0)
        .toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });

      const relanceSnap = await adminDb.collection("payments")
        .where("stageDate", "==", j5Str)
        .get();

      for (const payDoc of relanceSnap.docs) {
        const p = payDoc.data() as any;
        const solde = (p.totalTTC || 0) - (p.paidAmount || 0);
        if (solde <= 0 || p.status === "paid" || p.status === "cancelled") continue;
        if (!p.soldeReminderSentAt) continue;   // J-7 pas encore passé sur lui : on n'anticipe pas
        if (p.soldeRelanceJ5SentAt) continue;   // relance déjà faite (anti-doublon)
        const familyEmail = p.familyEmail || "";
        if (!familyEmail || !resendKey || !isRecipientAllowed(familyEmail)) continue;

        const stageTitle = p.stageTitle || (p.items || [])[0]?.activityTitle || "Stage";
        const subject = `Rappel — solde de ${eurosTexte(solde)} à régler avant le stage`;
        const html = emailLayout([
          emailTitre("Le stage approche"),
          P(`Bonjour <strong>${p.familyName || ""}</strong>,`),
          P(`Le stage <strong>${stageTitle}</strong> commence <strong>${j5Label}</strong> et il reste <strong>${euros(solde)}</strong> à régler sur votre inscription.`),
          emailButton("Régler mon solde", `${appUrl}/espace-cavalier/factures?payId=${payDoc.id}`),
          P("Vous préférez régler sur place, ou vous rencontrez un souci ? Répondez simplement à ce message, nous trouverons une solution.", 13),
          emailSignature(),
        ].join("\n"), `${euros(solde)} à régler avant ${j5Label}`);
        const r = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { "Authorization": `Bearer ${resendKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ from: fromEmail, to: familyEmail, subject, html }),
        });
        await logEmail({ to: familyEmail, subject, context: "cron_stage_solde_relance_j5", template: "stageSoldeRelance", status: r.ok ? "sent" : "failed", sentBy: "system", paymentId: payDoc.id }).catch(() => {});
        // Anti-doublon pose UNIQUEMENT si l'email est parti : un envoi bloqué
        // (mode restreint, panne Resend) sera retenté demain — a J-4, mieux
        // que jamais.
        if (r.ok) {
          await adminDb.collection("payments").doc(payDoc.id).update({ soldeRelanceJ5SentAt: FieldValue.serverTimestamp() });
          relances++;
          results.details.push(`🔁 ${p.familyName}: relance J-5 (${solde.toFixed(2)}€)`);
        }
      }
      if (relances > 0) console.log(`  🔁 ${relances} relance(s) J-5 envoyée(s)`);
    } catch (e) {
      console.error("Relance J-5:", e);
    }

    console.log(`\n✅ charge-stage-balances terminé: ${results.emailsSent} emails, ${relances} relances J-5, ${results.skipped} ignorés, ${results.errors} erreurs`);

    await tracerExecution("charge-stage-balances", declencheur, {
      ok: true,
      resume: { date: j7Str, rappels: results.emailsSent, relancesJ5: relances, erreurs: results.errors },
    });

    return NextResponse.json({
      ok: true,
      declencheur,
      message: `Stages du ${j7Str}: ${results.emailsSent} rappels, ${relances} relances J-5`,
      relancesJ5: relances,
      ...results,
    });
  } catch (error: any) {
    console.error("Cron charge-stage-balances error:", error);
    return NextResponse.json({ error: `Erreur interne — ${messageErreur(error)}` }, { status: 500 });
  }
}
