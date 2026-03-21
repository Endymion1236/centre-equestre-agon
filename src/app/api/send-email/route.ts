import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";

export const dynamic = "force-dynamic";

// Email expéditeur — utilise le domaine vérifié dans Resend
// En mode test (pas de domaine), Resend utilise onboarding@resend.dev
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "Centre Equestre Agon <onboarding@resend.dev>";

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

    // Filtrer les emails vides
    const validRecipients = recipients.filter(
      (email: string) => email && email.includes("@")
    );

    if (validRecipients.length === 0) {
      return NextResponse.json(
        { error: "Aucun destinataire valide" },
        { status: 400 }
      );
    }

    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: validRecipients,
      subject,
      html,
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
    });
  } catch (error: any) {
    console.error("Send email error:", error);
    return NextResponse.json(
      { error: error.message || "Erreur serveur" },
      { status: 500 }
    );
  }
}
