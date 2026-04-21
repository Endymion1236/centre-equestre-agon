import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { verifyAuth } from "@/lib/api-auth";
import { logEmail } from "@/lib/email-log";

export const dynamic = "force-dynamic";

// Email expéditeur — en mode test, utiliser EXACTEMENT l'adresse Resend
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";

// Mode test : si pas de domaine vérifié, tous les emails vont vers l'email du compte Resend
const TEST_MODE = !process.env.RESEND_FROM_EMAIL || process.env.RESEND_TEST_MODE === "true";
const TEST_EMAIL = process.env.RESEND_OWNER_EMAIL || "";

export async function POST(request: NextRequest) {
  // 🔒 Auth obligatoire — route admin
  const auth = await verifyAuth(request, { adminOnly: true });
  if (auth instanceof NextResponse) return auth;

  // Champs utilisés aussi en cas d'erreur pour le log
  let logTo: string | string[] = "";
  let logSubject = "";
  let logContext = "admin_manual";
  let logTemplate: string | undefined;
  let logMeta: { familyId?: string; paymentId?: string; creneauId?: string } = {};
  const sentBy = (auth as any)?.uid || "admin";

  try {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "RESEND_API_KEY non configurée. Ajoutez-la dans les variables d'environnement Vercel." },
        { status: 500 }
      );
    }

    const resend = new Resend(apiKey);
    const body = await request.json();
    const { to, subject, html, replyTo, bcc, context, template, familyId, paymentId, creneauId } = body;

    logTo = to;
    logSubject = subject || "";
    if (context) logContext = String(context);
    if (template) logTemplate = String(template);
    if (familyId) logMeta.familyId = String(familyId);
    if (paymentId) logMeta.paymentId = String(paymentId);
    if (creneauId) logMeta.creneauId = String(creneauId);

    if (!to || !subject || !html) {
      await logEmail({
        to: to || "", subject: subject || "",
        context: logContext, template: logTemplate,
        status: "failed", error: "Champs manquants",
        sentBy, ...logMeta,
      });
      return NextResponse.json(
        { error: "Champs requis : to, subject, html" },
        { status: 400 }
      );
    }

    // to peut être un string ou un tableau
    const recipients = Array.isArray(to) ? to : [to];
    const validRecipients = recipients.filter(
      (email: string) => email && email.includes("@")
    );

    if (validRecipients.length === 0) {
      await logEmail({
        to, subject,
        context: logContext, template: logTemplate,
        status: "failed", error: "Aucun destinataire valide",
        sentBy, ...logMeta,
      });
      return NextResponse.json(
        { error: "Aucun destinataire valide" },
        { status: 400 }
      );
    }

    // BCC : copie cachée configurable (variable d'env ou paramètre)
    const bccEmail = bcc || process.env.RESEND_BCC_EMAIL || "";
    const bccList = bccEmail ? (Array.isArray(bccEmail) ? bccEmail : [bccEmail]).filter((e: string) => e.includes("@")) : [];

    // En mode test : rediriger vers l'email admin avec le vrai destinataire dans l'objet
    if (TEST_MODE && !TEST_EMAIL) {
      return NextResponse.json(
        { error: "RESEND_OWNER_EMAIL non configurée. Requise en mode test." },
        { status: 500 }
      );
    }
    const finalTo = TEST_MODE ? [TEST_EMAIL] : validRecipients;
    const finalSubject = TEST_MODE
      ? `[TEST → ${validRecipients.join(", ")}] ${subject}`
      : subject;

    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: finalTo,
      ...(bccList.length > 0 && !TEST_MODE ? { bcc: bccList } : {}),
      subject: finalSubject,
      html: TEST_MODE
        ? `<div style="background:#fff3cd;padding:10px;border:1px solid #ffc107;border-radius:6px;margin-bottom:12px;font-family:sans-serif;font-size:12px;color:#856404;">
            <strong>⚠️ MODE TEST</strong> — Cet email aurait été envoyé à : <strong>${validRecipients.join(", ")}</strong>
          </div>${html}`
        : html,
      replyTo: replyTo || process.env.RESEND_OWNER_EMAIL || process.env.RESEND_FROM_EMAIL || "",
    });

    if (error) {
      console.error("Resend error:", error);
      await logEmail({
        to: validRecipients, subject,
        context: logContext, template: logTemplate,
        status: "failed", error: (error as any)?.message || String(error),
        sentBy, ...logMeta,
      });
      return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
    }

    // Succès — log
    await logEmail({
      to: validRecipients, subject,
      context: logContext, template: logTemplate,
      status: "sent",
      sentBy, ...logMeta,
    });

    return NextResponse.json({
      success: true,
      messageId: data?.id,
      recipients: validRecipients.length,
      testMode: TEST_MODE,
      sentTo: TEST_MODE ? TEST_EMAIL : validRecipients,
    });
  } catch (error: any) {
    console.error("Send email error:", error);
    await logEmail({
      to: logTo || "", subject: logSubject,
      context: logContext, template: logTemplate,
      status: "failed", error: error?.message || String(error),
      sentBy, ...logMeta,
    });
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}
