import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";

export const dynamic = "force-dynamic";

// Email expéditeur — utilise le domaine vérifié dans Resend
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "Centre Equestre Agon <onboarding@resend.dev>";

// Mode test : si pas de domaine vérifié, tous les emails vont vers l'email du compte Resend
// IMPORTANT : Resend gratuit n'autorise l'envoi qu'à l'email du propriétaire du compte
const TEST_MODE = !process.env.RESEND_FROM_EMAIL || process.env.RESEND_TEST_MODE === "true";
const TEST_EMAIL = process.env.RESEND_OWNER_EMAIL || process.env.RESEND_TEST_EMAIL || "delivered@resend.dev";

export async function POST(request: NextRequest) {
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
    const { to, subject, html, replyTo } = body;

    if (!to || !subject || !html) {
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
      return NextResponse.json(
        { error: "Aucun destinataire valide" },
        { status: 400 }
      );
    }

    // En mode test : rediriger vers l'email admin avec le vrai destinataire dans l'objet
    const finalTo = TEST_MODE ? [TEST_EMAIL] : validRecipients;
    const finalSubject = TEST_MODE
      ? `[TEST → ${validRecipients.join(", ")}] ${subject}`
      : subject;

    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: finalTo,
      subject: finalSubject,
      html: TEST_MODE
        ? `<div style="background:#fff3cd;padding:10px;border:1px solid #ffc107;border-radius:6px;margin-bottom:12px;font-family:sans-serif;font-size:12px;color:#856404;">
            <strong>⚠️ MODE TEST</strong> — Cet email aurait été envoyé à : <strong>${validRecipients.join(", ")}</strong>
          </div>${html}`
        : html,
      replyTo: replyTo || "ceagon@orange.fr",
    });

    if (error) {
      console.error("Resend error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      messageId: data?.id,
      recipients: validRecipients.length,
      testMode: TEST_MODE,
      sentTo: TEST_MODE ? TEST_EMAIL : validRecipients,
    });
  } catch (error: any) {
    console.error("Send email error:", error);
    return NextResponse.json(
      { error: error.message || "Erreur serveur" },
      { status: 500 }
    );
  }
}
