import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { verifyAuth } from "@/lib/api-auth";
import { logEmail } from "@/lib/email-log";
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
    const cawlRes = await fetch(`${origin}/api/cawl/checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": authHeader },
      body: JSON.stringify({
        items: (payData.items || []).map((i: any) => ({
          name: i.activityTitle || i.description || "Prestation",
          priceTTC: 0, // on utilise totalTTC direct
        })),
        totalTTC: amount,
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
    const prestations = (payData.items || []).map((i: any) => 
      `${i.activityTitle || "Prestation"}${i.childName ? ` — ${i.childName}` : ""}`
    ).join(", ");

    const htmlMessage = message 
      ? message.replace(/\n/g, "<br/>")
      : `<p>Bonjour,</p><p>Veuillez trouver ci-dessous le lien de paiement pour régler <strong>${amount.toFixed(2)}€</strong> pour : ${prestations}.</p>`;

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
    const qrSection = (qrCAWL || qrSEPA) ? `
      <div style="background: white; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin-top: 16px;">
        <p style="margin: 0 0 12px; font-size: 13px; color: #6b7280; text-align: center;">
          Vous pouvez aussi <strong>scanner</strong> avec votre téléphone :
        </p>
        <table style="width: 100%; border-collapse: collapse;" cellpadding="0" cellspacing="0">
          <tr>
            ${qrCAWL ? `
            <td style="text-align: center; vertical-align: top; padding: 8px;">
              <img src="cid:${cidCAWL}" alt="QR Code paiement carte" style="display: block; margin: 0 auto; width: 140px; height: 140px;" />
              <p style="margin: 8px 0 0; font-size: 12px; color: #1e3a5f; font-weight: bold;">💳 Paiement carte</p>
              <p style="margin: 2px 0 0; font-size: 11px; color: #6b7280;">Instantané, scannez avec l'appareil photo</p>
            </td>
            ` : ""}
            ${qrSEPA ? `
            <td style="text-align: center; vertical-align: top; padding: 8px;">
              <img src="cid:${cidSEPA}" alt="QR Code virement SEPA" style="display: block; margin: 0 auto; width: 140px; height: 140px;" />
              <p style="margin: 8px 0 0; font-size: 12px; color: #1e3a5f; font-weight: bold;">🏦 Virement bancaire</p>
              <p style="margin: 2px 0 0; font-size: 11px; color: #6b7280;">Compatible ING, Boursorama, Revolut, BNP Pro</p>
            </td>
            ` : ""}
          </tr>
        </table>
      </div>
    ` : "";

    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #1e3a5f; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 20px;">Centre Équestre d'Agon-Coutainville</h1>
        </div>
        <div style="padding: 24px; background: #f9fafb; border: 1px solid #e5e7eb;">
          ${htmlMessage}
          <div style="margin: 24px 0; text-align: center;">
            <a href="${paymentUrl}" style="display: inline-block; background: #16a34a; color: white; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-size: 16px; font-weight: bold;">
              Payer ${amount.toFixed(2)}€
            </a>
          </div>
          <div style="background: white; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin-top: 16px;">
            <p style="margin: 0 0 8px; font-size: 13px; color: #6b7280;">Détail :</p>
            <p style="margin: 0; font-size: 14px;"><strong>Famille :</strong> ${payData.familyName}</p>
            <p style="margin: 4px 0 0; font-size: 14px;"><strong>Prestations :</strong> ${prestations}</p>
            <p style="margin: 4px 0 0; font-size: 14px;"><strong>Montant :</strong> ${amount.toFixed(2)}€</p>
            ${amount < resteDu ? `<p style="margin: 4px 0 0; font-size: 13px; color: #f97316;">Reste dû après ce paiement : ${(resteDu - amount).toFixed(2)}€</p>` : ""}
          </div>
          ${qrSection}
          <p style="font-size: 12px; color: #9ca3af; margin-top: 20px;">Paiement sécurisé par CAWL / Crédit Agricole. Ce lien est valable 2 heures.</p>
        </div>
        <div style="text-align: center; padding: 12px; font-size: 11px; color: #9ca3af;">
          Centre Équestre d'Agon-Coutainville · 02 44 84 99 96
        </div>
      </div>
    `;

    // Envoyer via Resend
    const resendKey = process.env.RESEND_API_KEY;
    const subject = `Lien de paiement — ${amount.toFixed(2)}€ — Centre Équestre`;
    const sentByUid = (auth as any)?.uid || "admin";
    if (resendKey) {
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
        await logEmail({ to: recipientEmail, subject, context: "payment_link", template: "paymentLink", status: "failed", error: e?.message || String(e), sentBy: sentByUid, paymentId, familyId: payData.familyId });
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
