import { NextRequest, NextResponse } from "next/server";
import { prestationsCourtes } from "@/lib/email-prestations";
import {
  emailLayout, emailButton, emailPanneau, emailLigne, emailTitre,
  emailParagraphe, emailSignature, emailCouleurs as COULEURS, euros, eurosTexte,
} from "@/lib/email-templates";

const POLICE_TEXTE = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { verifyAuth } from "@/lib/api-auth";
import { logEmail } from "@/lib/email-log";
import { isRecipientAllowed, blockedLog, refreshEmailMode } from "@/lib/email-guard";
import { generateCAWLQR, generateSEPAQR } from "@/lib/payment-qr";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  // 🔒 Auth obligatoire — route admin
  const auth = await verifyAuth(req, { adminOnly: true });
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await req.json();
    const {
      paymentId,
      recipientEmail,
      amount, // montant custom en euros
      message, // message personnalisé
      familyId,
      familyName,
    } = body;

    if (!paymentId || !recipientEmail || !amount) {
      return NextResponse.json({ error: "Champs requis : paymentId, recipientEmail, amount" }, { status: 400 });
    }

    // 1. Vérifier que le paiement existe
    const paySnap = await adminDb.collection("payments").doc(paymentId).get();
    if (!paySnap.exists) {
      return NextResponse.json({ error: "Paiement introuvable" }, { status: 404 });
    }
    const payData = paySnap.data()!;
    const resteDu = (payData.totalTTC || 0) - (payData.paidAmount || 0);

    if (amount > resteDu + 0.01) {
      return NextResponse.json({ error: `Montant supérieur au reste dû (${resteDu.toFixed(2)}€)` }, { status: 400 });
    }

    // 2. Générer le lien CAWL
    const origin = req.nextUrl.origin;
    const authHeader = req.headers.get("authorization") || "";
    // Si ce lien correspond à l'ACOMPTE de la commande (montant ≈ acompteAmount,
    // rien encore payé), on le déclare comme acompte au checkout : CAWL
    // TOKENISE alors la carte (Card-On-File), indispensable au prélèvement
    // automatique du solde à J-7 (MIT/delayedCharge). Le montant reste `amount`.
    const acompteAttendu = typeof payData.acompteAmount === "number" ? payData.acompteAmount : 0;
    const estLienAcompte =
      acompteAttendu > 0 &&
      (payData.paidAmount || 0) < 0.01 &&
      Math.abs(amount - acompteAttendu) < 0.02 &&
      (payData.totalTTC || 0) > amount;
    const depositPercentLien = estLienAcompte
      ? Math.min(99, Math.max(1, Math.round((amount / (payData.totalTTC || amount)) * 100)))
      : 0;
    const cawlRes = await fetch(`${origin}/api/cawl/checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": authHeader },
      body: JSON.stringify({
        items: (payData.items || []).map((i: any) => ({
          name: i.activityTitle || i.description || "Prestation",
          priceTTC: 0, // on utilise totalTTC direct
        })),
        totalTTC: amount,
        ...(depositPercentLien > 0 ? { depositPercent: depositPercentLien } : {}),
        familyId: familyId || payData.familyId,
        familyEmail: recipientEmail,
        familyName: familyName || payData.familyName,
        paymentId,
      }),
    });

    if (!cawlRes.ok) {
      const err = await cawlRes.json().catch(() => ({}));
      return NextResponse.json({ error: err.error || "Erreur CAWL" }, { status: 500 });
    }

    const { url: paymentUrl } = await cawlRes.json();

    // 3. Envoyer l'email avec le lien
    // Le panier a DÉJÀ mis le prénom dans activityTitle : le recoller donnait
    // « Stage galop de bronze — Aurèle COSTEGROSSE — Aurèle COSTEGROSSE »
    // dans le mail reçu. prestationsCourtes ne l'ajoute que s'il manque.
    const prestations = prestationsCourtes(payData.items || []);

    const htmlMessage = message
      ? emailParagraphe(message.replace(/\n/g, "<br/>"))
      : emailParagraphe("Bonjour,") + emailParagraphe(`Voici le lien de paiement pour régler <strong>${euros(amount)}</strong> — ${prestations}.`);

    // Générer les QR codes (CAWL pour paiement carte, SEPA pour virement bancaire).
    // On utilise le mécanisme CID (Content-ID) de Resend plutôt que des images
    // base64 inline, car Gmail bloque les <img src="data:image/..."> pour
    // raisons de sécurité. Avec CID, les images sont attachées au mail (en
    // multipart/related) et référencées via <img src="cid:xxx">. Méthode standard
    // MIME, supportée par Gmail, Outlook, iCloud, etc.
    const qrCAWL = await generateCAWLQR(paymentUrl, "email");
    const sepaLibelle = `${(payData as any).invoiceNumber || paymentId.slice(0, 8)} ${payData.familyName || ""}`.trim();
    const qrSEPA = await generateSEPAQR(amount, sepaLibelle, "email");

    // Identifiants CID simples (pas d'@, pas de paymentId trop long).
    // L'API REST Resend attend content_id en snake_case (pas contentId).
    const cidCAWL = `qr-cawl`;
    const cidSEPA = `qr-sepa`;

    // Section HTML des QR codes (référence par cid:, pas par data:image)
    // Section QR — mêmes images (référencées par cid:, pas par data:), mise
    // en page reprise du reste des emails.
    const qrSection = (qrCAWL || qrSEPA) ? emailPanneau("Ou scannez avec votre téléphone", `
        <table role="presentation" style="width:100%;border-collapse:collapse;" cellpadding="0" cellspacing="0">
          <tr>
            ${qrCAWL ? `
            <td style="text-align:center;vertical-align:top;padding:8px;">
              <img src="cid:${cidCAWL}" alt="QR Code paiement carte" style="display:block;margin:0 auto;width:140px;height:140px;border:0;" />
              <div style="margin:10px 0 0;font-family:${POLICE_TEXTE};font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:${COULEURS.encre};">Paiement carte</div>
              <div style="margin:3px 0 0;font-family:${POLICE_TEXTE};font-size:12px;color:${COULEURS.gris};">Instantané, avec l'appareil photo</div>
            </td>
            ` : ""}
            ${qrSEPA ? `
            <td style="text-align:center;vertical-align:top;padding:8px;">
              <img src="cid:${cidSEPA}" alt="QR Code virement SEPA" style="display:block;margin:0 auto;width:140px;height:140px;border:0;" />
              <div style="margin:10px 0 0;font-family:${POLICE_TEXTE};font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:${COULEURS.encre};">Virement bancaire</div>
              <div style="margin:3px 0 0;font-family:${POLICE_TEXTE};font-size:12px;color:${COULEURS.gris};">ING, Boursorama, Revolut, BNP Pro…</div>
            </td>
            ` : ""}
          </tr>
        </table>
    `) : "";

    // Habillage commun (lib/email-templates). Ce message portait sa propre
    // mise en forme — Arial, fond gris, en-tête bleu — sans rapport avec les
    // autres. Or c'est souvent le premier email qu'une famille reçoit.
    const emailHtml = emailLayout([
      emailTitre("Votre lien de paiement"),
      htmlMessage,
      emailButton(`Payer ${euros(amount)}`, paymentUrl),
      emailPanneau("Détail", [
        emailLigne("Famille", String(payData.familyName || "")),
        emailLigne("Prestations", prestations),
        emailLigne("Montant", euros(amount)),
        amount < resteDu ? emailLigne("Reste dû après ce paiement", euros(resteDu - amount)) : "",
      ].join("")),
      qrSection,
      emailParagraphe(`<span style="color:${COULEURS.discret};">Paiement sécurisé par CAWL — Crédit Agricole. Ce lien est valable 2 heures.</span>`, 11),
      emailSignature(),
    ].join("\n"), `${euros(amount)} — ${prestations}`);

    // Envoyer via Resend
    const resendKey = process.env.RESEND_API_KEY;
    const subject = `Lien de paiement — ${eurosTexte(amount)}`;
    const sentByUid = (auth as any)?.uid || "admin";
    await refreshEmailMode();
    if (resendKey && !isRecipientAllowed(recipientEmail)) {
      // 🔒 Garde-fou phase de préparation : on ne pousse pas le lien à la famille.
      console.warn(blockedLog(recipientEmail, "payment_link"));
      await logEmail({ to: recipientEmail, subject, context: "payment_link", template: "paymentLink", status: "failed", error: "Bloqué par le mode restreint (email-guard)", sentBy: sentByUid, paymentId, familyId: payData.familyId });
    } else if (resendKey) {
      try {
        // Construire la liste d'attachments avec les QR codes en CID.
        // IMPORTANT : l'API REST Resend attend content_id (snake_case), pas
        // contentId (camelCase) — c'est la convention JSON pour l'API HTTP
        // brute, alors que le SDK Node accepte les deux. On utilise fetch()
        // direct ici, donc snake_case obligatoire. Sinon Resend ne sait pas
        // qu'il faut référencer cette image via cid:xxx et la traite comme
        // une simple pièce jointe (ce que tu as constaté sur ta capture).
        const attachments: any[] = [];
        if (qrCAWL) {
          attachments.push({
            filename: "qr-paiement-carte.png",
            content: qrCAWL.base64Raw,
            content_id: cidCAWL,
            content_type: "image/png",
          });
        }
        if (qrSEPA) {
          attachments.push({
            filename: "qr-virement-sepa.png",
            content: qrSEPA.base64Raw,
            content_id: cidSEPA,
            content_type: "image/png",
          });
        }

        const resendRes = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${resendKey}` },
          body: JSON.stringify({
            from: process.env.RESEND_FROM || "noreply@ce-agon.fr",
            to: recipientEmail,
            bcc: "ceagon50@gmail.com",
            subject,
            html: emailHtml,
            ...(attachments.length > 0 ? { attachments } : {}),
          }),
        });
        if (resendRes.ok) {
          await logEmail({ to: recipientEmail, subject, context: "payment_link", template: "paymentLink", status: "sent", sentBy: sentByUid, paymentId, familyId: payData.familyId });
        } else {
          const errText = await resendRes.text().catch(() => "");
          await logEmail({ to: recipientEmail, subject, context: "payment_link", template: "paymentLink", status: "failed", error: `HTTP ${resendRes.status}: ${errText}`.slice(0, 500), sentBy: sentByUid, paymentId, familyId: payData.familyId });
        }
      } catch (e: any) {
        await logEmail({ to: recipientEmail, subject, context: "payment_link", template: "paymentLink", status: "failed", error: "Erreur interne", sentBy: sentByUid, paymentId, familyId: payData.familyId });
        console.error("Erreur envoi email:", e);
      }
    }

    // 4. Tracer l'envoi
    await adminDb.collection("payment-links").add({
      paymentId,
      familyId: payData.familyId,
      familyName: payData.familyName,
      recipientEmail,
      amount,
      paymentUrl,
      message: message || "",
      sentAt: FieldValue.serverTimestamp(),
      status: "sent",
    });

    return NextResponse.json({ success: true, paymentUrl });
  } catch (error: any) {
    console.error("send-payment-link error:", error);
    console.error("API error:", error);
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}
